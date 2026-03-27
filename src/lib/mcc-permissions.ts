/**
 * MCC 细粒度权限控制服务
 * 
 * 功能：
 * - 权限定义和检查
 * - 角色权限管理
 * - 用户权限授予/撤销
 * - 权限中间件
 */

import { getDb } from './db';
import { logger } from './structured-logger';

const db = getDb();

export type PermissionCode =
  | 'mcc:read'
  | 'mcc:write'
  | 'mcc:delete'
  | 'mcc:authorize'
  | 'mcc:token_refresh'
  | 'binding:read'
  | 'binding:create'
  | 'binding:update'
  | 'binding:delete'
  | 'tenant:read'
  | 'tenant:write'
  | 'tenant:manage_members'
  | 'tenant:delete'
  | 'bulk:import'
  | 'bulk:export'
  | 'audit:read'
  | 'audit:export'
  | 'audit:cleanup'
  | 'monitoring:read'
  | 'monitoring:refresh';

export type ResourceType = 'mcc_account' | 'user_binding' | 'tenant' | 'audit_log' | 'monitoring';
export type ActionType = 'read' | 'write' | 'delete' | 'admin';
export type Role = 'owner' | 'admin' | 'member' | 'custom';

export interface Permission {
  id: number;
  permissionCode: PermissionCode;
  permissionName: string;
  resourceType: ResourceType;
  actionType: ActionType;
  description: string | null;
}

export interface PermissionCheckResult {
  hasPermission: boolean;
  role?: Role;
  grantedBy?: 'role' | 'direct' | 'admin';
  permission?: Permission;
}

/**
 * 检查用户是否有指定权限
 */
export async function checkPermission(
  userId: number,
  permissionCode: PermissionCode,
  tenantId?: string | null,
  mccAccountId?: number | null,
  userRole?: string
): Promise<PermissionCheckResult> {
  // 系统管理员拥有所有权限
  if (userRole === 'admin') {
    logger.debug('permission_check_admin', {
      operation: 'checkPermission',
      userId,
      permissionCode,
    });
    return { hasPermission: true, grantedBy: 'admin' };
  }

  // 获取权限定义
  const permission = db.queryOne(`
    SELECT * FROM mcc_permissions WHERE permission_code = ?
  `, [permissionCode]) as Permission | undefined;

  if (!permission) {
    logger.warn('permission_check_unknown_permission', {
      operation: 'checkPermission',
      userId,
      permissionCode,
    });
    return { hasPermission: false };
  }

  // 1. 检查直接授予的权限
  const directPermission = db.queryOne(`
    SELECT up.*, mp.permission_code
    FROM user_permissions up
    JOIN mcc_permissions mp ON up.permission_id = mp.id
    WHERE up.user_id = ?
      AND mp.permission_code = ?
      AND (up.tenant_id = ? OR (? IS NULL AND up.tenant_id IS NULL))
      AND (up.mcc_account_id = ? OR (? IS NULL AND up.mcc_account_id IS NULL))
      AND (up.expires_at IS NULL OR up.expires_at > datetime('now'))
  `, [userId, permissionCode, tenantId, tenantId, mccAccountId, mccAccountId]) as any;

  if (directPermission) {
    logger.debug('permission_check_direct', {
      operation: 'checkPermission',
      userId,
      permissionCode,
      tenantId,
      mccAccountId,
    });
    return { 
      hasPermission: true, 
      grantedBy: 'direct',
      permission 
    };
  }

  // 2. 检查租户角色权限
  if (tenantId) {
    const membership = db.queryOne(`
      SELECT utm.role
      FROM user_tenant_memberships utm
      WHERE utm.user_id = ? AND utm.tenant_id = ?
    `, [userId, tenantId]) as { role: Role } | undefined;

    if (membership) {
      const rolePermission = db.queryOne(`
        SELECT rp.*
        FROM role_permissions rp
        JOIN mcc_permissions mp ON rp.permission_id = mp.id
        WHERE rp.role = ?
          AND mp.permission_code = ?
          AND (rp.tenant_id = ? OR rp.tenant_id IS NULL)
      `, [membership.role, permissionCode, tenantId]) as any;

      if (rolePermission) {
        logger.debug('permission_check_role', {
          operation: 'checkPermission',
          userId,
          permissionCode,
          tenantId,
          role: membership.role,
        });
        return { 
          hasPermission: true, 
          role: membership.role,
          grantedBy: 'role',
          permission 
        };
      }
    }
  }

  logger.debug('permission_check_denied', {
    operation: 'checkPermission',
    userId,
    permissionCode,
    tenantId,
    mccAccountId,
  });
  return { hasPermission: false };
}

/**
 * 检查用户是否有任一权限（OR 逻辑）
 */
export async function checkAnyPermission(
  userId: number,
  permissionCodes: PermissionCode[],
  tenantId?: string | null,
  mccAccountId?: number | null,
  userRole?: string
): Promise<PermissionCheckResult> {
  for (const code of permissionCodes) {
    const result = await checkPermission(userId, code, tenantId, mccAccountId, userRole);
    if (result.hasPermission) {
      return result;
    }
  }
  return { hasPermission: false };
}

/**
 * 检查用户是否有所有权限（AND 逻辑）
 */
export async function checkAllPermissions(
  userId: number,
  permissionCodes: PermissionCode[],
  tenantId?: string | null,
  mccAccountId?: number | null,
  userRole?: string
): Promise<{ hasAllPermissions: boolean; missingPermissions: PermissionCode[] }> {
  const missingPermissions: PermissionCode[] = [];

  for (const code of permissionCodes) {
    const result = await checkPermission(userId, code, tenantId, mccAccountId, userRole);
    if (!result.hasPermission) {
      missingPermissions.push(code);
    }
  }

  return {
    hasAllPermissions: missingPermissions.length === 0,
    missingPermissions,
  };
}

/**
 * 获取用户的所有权限
 */
export async function getUserPermissions(
  userId: number,
  tenantId?: string | null
): Promise<Permission[]> {
  const permissions = db.query(`
    SELECT DISTINCT mp.*
    FROM mcc_permissions mp
    LEFT JOIN role_permissions rp ON mp.id = rp.permission_id
    LEFT JOIN user_tenant_memberships utm ON rp.role = utm.role AND utm.user_id = ?
    LEFT JOIN user_permissions up ON mp.id = up.permission_id AND up.user_id = ?
    WHERE utm.role IS NOT NULL
       OR up.id IS NOT NULL
       OR ? = 'admin'  -- 管理员拥有所有权限
       OR (rp.role = 'owner' AND rp.tenant_id IS NULL)  -- owner 拥有全局权限
    ORDER BY mp.resource_type, mp.action_type
  `, [userId, userId, userId]) as Permission[];

  return permissions;
}

/**
 * 获取所有权限定义
 */
export function getAllPermissions(): Permission[] {
  return db.query(`
    SELECT * FROM mcc_permissions
    ORDER BY resource_type, action_type
  `) as Permission[];
}

/**
 * 授予用户权限
 */
export function grantPermission(
  userId: number,
  permissionCode: PermissionCode,
  grantedBy: number,
  tenantId?: string | null,
  mccAccountId?: number | null,
  expiresAt?: string | null
): number {
  const permission = db.queryOne(`
    SELECT id FROM mcc_permissions WHERE permission_code = ?
  `, [permissionCode]) as { id: number } | undefined;

  if (!permission) {
    throw new Error(`权限不存在：${permissionCode}`);
  }

  const result = db.exec(`
    INSERT INTO user_permissions (
      user_id, permission_id, tenant_id, mcc_account_id, granted_by, expires_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(user_id, permission_id, tenant_id, mcc_account_id) DO UPDATE SET
      granted_by = excluded.granted_by,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `, [userId, permission.id, tenantId || null, mccAccountId || null, grantedBy, expiresAt || null]);

  logger.info('permission_granted', {
    operation: 'grantPermission',
    userId,
    permissionCode,
    grantedBy,
    tenantId,
    mccAccountId,
    expiresAt,
  });

  return result.lastInsertRowid as number;
}

/**
 * 撤销用户权限
 */
export function revokePermission(
  userId: number,
  permissionCode: PermissionCode,
  tenantId?: string | null,
  mccAccountId?: number | null
): number {
  const permission = db.queryOne(`
    SELECT id FROM mcc_permissions WHERE permission_code = ?
  `, [permissionCode]) as { id: number } | undefined;

  if (!permission) {
    throw new Error(`权限不存在：${permissionCode}`);
  }

  const result = db.exec(`
    DELETE FROM user_permissions
    WHERE user_id = ? 
      AND permission_id = ?
      AND (tenant_id = ? OR (? IS NULL AND tenant_id IS NULL))
      AND (mcc_account_id = ? OR (? IS NULL AND mcc_account_id IS NULL))
  `, [userId, permission.id, tenantId, tenantId, mccAccountId, mccAccountId]);

  logger.info('permission_revoked', {
    operation: 'revokePermission',
    userId,
    permissionCode,
    tenantId,
    mccAccountId,
  });

  return result.changes;
}

/**
 * 获取权限中间件工厂
 * 用于 API 路由的权限检查
 */
export function requirePermission(
  permissionCode: PermissionCode | PermissionCode[],
  options?: {
    requireTenant?: boolean;
    requireMCC?: boolean;
  }
) {
  return async function(
    userId: number,
    userRole: string | undefined,
    tenantId?: string | null,
    mccAccountId?: number | null
  ): Promise<PermissionCheckResult> {
    const permissionCodes = Array.isArray(permissionCode) ? permissionCode : [permissionCode];
    
    const result = await checkAnyPermission(
      userId,
      permissionCodes,
      options?.requireTenant ? tenantId : null,
      options?.requireMCC ? mccAccountId : null,
      userRole
    );

    if (!result.hasPermission) {
      logger.warn('permission_required_denied', {
        operation: 'requirePermission',
        userId,
        permissionCodes,
        tenantId,
        mccAccountId,
      });
    }

    return result;
  };
}
