/**
 * MCC 授权状态监控面板 API
 * GET: 获取所有 MCC 账号的授权状态和统计数据
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';

const mccService = new GoogleAdsMCCService(getDb());

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
      logger.warn('mcc_monitoring_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 获取所有 MCC 账号
    const mccAccounts = mccService.getAvailableMCCAccounts();
    
    // 获取每个 MCC 的绑定用户统计
    const mccStats = mccAccounts.map(mcc => {
      const bindings = mccService.getMCCBindings(mcc.id);
      const authorizedBindings = bindings.filter(b => b.is_authorized === 1);
      const needsReauthBindings = bindings.filter(b => b.needs_reauth === 1);
      
      // 检查 Token 是否即将过期（24 小时内）
      const tokenExpiresAt = mcc.mcc_token_expires_at ? new Date(mcc.mcc_token_expires_at) : null;
      const now = new Date();
      const hoursUntilExpiry = tokenExpiresAt 
        ? (tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        : null;
      const isTokenExpiringSoon = hoursUntilExpiry !== null && hoursUntilExpiry < 24 && hoursUntilExpiry > 0;
      const isTokenExpired = hoursUntilExpiry !== null && hoursUntilExpiry <= 0;

      return {
        id: mcc.id,
        mccCustomerId: mcc.mcc_customer_id,
        oauthClientId: mcc.oauth_client_id,
        isAuthorized: mcc.is_authorized === 1,
        isActive: mcc.is_active === 1,
        lastAuthorizedAt: mcc.last_authorized_at,
        tokenExpiresAt: mcc.mcc_token_expires_at,
        tokenStatus: isTokenExpired ? 'expired' : (isTokenExpiringSoon ? 'expiring_soon' : 'valid'),
        hoursUntilExpiry: hoursUntilExpiry ? Math.round(hoursUntilExpiry * 10) / 10 : null,
        totalBindings: bindings.length,
        authorizedBindings: authorizedBindings.length,
        needsReauthBindings: needsReauthBindings.length,
        pendingBindings: bindings.length - authorizedBindings.length,
        authorizationRate: bindings.length > 0 
          ? Math.round((authorizedBindings.length / bindings.length) * 100) 
          : 0,
      };
    });

    // 计算总体统计
    const totalMccCount = mccStats.length;
    const authorizedMccCount = mccStats.filter(m => m.isAuthorized).length;
    const totalBindings = mccStats.reduce((sum, m) => sum + m.totalBindings, 0);
    const totalAuthorizedBindings = mccStats.reduce((sum, m) => sum + m.authorizedBindings, 0);
    const totalNeedsReauth = mccStats.reduce((sum, m) => sum + m.needsReauthBindings, 0);
    const expiringTokens = mccStats.filter(m => m.tokenStatus === 'expiring_soon').length;
    const expiredTokens = mccStats.filter(m => m.tokenStatus === 'expired').length;

    // 按状态分类 MCC 账号
    const mccByStatus = {
      all: mccStats,
      authorized: mccStats.filter(m => m.isAuthorized),
      unauthorized: mccStats.filter(m => !m.isAuthorized),
      expiringTokens: mccStats.filter(m => m.tokenStatus === 'expiring_soon'),
      expiredTokens: mccStats.filter(m => m.tokenStatus === 'expired'),
      lowAuthorizationRate: mccStats.filter(m => m.authorizationRate < 50 && m.totalBindings > 0),
    };

    logger.info('mcc_monitoring_success', { 
      requestId,
      userId: user.id,
      totalMccCount,
      authorizedMccCount,
      totalBindings,
      totalAuthorizedBindings,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({
      success: true,
      requestId,
      summary: {
        totalMccCount,
        authorizedMccCount,
        unauthorizedMccCount: totalMccCount - authorizedMccCount,
        totalBindings,
        totalAuthorizedBindings,
        totalNeedsReauth,
        expiringTokens,
        expiredTokens,
        overallAuthorizationRate: totalBindings > 0 
          ? Math.round((totalAuthorizedBindings / totalBindings) * 100) 
          : 0,
      },
      mccStats,
      mccByStatus,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('mcc_monitoring_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取监控数据失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}
