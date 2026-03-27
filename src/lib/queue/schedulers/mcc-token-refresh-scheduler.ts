/**
 * MCC OAuth Token 自动刷新调度器
 * 
 * 功能：
 * - 每 6 小时检查一次所有 MCC 账号的 Token 状态
 * - 自动刷新 24 小时内即将过期的 Token
 * - 发送刷新结果通知（可选）
 * 
 * 调度策略：
 * - 提前 24 小时刷新，避免 Token 过期导致服务中断
 * - 每 6 小时检查一次，确保及时性
 * - 串行执行刷新任务，避免 OAuth 限流
 */

import { getQueueManager } from '../index';
import { logger } from '@/lib/structured-logger';

let __schedulerInitialized = false;
let __schedulerInterval: NodeJS.Timeout | null = null;

/**
 * 初始化 MCC Token 自动刷新调度器
 * 
 * @param checkIntervalHours 检查间隔（小时），默认 6 小时
 * @param expiryThresholdHours 过期阈值（小时），默认 24 小时内刷新
 */
export async function initializeMCCTokenRefreshScheduler(
  checkIntervalHours: number = 6,
  expiryThresholdHours: number = 24
): Promise<void> {
  if (__schedulerInitialized) {
    logger.warn('mcc_token_refresh_scheduler_already_initialized', {
      message: '调度器已初始化，跳过重复初始化',
    });
    return;
  }

  logger.info('mcc_token_refresh_scheduler_init', {
    checkIntervalHours,
    expiryThresholdHours,
  });

  // 立即执行一次检查
  await runMCCTokenRefreshCheck(expiryThresholdHours);

  // 设置定时检查
  const intervalMs = checkIntervalHours * 60 * 60 * 1000;
  
  __schedulerInterval = setInterval(async () => {
    try {
      await runMCCTokenRefreshCheck(expiryThresholdHours);
    } catch (error: any) {
      logger.error('mcc_token_refresh_scheduler_error', {
        error: error.message || String(error),
        stack: error.stack,
      });
    }
  }, intervalMs);

  __schedulerInitialized = true;

  logger.info('mcc_token_refresh_scheduler_started', {
    checkIntervalHours,
    expiryThresholdHours,
    nextCheckIn: `~${checkIntervalHours}小时`,
  });
}

/**
 * 执行一次 MCC Token 刷新检查
 */
async function runMCCTokenRefreshCheck(expiryThresholdHours: number): Promise<void> {
  const startTime = Date.now();
  
  logger.info('mcc_token_refresh_check_start', {
    operation: 'runMCCTokenRefreshCheck',
    expiryThresholdHours,
  });

  try {
    // 动态导入避免循环依赖
    const { refreshExpiringMCCTokens } = await import('../executors/mcc-token-refresh-executor');
    
    const result = await refreshExpiringMCCTokens(expiryThresholdHours);

    logger.info('mcc_token_refresh_check_complete', {
      operation: 'runMCCTokenRefreshCheck',
      total: result.total,
      successCount: result.successCount,
      failedCount: result.failedCount,
      durationMs: Date.now() - startTime,
    });

    // 如果有失败的刷新，记录告警
    if (result.failedCount > 0) {
      logger.warn('mcc_token_refresh_partial_failure', {
        total: result.total,
        successCount: result.successCount,
        failedCount: result.failedCount,
        failures: result.results
          .filter(r => !r.success)
          .map(r => ({
            mccAccountId: r.mccAccountId,
            error: r.error,
          })),
      });
    }
  } catch (error: any) {
    logger.error('mcc_token_refresh_check_error', {
      operation: 'runMCCTokenRefreshCheck',
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * 停止调度器
 */
export function stopMCCTokenRefreshScheduler(): void {
  if (__schedulerInterval) {
    clearInterval(__schedulerInterval);
    __schedulerInterval = null;
    __schedulerInitialized = false;
    
    logger.info('mcc_token_refresh_scheduler_stopped', {
      message: '调度器已停止',
    });
  }
}

/**
 * 手动触发一次 Token 刷新检查（用于测试或紧急刷新）
 */
export async function triggerMCCTokenRefresh(
  expiryThresholdHours: number = 24
): Promise<{
  total: number;
  successCount: number;
  failedCount: number;
  results: Array<{
    mccAccountId: number;
    success: boolean;
    error?: string;
  }>;
}> {
  logger.info('mcc_token_refresh_manual_trigger', {
    expiryThresholdHours,
  });

  const { refreshExpiringMCCTokens } = await import('../executors/mcc-token-refresh-executor');
  return await refreshExpiringMCCTokens(expiryThresholdHours);
}
