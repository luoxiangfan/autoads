import { NextRequest, NextResponse } from 'next/server'
import { findOfferById } from '@/lib/offers'
import { generateAdCreative } from '@/lib/ad-creative-gen'
import { createAdCreative, type GeneratedAdCreativeData } from '@/lib/ad-creative'
import {
  buildCreativeKeywordSet,
} from '@/lib/creative-keyword-set-builder'
import {
  applyCreativeKeywordSetToCreative,
  buildCreativeBrandKeywords,
  createCreativeAdStrengthPayload,
  createCreativeApiRetryHistory,
  createCreativeBucketSummaryPayload,
  createCreativeKeywordSetBuilderInput,
  createCreativeOptimizationPayload,
  createCreativeOfferSummaryPayload,
  createCreativePublishDecisionPayload,
  createCreativeQualityEvaluationInput,
  createCreativeQualityGatePayload,
  createCreativeResponsePayload,
  createCreativeScoreBreakdown,
  mergeUsedKeywordsExcludingBrand,
  resolveCreativeKeywordAudit,
} from '@/lib/creative-keyword-runtime'
import { getSearchTermFeedbackHints } from '@/lib/search-term-feedback-hints'
import {
  AD_CREATIVE_MAX_AUTO_RETRIES,
  AD_CREATIVE_REQUIRED_MIN_SCORE,
  evaluateCreativeForQuality,
  runCreativeGenerationQualityLoop
} from '@/lib/ad-creative-quality-loop'
import { getAvailableBuckets, getKeywordsByLinkTypeAndBucket } from '@/lib/offer-keyword-pool'
import { markBucketGenerated } from '@/lib/offers'
import { getThemeByBucket, type BucketType } from '@/lib/ad-creative-generator'
import {
  getCreativeTypeForBucketSlot,
} from '@/lib/creative-type'
import { resolveGeneratedBuckets } from '@/lib/creative-generated-buckets'
import { hasModelAnchorEvidenceFromOffer } from '@/lib/model-anchor-evidence'
import { normalizeSingleCreativeSelection } from '@/lib/creative-request-normalizer'

type CanonicalBucketSlot = 'A' | 'B' | 'D'

/**
 * POST /api/offers/:id/generate-creatives
 * 为指定Offer生成AI创意（支持自动重试优化到EXCELLENT）
 *
 * 新增功能：
 * 1. 使用EXCELLENT标准的优化Prompt
 * 2. 自动评估Ad Strength
 * 3. 如果未达到EXCELLENT，自动重试（最多3次）
 * 4. 返回最佳结果
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

    const body = await request.json()
    const {
      maxRetries = AD_CREATIVE_MAX_AUTO_RETRIES,
      targetRating: requestedTargetRating = 'GOOD',
      bucket: explicitBucket,
      creativeType: explicitCreativeType,
    } = body
    const forcePublishRequested = body?.forcePublish === true || body?.force_publish === true
    const parsedOfferId = parseInt(id, 10)
    const parsedUserId = parseInt(userId, 10)

    // 验证Offer存在且属于当前用户
    const offer = await findOfferById(parsedOfferId, parsedUserId)

    if (!offer) {
      return NextResponse.json(
        {
          error: 'Offer不存在或无权访问',
        },
        { status: 404 }
      )
    }

    // 验证Offer已完成抓取
    if (offer.scrape_status === 'failed') {
      return NextResponse.json(
        {
          error: 'Offer信息抓取失败，请重新抓取',
        },
        { status: 400 }
      )
    }

    const linkType = offer.page_type === 'store' ? 'store' : 'product'
    const availableBuckets = await getAvailableBuckets(parsedOfferId)
    const hasExplicitBucket = explicitBucket !== undefined && explicitBucket !== null && String(explicitBucket).trim() !== ''
    const hasExplicitCreativeType = explicitCreativeType !== undefined && explicitCreativeType !== null && String(explicitCreativeType).trim() !== ''
    const normalizedSelection = normalizeSingleCreativeSelection({
      creativeType: explicitCreativeType,
      bucket: explicitBucket,
      hasExplicitCreativeType,
      hasExplicitBucket,
      resolveLegacyModelIntent: () => hasModelAnchorEvidenceFromOffer(offer),
    })

    if (normalizedSelection.errorCode === 'invalid-creative-type') {
      return NextResponse.json(
        { error: 'creativeType 无效，仅支持 brand_intent/model_intent/product_intent 及兼容旧 key' },
        { status: 400 }
      )
    }

    if (normalizedSelection.errorCode === 'invalid-bucket') {
      return NextResponse.json(
        { error: 'bucket 无效，仅支持 A/B/C/D/S' },
        { status: 400 }
      )
    }

    if (normalizedSelection.errorCode === 'creative-type-bucket-conflict') {
      return NextResponse.json(
        { error: 'creativeType 与 bucket 不一致，请传入同一创意类型对应的槽位' },
        { status: 400 }
      )
    }

    const bucketSelection = normalizedSelection.bucketSelection
    let requestedBucket: CanonicalBucketSlot | null = normalizedSelection.requestedBucket
    if (normalizedSelection.legacyFallbackToProduct) {
      console.warn(
        `[GenerateCreatives] Offer ${parsedOfferId}: legacy bucket ${bucketSelection.rawBucket} fallback to D/product_intent because no verifiable model anchor evidence was found`
      )
    }
    if (availableBuckets.length === 0) {
      return NextResponse.json(
        { error: '该Offer已生成全部3种创意类型（A/B/D），请删除某个类型后再生成。' },
        { status: 409 }
      )
    }

    if (requestedBucket && !availableBuckets.includes(requestedBucket)) {
      return NextResponse.json(
        { error: `该Offer已生成${requestedBucket}槽位创意。请先删除对应创意后再生成。`, availableBuckets },
        { status: 409 }
      )
    }

    const selectedBucket = (requestedBucket || availableBuckets[0]) as CanonicalBucketSlot
    const creativeType = getCreativeTypeForBucketSlot(selectedBucket)
    const bucketIntent = getThemeByBucket(selectedBucket as BucketType, linkType)
    const bucketIntentEn = bucketIntent.split(' - ')[1] || bucketIntent

    // 读取近期搜索词反馈（轻量 hard/soft 提示）
    let searchTermFeedbackHints: {
      hardNegativeTerms?: string[]
      softSuppressTerms?: string[]
      highPerformingTerms?: string[]
    } | undefined
    try {
      const hints = await getSearchTermFeedbackHints({
        offerId: parsedOfferId,
        userId: parsedUserId
      })
      searchTermFeedbackHints = {
        hardNegativeTerms: hints.hardNegativeTerms,
        softSuppressTerms: hints.softSuppressTerms,
        highPerformingTerms: hints.highPerformingTerms
      }
      console.log(
        `🔁 搜索词反馈已加载: high=${hints.highPerformingTerms.length}, hard=${hints.hardNegativeTerms.length}, soft=${hints.softSuppressTerms.length}, rows=${hints.sourceRows}`
      )
    } catch (hintError: any) {
      console.warn(`⚠️ 搜索词反馈读取失败，继续默认生成: ${hintError?.message || 'unknown error'}`)
    }

    const normalizedMaxRetries = Math.max(
      0,
      Math.min(
        AD_CREATIVE_MAX_AUTO_RETRIES,
        Number.isFinite(Number(maxRetries)) ? Math.floor(Number(maxRetries)) : AD_CREATIVE_MAX_AUTO_RETRIES
      )
    )
    const enforcedTargetRating = 'GOOD'
    const offerAny = offer as any
    if (String(requestedTargetRating || '').toUpperCase() !== enforcedTargetRating) {
      console.warn(`⚠️ targetRating=${requestedTargetRating} 已忽略，统一使用最低阈值 GOOD`)
    }

    console.log(`🎯 开始生成创意，目标评级: ${enforcedTargetRating}, 自动重试上限: ${normalizedMaxRetries}次`)
    console.log(`📌 生成接口 forcePublish 参数: ${forcePublishRequested ? '已传入（本接口忽略）' : '未传入'}`)
    console.time('⏱️ 总生成耗时')

    let usedKeywords: string[] = []
    const brandKeywords = buildCreativeBrandKeywords(offer.brand)

    const generationResult = await runCreativeGenerationQualityLoop<GeneratedAdCreativeData>({
      maxRetries: normalizedMaxRetries,
      delayMs: 1000,
      generate: async ({ attempt, retryFailureType }) => {
        const creative = await generateAdCreative(
          parsedOfferId,
          parsedUserId,
          {
            theme: bucketIntent,
            skipCache: attempt > 1,
            excludeKeywords: attempt > 1 ? usedKeywords : undefined,
            retryFailureType,
            searchTermFeedbackHints,
            bucket: selectedBucket,
            bucketIntent,
            bucketIntentEn,
            deferKeywordPostProcessingToBuilder: true,
          }
        )

        let seedCandidates: Array<Record<string, any>> = []
        try {
          const bucketResult = await getKeywordsByLinkTypeAndBucket(
            parsedOfferId,
            linkType as 'product' | 'store',
            selectedBucket
          )
          seedCandidates = Array.isArray(bucketResult.keywords)
            ? bucketResult.keywords as Array<Record<string, any>>
            : []
        } catch (poolError: any) {
          console.warn(
            `⚠️ [generate-creatives] 桶${selectedBucket}关键词同步失败: ${poolError?.message || poolError}`
          )
        }

        const keywordSet = await buildCreativeKeywordSet(createCreativeKeywordSetBuilderInput({
          offer,
          userId: parsedUserId,
          creative,
          creativeType,
          bucket: selectedBucket,
          scopeLabel: `sync-${selectedBucket || 'default'}`,
          seedCandidates,
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
        userId: parsedUserId,
        bucket: selectedBucket,
        productNameFallback: offerAny.product_title || offerAny.name,
        productTitleFallback: offerAny.title,
      }))
    })

    const attempts = generationResult.attempts
    const bestCreative = generationResult.selectedCreative
    const selectedEvaluation = generationResult.selectedEvaluation
    const bestEvaluation = selectedEvaluation.adStrength
    const bestCreativeAudit = resolveCreativeKeywordAudit(bestCreative)
    const qualityPassed = selectedEvaluation.passed
    const retryHistory = createCreativeApiRetryHistory(generationResult.history)

    console.log(`\n🎯 最终结果: ${bestEvaluation.finalRating} (${bestEvaluation.finalScore}分)`)
    console.log(`📊 总尝试次数: ${attempts}次`)
    console.timeEnd('⏱️ 总生成耗时')

    if (!qualityPassed) {
      console.warn(
        `⚠️ 连续重试仍未达到 GOOD 阈值，已按策略保存最佳结果: score=${bestEvaluation.finalScore}, failureType=${selectedEvaluation.failureType}`
      )
    } else {
      console.log(`✅ 创意质量达标: ${bestEvaluation.finalScore}分 ≥ ${AD_CREATIVE_REQUIRED_MIN_SCORE}分 且通过规则门禁`)
    }


    // 保存到数据库
    const savedCreative = await createAdCreative(parsedUserId, parsedOfferId, {
      headlines: bestCreative.headlines,
      descriptions: bestCreative.descriptions,
      keywords: bestCreative.keywords,
      keywordsWithVolume: bestCreative.keywordsWithVolume,
      callouts: bestCreative.callouts,
      sitelinks: bestCreative.sitelinks,
      theme: bestCreative.theme,
      explanation: bestCreative.explanation,
      final_url: offer.final_url || offer.url,
      final_url_suffix: offer.final_url_suffix || undefined,
      // 传入Ad Strength评估的分数（而不是让createAdCreative重新计算）
      score: bestEvaluation.finalScore,
      score_breakdown: createCreativeScoreBreakdown(bestEvaluation),
      generation_round: attempts, // 传入实际的尝试次数
      ai_model: bestCreative.ai_model, // 传入实际使用的AI模型
      creative_type: creativeType,
      keyword_bucket: selectedBucket,
      bucket_intent: bucketIntent,
      adStrength: createCreativeAdStrengthPayload(bestEvaluation, bestCreativeAudit),
    })
    await markBucketGenerated(parsedOfferId, selectedBucket)

    console.log(`✅ 广告创意已保存到数据库 (ID: ${savedCreative.id})`)

    return NextResponse.json({
      success: true,
      ...createCreativePublishDecisionPayload(forcePublishRequested),
      qualityGate: createCreativeQualityGatePayload(selectedEvaluation),
      creative: createCreativeResponsePayload({
        id: savedCreative.id,
        creative: bestCreative,
        audit: bestCreativeAudit,
      }),
      ...createCreativeBucketSummaryPayload({
        creativeType,
        bucket: selectedBucket,
        bucketIntent,
        generatedBuckets: resolveGeneratedBuckets({
          availableBuckets: availableBuckets as CanonicalBucketSlot[],
          selectedBucket,
        }),
      }),
      adStrength: createCreativeAdStrengthPayload(bestEvaluation, bestCreativeAudit, {
        includeRsaQualityGate: true,
      }),
      optimization: createCreativeOptimizationPayload({
        attempts,
        targetRating: enforcedTargetRating,
        achieved: qualityPassed,
        qualityGatePassed: qualityPassed,
        history: retryHistory
      }),
      offer: createCreativeOfferSummaryPayload(offer)
    })
  } catch (error: any) {
    console.error('生成创意失败:', error)

    return NextResponse.json(
      {
        error: error.message || '生成创意失败',
      },
      { status: 500 }
    )
  }
}
