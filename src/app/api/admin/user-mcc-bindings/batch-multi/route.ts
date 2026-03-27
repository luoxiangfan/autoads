/**
 * 批量导入用户到多个 MCC 账号
 * POST: /api/admin/user-mcc-bindings/batch-multi
 * 
 * 支持一个用户绑定多个 MCC，每个用户可以指定不同的 MCC
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';

const mccService = new GoogleAdsMCCService(getDb());

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
      logger.warn('mcc_batch_multi_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      bindings, // Array of { userId: number, mccAccountId: number, customerId: string }
    } = body;

    // 验证必填字段
    if (!bindings || !Array.isArray(bindings)) {
      logger.warn('mcc_batch_multi_invalid_bindings', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '绑定列表格式不正确，应该是数组', requestId },
        { status: 400 }
      );
    }

    if (bindings.length === 0) {
      logger.warn('mcc_batch_multi_empty_bindings', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '绑定列表不能为空', requestId },
        { status: 400 }
      );
    }

    // 限制单次导入数量
    if (bindings.length > 200) {
      logger.warn('mcc_batch_multi_exceed_limit', { 
        requestId, 
        userId: user.id,
        count: bindings.length,
        limit: 200 
      });
      return NextResponse.json(
        { 
          error: `单次最多导入 200 个绑定（当前：${bindings.length}个）`,
          requestId 
        },
        { status: 400 }
      );
    }

    // 验证每个绑定的格式
    const validationErrors: Array<{ index: number; error: string }> = [];
    
    bindings.forEach((b: any, index: number) => {
      if (!b.userId) {
        validationErrors.push({ index, error: '缺少 userId' });
      } else if (!b.mccAccountId) {
        validationErrors.push({ index, error: '缺少 mccAccountId' });
      } else if (!b.customerId) {
        validationErrors.push({ index, error: '缺少 customerId' });
      } else if (!/^\d{10}$/.test(String(b.customerId).trim())) {
        validationErrors.push({ 
          index, 
          error: 'Customer ID 必须是 10 位数字' 
        });
      }
    });

    if (validationErrors.length > 0) {
      logger.warn('mcc_batch_multi_validation_failed', { 
        requestId,
        userId: user.id,
        errorCount: validationErrors.length,
        errors: validationErrors.slice(0, 5)
      });
      
      return NextResponse.json(
        { 
          error: `${validationErrors.length} 个绑定数据格式不正确`,
          details: validationErrors.slice(0, 10),
          requestId
        },
        { status: 400 }
      );
    }

    // 执行批量绑定
    const results: Array<{
      userId: number;
      mccAccountId: number;
      customerId: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const binding of bindings) {
      try {
        const bindingId = mccService.bindUserToMCC(
          parseInt(binding.userId),
          binding.mccAccountId,
          String(binding.customerId).trim(),
          user.id
        );

        results.push({
          userId: parseInt(binding.userId),
          mccAccountId: binding.mccAccountId,
          customerId: String(binding.customerId).trim(),
          success: true,
        });
      } catch (error: any) {
        results.push({
          userId: parseInt(binding.userId),
          mccAccountId: binding.mccAccountId,
          customerId: String(binding.customerId).trim(),
          success: false,
          error: error.message || '绑定失败',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // 记录失败的详细信息
    const failedResults = results.filter(r => !r.success);
    if (failedCount > 0) {
      logger.warn('mcc_batch_multi_partial_failure', { 
        requestId,
        userId: user.id,
        totalCount: bindings.length,
        successCount,
        failedCount,
        failures: failedResults.slice(0, 10).map(r => ({
          userId: r.userId,
          mccAccountId: r.mccAccountId,
          error: r.error
        }))
      });
    } else {
      logger.info('mcc_batch_multi_success', { 
        requestId,
        userId: user.id,
        totalCount: bindings.length,
        successCount,
        durationMs: Date.now() - startTime 
      });
    }

    return NextResponse.json({
      success: true,
      total: bindings.length,
      successCount,
      failedCount,
      results: results.map(r => ({
        userId: r.userId,
        mccAccountId: r.mccAccountId,
        customerId: r.customerId,
        success: r.success,
        error: r.error,
      })),
      message: `批量导入完成：成功 ${successCount} 个，失败 ${failedCount} 个`,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_batch_multi_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '批量导入失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
