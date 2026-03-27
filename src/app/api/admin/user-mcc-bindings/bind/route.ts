/**
 * 绑定用户到指定 MCC 账号
 * POST: /api/admin/user-mcc-bindings/bind
 * 
 * 支持一个用户绑定多个 MCC 账号
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
      logger.warn('user_mcc_bind_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      mccAccountId,
      customerId,
    } = body;

    // 验证必填字段
    if (!userId) {
      logger.warn('user_mcc_bind_missing_user', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '缺少必填字段：userId', requestId },
        { status: 400 }
      );
    }

    if (!mccAccountId) {
      logger.warn('user_mcc_bind_missing_mcc', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '缺少必填字段：mccAccountId', requestId },
        { status: 400 }
      );
    }

    if (!customerId) {
      logger.warn('user_mcc_bind_missing_customer', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '缺少必填字段：customerId', requestId },
        { status: 400 }
      );
    }

    // 验证 Customer ID 格式（10 位数字）
    if (!/^\d{10}$/.test(String(customerId).trim())) {
      logger.warn('user_mcc_bind_invalid_customer_format', { 
        requestId, 
        userId: user.id,
        customerId: String(customerId).substring(0, 4) + '***'
      });
      return NextResponse.json(
        { 
          error: 'Customer ID 格式不正确',
          details: '必须是 10 位数字（不含连字符）',
          requestId
        },
        { status: 400 }
      );
    }

    // 验证 MCC 账号存在且已授权
    const mcc = mccService.getMCCAccount(mccAccountId);
    if (!mcc) {
      logger.warn('user_mcc_bind_mcc_not_found', { 
        requestId, 
        userId: user.id,
        mccAccountId 
      });
      return NextResponse.json(
        { 
          error: 'MCC 账号不存在',
          mccAccountId,
          requestId
        },
        { status: 404 }
      );
    }

    if (!mcc.is_authorized) {
      logger.warn('user_mcc_bind_mcc_not_authorized', { 
        requestId, 
        userId: user.id,
        mccAccountId,
        mccCustomerId: mcc.mcc_customer_id
      });
      return NextResponse.json(
        { 
          error: 'MCC 账号未完成 OAuth 授权，请先完成授权',
          mccAccountId,
          mccCustomerId: mcc.mcc_customer_id,
          requestId
        },
        { status: 400 }
      );
    }

    // 检查是否已绑定到同一个 MCC（允许同一个用户绑定多个不同的 MCC）
    const existingBinding = mccService.getUserMCCBindingByMCC(parseInt(userId), mccAccountId);
    if (existingBinding && existingBinding.customer_id === customerId.trim()) {
      logger.info('user_mcc_bind_already_exists', { 
        requestId, 
        userId: user.id,
        targetUserId: userId,
        mccAccountId,
        customerId: customerId.substring(0, 4) + '***'
      });
      return NextResponse.json({ 
        success: true, 
        message: '用户已绑定到此 MCC 账号',
        bindingId: existingBinding.id,
        isUpdate: false,
        requestId
      });
    }

    // 执行绑定（支持一个用户绑定多个 MCC）
    const bindingId = mccService.bindUserToMCC(
      parseInt(userId),
      mccAccountId,
      customerId,
      user.id
    );

    logger.info('user_mcc_bind_success', { 
      requestId,
      userId: user.id,
      targetUserId: userId,
      mccAccountId,
      mccCustomerId: mcc.mcc_customer_id,
      bindingId,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      bindingId,
      message: '用户绑定成功，用户需完成 OAuth 授权',
      isUpdate: !!existingBinding,
      requestId
    });
  } catch (error: any) {
    logger.error('user_mcc_bind_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '绑定用户失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
