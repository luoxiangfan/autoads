import { getDatabase, type Database } from '@/lib/db'
import { getInsertedId } from '@/lib/db-helpers'

/**
 * 备份类型枚举
 */
export enum BackupType {
  AUTO_CREATED = 'auto_created',      // 广告系列创建时自动备份
  SYNC_INITIAL = 'sync_initial',      // Google Ads 同步时首次备份
  SYNC_7DAY = 'sync_7day',            // Google Ads 同步后第 7 天备份
  MANUAL = 'manual'                   // 手动备份
}

/**
 * 发布状态枚举
 */
export enum PublishStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * 备份记录接口
 */
export interface CampaignBackup {
  id: number
  campaignId: number | null
  userId: number
  offerId: number
  googleAdsAccountId: number | null
  campaignData: any
  campaignConfig: any | null
  backupType: BackupType
  backupReason: string | null
  publishStatus: PublishStatus
  publishedAt: string | null
  publishedCampaignId: number | null
  publishError: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 创建广告系列备份
 */
export async function createCampaignBackup(
  campaign: {
    id: number
    user_id: number
    offer_id: number
    google_ads_account_id: number | null
    campaign_name: string
    budget_amount: number
    budget_type: string
    max_cpc: number | null
    status: string
    campaign_config: string | null
    [key: string]: any
  },
  backupType: BackupType,
  backupReason?: string
): Promise<number> {
  const db = await getDatabase()
  
  // 构建完整的 campaign 数据对象
  const campaignData = {
    id: campaign.id,
    userId: campaign.user_id,
    offerId: campaign.offer_id,
    googleAdsAccountId: campaign.google_ads_account_id,
    campaignName: campaign.campaign_name,
    budgetAmount: campaign.budget_amount,
    budgetType: campaign.budget_type,
    maxCpc: campaign.max_cpc,
    status: campaign.status,
    startDate: campaign.start_date,
    endDate: campaign.end_date,
    creationStatus: campaign.creation_status,
    adCreativeId: campaign.ad_creative_id,
    googleCampaignId: campaign.google_campaign_id,
    googleAdGroupId: campaign.google_ad_group_id,
    googleAdId: campaign.google_ad_id,
    pauseOldCampaigns: campaign.pause_old_campaigns,
    isTestVariant: campaign.is_test_variant,
    trafficAllocation: campaign.traffic_allocation,
    // 保留原始字段用于兼容
    user_id: campaign.user_id,
    offer_id: campaign.offer_id,
    google_ads_account_id: campaign.google_ads_account_id,
    campaign_name: campaign.campaign_name,
    budget_amount: campaign.budget_amount,
    budget_type: campaign.budget_type,
    max_cpc: campaign.max_cpc,
    status: campaign.status,
    start_date: campaign.start_date,
    end_date: campaign.end_date,
    creation_status: campaign.creation_status,
    ad_creative_id: campaign.ad_creative_id,
    google_campaign_id: campaign.google_campaign_id,
    google_ad_group_id: campaign.google_ad_group_id,
    google_ad_id: campaign.google_ad_id,
    pause_old_campaigns: campaign.pause_old_campaigns,
    is_test_variant: campaign.is_test_variant,
    traffic_allocation: campaign.traffic_allocation,
  }

  const campaignConfig = campaign.campaign_config ? JSON.parse(campaign.campaign_config) : null

  // 插入备份记录
  const insertSql = db.type === 'postgres' ? `
    INSERT INTO campaign_backups (
      campaign_id,
      user_id,
      offer_id,
      google_ads_account_id,
      campaign_data,
      campaign_config,
      backup_type,
      backup_reason,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    RETURNING id
  ` : `
    INSERT INTO campaign_backups (
      campaign_id,
      user_id,
      offer_id,
      google_ads_account_id,
      campaign_data,
      campaign_config,
      backup_type,
      backup_reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `

  const params = db.type === 'postgres' ? [
    campaign.id,
    campaign.user_id,
    campaign.offer_id,
    campaign.google_ads_account_id,
    JSON.stringify(campaignData),
    campaignConfig ? JSON.stringify(campaignConfig) : null,
    backupType,
    backupReason || null
  ] : [
    campaign.id,
    campaign.user_id,
    campaign.offer_id,
    campaign.google_ads_account_id,
    JSON.stringify(campaignData),
    campaignConfig ? JSON.stringify(campaignConfig) : null,
    backupType,
    backupReason || null
  ]

  const result = await db.exec(insertSql, params)
  return getInsertedId(result, db.type)
}

/**
 * 获取备份列表（带筛选和分页）
 */
export async function getCampaignBackups(
  userId: number,
  options: {
    limit?: number
    offset?: number
    backupType?: BackupType
    publishStatus?: PublishStatus
    offerId?: number
    googleAdsAccountId?: number
  } = {}
): Promise<{ backups: CampaignBackup[]; total: number }> {
  const db = await getDatabase()
  
  const {
    limit = 50,
    offset = 0,
    backupType,
    publishStatus,
    offerId,
    googleAdsAccountId
  } = options

  // 构建 WHERE 子句
  const whereClauses = ['user_id = ?']
  const params: any[] = [userId]

  if (backupType) {
    whereClauses.push('backup_type = ?')
    params.push(backupType)
  }

  if (publishStatus) {
    whereClauses.push('publish_status = ?')
    params.push(publishStatus)
  }

  if (offerId) {
    whereClauses.push('offer_id = ?')
    params.push(offerId)
  }

  if (googleAdsAccountId) {
    whereClauses.push('google_ads_account_id = ?')
    params.push(googleAdsAccountId)
  }

  const whereSql = whereClauses.join(' AND ')

  // 查询总数
  const countSql = `SELECT COUNT(*) as count FROM campaign_backups WHERE ${whereSql}`
  const countResult = await db.queryOne(countSql, params) as any
  const total = countResult?.count || 0

  // 查询数据
  const selectSql = `
    SELECT *
    FROM campaign_backups
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `

  const backups = await db.query(selectSql, [...params, limit, offset]) as any[]

  // 转换字段名为 camelCase
  return {
    backups: backups.map((backup) => ({
      id: backup.id,
      campaignId: backup.campaign_id,
      userId: backup.user_id,
      offerId: backup.offer_id,
      googleAdsAccountId: backup.google_ads_account_id,
      campaignData: typeof backup.campaign_data === 'string' 
        ? JSON.parse(backup.campaign_data) 
        : backup.campaign_data,
      campaignConfig: backup.campaign_config 
        ? (typeof backup.campaign_config === 'string'
            ? JSON.parse(backup.campaign_config)
            : backup.campaign_config)
        : null,
      backupType: backup.backup_type,
      backupReason: backup.backup_reason,
      publishStatus: backup.publish_status,
      publishedAt: backup.published_at,
      publishedCampaignId: backup.published_campaign_id,
      publishError: backup.publish_error,
      createdAt: backup.created_at,
      updatedAt: backup.updated_at
    })),
    total
  }
}

/**
 * 根据 ID 获取备份
 */
export async function getCampaignBackupById(
  backupId: number,
  userId: number
): Promise<CampaignBackup | null> {
  const db = await getDatabase()
  
  const sql = `
    SELECT *
    FROM campaign_backups
    WHERE id = ? AND user_id = ?
  `

  const backup = await db.queryOne(sql, [backupId, userId]) as any

  if (!backup) return null

  return {
    id: backup.id,
    campaignId: backup.campaign_id,
    userId: backup.user_id,
    offerId: backup.offer_id,
    googleAdsAccountId: backup.google_ads_account_id,
    campaignData: typeof backup.campaign_data === 'string' 
      ? JSON.parse(backup.campaign_data) 
      : backup.campaign_data,
    campaignConfig: backup.campaign_config 
      ? (typeof backup.campaign_config === 'string'
          ? JSON.parse(backup.campaign_config)
          : backup.campaign_config)
      : null,
    backupType: backup.backup_type,
    backupReason: backup.backup_reason,
    publishStatus: backup.publish_status,
    publishedAt: backup.published_at,
    publishedCampaignId: backup.published_campaign_id,
    publishError: backup.publish_error,
    createdAt: backup.created_at,
    updatedAt: backup.updated_at
  }
}

/**
 * 更新备份发布状态
 */
export async function updateBackupPublishStatus(
  backupId: number,
  userId: number,
  status: PublishStatus,
  options: {
    publishedCampaignId?: number | null
    publishError?: string | null
  } = {}
): Promise<void> {
  const db = await getDatabase()
  
  const { publishedCampaignId, publishError } = options

  const updateSql = db.type === 'postgres' ? `
    UPDATE campaign_backups
    SET 
      publish_status = $1,
      published_at = CASE WHEN $1 = 'published' THEN NOW() ELSE published_at END,
      published_campaign_id = $2,
      publish_error = $3,
      updated_at = NOW()
    WHERE id = $4 AND user_id = $5
  ` : `
    UPDATE campaign_backups
    SET 
      publish_status = ?,
      published_at = CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE published_at END,
      published_campaign_id = ?,
      publish_error = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `

  const params = db.type === 'postgres' ? [
    status,
    publishedCampaignId || null,
    publishError || null,
    backupId,
    userId
  ] : [
    status,
    status,
    publishedCampaignId || null,
    publishError || null,
    backupId,
    userId
  ]

  await db.exec(updateSql, params)
}

/**
 * 查找需要创建 7 天备份的广告系列
 */
export async function findCampaignsNeeding7DayBackup(): Promise<any[]> {
  const db = await getDatabase()
  
  const sql = `
    SELECT c.*
    FROM campaigns c
    LEFT JOIN campaign_backups cb ON c.id = cb.campaign_id 
      AND cb.backup_type = 'sync_7day'
    WHERE c.google_ads_account_id IS NOT NULL  -- Google Ads 同步的
      AND cb.id IS NULL  -- 还没有 7 天备份的
      AND c.created_at <= datetime('now', '-7 days')
      AND c.is_deleted = 0
    ORDER BY c.created_at ASC
  `

  return await db.query(sql, [])
}

/**
 * 获取备份统计信息
 */
export async function getBackupStats(userId: number): Promise<{
  total: number
  pending: number
  published: number
  failed: number
  skipped: number
  byType: Record<BackupType, number>
}> {
  const db = await getDatabase()
  
  // 总统计
  const statsSql = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN publish_status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN publish_status = 'published' THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN publish_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN publish_status = 'skipped' THEN 1 ELSE 0 END) as skipped
    FROM campaign_backups
    WHERE user_id = ?
  `

  const stats = await db.queryOne(statsSql, [userId]) as any

  // 按类型统计
  const byTypeSql = `
    SELECT backup_type, COUNT(*) as count
    FROM campaign_backups
    WHERE user_id = ?
    GROUP BY backup_type
  `

  const byTypeRows = await db.query(byTypeSql, [userId]) as any[]
  const byType = {} as Record<BackupType, number>
  
  for (const row of byTypeRows) {
    byType[row.backup_type] = row.count
  }

  return {
    total: stats.total || 0,
    pending: stats.pending || 0,
    published: stats.published || 0,
    failed: stats.failed || 0,
    skipped: stats.skipped || 0,
    byType
  }
}
