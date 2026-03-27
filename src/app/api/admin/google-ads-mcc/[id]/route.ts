/**
 * MCC 账号配置管理
 * PUT: 更新 MCC 配置
 * DELETE: 删除 MCC 账号配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

/**
 * PUT /api/admin/google-ads-mcc/[id]
 * 更新 MCC 配置
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const mccId = parseInt(params.id);
    if (isNaN(mccId)) {
      return NextResponse.json({ error: 'Invalid MCC ID' }, { status: 400 });
    }

    const body = await request.json();
    const {
      oauthClientId,
      oauthClientSecret,
      developerToken,
    } = body;

    // 验证必填字段
    if (!oauthClientId || !developerToken) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 验证 OAuth Client ID 格式
    if (!oauthClientId.includes('.apps.googleusercontent.com')) {
      return NextResponse.json(
        { error: 'OAuth Client ID 格式不正确' },
        { status: 400 }
      );
    }

    // 构建更新对象
    const updates: any = {
      oauth_client_id: oauthClientId.trim(),
      developer_token: developerToken.trim(),
    };

    // 只有提供了新的 Client Secret 才更新
    if (oauthClientSecret && oauthClientSecret.trim()) {
      updates.oauth_client_secret = oauthClientSecret.trim();
    }

    mccService.updateMCCConfig(mccId, updates);

    return NextResponse.json({ 
      success: true,
      message: 'MCC 配置已更新' + (oauthClientSecret ? '，请重新授权' : '')
    });
  } catch (error) {
    console.error('Error updating MCC config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update MCC config' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const mccId = parseInt(params.id);
    if (isNaN(mccId)) {
      return NextResponse.json({ error: 'Invalid MCC ID' }, { status: 400 });
    }

    mccService.deleteMCCConfig(mccId);

    return NextResponse.json({ 
      success: true,
      message: 'MCC 账号已删除'
    });
  } catch (error) {
    console.error('Error deleting MCC config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete MCC config' },
      { status: 500 }
    );
  }
}
