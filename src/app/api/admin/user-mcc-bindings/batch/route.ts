/**
 * 批量导入用户到 MCC 账号
 * POST: /api/admin/user-mcc-bindings/batch
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
      logger.warn('mcc_batch_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      mccAccountId,
      users,
    } = body;

    // 验证必填字段
    if (!mccAccountId) {
      logger.warn('mcc_batch_missing_mcc', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '缺少必填字段：mccAccountId', requestId },
        { status: 400 }
      );
    }

    if (!users || !Array.isArray(users)) {
      logger.warn('mcc_batch_invalid_users', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '用户列表格式不正确，应该是数组', requestId },
        { status: 400 }
      );
    }

    if (users.length === 0) {
      logger.warn('mcc_batch_empty_users', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '用户列表不能为空', requestId },
        { status: 400 }
      );
    }

    // 限制单次导入数量
    if (users.length > 100) {
      logger.warn('mcc_batch_exceed_limit', { 
        requestId, 
        userId: user.id,
        count: users.length,
        limit: 100 
      });
      return NextResponse.json(
        { 
          error: `单次最多导入 100 个用户（当前：${users.length}个）`,
          requestId 
        },
        { status: 400 }
      );
    }

    // 验证每个用户的 Customer ID 格式并收集错误详情
    const validationErrors: Array<{ index: number; userId: any; customerId: any; error: string }> = [];
    
    users.forEach((u: any, index: number) => {
      if (!u.userId) {
        validationErrors.push({ index, userId: u.userId, customerId: u.customerId, error: '缺少 userId' });
      } else if (!u.customerId) {
        validationErrors.push({ index, userId: u.userId, customerId: u.customerId, error: '缺少 customerId' });
      } else if (!/^\d{10}$/.test(String(u.customerId).trim())) {
        validationErrors.push({ 
          index, 
          userId: u.userId, 
          customerId: String(u.customerId).substring(0, 4) + '***',
          error: 'Customer ID 必须是 10 位数字' 
        });
      }
    });

    if (validationErrors.length > 0) {
      logger.warn('mcc_batch_validation_failed', { 
        requestId,
        userId: user.id,
        errorCount: validationErrors.length,
        errors: validationErrors.slice(0, 5) // 只显示前 5 个错误
      });
      
      return NextResponse.json(
        { 
          error: `${validationErrors.length} 个用户数据格式不正确`,
          details: validationErrors.slice(0, 10), // 返回前 10 个错误详情
          requestId
        },
        { status: 400 }
      );
    }

    // 执行批量绑定
    const results = mccService.batchBindUsersToMCC(
      mccAccountId,
      users.map((u: any) => ({
        userId: parseInt(u.userId),
        customerId: String(u.customerId).trim(),
      })),
      user.id
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // 记录失败的详细信息
    const failedResults = results.filter(r => !r.success);
    if (failedCount > 0) {
      logger.warn('mcc_batch_partial_failure', { 
        requestId,
        userId: user.id,
        mccAccountId,
        totalCount: users.length,
        successCount,
        failedCount,
        failures: failedResults.slice(0, 10).map(r => ({
          userId: r.userId,
          error: r.error
        }))
      });
    } else {
      logger.info('mcc_batch_success', { 
        requestId,
        userId: user.id,
        mccAccountId,
        totalCount: users.length,
        successCount,
        durationMs: Date.now() - startTime 
      });
    }

    return NextResponse.json({
      success: true,
      total: users.length,
      successCount,
      failedCount,
      results: results.map(r => ({
        userId: r.userId,
        success: r.success,
        error: r.error,
      })),
      message: `批量导入完成：成功 ${successCount} 个，失败 ${failedCount} 个`,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_batch_error', { 
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
