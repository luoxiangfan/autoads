/**
 * 删除服务账号配置 API
 * DELETE: /api/admin/service-accounts/[id]
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('service_account_delete_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const serviceAccountId = parseInt(params.id);
    if (isNaN(serviceAccountId)) {
      logger.warn('service_account_delete_invalid_id', { 
        requestId, 
        userId: user.id,
        serviceAccountId: params.id,
      });
      return NextResponse.json({ error: 'Invalid service account ID', requestId }, { status: 400 });
    }

    // 检查服务账号是否存在
    const existing = db.queryOne(`
      SELECT id, service_account_email FROM mcc_accounts 
      WHERE id = ? AND auth_type = 'service_account'
    `, [serviceAccountId]) as { id: number; service_account_email: string } | undefined;

    if (!existing) {
      logger.warn('service_account_delete_not_found', { 
        requestId, 
        userId: user.id,
        serviceAccountId,
      });
      return NextResponse.json({ error: '服务账号不存在', requestId }, { status: 404 });
    }

    // 检查是否有用户正在使用该服务账号
    const boundUsers = db.queryOne(`
      SELECT COUNT(*) as count FROM user_mcc_bindings 
      WHERE mcc_account_id = ? AND is_authorized = ${db.type === 'postgres' ? 'TRUE' : '1'}
    `, [serviceAccountId]) as { count: number };

    if (boundUsers.count > 0) {
      logger.warn('service_account_delete_has_bound_users', { 
        requestId, 
        userId: user.id,
        serviceAccountId,
        boundUserCount: boundUsers.count,
      });
      return NextResponse.json({ 
        error: `有 ${boundUsers.count} 个用户正在使用该服务账号，无法删除`,
        boundUserCount: boundUsers.count,
        requestId
      }, { status: 400 });
    }

    // 删除服务账号配置（软删除：设置为非活跃）
    const nowFunc = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
    db.exec(`
      UPDATE mcc_accounts SET
        is_active = ${db.type === 'postgres' ? 'FALSE' : '0'},
        service_account_key = NULL,
        updated_at = ${nowFunc}
      WHERE id = ?
    `, [serviceAccountId]);

    logger.info('service_account_delete_success', { 
      requestId,
      userId: user.id,
      serviceAccountId,
      serviceAccountEmail: existing.service_account_email,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      message: '服务账号已删除（设置为非活跃状态）',
      requestId
    });
  } catch (error: any) {
    logger.error('service_account_delete_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '删除服务账号失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
