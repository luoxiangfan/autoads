/**
 * 用户租户列表 API
 * GET: 获取当前用户所属的所有租户
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserTenants } from '@/lib/mcc-tenant-isolation';
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
    if (!user) {
      logger.warn('user_tenants_unauthorized', { 
        requestId, 
        userId: user?.id,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const tenants = await getUserTenants(user.id);

    logger.info('user_tenants_success', { 
      requestId,
      userId: user.id,
      tenantCount: tenants.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      tenants,
      count: tenants.length,
      requestId
    });
  } catch (error: any) {
    logger.error('user_tenants_error', { 
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
