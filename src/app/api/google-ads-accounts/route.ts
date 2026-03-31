/**
 * Google Ads 账号列表 API
 * GET: 获取用户有权限访问的 Google Ads 账号列表
 * 
 * 权限控制：
 * - 管理员：可以看到所有账号
 * - 普通用户：只能看到自己绑定的账号
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
      logger.warn('google_ads_accounts_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const nowFunc = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
    let accounts;

    if (user.role === 'admin') {
      // 管理员：获取所有账号
      accounts = db.query(`
        SELECT 
          gaa.id,
          gaa.customer_id,
          gaa.account_name,
          gaa.currency_code,
          gaa.mcc_account_id,
          gaa.is_active,
          gaa.status,
          ma.mcc_customer_id,
          ma.auth_type,
          ma.service_account_email,
          CASE 
            WHEN gaa.is_active = ${db.type === 'postgres' ? 'TRUE' : '1'} THEN 'ACTIVE'
            ELSE 'INACTIVE'
          END as display_status
        FROM google_ads_accounts gaa
        LEFT JOIN mcc_accounts ma ON gaa.mcc_account_id = ma.id
        WHERE gaa.is_deleted = ${db.type === 'postgres' ? 'FALSE' : '0'}
        ORDER BY gaa.created_at DESC
      `) as Array<{
        id: number;
        customer_id: string;
        account_name: string | null;
        currency_code: string | null;
        mcc_account_id: number | null;
        is_active: any;
        status: string | null;
        mcc_customer_id: string | null;
        auth_type: string | null;
        service_account_email: string | null;
        display_status: string;
      }>;
    } else {
      // 普通用户：只能获取自己绑定的 MCC 下的账号
      accounts = db.query(`
        SELECT 
          gaa.id,
          gaa.customer_id,
          gaa.account_name,
          gaa.currency_code,
          gaa.mcc_account_id,
          gaa.is_active,
          gaa.status,
          ma.mcc_customer_id,
          ma.auth_type,
          ma.service_account_email,
          CASE 
            WHEN gaa.is_active = ${db.type === 'postgres' ? 'TRUE' : '1'} THEN 'ACTIVE'
            ELSE 'INACTIVE'
          END as display_status
        FROM google_ads_accounts gaa
        LEFT JOIN mcc_accounts ma ON gaa.mcc_account_id = ma.id
        LEFT JOIN user_mcc_bindings umb ON ma.id = umb.mcc_account_id
        WHERE gaa.is_deleted = ${db.type === 'postgres' ? 'FALSE' : '0'}
          AND umb.user_id = ?
          AND umb.is_authorized = ${db.type === 'postgres' ? 'TRUE' : '1'}
        ORDER BY gaa.created_at DESC
      `, [user.id]) as Array<{
        id: number;
        customer_id: string;
        account_name: string | null;
        currency_code: string | null;
        mcc_account_id: number | null;
        is_active: any;
        status: string | null;
        mcc_customer_id: string | null;
        auth_type: string | null;
        service_account_email: string | null;
        display_status: string;
      }>;
    }

    logger.info('google_ads_accounts_success', { 
      requestId,
      userId: user.id,
      role: user.role,
      accountCount: accounts.length,
      isAdmin: user.role === 'admin',
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      accounts: accounts.map(acc => ({
        id: acc.id,
        customerId: acc.customer_id,
        accountName: acc.account_name,
        currencyCode: acc.currency_code,
        mccAccountId: acc.mcc_account_id,
        mccCustomerId: acc.mcc_customer_id,
        authType: acc.auth_type || 'oauth',
        serviceAccountEmail: acc.service_account_email,
        isActive: acc.is_active === true || acc.is_active === 1 || acc.is_active === '1',
        status: acc.status || acc.display_status,
      })),
      count: accounts.length,
      requestId
    });
  } catch (error: any) {
    logger.error('google_ads_accounts_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取账号列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
