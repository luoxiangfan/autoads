/**
 * 租户成员管理 API
 * GET: 获取租户下的所有成员
 * POST: 添加成员到租户
 * DELETE: 从租户移除成员
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

export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { tenantId } = params;
  
  try {
    const user = await getCurrentUser();
    if (!user) {
      logger.warn('tenant_members_get_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 验证用户是否有权限访问此租户
    const membership = db.queryOne(`
      SELECT role FROM user_tenant_memberships
      WHERE user_id = ? AND tenant_id = ?
    `, [user.id, tenantId]) as { role: string } | undefined;

    // 非管理员需要是租户成员才能查看
    if (user.role !== 'admin' && !membership) {
      logger.warn('tenant_members_get_forbidden', { 
        requestId, 
        userId: user.id,
        tenantId: tenantId.substring(0, 8) + '***'
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const members = db.query(`
      SELECT 
        utm.id,
        utm.user_id,
        u.username,
        u.email,
        u.display_name,
        utm.role,
        utm.mcc_account_id,
        ma.mcc_customer_id,
        utm.invited_by,
        utm.joined_at,
        utm.created_at
      FROM user_tenant_memberships utm
      LEFT JOIN users u ON utm.user_id = u.id
      LEFT JOIN mcc_accounts ma ON utm.mcc_account_id = ma.id
      WHERE utm.tenant_id = ?
      ORDER BY utm.role DESC, utm.joined_at DESC
    `, [tenantId]) as Array<{
      id: number;
      user_id: number;
      username: string | null;
      email: string;
      display_name: string | null;
      role: string;
      mcc_account_id: number | null;
      mcc_customer_id: string | null;
      invited_by: number | null;
      joined_at: string;
      created_at: string;
    }>;

    logger.info('tenant_members_get_success', { 
      requestId,
      userId: user.id,
      tenantId: tenantId.substring(0, 8) + '***',
      memberCount: members.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      members: members.map(m => ({
        id: m.id,
        userId: m.user_id,
        username: m.username || m.display_name || m.email,
        email: m.email,
        role: m.role,
        mccAccountId: m.mcc_account_id,
        mccCustomerId: m.mcc_customer_id,
        invitedBy: m.invited_by,
        joinedAt: m.joined_at,
      })),
      count: members.length,
      tenantId,
      requestId
    });
  } catch (error: any) {
    logger.error('tenant_members_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取成员列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const { tenantId } = params;
  
  try {
    const user = await getCurrentUser();
    if (!user) {
      logger.warn('tenant_members_post_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      role = 'member',
      mccAccountId,
    } = body;

    // 验证必填字段
    if (!userId) {
      logger.warn('tenant_members_post_missing_user', { requestId, userId: user.id, tenantId });
      return NextResponse.json(
        { error: '缺少必填字段：userId', requestId },
        { status: 400 }
      );
    }

    // 验证角色
    if (!['owner', 'admin', 'member'].includes(role)) {
      logger.warn('tenant_members_post_invalid_role', { requestId, userId: user.id, role });
      return NextResponse.json(
        { error: '角色必须是 owner、admin 或 member', requestId },
        { status: 400 }
      );
    }

    // 验证租户存在
    const tenantExists = db.queryOne(`
      SELECT tenant_id FROM mcc_accounts WHERE tenant_id = ? LIMIT 1
    `, [tenantId]) as { tenant_id: string } | undefined;

    if (!tenantExists) {
      logger.warn('tenant_members_post_tenant_not_found', { requestId, userId: user.id, tenantId });
      return NextResponse.json(
        { error: '租户不存在', tenantId, requestId },
        { status: 404 }
      );
    }

    // 添加成员
    const result = db.exec(`
      INSERT INTO user_tenant_memberships (
        user_id, tenant_id, role, mcc_account_id, invited_by,
        joined_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(user_id, tenant_id) DO UPDATE SET
        role = excluded.role,
        mcc_account_id = excluded.mcc_account_id,
        invited_by = excluded.invited_by,
        updated_at = datetime('now')
    `, [parseInt(userId), tenantId, role, mccAccountId || null, user.id]);

    logger.info('tenant_members_post_success', { 
      requestId,
      userId: user.id,
      tenantId: tenantId.substring(0, 8) + '***',
      targetUserId: userId,
      role,
      mccAccountId,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      membershipId: result.lastInsertRowid,
      message: '成员添加成功',
      requestId
    });
  } catch (error: any) {
    logger.error('tenant_members_post_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '添加成员失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
