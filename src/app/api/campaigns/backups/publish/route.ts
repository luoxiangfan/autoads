import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { createError, ErrorCode, AppError } from '@/lib/errors'
import { getCampaignBackupById, updateBackupPublishStatus, PublishStatus } from '@/lib/campaign-backup'
import { normalizeCampaignPublishRequestBody } from '@/lib/autoads-request-normalizers'

/**
 * POST /api/campaigns/backups/publish
 * 批量发布广告系列备份
 * 
 * Request Body:
 * {
 *   backupIds: number[]              // 备份 ID 列表
 *   googleAdsAccountId: number       // 目标 Google Ads 账号（customerId 或内部 ID）
 *   pauseOldCampaigns: boolean       // 是否暂停旧广告系列（可选，默认 true）
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const authResult = await verifyAuth(request)
    if (!authResult.authenticated || !authResult.user) {
      const error = createError.unauthorized()
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    const userId = authResult.user.userId
    const parentRequestId = request.headers.get('x-request-id') || undefined

    // 2. 解析请求体
    const body = await request.json()
    const {
      backupIds,
      googleAdsAccountId,
      pauseOldCampaigns = true
    } = body

    // 3. 验证必填字段
    if (!backupIds || !Array.isArray(backupIds) || backupIds.length === 0) {
      const error = createError.requiredField('backupIds')
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    if (!googleAdsAccountId) {
      const error = createError.requiredField('googleAdsAccountId')
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    // 4. 验证备份归属并加载备份数据
    const db = await getDatabase()
    const validatedBackups: any[] = []

    for (const backupId of backupIds) {
      const backup = await getCampaignBackupById(backupId, userId)
      
      if (!backup) {
        return NextResponse.json({
          error: `备份 #${backupId} 不存在或无权访问`,
          code: 'BACKUP_NOT_FOUND'
        }, { status: 404 })
      }

      // 检查是否已经发布过
      if (backup.publishStatus === PublishStatus.PUBLISHED) {
        return NextResponse.json({
          error: `备份 #${backupId} 已经发布过，不能重复发布`,
          code: 'BACKUP_ALREADY_PUBLISHED',
          details: {
            backupId,
            publishedAt: backup.publishedAt,
            publishedCampaignId: backup.publishedCampaignId
          }
        }, { status: 422 })
      }

      validatedBackups.push(backup)
    }

    // 5. 获取 Google Ads 账号信息（兼容内部 ID 与 customer_id）
    const normalizeAccountIdInput = (value: unknown): string => {
      return String(value ?? '').trim().replace(/\s+/g, '')
    }
    const normalizeCustomerId = (value: string): string => {
      return value.replace(/-/g, '')
    }
    const toSafePositiveInt32 = (value: string): number | null => {
      const MAX_INT32 = 2147483647
      if (!/^\d+$/.test(value)) return null
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_INT32) {
        return null
      }
      return parsed
    }

    const rawGoogleAdsAccountId = normalizeAccountIdInput(googleAdsAccountId)
    const normalizedCustomerId = normalizeCustomerId(rawGoogleAdsAccountId)
    const accountIdAsInt32 = toSafePositiveInt32(rawGoogleAdsAccountId)

    let adsAccount = null as any
    let accountLookupBy: 'id' | 'customer_id' | null = null

    if (accountIdAsInt32 !== null) {
      adsAccount = await db.queryOne(`
        SELECT
          id,
          customer_id,
          parent_mcc_id,
          is_active,
          status
        FROM google_ads_accounts
        WHERE id = ? AND user_id = ? AND is_active = 1
      `, [accountIdAsInt32, Number(userId)]) as any
      if (adsAccount) {
        accountLookupBy = 'id'
      }
    }

    // 兜底：若传入的是 customer_id，自动映射到内部 account.id
    if (!adsAccount && normalizedCustomerId) {
      adsAccount = await db.queryOne(`
        SELECT
          id,
          customer_id,
          parent_mcc_id,
          is_active,
          status
        FROM google_ads_accounts
        WHERE user_id = ?
          AND is_active = 1
          AND REPLACE(customer_id, '-', '') = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `, [Number(userId), normalizedCustomerId]) as any
      if (adsAccount) {
        accountLookupBy = 'customer_id'
      }
    }

    if (!adsAccount) {
      const error = createError.gadsAccountNotActive({
        accountId: googleAdsAccountId,
        userId
      })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    const resolvedGoogleAdsAccountId = Number(adsAccount.id)
    console.log(`✅ 使用 Google Ads 账号：${rawGoogleAdsAccountId} (内部 ID: ${resolvedGoogleAdsAccountId})`)

    // 6. 批量发布（使用队列系统）
    const results: any[] = []
    const { getOrCreateQueueManager } = await import('@/lib/queue/init-queue')
    const queue = await getOrCreateQueueManager()

    for (const backup of validatedBackups) {
      try {
        // 验证备份数据
        const campaignData = backup.campaignData
        const campaignConfig = backup.campaignConfig

        if (!campaignData || !campaignConfig) {
          throw new Error('备份数据不完整')
        }

        // 获取 Offer 信息
        const offer = await db.queryOne(`
          SELECT id, url, final_url, final_url_suffix, brand, target_country, target_language, scrape_status, category, offer_name
          FROM offers
          WHERE id = ? AND user_id = ?
        `, [backup.offerId, userId]) as any

        if (!offer) {
          throw new Error(`Offer #${backup.offerId} 不存在`)
        }

        if (offer.scrape_status !== 'completed') {
          throw new Error(`Offer #${backup.offerId} 尚未准备就绪 (状态：${offer.scrape_status})`)
        }

        // 获取广告创意
        const adCreativeId = campaignData.adCreativeId || campaignData.ad_creative_id
        if (!adCreativeId) {
          throw new Error('备份数据缺少广告创意 ID')
        }

        const creative = await db.queryOne(`
          SELECT id, headlines, descriptions, keywords, negative_keywords, callouts, sitelinks, final_url, final_url_suffix, launch_score, keywords_with_volume, theme
          FROM ad_creatives
          WHERE id = ? AND offer_id = ? AND user_id = ?
        `, [adCreativeId, backup.offerId, userId]) as any

        if (!creative) {
          throw new Error(`广告创意 #${adCreativeId} 不存在`)
        }

        // 构建发布任务数据
        const taskData: any = {
          offerId: backup.offerId,
          adCreativeId: adCreativeId,
          googleAdsAccountId: resolvedGoogleAdsAccountId,
          campaignConfig: {
            campaignName: campaignConfig.campaignName || campaignConfig.campaign_name,
            budgetAmount: campaignConfig.budgetAmount || campaignConfig.budget_amount,
            budgetType: campaignConfig.budgetType || campaignConfig.budget_type,
            targetCountry: campaignConfig.targetCountry || campaignConfig.target_country,
            targetLanguage: campaignConfig.targetLanguage || campaignConfig.target_language,
            biddingStrategy: campaignConfig.biddingStrategy || campaignConfig.bidding_strategy,
            finalUrlSuffix: campaignConfig.finalUrlSuffix || campaignConfig.final_url_suffix,
            adGroupName: campaignConfig.adGroupName || campaignConfig.ad_group_name,
            maxCpcBid: campaignConfig.maxCpcBid || campaignConfig.max_cpc_bid,
            keywords: campaignConfig.keywords || [],
            negativeKeywords: campaignConfig.negativeKeywords || campaignConfig.negative_keywords,
            negativeKeywordMatchType: campaignConfig.negativeKeywordMatchType || campaignConfig.negative_keyword_match_type
          },
          pauseOldCampaigns,
          enableCampaignImmediately: false,
          fromBackupId: backup.id  // 标记是从备份发布
        }

        // 入队任务
        await queue.enqueue(
          'campaign-publish',
          taskData,
          userId,
          {
            parentRequestId,
            priority: 'high'
          }
        )

        // 更新备份状态为 pending（队列处理中）
        await updateBackupPublishStatus(backup.id, userId, PublishStatus.PENDING)

        results.push({
          backupId: backup.id,
          status: 'queued',
          message: '发布任务已提交到后台队列处理'
        })

        console.log(`✅ 备份 #${backup.id} 发布任务已入队`)

      } catch (variantError: any) {
        console.error(`❌ 备份 #${backup.id} 发布失败:`, variantError.message)
        
        // 更新备份状态为 failed
        await updateBackupPublishStatus(backup.id, userId, PublishStatus.FAILED, {
          publishError: variantError.message
        })

        results.push({
          backupId: backup.id,
          status: 'failed',
          error: variantError.message
        })
      }
    }

    // 7. 返回结果
    const queued = results.filter(r => r.status === 'queued').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: queued > 0,
      data: {
        queued,
        failed,
        total: backupIds.length,
        results
      }
    }, { status: 202 })

  } catch (error: any) {
    console.error('批量发布备份失败:', error.message)
    
    if (error instanceof AppError) {
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    return NextResponse.json(
      { error: '批量发布失败', details: error.message },
      { status: 500 }
    )
  }
}
