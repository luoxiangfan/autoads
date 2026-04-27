import { getDatabase } from '@/lib/db'
import { createCampaignBackup, BackupType } from '@/lib/campaign-backup'

/**
 * 定时任务：为创建超过 7 天的 Google Ads 同步广告系列创建备份
 * 
 * 执行逻辑:
 * 1. 查找创建时间 >= 7 天的广告系列（google_ads_account_id 不为空）
 * 2. 检查是否已经有 sync_7day 类型的备份
 * 3. 为没有备份的广告系列创建备份
 * 
 * 执行频率：每天凌晨 3 点
 */
export async function run7DayBackupTask(): Promise<{
  success: boolean
  totalFound: number
  totalBackedUp: number
  failedCount: number
  errors: string[]
}> {
  const errors: string[] = []
  let totalFound = 0
  let totalBackedUp = 0
  let failedCount = 0

  try {
    console.log('[7DayBackup] 开始执行 7 天备份任务...')

    const db = await getDatabase()

    // 1. 查找需要备份的广告系列
    // PostgreSQL 和 SQLite 的日期函数语法不同
    const dateSubSql = db.type === 'postgres' 
      ? "NOW() - INTERVAL '7 days'"
      : "datetime('now', '-7 days')"

    const campaignsSql = `
      SELECT c.*
      FROM campaigns c
      LEFT JOIN campaign_backups cb ON c.id = cb.campaign_id 
        AND cb.backup_type = 'sync_7day'
      WHERE c.google_ads_account_id IS NOT NULL
        AND cb.id IS NULL
        AND c.created_at <= ${dateSubSql}
        AND c.is_deleted = 0
      ORDER BY c.created_at ASC
    `

    const campaigns = await db.query(campaignsSql, []) as any[]
    totalFound = campaigns.length

    console.log(`[7DayBackup] 找到 ${totalFound} 个需要备份的广告系列`)

    if (totalFound === 0) {
      console.log('[7DayBackup] 没有需要备份的广告系列')
      return {
        success: true,
        totalFound: 0,
        totalBackedUp: 0,
        failedCount: 0,
        errors: []
      }
    }

    // 2. 为每个广告系列创建备份
    for (const campaign of campaigns) {
      try {
        console.log(`[7DayBackup] 为广告系列 #${campaign.id} (${campaign.campaign_name}) 创建备份...`)

        const backupId = await createCampaignBackup(
          campaign,
          BackupType.SYNC_7DAY,
          '创建后第七天自动备份'
        )

        console.log(`[7DayBackup] ✅ 备份创建成功 ID: ${backupId}`)
        totalBackedUp++

      } catch (error: any) {
        console.error(`[7DayBackup] ❌ 广告系列 #${campaign.id} 备份失败:`, error.message)
        errors.push(`Campaign #${campaign.id}: ${error.message}`)
        failedCount++
      }
    }

    console.log(`[7DayBackup] 任务完成：成功 ${totalBackedUp}, 失败 ${failedCount}`)

    return {
      success: failedCount === 0,
      totalFound,
      totalBackedUp,
      failedCount,
      errors
    }

  } catch (error: any) {
    console.error('[7DayBackup] 任务执行失败:', error.message)
    errors.push(`Task execution failed: ${error.message}`)
    
    return {
      success: false,
      totalFound,
      totalBackedUp,
      failedCount,
      errors
    }
  }
}

/**
 * API 路由：手动触发 7 天备份任务（管理员专用）
 */
export async function handler(request: Request): Promise<Response> {
  const { NextResponse } = await import('next/server')
  const { verifyAuth } = await import('@/lib/auth')

  try {
    // 验证管理员权限
    const authResult = await verifyAuth(request as any)
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 这里可以添加管理员角色检查
    // if (authResult.user.role !== 'admin') { ... }

    // 执行任务
    const result = await run7DayBackupTask()

    return NextResponse.json({
      success: result.success,
      data: result
    })

  } catch (error: any) {
    console.error('手动触发 7 天备份任务失败:', error.message)
    const { NextResponse } = await import('next/server')
    return NextResponse.json(
      { error: '任务执行失败', details: error.message },
      { status: 500 }
    )
  }
}
