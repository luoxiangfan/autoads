/**
 * 解除用户 MCC 绑定
 * DELETE: /api/admin/user-mcc-binding/[userId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

const db = getDb();

export async function DELETE(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const userId = parseInt(params.userId);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    db.prepare(`
      UPDATE user_mcc_bindings SET
        is_authorized = 0,
        needs_reauth = 1,
        user_refresh_token = NULL,
        user_access_token = NULL,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(userId);

    return NextResponse.json({ 
      success: true,
      message: '用户绑定已解除'
    });
  } catch (error) {
    console.error('Error unbinding user:', error);
    return NextResponse.json(
      { error: 'Failed to unbind user' },
      { status: 500 }
    );
  }
}
