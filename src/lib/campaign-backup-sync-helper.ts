/**
 * Google Ads 同步时创建备份的辅助函数
 * 
 * 使用场景：
 * 1. 从 Google Ads API 同步广告系列到 campaigns 表时
 * 2. 创建 sync_initial 类型备份
 * 
 * @param campaign - campaigns 表的记录
 * @param backupType - 备份类型（sync_initial 或 sync_7day）
 * @param backupReason - 备份原因描述
 * 
 * @example
 * // 在同步逻辑中，插入 campaigns 后调用
 * const campaign = await createCampaign({...})
 * await createBackupForSyncedCampaign(campaign, BackupType.SYNC_INITIAL, 'Google Ads 同步时首次备份')
 */
export async function createBackupForSyncedCampaign(
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
  backupType: 'sync_initial' | 'sync_7day' = 'sync_initial',
  backupReason: string = 'Google Ads 同步时备份'
): Promise<void> {
  try {
    const { createCampaignBackup, BackupType } = await import('@/lib/campaign-backup')
    
    const backupId = await createCampaignBackup(
      campaign,
      backupType === 'sync_initial' ? BackupType.SYNC_INITIAL : BackupType.SYNC_7DAY,
      backupReason
    )
    
    console.log(`✅ 同步广告系列 #${campaign.id} 备份创建成功 ID: ${backupId}`)
  } catch (error: any) {
    console.warn(`⚠️ 同步广告系列 #${campaign.id} 备份失败:`, error.message)
    // 备份失败不阻断主流程
  }
}

/**
 * 批量为同步的广告系列创建备份
 * 
 * @param campaigns - 同步的 campaigns 记录数组
 * @param backupType - 备份类型
 * 
 * @example
 * // 在批量同步后调用
 * const syncedCampaigns = await syncFromGoogleAds(...)
 * await createBackupsForSyncedCampaigns(syncedCampaigns, 'sync_initial')
 */
export async function createBackupsForSyncedCampaigns(
  campaigns: Array<{
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
  }>,
  backupType: 'sync_initial' | 'sync_7day' = 'sync_initial'
): Promise<{
  success: number
  failed: number
  errors: string[]
}> {
  let success = 0
  let failed = 0
  const errors: string[] = []

  for (const campaign of campaigns) {
    try {
      await createBackupForSyncedCampaign(campaign, backupType)
      success++
    } catch (error: any) {
      failed++
      errors.push(`Campaign #${campaign.id}: ${error.message}`)
    }
  }

  return { success, failed, errors }
}
