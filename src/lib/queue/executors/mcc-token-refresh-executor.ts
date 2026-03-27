/**
 * MCC OAuth Token 自动刷新任务执行器
 * 
 * 功能：
 * - 定期检查 MCC 账号的 Token 过期时间
 * - 自动刷新即将过期的 Token（提前 24 小时）
 * - 记录刷新结果和错误
 */

import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { logger } from '@/lib/structured-logger';
import { google } from 'googleapis';

const mccService = new GoogleAdsMCCService(getDb());

export interface MCCTokenRefreshTask {
  type: 'mcc-token-refresh';
  data: {
    mccAccountId: number;
    reason: 'scheduled' | 'on_demand' | 'before_expiry';
  };
}

/**
 * 刷新单个 MCC 账号的 OAuth Token
 */
export async function executeMCCTokenRefresh(task: MCCTokenRefreshTask): Promise<{
  success: boolean;
  mccAccountId: number;
  message?: string;
  error?: string;
  newExpiresAt?: string;
}> {
  const { mccAccountId, reason } = task.data;
  const startTime = Date.now();
  
  logger.info('mcc_token_refresh_start', {
    operation: 'executeMCCTokenRefresh',
    mccAccountId,
    reason,
  });

  try {
    // 获取 MCC 账号信息
    const mcc = mccService.getMCCAccount(mccAccountId);
    
    if (!mcc) {
      const error = `MCC 账号不存在 (ID: ${mccAccountId})`;
      logger.error('mcc_token_refresh_account_not_found', {
        mccAccountId,
        reason,
      });
      return { success: false, mccAccountId, error };
    }

    if (!mcc.is_authorized) {
      const error = `MCC 账号未授权，无法刷新 Token`;
      logger.warn('mcc_token_refresh_not_authorized', {
        mccAccountId,
        mccCustomerId: mcc.mcc_customer_id,
        reason,
      });
      return { success: false, mccAccountId, error };
    }

    if (!mcc.mcc_refresh_token) {
      const error = `MCC 账号缺少 refresh_token`;
      logger.error('mcc_token_refresh_missing_refresh_token', {
        mccAccountId,
        mccCustomerId: mcc.mcc_customer_id,
        reason,
      });
      return { success: false, mccAccountId, error };
    }

    // 检查当前 Token 状态
    const tokenExpiresAt = mcc.mcc_token_expires_at ? new Date(mcc.mcc_token_expires_at) : null;
    const now = new Date();
    const hoursUntilExpiry = tokenExpiresAt 
      ? (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      : null;

    logger.info('mcc_token_refresh_current_status', {
      mccAccountId,
      mccCustomerId: mcc.mcc_customer_id,
      hoursUntilExpiry,
      tokenExpiresAt: tokenExpiresAt?.toISOString(),
      reason,
    });

    // 使用 OAuth2 客户端刷新 Token
    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret,
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/google-ads-mcc/callback`
    );

    oauth2Client.setCredentials({
      refresh_token: mcc.mcc_refresh_token,
    });

    // 刷新 Token
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new Error('刷新 Token 失败：未获取到 access_token');
    }

    // 计算新的过期时间
    const expiresAt = credentials.expiry_date 
      ? new Date(credentials.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString(); // 默认 1 小时

    // 更新数据库中的 Token 信息
    mccService.updateMCCTokens(
      mccAccountId,
      {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token || mcc.mcc_refresh_token,
        expires_at: expiresAt,
      }
    );

    const durationMs = Date.now() - startTime;

    logger.info('mcc_token_refresh_success', {
      operation: 'executeMCCTokenRefresh',
      mccAccountId,
      mccCustomerId: mcc.mcc_customer_id,
      reason,
      newExpiresAt: expiresAt,
      durationMs,
    });

    return {
      success: true,
      mccAccountId,
      message: 'Token 刷新成功',
      newExpiresAt: expiresAt,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    logger.error('mcc_token_refresh_error', {
      operation: 'executeMCCTokenRefresh',
      mccAccountId,
      reason,
      error: error.message || String(error),
      stack: error.stack,
      durationMs,
    });

    return {
      success: false,
      mccAccountId,
      error: error.message || 'Token 刷新失败',
    };
  }
}

/**
 * 批量刷新所有即将过期的 MCC Token
 * 用于定时任务调度
 */
export async function refreshExpiringMCCTokens(hoursThreshold: number = 24): Promise<{
  total: number;
  successCount: number;
  failedCount: number;
  results: Array<{
    mccAccountId: number;
    success: boolean;
    error?: string;
    hoursUntilExpiry?: number | null;
  }>;
}> {
  const startTime = Date.now();
  
  logger.info('mcc_token_refresh_batch_start', {
    operation: 'refreshExpiringMCCTokens',
    hoursThreshold,
  });

  // 获取所有已授权的 MCC 账号
  const mccAccounts = mccService.getAvailableMCCAccounts();
  const now = new Date();

  // 筛选即将过期的账号
  const expiringMCCs = mccAccounts.filter(mcc => {
    if (!mcc.is_authorized || !mcc.mcc_token_expires_at) return false;
    
    const expiresAt = new Date(mcc.mcc_token_expires_at);
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    return hoursUntilExpiry <= hoursThreshold && hoursUntilExpiry > 0;
  });

  logger.info('mcc_token_refresh_batch_filter', {
    totalMccCount: mccAccounts.length,
    expiringCount: expiringMCCs.length,
    hoursThreshold,
  });

  const results: Array<{
    mccAccountId: number;
    success: boolean;
    error?: string;
    hoursUntilExpiry?: number | null;
  }> = [];

  let successCount = 0;
  let failedCount = 0;

  // 串行刷新（避免并发 OAuth 请求冲突）
  for (const mcc of expiringMCCs) {
    const expiresAt = new Date(mcc.mcc_token_expires_at!);
    const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);

    const result = await executeMCCTokenRefresh({
      type: 'mcc-token-refresh',
      data: {
        mccAccountId: mcc.id,
        reason: 'before_expiry',
      },
    });

    results.push({
      mccAccountId: mcc.id,
      success: result.success,
      error: result.error,
      hoursUntilExpiry,
    });

    if (result.success) {
      successCount++;
    } else {
      failedCount++;
    }

    // 添加小延迟避免触发 OAuth 限流
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const durationMs = Date.now() - startTime;

  logger.info('mcc_token_refresh_batch_complete', {
    operation: 'refreshExpiringMCCTokens',
    hoursThreshold,
    total: expiringMCCs.length,
    successCount,
    failedCount,
    durationMs,
  });

  return {
    total: expiringMCCs.length,
    successCount,
    failedCount,
    results,
  };
}
