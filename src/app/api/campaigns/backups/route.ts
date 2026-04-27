import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { createError } from '@/lib/errors'
import { getCampaignBackups, getBackupStats, BackupType, PublishStatus } from '@/lib/campaign-backup'

/**
 * GET /api/campaigns/backups
 * 获取广告系列备份列表
 * 
 * Query Parameters:
 * - limit: 返回数量限制（默认 50）
 * - offset: 偏移量（默认 0）
 * - backupType: 备份类型筛选（auto_created | sync_initial | sync_7day | manual）
 * - publishStatus: 发布状态筛选（pending | published | failed | skipped）
 * - offerId: Offer ID 筛选
 * - googleAdsAccountId: Google Ads 账号 ID 筛选
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // 1. 验证用户身份
    const authResult = await verifyAuth(request)
    if (!authResult.authenticated || !authResult.user) {
      const error = createError.unauthorized()
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    const userId = authResult.user.userId

    // 2. 解析查询参数
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const backupType = searchParams.get('backupType') as BackupType | null
    const publishStatus = searchParams.get('publishStatus') as PublishStatus | null
    const offerId = searchParams.get('offerId') ? parseInt(searchParams.get('offerId')!) : undefined
    const googleAdsAccountId = searchParams.get('googleAdsAccountId') ? parseInt(searchParams.get('googleAdsAccountId')!) : undefined

    // 3. 验证参数
    if (limit < 1 || limit > 500) {
      const error = createError.invalidParameter({
        field: 'limit',
        value: limit.toString(),
        constraint: 'Must be between 1 and 500'
      })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    if (offset < 0) {
      const error = createError.invalidParameter({
        field: 'offset',
        value: offset.toString(),
        constraint: 'Must be non-negative'
      })
      return NextResponse.json(error.toJSON(), { status: error.httpStatus })
    }

    // 4. 获取备份列表
    const { backups, total } = await getCampaignBackups(userId, {
      limit,
      offset,
      backupType: backupType || undefined,
      publishStatus: publishStatus || undefined,
      offerId,
      googleAdsAccountId
    })

    // 5. 获取统计信息
    const stats = await getBackupStats(userId)

    return NextResponse.json({
      success: true,
      data: {
        backups,
        total,
        stats
      }
    })

  } catch (error: any) {
    console.error('获取备份列表失败:', error.message)
    return NextResponse.json(
      { error: '获取备份列表失败', details: error.message },
      { status: 500 }
    )
  }
}
