/**
 * 用户可用服务账号 API
 * GET: 获取当前用户可用的服务账号列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';

const db = getDb();

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
      logger.warn('user_service_accounts_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 获取用户绑定的 MCC 账号下的服务账号
    // 或者全局可用的服务账号
    const serviceAccounts = db.query(`
      SELECT DISTINCT
        ma.id,
        ma.mcc_customer_id,
        ma.service_account_email,
        ma.service_account_id,
        ma.auth_type,
        CASE 
          WHEN umb.user_id = ? THEN 1
          ELSE 0
        END as is_bound
      FROM mcc_accounts ma
      LEFT JOIN user_mcc_bindings umb ON ma.id = umb.mcc_account_id AND umb.user_id = ?
      WHERE ma.auth_type = 'service_account'
        AND ma.is_active = 1
        AND (umb.user_id = ? OR ma.id IN (
          SELECT mcc_account_id FROM user_mcc_bindings WHERE user_id = ?
        ))
      ORDER BY ma.created_at DESC
    `, [user.id, user.id, user.id, user.id]) as Array<{
      id: number;
      mcc_customer_id: string;
      service_account_email: string;
      service_account_id: string;
      auth_type: string;
      is_bound: number;
    }>;

    logger.info('user_service_accounts_success', { 
      requestId,
      userId: user.id,
      count: serviceAccounts.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      serviceAccounts: serviceAccounts.map(sa => ({
        id: sa.id,
        mccCustomerId: sa.mcc_customer_id,
        serviceAccountEmail: sa.service_account_email,
        serviceAccountId: sa.service_account_id,
        authType: sa.auth_type,
        isBound: sa.is_bound === 1,
      })),
      count: serviceAccounts.length,
      requestId
    });
  } catch (error: any) {
    logger.error('user_service_accounts_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取服务账号列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
