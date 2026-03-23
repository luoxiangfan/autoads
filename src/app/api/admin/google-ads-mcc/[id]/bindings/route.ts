/**
 * 获取 MCC 账号下的绑定用户列表
 * GET: 获取指定 MCC 账号的所有绑定用户
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

export async function GET(
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

    const bindings = mccService.getMCCBindings(mccId);
    
    // 脱敏敏感信息
    const sanitizedBindings = bindings.map(b => ({
      id: b.id,
      user_id: b.user_id,
      username: b.username,
      email: b.email,
      customer_id: b.customer_id,
      is_authorized: b.is_authorized === 1,
      needs_reauth: b.needs_reauth === 1,
      last_authorized_at: b.last_authorized_at,
      bound_at: b.bound_at,
    }));

    return NextResponse.json({ bindings: sanitizedBindings });
  } catch (error) {
    console.error('Error fetching MCC bindings:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch bindings' },
      { status: 500 }
    );
  }
}
