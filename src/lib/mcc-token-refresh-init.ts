/**
 * MCC Token 自动刷新初始化脚本
 * 
 * 在应用启动时自动初始化 MCC Token 刷新调度器
 * 
 * 使用方式：
 * 1. 在应用入口（如 layout.tsx 或 middleware）中调用
 * 2. 或在第一个 MCC 相关 API 请求时懒加载
 * 
 * 配置说明：
 * - CHECK_INTERVAL_HOURS: 检查间隔（小时），默认 6 小时
 * - EXPIRY_THRESHOLD_HOURS: 过期阈值（小时），默认 24 小时内刷新
 */

import { logger } from './structured-logger';

const CHECK_INTERVAL_HOURS = parseInt(process.env.MCC_TOKEN_CHECK_INTERVAL_HOURS || '6');
const EXPIRY_THRESHOLD_HOURS = parseInt(process.env.MCC_TOKEN_EXPIRY_THRESHOLD_HOURS || '24');

let __initialized = false;
let __initPromise: Promise<void> | null = null;

/**
 * 初始化 MCC Token 自动刷新调度器
 */
export async function initializeMCCTokenRefresh(): Promise<void> {
  if (__initialized) {
    return;
  }

  if (__initPromise) {
    return __initPromise;
  }

  __initPromise = (async () => {
    try {
      logger.info('mcc_token_refresh_init_start', {
        checkIntervalHours: CHECK_INTERVAL_HOURS,
        expiryThresholdHours: EXPIRY_THRESHOLD_HOURS,
      });

      const { initializeMCCTokenRefreshScheduler } = await import('./queue/schedulers/mcc-token-refresh-scheduler');
      
      await initializeMCCTokenRefreshScheduler(
        CHECK_INTERVAL_HOURS,
        EXPIRY_THRESHOLD_HOURS
      );

      __initialized = true;

      logger.info('mcc_token_refresh_init_complete', {
        checkIntervalHours: CHECK_INTERVAL_HOURS,
        expiryThresholdHours: EXPIRY_THRESHOLD_HOURS,
        nextCheckIn: `~${CHECK_INTERVAL_HOURS}小时`,
      });
    } catch (error: any) {
      logger.error('mcc_token_refresh_init_error', {
        error: error.message || String(error),
        stack: error.stack,
      });
      // 不抛出错误，避免影响应用启动
      // 调度器初始化失败不影响核心功能
    }
  })();

  return __initPromise;
}

/**
 * 懒加载初始化（在第一个 MCC API 请求时调用）
 */
export async function lazyInitializeMCCTokenRefresh(): Promise<void> {
  // 只在生产环境自动初始化
  if (process.env.NODE_ENV === 'production') {
    await initializeMCCTokenRefresh();
  }
}
