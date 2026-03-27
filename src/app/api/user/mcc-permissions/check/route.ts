/**
 * 用户权限检查 API
 * POST: 检查当前用户是否有指定权限
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { checkPermission, checkAnyPermission, checkAllPermissions } from '@/lib/mcc-permissions';
import { logger } from '@/lib/structured-logger';

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
    if (!user) {
      logger.warn('mcc_permission_check_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      permissionCode,
      permissionCodes,
      checkType = 'any',  // 'any' | 'all'
      tenantId,
      mccAccountId,
    } = body;

    let result;

    if (Array.isArray(permissionCodes)) {
      // 检查多个权限
      if (checkType === 'all') {
        result = await checkAllPermissions(
          user.id,
          permissionCodes,
          tenantId,
          mccAccountId,
          user.role
        );
      } else {
        result = await checkAnyPermission(
          user.id,
          permissionCodes,
          tenantId,
          mccAccountId,
          user.role
        );
      }
    } else if (permissionCode) {
      // 检查单个权限
      result = await checkPermission(
        user.id,
        permissionCode,
        tenantId,
        mccAccountId,
        user.role
      );
    } else {
      logger.warn('mcc_permission_check_missing_code', { 
        requestId, 
        userId: user.id,
      });
      return NextResponse.json(
        { error: '缺少必填字段：permissionCode 或 permissionCodes', requestId },
        { status: 400 }
      );
    }

    logger.info('mcc_permission_check_success', { 
      requestId,
      userId: user.id,
      permissionCode: permissionCode || permissionCodes,
      tenantId,
      mccAccountId,
      hasPermission: 'hasPermission' in result ? result.hasPermission : result.hasAllPermissions,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      ...result,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_permission_check_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '权限检查失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
