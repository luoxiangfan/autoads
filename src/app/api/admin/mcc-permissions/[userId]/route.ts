/**
 * 用户权限管理 API
 * GET: 获取用户的权限列表
 * DELETE: 撤销用户权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserPermissions, revokePermission, checkPermission } from '@/lib/mcc-permissions';
import { logger } from '@/lib/structured-logger';

/**
 * 生成请求 ID 用于追踪
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const targetUserId = parseInt(params.userId);
  
  try {
    const user = await getCurrentUser();
    if (!user) {
      logger.warn('user_permissions_get_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 用户只能查看自己的权限，管理员可以查看任何人
    if (user.role !== 'admin' && user.id !== targetUserId) {
      logger.warn('user_permissions_get_forbidden', { 
        requestId, 
        userId: user.id,
        targetUserId,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId') || undefined;

    const permissions = await getUserPermissions(targetUserId, tenantId || null);

    logger.info('user_permissions_get_success', { 
      requestId,
      userId: user.id,
      targetUserId,
      permissionCount: permissions.length,
      tenantId,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      permissions,
      count: permissions.length,
      userId: targetUserId,
      tenantId,
      requestId
    });
  } catch (error: any) {
    logger.error('user_permissions_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取用户权限失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const targetUserId = parseInt(params.userId);
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('user_permissions_delete_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      permissionCode,
      tenantId,
      mccAccountId,
    } = body;

    // 验证必填字段
    if (!permissionCode) {
      logger.warn('user_permissions_delete_missing_permission', { 
        requestId, 
        userId: user.id,
        targetUserId,
      });
      return NextResponse.json(
        { error: '缺少必填字段：permissionCode', requestId },
        { status: 400 }
      );
    }

    // 不能撤销管理员权限
    if (user.role === 'admin' && targetUserId === user.id) {
      logger.warn('user_permissions_delete_admin_self', { 
        requestId, 
        userId: user.id,
      });
      return NextResponse.json(
        { error: '不能撤销管理员自己的权限', requestId },
        { status: 400 }
      );
    }

    // 检查是否有权限撤销该权限
    const canRevoke = await checkPermission(
      user.id,
      permissionCode,
      tenantId,
      mccAccountId,
      user.role
    );

    if (!canRevoke.hasPermission && user.role !== 'admin') {
      logger.warn('user_permissions_delete_cannot_revoke', { 
        requestId, 
        userId: user.id,
        permissionCode,
        targetUserId,
      });
      return NextResponse.json(
        { 
          error: '您没有权限撤销此权限',
          permissionCode,
          requestId
        },
        { status: 403 }
      );
    }

    // 撤销权限
    const deletedCount = revokePermission(
      targetUserId,
      permissionCode,
      tenantId || null,
      mccAccountId || null
    );

    if (deletedCount === 0) {
      logger.warn('user_permissions_delete_not_found', { 
        requestId, 
        userId: user.id,
        targetUserId,
        permissionCode,
      });
      return NextResponse.json(
        { 
          error: '未找到该权限授予记录',
          permissionCode,
          requestId
        },
        { status: 404 }
      );
    }

    logger.info('user_permissions_delete_success', { 
      requestId,
      userId: user.id,
      targetUserId,
      permissionCode,
      tenantId,
      mccAccountId,
      deletedCount,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      deletedCount,
      message: '权限撤销成功',
      requestId
    });
  } catch (error: any) {
    logger.error('user_permissions_delete_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '撤销权限失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
