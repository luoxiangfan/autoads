/**
 * 获取所有用户 MCC 绑定
 * GET: /api/admin/user-mcc-bindings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const db = getDb();

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const bindings = db.prepare(`
      SELECT 
        umb.id,
        umb.user_id,
        umb.mcc_account_id,
        umb.customer_id,
        umb.is_authorized,
        umb.needs_reauth,
        umb.bound_at,
        u.username,
        u.email,
        ma.mcc_customer_id
      FROM user_mcc_bindings umb
      JOIN users u ON umb.user_id = u.id
      JOIN mcc_accounts ma ON umb.mcc_account_id = ma.id
      ORDER BY umb.bound_at DESC
    `).all();

    return NextResponse.json({ bindings });
  } catch (error) {
    console.error('Error fetching user bindings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user bindings' },
      { status: 500 }
    );
  }
}
