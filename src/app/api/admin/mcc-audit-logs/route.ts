/**
 * MCC 审计日志查询 API
 * GET: 查询审计日志
 * DELETE: 清理旧的审计日志
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queryAuditLogs, cleanupOldAuditLogs, exportAuditLogs } from '@/lib/mcc-audit-log';
import { logger } from '@/lib/structured-logger';

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
      logger.warn('mcc_audit_logs_get_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 解析查询参数
    const url = new URL(request.url);
    const filter = {
      userId: url.searchParams.get('userId') ? parseInt(url.searchParams.get('userId')!) : undefined,
      actionType: url.searchParams.get('actionType') as any || undefined,
      resourceType: url.searchParams.get('resourceType') || undefined,
      resourceId: url.searchParams.get('resourceId') ? parseInt(url.searchParams.get('resourceId')!) : undefined,
      tenantId: url.searchParams.get('tenantId') || undefined,
      status: url.searchParams.get('status') as any || undefined,
      requestId: url.searchParams.get('requestId') || undefined,
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 100,
      offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
    };

    // 导出格式
    const exportFormat = url.searchParams.get('export') as 'json' | 'csv' | null;

    logger.info('mcc_audit_logs_get_request', { 
      requestId,
      userId: user.id,
      filter,
    });

    if (exportFormat) {
      // 导出模式
      const csv = exportAuditLogs(filter, exportFormat);
      
      logger.info('mcc_audit_logs_export_success', { 
        requestId,
        userId: user.id,
        format: exportFormat,
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': exportFormat === 'csv' ? 'text/csv' : 'application/json',
          'Content-Disposition': `attachment; filename="mcc-audit-logs-${Date.now()}.${exportFormat}"`,
        },
      });
    }

    // 正常查询模式
    const result = queryAuditLogs(filter);

    logger.info('mcc_audit_logs_get_success', { 
      requestId,
      userId: user.id,
      logCount: result.logs.length,
      total: result.total,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      logs: result.logs,
      total: result.total,
      limit: filter.limit,
      offset: filter.offset,
      hasMore: result.logs.length === filter.limit,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_audit_logs_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '查询审计日志失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('mcc_audit_logs_delete_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { daysToKeep = 90 } = body;

    if (daysToKeep < 1 || daysToKeep > 365) {
      logger.warn('mcc_audit_logs_delete_invalid_days', { 
        requestId, 
        userId: user.id,
        daysToKeep,
      });
      return NextResponse.json(
        { error: 'daysToKeep 必须在 1-365 天之间', requestId },
        { status: 400 }
      );
    }

    const deletedCount = cleanupOldAuditLogs(daysToKeep);

    logger.info('mcc_audit_logs_delete_success', { 
      requestId,
      userId: user.id,
      daysToKeep,
      deletedCount,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      success: true, 
      deletedCount,
      daysToKeep,
      message: `已清理 ${deletedCount} 条 ${daysToKeep} 天前的审计日志`,
      requestId
    });
  } catch (error: any) {
    logger.error('mcc_audit_logs_delete_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '清理审计日志失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
