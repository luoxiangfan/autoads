/**
 * 手动触发 MCC Token 刷新
 * POST: /api/admin/google-ads-mcc/refresh-tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';

/**
 * 生成请求 ID 用于追踪
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('mcc_refresh_tokens_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      mccAccountId, // 可选，指定刷新单个 MCC
      expiryThresholdHours = 24, // 过期阈值（小时）
    } = body;

    logger.info('mcc_refresh_tokens_request', {
      requestId,
      userId: user.id,
      mccAccountId,
      expiryThresholdHours,
    });

    // 动态导入避免循环依赖
    const { triggerMCCTokenRefresh } = await import('@/lib/queue/schedulers/mcc-token-refresh-scheduler');
    const { executeMCCTokenRefresh } = await import('@/lib/queue/executors/mcc-token-refresh-executor');

    let result;

    if (mccAccountId) {
      // 刷新单个 MCC
      const singleResult = await executeMCCTokenRefresh({
        type: 'mcc-token-refresh',
        data: {
          mccAccountId: parseInt(mccAccountId),
          reason: 'on_demand',
        },
      });

      result = {
        isBatch: false,
        mccAccountId,
        ...singleResult,
      };
    } else {
      // 批量刷新所有即将过期的 MCC
      const batchResult = await triggerMCCTokenRefresh(expiryThresholdHours);
      
      result = {
        isBatch: true,
        expiryThresholdHours,
        ...batchResult,
      };
    }

    logger.info('mcc_refresh_tokens_complete', {
      requestId,
      userId: user.id,
      isBatch: result.isBatch,
      successCount: result.successCount || (result.success ? 1 : 0),
      failedCount: result.failedCount || (result.success ? 0 : 1),
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      requestId,
      result,
      message: result.isBatch
        ? `Token 刷新完成：成功 ${result.successCount} 个，失败 ${result.failedCount} 个`
        : (result.success ? 'Token 刷新成功' : `Token 刷新失败：${result.error}`),
    });
  } catch (error: any) {
    logger.error('mcc_refresh_tokens_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime,
    });
    
    return NextResponse.json(
      { 
        error: 'Token 刷新失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
