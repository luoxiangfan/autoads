/**
 * 用户 MCC 账号列表 API
 * GET: 获取当前用户有权限访问的 MCC 账号列表
 * 
 * 权限控制：
 * - 管理员：可以看到所有 MCC 账号
 * - 普通用户：只能看到自己绑定的 MCC 账号
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';

const db = getDatabase();

/**
 * 生成请求 ID 用于追踪
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const GET = withAuth(async (request: NextRequest, user) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    if (!user) {
      logger.warn('user_mcc_accounts_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const nowFunc = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
    let mccAccounts;

    if (user.role === 'admin') {
      // 管理员：获取所有 MCC 账号
      mccAccounts = db.query(`
        SELECT 
          ma.id,
          ma.mcc_customer_id,
          ma.oauth_client_id,
          ma.auth_type,
          ma.service_account_email,
          ma.is_active,
          ma.is_authorized,
          ma.last_authorized_at,
          ma.created_at,
          ma.updated_at,
          (SELECT COUNT(*) FROM user_mcc_bindings umb WHERE umb.mcc_account_id = ma.id) as bound_user_count
        FROM mcc_accounts ma
        ORDER BY ma.created_at DESC
      `) as Array<{
        id: number;
        mcc_customer_id: string;
        oauth_client_id: string;
        auth_type: string;
        service_account_email: string | null;
        is_active: any;
        is_authorized: any;
        last_authorized_at: string | null;
        created_at: string;
        updated_at: string;
        bound_user_count: number;
      }>;
    } else {
      // 普通用户：只能获取自己绑定的 MCC 账号
      mccAccounts = db.query(`
        SELECT 
          ma.id,
          ma.mcc_customer_id,
          ma.oauth_client_id,
          ma.auth_type,
          ma.service_account_email,
          ma.is_active,
          ma.is_authorized,
          ma.last_authorized_at,
          ma.created_at,
          ma.updated_at,
          umb.is_authorized as user_authorized,
          umb.needs_reauth as user_needs_reauth
        FROM mcc_accounts ma
        INNER JOIN user_mcc_bindings umb ON ma.id = umb.mcc_account_id
        WHERE umb.user_id = ?
        ORDER BY umb.created_at DESC
      `, [user.id]) as Array<{
        id: number;
        mcc_customer_id: string;
        oauth_client_id: string;
        auth_type: string;
        service_account_email: string | null;
        is_active: any;
        is_authorized: any;
        last_authorized_at: string | null;
        created_at: string;
        updated_at: string;
        user_authorized: any;
        user_needs_reauth: any;
      }>;
    }

    logger.info('user_mcc_accounts_success', { 
      requestId,
      userId: user.id,
      role: user.role,
      mccCount: mccAccounts.length,
      isAdmin: user.role === 'admin',
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      mccAccounts: mccAccounts.map(ma => ({
        id: ma.id,
        mccCustomerId: ma.mcc_customer_id,
        oauthClientId: ma.oauth_client_id,
        authType: ma.auth_type || 'oauth',
        serviceAccountEmail: ma.service_account_email,
        isActive: ma.is_active === true || ma.is_active === 1 || ma.is_active === '1',
        isAuthorized: ma.is_authorized === true || ma.is_authorized === 1 || ma.is_authorized === '1',
        lastAuthorizedAt: ma.last_authorized_at,
        createdAt: ma.created_at,
        updatedAt: ma.updated_at,
        // 管理员特有字段
        boundUserCount: ma.bound_user_count,
        // 用户特有字段
        userAuthorized: ma.user_authorized === true || ma.user_authorized === 1 || ma.user_authorized === '1',
        userNeedsReauth: ma.user_needs_reauth === true || ma.user_needs_reauth === 1 || ma.user_needs_reauth === '1',
      })),
      count: mccAccounts.length,
      requestId
    });
  } catch (error: any) {
    logger.error('user_mcc_accounts_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取 MCC 账号列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
