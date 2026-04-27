import { NextRequest, NextResponse } from 'next/server'
import { handler } from '@/lib/tasks/7day-backup'

/**
 * POST /api/admin/backups/trigger-7day
 * 手动触发 7 天备份任务（管理员专用）
 */
export async function POST(request: NextRequest) {
  return handler(request)
}

/**
 * GET /api/admin/backups/trigger-7day
 * 也可以 GET 触发（方便测试）
 */
export async function GET(request: NextRequest) {
  return handler(request)
}
