/**
 * 更新备份发布状态（如果是从备份发布）
 */
const updateBackupStatusIfApplicable = async (
  backupId: number | undefined,
  userId: number,
  status: 'published' | 'failed',
  options?: {
    publishedCampaignId?: number
    publishError?: string
  }
) => {
  if (!backupId) return
  
  try {
    const { updateBackupPublishStatus, PublishStatus } = await import('@/lib/campaign-backup')
    
    await updateBackupPublishStatus(backupId, userId, status as any, options)
    
    if (status === 'published') {
      console.log(`✅ 备份 #${backupId} 状态已更新为 published`)
    } else {
      console.log(`❌ 备份 #${backupId} 状态已更新为 failed`)
    }
  } catch (backupUpdateError: any) {
    console.warn(`⚠️ 更新备份状态失败 (backupId=${backupId}):`, backupUpdateError.message)
  }
}
