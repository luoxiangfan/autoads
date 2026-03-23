/**
 * MCC 账号配置管理 API
 * GET: 获取所有 MCC 账号列表
 * POST: 创建/更新 MCC 配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
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

    return NextResponse.json({ mccAccounts: sanitizedAccounts });
  } catch (error) {
    console.error('Error fetching MCC accounts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MCC accounts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
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
    if (!mccCustomerId || !oauthClientId || !oauthClientSecret || !developerToken) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 验证 MCC Customer ID 格式（10 位数字）
    if (!/^\d{10}$/.test(mccCustomerId.trim())) {
      return NextResponse.json(
        { error: 'MCC Customer ID 必须是 10 位数字' },
        { status: 400 }
      );
    }

    const mccId = mccService.saveMCCConfig(
      mccCustomerId,
      oauthClientId,
      oauthClientSecret,
      developerToken,
      user.id
    );

    return NextResponse.json({ 
      success: true, 
      mccId,
      message: 'MCC 配置已保存，请进行 OAuth 授权'
    });
  } catch (error) {
    console.error('Error saving MCC config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save MCC config' },
      { status: 500 }
    );
  }
}
