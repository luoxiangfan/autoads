/**
 * MCC 账号配置管理 API
 * GET: 获取所有 MCC 账号列表
 * POST: 创建/更新 MCC 配置
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
      logger.warn('mcc_get_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const mccAccounts = mccService.getAvailableMCCAccounts();
    
    // 脱敏敏感信息
    const sanitizedAccounts = mccAccounts.map(acc => ({
      id: acc.id,
      mcc_customer_id: acc.mcc_customer_id,
      oauth_client_id: acc.oauth_client_id,
      is_authorized: acc.is_authorized === 1,
      is_active: acc.is_active === 1,
      last_authorized_at: acc.last_authorized_at,
      created_at: acc.created_at,
      updated_at: acc.updated_at,
    }));

    logger.info('mcc_get_success', { 
      requestId,
      userId: user.id,
      count: sanitizedAccounts.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ mccAccounts: sanitizedAccounts });
  } catch (error: any) {
    logger.error('mcc_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取 MCC 账号列表失败',
        requestId,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      logger.warn('mcc_post_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      mccCustomerId,
      oauthClientId,
      oauthClientSecret,
      developerToken,
    } = body;

    // 验证必填字段
    const missingFields: string[] = [];
    if (!mccCustomerId) missingFields.push('mccCustomerId');
    if (!oauthClientId) missingFields.push('oauthClientId');
    if (!oauthClientSecret) missingFields.push('oauthClientSecret');
    if (!developerToken) missingFields.push('developerToken');

    if (missingFields.length > 0) {
      logger.warn('mcc_post_validation_failed', { 
        requestId,
        userId: user.id,
        missingFields,
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json(
        { 
          error: '缺少必填字段',
          missingFields,
          requestId
        },
        { status: 400 }
      );
    }

    // 验证 MCC Customer ID 格式（10 位数字）
    if (!/^\d{10}$/.test(mccCustomerId.trim())) {
      logger.warn('mcc_post_invalid_format', { 
        requestId,
        userId: user.id,
        field: 'mccCustomerId',
        value: mccCustomerId.substring(0, 4) + '***',
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json(
        { 
          error: 'MCC Customer ID 格式不正确',
          details: '必须是 10 位数字（不含连字符）',
          requestId
        },
        { status: 400 }
      );
    }

    // 验证 OAuth Client ID 格式
    if (!oauthClientId.includes('.apps.googleusercontent.com')) {
      logger.warn('mcc_post_invalid_oauth_client', { 
        requestId,
        userId: user.id,
        durationMs: Date.now() - startTime 
      });
      return NextResponse.json(
        { 
          error: 'OAuth Client ID 格式不正确',
          details: '应该是 xxx.apps.googleusercontent.com 格式',
          requestId
        },
        { status: 400 }
      );
    }

    const mccId = mccService.saveMCCConfig(
      mccCustomerId.trim(),
      oauthClientId.trim(),
      oauthClientSecret.trim(),
      developerToken.trim(),
      user.id
    );

    logger.info('mcc_post_success', { 
      requestId,
      userId: user.id,
      mccId,
      mccCustomerId: mccCustomerId.substring(0, 4) + '***',
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      mccId,
      message: 'MCC 配置已保存，请进行 OAuth 授权',
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_post_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '保存 MCC 配置失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
