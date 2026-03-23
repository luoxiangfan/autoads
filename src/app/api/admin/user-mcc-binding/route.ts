/**
 * 用户 MCC 绑定管理 API
 * GET: 获取用户的绑定状态
 * POST: 管理员绑定用户到 MCC
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const authStatus = mccService.checkUserAuthorization(user.id);
    
    return NextResponse.json({
      isAuthorized: authStatus.isAuthorized,
      needsReauth: authStatus.needsReauth,
      customerId: authStatus.customerId,
      mccName: authStatus.mccName,
    });
  } catch (error) {
    console.error('Error checking authorization:', error);
    return NextResponse.json(
      { error: 'Failed to check authorization status' },
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
      userId,
      mccAccountId,
      customerId,
    } = body;

    // 验证必填字段
    if (!userId || !mccAccountId || !customerId) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    // 验证 Customer ID 格式（10 位数字）
    if (!/^\d{10}$/.test(customerId.trim())) {
      return NextResponse.json(
        { error: 'Customer ID 必须是 10 位数字' },
        { status: 400 }
      );
    }

    const bindingId = mccService.bindUserToMCC(
      parseInt(userId),
      parseInt(mccAccountId),
      customerId,
      user.id
    );

    return NextResponse.json({ 
      success: true, 
      bindingId,
      message: '用户绑定成功，用户需完成 OAuth 授权'
    });
  } catch (error) {
    console.error('Error binding user to MCC:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to bind user' },
      { status: 500 }
    );
  }
}
