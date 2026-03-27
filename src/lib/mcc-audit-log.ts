/**
 * MCC 审计日志服务
 * 
 * 功能：
 * - 记录所有 MCC 相关操作
 * - 支持查询和过滤审计日志
 * - 支持数据导出
 */

import { getDb } from './db';
import { logger } from './structured-logger';

const db = getDb();

export type AuditActionType =
  | 'MCC_CREATE'
  | 'MCC_UPDATE'
  | 'MCC_DELETE'
  | 'MCC_AUTHORIZE'
  | 'MCC_TOKEN_REFRESH'
  | 'USER_BIND'
  | 'USER_UNBIND'
  | 'USER_BINDING_UPDATE'
  | 'TENANT_CREATE'
  | 'TENANT_MEMBER_ADD'
  | 'TENANT_MEMBER_REMOVE'
  | 'TENANT_MEMBER_UPDATE'
  | 'BULK_IMPORT'
  | 'BULK_EXPORT';

export type AuditStatus = 'success' | 'failure' | 'warning';

export interface AuditLogEntry {
  id: number;
  actionType: AuditActionType;
  resourceType: string;
  resourceId: number | null;
  tenantId: string | null;
  userId: number;
  userRole: string | null;
  userEmail: string | null;
  actionDetails: any | null;
  oldValues: any | null;
  newValues: any | null;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: AuditStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface AuditLogFilter {
  userId?: number;
  actionType?: AuditActionType;
  resourceType?: string;
  resourceId?: number;
  tenantId?: string;
  status?: AuditStatus;
  requestId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * 记录审计日志
 */
export function logAudit(
  params: {
    actionType: AuditActionType;
    resourceType?: string;
    resourceId?: number | null;
    tenantId?: string | null;
    userId: number;
    userRole?: string | null;
    userEmail?: string | null;
    actionDetails?: any;
    oldValues?: any;
    newValues?: any;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    status?: AuditStatus;
    errorMessage?: string | null;
  }
): number {
  const {
    actionType,
    resourceType = 'mcc_account',
    resourceId = null,
    tenantId = null,
    userId,
    userRole = null,
    userEmail = null,
    actionDetails = null,
    oldValues = null,
    newValues = null,
    requestId = null,
    ipAddress = null,
    userAgent = null,
    status = 'success',
    errorMessage = null,
  } = params;

  try {
    const result = db.exec(`
      INSERT INTO mcc_audit_logs (
        action_type, resource_type, resource_id, tenant_id,
        user_id, user_role, user_email,
        action_details, old_values, new_values,
        request_id, ip_address, user_agent,
        status, error_message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      actionType,
      resourceType,
      resourceId,
      tenantId,
      userId,
      userRole,
      userEmail,
      actionDetails ? JSON.stringify(actionDetails) : null,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      requestId,
      ipAddress,
      userAgent,
      status,
      errorMessage,
    ]);

    const logId = result.lastInsertRowid as number;

    logger.info('mcc_audit_log_created', {
      operation: 'logAudit',
      logId,
      actionType,
      userId,
      resourceId,
      status,
    });

    return logId;
  } catch (error: any) {
    logger.error('mcc_audit_log_error', {
      operation: 'logAudit',
      actionType,
      userId,
      error: error.message || String(error),
    });
    throw error;
  }
}

/**
 * 查询审计日志
 */
export function queryAuditLogs(filter: AuditLogFilter): {
  logs: AuditLogEntry[];
  total: number;
} {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filter.userId) {
    conditions.push('user_id = ?');
    params.push(filter.userId);
  }

  if (filter.actionType) {
    conditions.push('action_type = ?');
    params.push(filter.actionType);
  }

  if (filter.resourceType) {
    conditions.push('resource_type = ?');
    params.push(filter.resourceType);
  }

  if (filter.resourceId !== undefined) {
    conditions.push('resource_id = ?');
    params.push(filter.resourceId);
  }

  if (filter.tenantId) {
    conditions.push('tenant_id = ?');
    params.push(filter.tenantId);
  }

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }

  if (filter.requestId) {
    conditions.push('request_id = ?');
    params.push(filter.requestId);
  }

  if (filter.startDate) {
    conditions.push('created_at >= ?');
    params.push(filter.startDate);
  }

  if (filter.endDate) {
    conditions.push('created_at <= ?');
    params.push(filter.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countResult = db.queryOne(`
    SELECT COUNT(*) as count FROM mcc_audit_logs ${whereClause}
  `, params) as { count: number };

  // 查询日志
  const limit = filter.limit || 100;
  const offset = filter.offset || 0;

  const logs = db.query(`
    SELECT * FROM mcc_audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]) as any[];

  return {
    logs: logs.map(log => ({
      id: log.id,
      actionType: log.action_type as AuditActionType,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      tenantId: log.tenant_id,
      userId: log.user_id,
      userRole: log.user_role,
      userEmail: log.user_email,
      actionDetails: log.action_details ? JSON.parse(log.action_details) : null,
      oldValues: log.old_values ? JSON.parse(log.old_values) : null,
      newValues: log.new_values ? JSON.parse(log.new_values) : null,
      requestId: log.request_id,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      status: log.status as AuditStatus,
      errorMessage: log.error_message,
      createdAt: log.created_at,
    })),
    total: countResult.count,
  };
}

/**
 * 获取资源的操作历史
 */
export function getResourceHistory(
  resourceType: string,
  resourceId: number,
  limit: number = 50
): AuditLogEntry[] {
  const result = queryAuditLogs({
    resourceType,
    resourceId,
    limit,
  });

  return result.logs;
}

/**
 * 获取用户的操作历史
 */
export function getUserHistory(
  userId: number,
  limit: number = 100
): AuditLogEntry[] {
  const result = queryAuditLogs({
    userId,
    limit,
  });

  return result.logs;
}

/**
 * 导出审计日志（用于合规审计）
 */
export function exportAuditLogs(
  filter: AuditLogFilter,
  format: 'json' | 'csv' = 'json'
): string {
  const result = queryAuditLogs(filter);

  if (format === 'json') {
    return JSON.stringify(result.logs, null, 2);
  }

  // CSV 格式
  if (result.logs.length === 0) {
    return 'id,action_type,resource_type,resource_id,user_id,status,created_at\n';
  }

  const headers = 'id,action_type,resource_type,resource_id,user_id,status,created_at';
  const rows = result.logs.map(log =>
    `${log.id},${log.actionType},${log.resourceType},${log.resourceId || ''},${log.userId},${log.status},${log.createdAt}`
  );

  return [headers, ...rows].join('\n');
}

/**
 * 清理旧的审计日志（保留最近 N 天）
 */
export function cleanupOldAuditLogs(daysToKeep: number = 90): number {
  const result = db.exec(`
    DELETE FROM mcc_audit_logs
    WHERE created_at < datetime('now', '-${daysToKeep} days')
  `);

  const deletedCount = result.changes;

  logger.info('mcc_audit_log_cleanup', {
    operation: 'cleanupOldAuditLogs',
    daysToKeep,
    deletedCount,
  });

  return deletedCount;
}
