/**
 * 获取当前用户的所有 MCC 绑定
 * GET: /api/admin/user-mcc-bindings/my
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

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user) {
      logger.warn('user_mcc_bindings_my_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const bindings = mccService.getUserMCCBindings(user.id);
    
    // 脱敏并格式化返回数据
    const sanitizedBindings = bindings.map(b => ({
      id: b.id,
      mccAccountId: b.mcc_account_id,
      mccCustomerId: b.mcc_customer_id,
      customerId: b.customer_id,
      isAuthorized: b.is_authorized === 1,
      needsReauth: b.needs_reauth === 1,
      lastAuthorizedAt: b.last_authorized_at,
      boundAt: b.bound_at,
    }));

    logger.info('user_mcc_bindings_my_success', { 
      requestId,
      userId: user.id,
      bindingCount: sanitizedBindings.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      bindings: sanitizedBindings,
      count: sanitizedBindings.length,
      requestId
    });
  } catch (error: any) {
    logger.error('user_mcc_bindings_my_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取绑定信息失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
