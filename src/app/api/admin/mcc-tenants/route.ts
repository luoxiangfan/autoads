/**
 * MCC 租户管理 API
 * GET: 获取所有租户列表
 * POST: 创建新租户
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
    if (!user || user.role !== 'admin') {
      logger.warn('mcc_tenants_get_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const tenants = db.query(`
      SELECT 
        mt.tenant_id,
        mt.is_tenant_isolated,
        COUNT(DISTINCT mtm.user_id) as userCount,
        COUNT(DISTINCT ma.id) as mccCount,
        mt.created_at,
        mt.updated_at
      FROM mcc_accounts mt
      LEFT JOIN user_tenant_memberships mtm ON mt.tenant_id = mtm.tenant_id
      LEFT JOIN mcc_accounts ma ON mt.tenant_id = ma.tenant_id
      WHERE mt.tenant_id IS NOT NULL
      GROUP BY mt.tenant_id, mt.is_tenant_isolated, mt.created_at, mt.updated_at
      ORDER BY mt.created_at DESC
    `) as Array<{
      tenant_id: string;
      is_tenant_isolated: number;
      userCount: number;
      mccCount: number;
      created_at: string;
      updated_at: string;
    }>;

    logger.info('mcc_tenants_get_success', { 
      requestId,
      userId: user.id,
      tenantCount: tenants.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      tenants: tenants.map(t => ({
        tenantId: t.tenant_id,
        isTenantIsolated: t.is_tenant_isolated === 1,
        userCount: t.userCount,
        mccCount: t.mccCount,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      count: tenants.length,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_tenants_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取租户列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('mcc_tenants_post_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      tenantId,
      mccAccountId,
      isTenantIsolated = false,
    } = body;

    // 验证必填字段
    if (!tenantId) {
      logger.warn('mcc_tenants_post_missing_tenant', { requestId, userId: user.id });
      return NextResponse.json(
        { error: '缺少必填字段：tenantId', requestId },
        { status: 400 }
      );
    }

    // 验证 tenantId 格式（字母数字下划线，3-32 字符）
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(tenantId)) {
      logger.warn('mcc_tenants_post_invalid_tenant_format', { 
        requestId, 
        userId: user.id,
        tenantId: tenantId.substring(0, 8) + '***'
      });
      return NextResponse.json(
        { 
          error: 'tenantId 格式不正确',
          details: '必须是 3-32 位的字母、数字、下划线或连字符',
          requestId
        },
        { status: 400 }
      );
    }

    // 检查 tenantId 是否已存在
    const existing = db.queryOne(`
      SELECT tenant_id FROM mcc_accounts WHERE tenant_id = ?
    `, [tenantId]) as { tenant_id: string } | undefined;

    if (existing) {
      logger.warn('mcc_tenants_post_duplicate_tenant', { 
        requestId, 
        userId: user.id,
        tenantId: tenantId.substring(0, 8) + '***'
      });
      return NextResponse.json(
        { 
          error: 'tenantId 已存在',
          tenantId: tenantId.substring(0, 8) + '***',
          requestId
        },
        { status: 409 }
      );
    }

    // 创建租户（通过更新 mcc_accounts 的 tenant_id 字段）
    if (mccAccountId) {
      // 关联到现有 MCC
      db.exec(`
        UPDATE mcc_accounts 
        SET tenant_id = ?, is_tenant_isolated = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [tenantId, isTenantIsolated ? 1 : 0, mccAccountId]);
    } else {
      // 创建新 MCC 记录作为租户根
      const result = db.exec(`
        INSERT INTO mcc_accounts (
          tenant_id, is_tenant_isolated, is_authorized, is_active,
          created_at, updated_at
        ) VALUES (?, ?, 0, 1, datetime('now'), datetime('now'))
      `, [tenantId, isTenantIsolated ? 1 : 0]);
      
      const mccId = result.lastInsertRowid as number;

      // 自动将创建者添加为租户 owner
      db.exec(`
        INSERT INTO user_tenant_memberships (
          user_id, tenant_id, role, mcc_account_id, invited_by,
          joined_at, created_at, updated_at
        ) VALUES (?, ?, 'owner', ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `, [user.id, tenantId, mccId, user.id]);
    }

    logger.info('mcc_tenants_post_success', { 
      requestId,
      userId: user.id,
      tenantId: tenantId.substring(0, 8) + '***',
      mccAccountId,
      isTenantIsolated,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      tenantId,
      message: '租户创建成功',
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_tenants_post_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '创建租户失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
