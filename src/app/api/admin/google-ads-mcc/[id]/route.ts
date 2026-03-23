/**
 * 删除 MCC 账号配置
 * DELETE: /api/admin/google-ads-mcc/[id]
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';
import { getCurrentUser } from '@/lib/auth';

const mccService = new GoogleAdsMCCService(getDb());

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
