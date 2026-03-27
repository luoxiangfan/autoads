/**
 * 批量导入用户到 MCC 账号
 * POST: /api/admin/user-mcc-bindings/batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      mccAccountId,
      users, // Array of { userId: number, customerId: string }
    } = body;

    // 验证必填字段
    if (!mccAccountId || !users || !Array.isArray(users)) {
      return NextResponse.json(
        { error: '缺少必填字段' },
        { status: 400 }
      );
    }

    if (users.length === 0) {
      return NextResponse.json(
        { error: '用户列表不能为空' },
        { status: 400 }
      );
    }

    // 限制单次导入数量
    if (users.length > 100) {
      return NextResponse.json(
        { error: '单次最多导入 100 个用户' },
        { status: 400 }
      );
    }

    // 验证每个用户的 Customer ID 格式
    const invalidUsers = users.filter((u: any) => {
      if (!u.userId || !u.customerId) return true;
      if (!/^\d{10}$/.test(String(u.customerId).trim())) return true;
      return false;
    });

    if (invalidUsers.length > 0) {
      return NextResponse.json(
        { 
          error: '部分用户数据格式不正确',
          details: '每个用户需要包含 userId 和 10 位数字的 customerId'
        },
        { status: 400 }
      );
    }

    // 执行批量绑定
    const results = mccService.batchBindUsersToMCC(
      mccAccountId,
      users.map((u: any) => ({
        userId: parseInt(u.userId),
        customerId: String(u.customerId).trim(),
      })),
      user.id
    );

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      total: users.length,
      successCount,
      failedCount,
      results: results.map(r => ({
        userId: r.userId,
        success: r.success,
        error: r.error,
      })),
      message: `批量导入完成：成功 ${successCount} 个，失败 ${failedCount} 个`
    });
  } catch (error) {
    console.error('Error batch binding users:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to batch bind users' },
      { status: 500 }
    );
  }
}
