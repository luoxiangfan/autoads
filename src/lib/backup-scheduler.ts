/**
 * 定时任务配置 - 7 天备份任务
 * 
 * 配置方式 1: 使用 node-cron（推荐）
 * 配置方式 2: 使用系统 cron + HTTP API
 * 配置方式 3: 集成到现有调度器
 */

import { run7DayBackupTask } from './tasks/7day-backup'

/**
 * 配置 1: 使用 node-cron
 * 
 * 需要安装：npm install node-cron
 */
export function setup7DayBackupWithCron() {
  // 动态导入 node-cron（避免硬依赖）
  let cron: any
  try {
    cron = require('node-cron')
  } catch (error) {
    console.warn('⚠️ node-cron 未安装，跳过定时任务配置')
    console.warn('   安装方法：npm install node-cron')
    console.warn('   或使用其他方式配置（见 docs/BACKUP_SCHEDULE_SETUP.md）')
    return
  }

  // 每天凌晨 3 点执行
  // Cron 表达式：秒 分 时 日 月 星期
  cron.schedule('0 0 3 * * *', async () => {
    console.log('[Scheduler] 开始执行 7 天备份任务...')
    
    try {
      const result = await run7DayBackupTask()
      
      console.log('[Scheduler] 7 天备份任务完成:')
      console.log(`  - 找到广告系列：${result.totalFound}`)
      console.log(`  - 成功备份：${result.totalBackedUp}`)
      console.log(`  - 失败：${result.failedCount}`)
      
      if (result.errors.length > 0) {
        console.error('  - 错误:')
        result.errors.forEach((err: string) => console.error(`    ${err}`))
      }
    } catch (error: any) {
      console.error('[Scheduler] 7 天备份任务执行失败:', error.message)
    }
  })

  console.log('✅ 7 天备份定时任务已配置（每天凌晨 3 点执行）')
}

/**
 * 配置 2: 手动触发（用于测试或外部 cron）
 * 
 * 可以通过 HTTP API 触发：
 * POST /api/admin/backups/trigger-7day
 */
export async function trigger7DayBackupManual() {
  console.log('[Manual] 手动触发 7 天备份任务...')
  
  try {
    const result = await run7DayBackupTask()
    
    console.log('[Manual] 任务完成:')
    console.log(`  - 找到广告系列：${result.totalFound}`)
    console.log(`  - 成功备份：${result.totalBackedUp}`)
    console.log(`  - 失败：${result.failedCount}`)
    
    return result
  } catch (error: any) {
    console.error('[Manual] 任务失败:', error.message)
    throw error
  }
}

/**
 * 配置 3: 集成到现有调度器
 * 
 * 如果项目已有调度器（如 SyncScheduler），可以添加 7 天备份任务
 */
export function integrateWithExistingScheduler() {
  console.log('ℹ️  集成到现有调度器')
  console.log('   请参考 docs/BACKUP_SCHEDULE_SETUP.md 中的示例代码')
}

/**
 * 初始化定时任务
 * 
 * 在应用启动时调用（如 src/lib/init.ts 或 src/app/layout.tsx）
 */
export function initBackupScheduler() {
  console.log('🔄 初始化备份定时任务...')
  
  // 方式 1: 使用 node-cron（推荐）
  setup7DayBackupWithCron()
  
  // 方式 2: 如果已有调度器，取消下面注释
  // integrateWithExistingScheduler()
  
  console.log('✅ 备份定时任务初始化完成')
}
