import { NextRequest, NextResponse } from 'next/server'
import { findOfferById } from '@/lib/offers'
import { getDatabase } from '@/lib/db'
import { generateAdCreative } from '@/lib/ad-creative-generator'
import { createAdCreative } from '@/lib/ad-creative'
import { type ComprehensiveAdStrengthResult } from '@/lib/scoring'
import {
  buildCreativeKeywordSet,
} from '@/lib/creative-keyword-set-builder'
import {
  applyCreativeKeywordSetToCreative,
  buildCreativeBrandKeywords,
  createCreativeAdStrengthPayload,
  createCreativeKeywordSetBuilderInput,
  createCreativeQualityEvaluationInput,
  createCreativeScoreBreakdown,
  mergeUsedKeywordsExcludingBrand,
  resolveCreativeKeywordAudit,
} from '@/lib/creative-keyword-runtime'
import {
  AD_CREATIVE_MAX_AUTO_RETRIES,
  AD_CREATIVE_REQUIRED_MIN_SCORE,
  evaluateCreativeForQuality,
  runCreativeGenerationQualityLoop
} from '@/lib/ad-creative-quality-loop'
import {
  getOrCreateKeywordPool,
  getKeywordPoolByOfferId,
  getBucketInfo,
  getAvailableBuckets,
  getUsedBuckets,
  isCreativeLimitReached,
  calculateKeywordOverlapRate,
  determineClusteringStrategy,
  type BucketType,
  type OfferKeywordPool,
  type PoolKeywordData
} from '@/lib/offer-keyword-pool'
import { POST as rebuildOfferPost } from '@/app/api/offers/[id]/rebuild/route'
import {
  deriveCanonicalCreativeType,
  getCreativeTypeForBucketSlot,
  mapCreativeTypeToBucketSlot,
  normalizeCanonicalCreativeType,
  normalizeCreativeBucketSlot,
} from '@/lib/creative-type'
import { extractModelAnchorTextsFromScrapedData } from '@/lib/model-anchor-evidence'
import { normalizeSingleCreativeSelection } from '@/lib/creative-request-normalizer'

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function normalizeRequestedBucketForOffer(rawBucket: unknown, offer: any): BucketType | null {
  const normalizedSelection = normalizeSingleCreativeSelection({
    creativeType: undefined,
    bucket: rawBucket,
    hasExplicitCreativeType: false,
    hasExplicitBucket: rawBucket !== undefined,
    resolveLegacyModelIntent: () => {
      const upper = String(rawBucket || '').trim().toUpperCase()
      const scrapedModelTexts = extractModelAnchorTextsFromScrapedData(offer?.scraped_data)
      const normalizedLegacyType = deriveCanonicalCreativeType({
        keywordBucket: upper,
        keywords: [
          offer?.product_name,
          offer?.extracted_keywords,
          ...scrapedModelTexts,
        ],
        headlines: [offer?.extracted_headlines],
        descriptions: [
          offer?.brand_description,
          offer?.unique_selling_points,
          offer?.product_highlights,
          offer?.extracted_descriptions,
        ],
        theme: [offer?.offer_name, offer?.category],
      })

      return normalizedLegacyType === 'model_intent'
    },
  })

  if (normalizedSelection.errorCode === 'invalid-bucket') return null
  if (normalizedSelection.legacyFallbackToProduct) {
    const upper = String(rawBucket || '').trim().toUpperCase()
    console.warn(
      `[DifferentiatedCreative] Offer ${offer?.id ?? 'unknown'}: legacy bucket ${upper} fallback to D/product_intent because no verifiable model anchor evidence was found`
    )
  }

  return normalizedSelection.requestedBucket as BucketType | null
}

function dedupeBuckets(values: Array<BucketType | null | undefined>): BucketType[] {
  return Array.from(new Set(values.filter((value): value is BucketType => Boolean(value))))
}

function sameBucketSet(left: BucketType[], right: BucketType[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((item) => rightSet.has(item))
}

/**
 * POST /api/offers/:id/creatives/generate-differentiated
 * 生成差异化创意（KISS：仅3个用户可见类型）
 *
 * Request Body:
 * - buckets?: BucketType[] - 指定要生成的桶（默认所有可用桶）
 * - maxRetries?: number - 每个创意最大重试次数（默认 2）
 * - forceRegeneratePool?: boolean - 是否触发重建Offer（替代关键词池重建）
 *
 * Response:
 * - 成功生成的创意列表
 * - 各创意的关键词桶信息
 * - 创意间的关键词重叠率统计
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // 从中间件注入的请求头中获取用户ID
    const userId = request.headers.get('x-user-id')
    if (!userId) {
      return NextResponse.json({ error: '未授权' }, { status: 401 })
    }

    const offerId = parseInt(id, 10)
    const userIdNum = parseInt(userId, 10)

    // 验证 Offer 存在且属于当前用户
    const offer = await findOfferById(offerId, userIdNum)
    if (!offer) {
      return NextResponse.json(
        { error: 'Offer 不存在或无权访问' },
        { status: 404 }
      )
    }

    // 验证 Offer 已完成抓取
    if (offer.scrape_status === 'failed') {
      return NextResponse.json(
        { error: 'Offer 信息抓取失败，请重新抓取' },
        { status: 400 }
      )
    }

    // 解析请求体
    const body = await request.json().catch(() => ({}))
    const {
      buckets: requestedBuckets,
      creativeTypes: requestedCreativeTypes,
      creativeType: requestedCreativeType,
      maxRetries = AD_CREATIVE_MAX_AUTO_RETRIES,
    } = body
    const normalizedMaxRetries = Math.max(
      0,
      Math.min(
        AD_CREATIVE_MAX_AUTO_RETRIES,
        Number.isFinite(Number(maxRetries)) ? Math.floor(Number(maxRetries)) : AD_CREATIVE_MAX_AUTO_RETRIES
      )
    )
    const forceRegeneratePool = parseBooleanFlag(body.forceRegeneratePool)

    console.log(`\n🎨 POST /api/offers/${offerId}/creatives/generate-differentiated`)
    console.log(`   requestedBuckets: ${requestedBuckets ? requestedBuckets.join(', ') : '自动选择'}`)
    console.log(`   requestedCreativeTypes: ${requestedCreativeTypes ? requestedCreativeTypes.join(', ') : requestedCreativeType || '未指定'}`)
    console.log(`   maxRetries: ${normalizedMaxRetries}`)
    console.log(`   forceRegeneratePool: ${forceRegeneratePool}`)

    if (forceRegeneratePool) {
      console.log(`🔁 forceRegeneratePool=true，改为触发 /api/offers/${offerId}/rebuild`)
      const rebuildResponse = await rebuildOfferPost(request, { params })
      const rebuildPayload = await rebuildResponse.json().catch(() => null)

      if (!rebuildResponse.ok) {
        return NextResponse.json(
          rebuildPayload && typeof rebuildPayload === 'object'
            ? rebuildPayload
            : { error: '重建Offer失败', message: '触发Offer重建失败' },
          { status: rebuildResponse.status }
        )
      }

      const rebuildTaskId = rebuildPayload && typeof rebuildPayload === 'object'
        ? (rebuildPayload as { taskId?: string }).taskId
        : undefined

      return NextResponse.json({
        success: true,
        message: '已触发Offer重建。请等待重建完成后，再调用该接口生成差异化创意',
        data: {
          offerId,
          rebuildTaskId: rebuildTaskId || null
        }
      }, { status: 202 })
    }

    // 1. 获取或创建关键词池
    console.log('\n📦 Step 1: 获取关键词池')
    const pool = await getOrCreateKeywordPool(offerId, userIdNum, false)

    // 2. 确定聚类策略
    const strategy = determineClusteringStrategy(pool.totalKeywords)
    console.log(`📊 聚类策略: ${strategy.strategy} (${strategy.message})`)

    // 3. 获取可用桶
    const availableBuckets = await getAvailableBuckets(offerId)
    console.log(`🎯 可用桶: ${availableBuckets.join(', ') || '(无)'}`)

    if (availableBuckets.length === 0) {
      return NextResponse.json({
        success: false,
        error: '所有创意类型已被占用，每个 Offer 最多支持 3 个差异化创意（A/B/D）',
        data: {
          usedBuckets: await getUsedBuckets(offerId),
          maxCreatives: 3,
          suggestion: '请删除现有创意后再生成新的'
        }
      }, { status: 400 })
    }

    const hasCreativeTypeInput = requestedCreativeTypes !== undefined || requestedCreativeType !== undefined
    const rawCreativeTypeInputs: unknown[] = Array.isArray(requestedCreativeTypes)
      ? requestedCreativeTypes
      : requestedCreativeType !== undefined
        ? [requestedCreativeType]
        : []

    const requestedBucketsFromCreativeType = dedupeBuckets(rawCreativeTypeInputs.map((value) => {
      const normalizedType = normalizeCanonicalCreativeType(value)
      if (!normalizedType) return null
      return mapCreativeTypeToBucketSlot(normalizedType) as BucketType | null
    }))

    if (hasCreativeTypeInput && requestedBucketsFromCreativeType.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'creativeType 无效，仅支持 brand_intent/model_intent/product_intent 及兼容旧 key',
      }, { status: 400 })
    }

    // 4. 确定要生成的桶
    let bucketsToGenerate: BucketType[]
    if (requestedBuckets && Array.isArray(requestedBuckets)) {
      const requestedBucketsFromLegacyBucket = dedupeBuckets(requestedBuckets
        .map((b: unknown) => normalizeRequestedBucketForOffer(b, offer))
      )
      const deduped = requestedBucketsFromLegacyBucket

      if (
        requestedBucketsFromCreativeType.length > 0 &&
        !sameBucketSet(deduped, requestedBucketsFromCreativeType)
      ) {
        return NextResponse.json({
          success: false,
          error: 'creativeType 与 buckets 不一致，请传入同一创意类型对应的槽位',
          data: {
            requestedBuckets: deduped,
            requestedCreativeTypeBuckets: requestedBucketsFromCreativeType,
          }
        }, { status: 400 })
      }

      // 验证请求的桶是否可用（按KISS-3类型）
      const invalidBuckets = deduped.filter((b: BucketType) => !availableBuckets.includes(b))
      if (invalidBuckets.length > 0) {
        return NextResponse.json({
          success: false,
          error: `以下桶不可用: ${invalidBuckets.join(', ')}`,
          data: { availableBuckets }
        }, { status: 400 })
      }
      bucketsToGenerate = requestedBucketsFromCreativeType.length > 0
        ? requestedBucketsFromCreativeType
        : deduped
    } else if (requestedBucketsFromCreativeType.length > 0) {
      const invalidBuckets = requestedBucketsFromCreativeType.filter((b: BucketType) => !availableBuckets.includes(b))
      if (invalidBuckets.length > 0) {
        return NextResponse.json({
          success: false,
          error: `以下桶不可用: ${invalidBuckets.join(', ')}`,
          data: { availableBuckets }
        }, { status: 400 })
      }
      bucketsToGenerate = requestedBucketsFromCreativeType
    } else {
      // 根据策略决定生成多少个
      bucketsToGenerate = availableBuckets.slice(0, strategy.bucketCount)
    }

    console.log(`🚀 将生成 ${bucketsToGenerate.length} 个创意: ${bucketsToGenerate.join(', ')}`)

    // 5. 为每个桶生成创意
    const results: Array<{
      bucket: BucketType
      creative: any
      evaluation: ComprehensiveAdStrengthResult | null
      success: boolean
      error?: string
    }> = []

    for (const bucket of bucketsToGenerate) {
      console.log(`\n📝 生成桶 ${bucket} 的创意...`)

      try {
        const bucketInfo = getBucketInfo(pool, bucket)

        // 生成创意（使用桶的关键词）
        const creativeResult = await generateCreativeWithBucket(
          offerId,
          userIdNum,
          offer,
          pool,
          bucket,
          bucketInfo,
          normalizedMaxRetries
        )

        results.push({
          bucket,
          creative: creativeResult.creative,
          evaluation: creativeResult.evaluation,
          success: true
        })

        console.log(`✅ 桶 ${bucket} 创意生成成功`)
      } catch (error: any) {
        console.error(`❌ 桶 ${bucket} 创意生成失败:`, error.message)
        results.push({
          bucket,
          creative: null,
          evaluation: null,
          success: false,
          error: error.message
        })
      }
    }

    // 6. 计算创意间的关键词重叠率
    const successfulCreatives = results.filter(r => r.success && r.creative)
    let overlapStats = null

    if (successfulCreatives.length >= 2) {
      overlapStats = calculateOverlapStats(successfulCreatives, pool)
    }

    // 7. 返回结果
    const successCount = successfulCreatives.length
    const failCount = results.length - successCount

    return NextResponse.json({
      success: failCount === 0,
      message: failCount === 0
        ? `成功生成 ${successCount} 个差异化创意`
        : `生成 ${successCount} 个成功, ${failCount} 个失败`,
      data: {
        offerId,
        totalGenerated: successCount,
        totalFailed: failCount,

        // 关键词池信息
        keywordPool: {
          id: pool.id,
          totalKeywords: pool.totalKeywords,
          brandKeywordsCount: pool.brandKeywords.length,
          balanceScore: pool.balanceScore
        },

        // 创意列表
        creatives: results.map(r => ({
          bucket: r.bucket,
          success: r.success,
          creative: r.creative ? {
            id: r.creative.id,
            creativeType: r.creative.creative_type || getCreativeTypeForBucketSlot(normalizeCreativeBucketSlot(r.bucket) || 'D'),
            headlines: r.creative.headlines?.length || 0,
            descriptions: r.creative.descriptions?.length || 0,
            keywords: r.creative.keywords?.length || 0,
            theme: r.creative.theme,
            score: r.creative.score,
            bucketIntent: getBucketInfo(pool, r.bucket).intent,
            keywordSupplementation: r.creative.keywordSupplementation || null
          } : null,
          evaluation: r.evaluation ? {
            rating: r.evaluation.finalRating,
            score: r.evaluation.finalScore,
            isExcellent: r.evaluation.finalRating === 'EXCELLENT'
          } : null,
          error: r.error
        })),

        // 重叠统计（关键指标：应该接近 3%，仅品牌词重叠）
        overlapStats,

        // 策略信息
        strategy: {
          bucketCount: strategy.bucketCount,
          strategyType: strategy.strategy,
          message: strategy.message
        }
      }
    })
  } catch (error: any) {
    console.error('生成差异化创意失败:', error)
    return NextResponse.json(
      { error: error.message || '生成差异化创意失败' },
      { status: 500 }
    )
  }
}

/**
 * 为指定桶生成创意
 */
async function generateCreativeWithBucket(
  offerId: number,
  userId: number,
  offer: any,
  pool: OfferKeywordPool,
  bucket: BucketType,
  bucketInfo: { keywords: PoolKeywordData[]; intent: string; intentEn: string },
  maxRetries: number
): Promise<{
  creative: any
  evaluation: ComprehensiveAdStrengthResult | null
}> {
  // 从 PoolKeywordData[] 提取关键词字符串
  const keywordStrings = bucketInfo.keywords.map(kw => typeof kw === 'string' ? kw : kw.keyword)
  let usedKeywords: string[] = []
  const brandKeywords = buildCreativeBrandKeywords(offer.brand)
  const creativeType = getCreativeTypeForBucketSlot(bucket as 'A' | 'B' | 'D')

  const loopResult = await runCreativeGenerationQualityLoop({
    maxRetries,
    delayMs: 1000,
    generate: async ({ attempt, retryFailureType }) => {
      const creative = await generateAdCreative(offerId, userId, {
        theme: `${bucketInfo.intent} - ${bucketInfo.intentEn}`,
        skipCache: attempt > 1,
        excludeKeywords: attempt > 1 ? usedKeywords : undefined,
        retryFailureType,
        keywordPool: pool,
        bucket: bucket,
        bucketKeywords: keywordStrings,
        bucketIntent: bucketInfo.intent,
        bucketIntentEn: bucketInfo.intentEn,
        deferKeywordPostProcessingToBuilder: true,
        // 🔥 2026-03-13: 移除 deferKeywordSupplementation，让缺口分析始终执行
        // deferKeywordSupplementation: true
      })

      const seedCandidates = Array.isArray(bucketInfo.keywords) ? bucketInfo.keywords : []

      const keywordSet = await buildCreativeKeywordSet(createCreativeKeywordSetBuilderInput({
        offer,
        userId,
        creative,
        creativeType,
        bucket,
        scopeLabel: `generate-differentiated-${bucket}`,
        seedCandidates: seedCandidates as any,
        enableSupplementation: true,
        continueOnSupplementError: true,
      }))
      applyCreativeKeywordSetToCreative(creative, {
        executableKeywords: keywordSet.executableKeywords,
        keywordsWithVolume: keywordSet.keywordsWithVolume,
        promptKeywords: keywordSet.promptKeywords,
        keywordSupplementation: keywordSet.keywordSupplementation,
        audit: keywordSet.audit,
      })

      usedKeywords = mergeUsedKeywordsExcludingBrand({
        usedKeywords,
        candidateKeywords: creative.keywords,
        brandKeywords,
      })

      return creative
    },
    evaluate: async (creative) => evaluateCreativeForQuality(createCreativeQualityEvaluationInput({
      creative,
      minimumScore: AD_CREATIVE_REQUIRED_MIN_SCORE,
      offer,
      userId,
      bucket,
      keywords: creative.keywords || [],
      productNameFallback: offer.product_title || offer.name,
      productTitleFallback: offer.title,
    }))
  })

  const bestCreative = loopResult.selectedCreative
  const selectedEvaluation = loopResult.selectedEvaluation
  const evaluation = selectedEvaluation.adStrength
  const bestCreativeAudit = resolveCreativeKeywordAudit(bestCreative)

  if (!selectedEvaluation.passed) {
    console.warn(`⚠️ 桶 ${bucket} 未达 GOOD 阈值，已保存最佳结果: ${evaluation.finalRating} (${evaluation.finalScore})`)
  }

  const savedCreative = await createAdCreative(
    userId,
    offerId,
    {
      ...bestCreative,
      final_url: offer.final_url || offer.url,
      final_url_suffix: offer.final_url_suffix,
      ai_model: bestCreative.ai_model,
      generation_round: loopResult.attempts,
      score: evaluation.finalScore,
      score_breakdown: createCreativeScoreBreakdown(evaluation),
      creative_type: creativeType,
      keyword_bucket: bucket,
      keyword_pool_id: pool.id,
      bucket_intent: bucketInfo.intent,
      adStrength: createCreativeAdStrengthPayload(evaluation, bestCreativeAudit)
    }
  )

  return {
    creative: {
      ...savedCreative,
      creative_type: creativeType,
      keyword_bucket: bucket,
      bucket_intent: bucketInfo.intent,
      keywordSupplementation: bestCreative.keywordSupplementation || null,
      audit: bestCreativeAudit,
      keywordSourceAudit: bestCreativeAudit
    },
    evaluation
  }
}

/**
 * 计算创意间的关键词重叠统计
 */
function calculateOverlapStats(
  creatives: Array<{ bucket: BucketType; creative: any }>,
  pool: OfferKeywordPool
): {
  averageOverlapRate: number
  pairwiseOverlaps: Array<{
    bucket1: BucketType
    bucket2: BucketType
    overlapRate: number
    overlapCount: number
  }>
  brandKeywordsShared: number
  targetOverlapRate: string
  isOptimal: boolean
} {
  const pairwiseOverlaps: Array<{
    bucket1: BucketType
    bucket2: BucketType
    overlapRate: number
    overlapCount: number
  }> = []

  // 计算每对创意之间的重叠
  for (let i = 0; i < creatives.length; i++) {
    for (let j = i + 1; j < creatives.length; j++) {
      const keywords1 = creatives[i].creative?.keywords || []
      const keywords2 = creatives[j].creative?.keywords || []

      const set1 = new Set(keywords1.map((k: string) => k.toLowerCase()))
      const set2 = new Set(keywords2.map((k: string) => k.toLowerCase()))

      let overlapCount = 0
      for (const kw of set1) {
        if (set2.has(kw)) overlapCount++
      }

      const overlapRate = Math.max(set1.size, set2.size) > 0
        ? overlapCount / Math.max(set1.size, set2.size)
        : 0

      pairwiseOverlaps.push({
        bucket1: creatives[i].bucket,
        bucket2: creatives[j].bucket,
        overlapRate: Math.round(overlapRate * 100) / 100,
        overlapCount
      })
    }
  }

  // 计算平均重叠率
  const averageOverlapRate = pairwiseOverlaps.length > 0
    ? pairwiseOverlaps.reduce((sum, p) => sum + p.overlapRate, 0) / pairwiseOverlaps.length
    : 0

  // 共享的品牌词数量
  const brandKeywordsShared = pool.brandKeywords.length

  // 目标重叠率：~3%（仅品牌词重叠）
  const targetOverlapRate = '~3%'

  // 是否达到最优（重叠率 < 10%）
  const isOptimal = averageOverlapRate < 0.10

  return {
    averageOverlapRate: Math.round(averageOverlapRate * 100) / 100,
    pairwiseOverlaps,
    brandKeywordsShared,
    targetOverlapRate,
    isOptimal
  }
}
