/**
 * MCC 权限管理 API
 * GET: 获取所有权限定义
 * POST: 授予用户权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAllPermissions, grantPermission, checkPermission } from '@/lib/mcc-permissions';
import { logger } from '@/lib/structured-logger';

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
      logger.warn('mcc_permissions_get_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const permissions = getAllPermissions();

    logger.info('mcc_permissions_get_success', { 
      requestId,
      userId: user.id,
      permissionCount: permissions.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      permissions,
      count: permissions.length,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_permissions_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取权限列表失败',
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
      logger.warn('mcc_permissions_post_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      userId,
      permissionCode,
      tenantId,
      mccAccountId,
      expiresAt,
    } = body;

    // 验证必填字段
    if (!userId || !permissionCode) {
      logger.warn('mcc_permissions_post_missing_fields', { 
        requestId, 
        userId: user.id,
        targetUserId: userId,
        permissionCode,
      });
      return NextResponse.json(
        { error: '缺少必填字段：userId, permissionCode', requestId },
        { status: 400 }
      );
    }

    // 管理员不能给自己授予权限（已经是全权限）
    if (user.role === 'admin' && userId === user.id) {
      logger.warn('mcc_permissions_post_admin_self', { 
        requestId, 
        userId: user.id,
      });
      return NextResponse.json(
        { error: '管理员已经拥有所有权限，无需授予', requestId },
        { status: 400 }
      );
    }

    // 检查授予者是否有权限授予该权限
    const canGrant = await checkPermission(
      user.id,
      permissionCode,
      tenantId,
      mccAccountId,
      user.role
    );

    if (!canGrant.hasPermission && user.role !== 'admin') {
      logger.warn('mcc_permissions_post_cannot_grant', { 
        requestId, 
        userId: user.id,
        permissionCode,
        tenantId,
        mccAccountId,
      });
      return NextResponse.json(
        { 
          error: '您没有权限授予此权限',
          permissionCode,
          requestId
        },
        { status: 403 }
      );
    }

    // 授予权限
    const permissionId = grantPermission(
      parseInt(userId),
      permissionCode,
      user.id,
      tenantId || null,
      mccAccountId || null,
      expiresAt || null
    );

    logger.info('mcc_permissions_post_success', { 
      requestId,
      userId: user.id,
      targetUserId: userId,
      permissionCode,
      tenantId,
      mccAccountId,
      expiresAt,
      permissionId,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      permissionId,
      message: '权限授予成功',
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_permissions_post_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '授予权限失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
