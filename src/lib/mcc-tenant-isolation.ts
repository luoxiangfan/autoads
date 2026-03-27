/**
 * MCC 租户隔离工具函数
 * 
 * 功能：
 * - 检查用户对 MCC 的访问权限
 * - 根据租户隔离过滤查询结果
 * - 租户权限验证
 */

import { getDb } from './db';
import { logger } from './structured-logger';

const db = getDb();

export interface TenantPermission {
  hasAccess: boolean;
  tenantId?: string | null;
  role?: string;
  mccAccountId?: number;
  isTenantIsolated?: boolean;
}

/**
 * 检查用户是否有权限访问指定的 MCC 账号
 */
export async function checkMCCAccess(
  userId: number,
  mccAccountId: number,
  userRole?: string
): Promise<TenantPermission> {
  // 管理员拥有所有权限
  if (userRole === 'admin') {
    logger.debug('mcc_access_check_admin', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
    });
    return { hasAccess: true };
  }

  // 查询 MCC 的租户信息
  const mcc = db.queryOne(`
    SELECT id, tenant_id, is_tenant_isolated
    FROM mcc_accounts
    WHERE id = ?
  `, [mccAccountId]) as { 
    id: number; 
    tenant_id: string | null; 
    is_tenant_isolated: number 
  } | undefined;

  if (!mcc) {
    logger.warn('mcc_access_check_not_found', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
    });
    return { hasAccess: false };
  }

  // 如果 MCC 没有启用租户隔离，检查用户绑定关系
  if (!mcc.tenant_id || mcc.is_tenant_isolated === 0) {
    const binding = db.queryOne(`
      SELECT umb.is_authorized, umb.needs_reauth
      FROM user_mcc_bindings umb
      WHERE umb.user_id = ? AND umb.mcc_account_id = ?
    `, [userId, mccAccountId]) as { is_authorized: number; needs_reauth: number } | undefined;

    if (binding && binding.is_authorized === 1) {
      logger.debug('mcc_access_check_binding_ok', {
        operation: 'checkMCCAccess',
        userId,
        mccAccountId,
      });
      return { 
        hasAccess: true,
        tenantId: mcc.tenant_id,
        isTenantIsolated: mcc.is_tenant_isolated === 1,
      };
    }

    logger.warn('mcc_access_check_no_binding', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
    });
    return { hasAccess: false };
  }

  // MCC 启用了租户隔离，检查用户是否是租户成员
  const membership = db.queryOne(`
    SELECT utm.role, utm.mcc_account_id
    FROM user_tenant_memberships utm
    WHERE utm.user_id = ? AND utm.tenant_id = ?
  `, [userId, mcc.tenant_id]) as { role: string; mcc_account_id: number | null } | undefined;

  if (!membership) {
    logger.warn('mcc_access_check_no_membership', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
      tenantId: mcc.tenant_id,
    });
    return { hasAccess: false, tenantId: mcc.tenant_id };
  }

  // 租户 owner/admin 可以访问所有 MCC
  if (['owner', 'admin'].includes(membership.role)) {
    logger.debug('mcc_access_check_tenant_admin', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
      tenantId: mcc.tenant_id,
      role: membership.role,
    });
    return { 
      hasAccess: true,
      tenantId: mcc.tenant_id,
      role: membership.role,
      isTenantIsolated: true,
    };
  }

  // 租户 member 只能访问关联的 MCC
  if (membership.mcc_account_id === mccAccountId) {
    logger.debug('mcc_access_check_tenant_member', {
      operation: 'checkMCCAccess',
      userId,
      mccAccountId,
      tenantId: mcc.tenant_id,
      role: membership.role,
    });
    return { 
      hasAccess: true,
      tenantId: mcc.tenant_id,
      role: membership.role,
      mccAccountId,
      isTenantIsolated: true,
    };
  }

  logger.warn('mcc_access_check_tenant_member_no_mcc', {
    operation: 'checkMCCAccess',
    userId,
    mccAccountId,
    tenantId: mcc.tenant_id,
    role: membership.role,
  });
  return { 
    hasAccess: false,
    tenantId: mcc.tenant_id,
    role: membership.role,
  };
}

/**
 * 获取用户有权限访问的所有 MCC 账号 ID 列表
 */
export async function getUserAccessibleMCCIds(
  userId: number,
  userRole?: string
): Promise<number[]> {
  // 管理员可以访问所有 MCC
  if (userRole === 'admin') {
    const allMCCs = db.query(`
      SELECT id FROM mcc_accounts WHERE is_active = 1
    `) as Array<{ id: number }>;
    return allMCCs.map(m => m.id);
  }

  // 查询用户有权限的 MCC
  const accessibleMCCs = db.query(`
    SELECT DISTINCT ma.id
    FROM mcc_accounts ma
    LEFT JOIN user_mcc_bindings umb ON ma.id = umb.mcc_account_id AND umb.user_id = ?
    LEFT JOIN user_tenant_memberships utm ON ma.tenant_id = utm.tenant_id AND utm.user_id = ?
    WHERE ma.is_active = 1
      AND (
        -- 非租户隔离的 MCC，通过 user_mcc_bindings 授权
        (ma.is_tenant_isolated = 0 OR ma.tenant_id IS NULL) AND umb.is_authorized = 1
        OR
        -- 租户隔离的 MCC，通过租户成员关系授权
        (ma.is_tenant_isolated = 1 AND utm.role IN ('owner', 'admin'))
        OR
        -- 租户成员关联的特定 MCC
        (ma.is_tenant_isolated = 1 AND utm.mcc_account_id = ma.id)
      )
  `, [userId, userId]) as Array<{ id: number }>;

  return accessibleMCCs.map(m => m.id);
}

/**
 * 为 SQL 查询添加租户隔离 WHERE 子句
 * 
 * 使用示例：
 * const baseQuery = "SELECT * FROM mcc_accounts WHERE";
 * const { query, params } = applyTenantIsolation(baseQuery, userId, userRole, [userId]);
 */
export function applyTenantIsolation(
  baseQuery: string,
  userId: number,
  userRole?: string,
  existingParams: any[] = []
): { query: string; params: any[] } {
  // 管理员不需要隔离
  if (userRole === 'admin') {
    return { query: baseQuery, params: existingParams };
  }

  const tenantWhere = `
    (
      -- 非租户隔离的 MCC，通过 user_mcc_bindings 授权
      (mcc_accounts.is_tenant_isolated = 0 OR mcc_accounts.tenant_id IS NULL)
      AND EXISTS (
        SELECT 1 FROM user_mcc_bindings umb
        WHERE umb.mcc_account_id = mcc_accounts.id
          AND umb.user_id = ?
          AND umb.is_authorized = 1
      )
      OR
      -- 租户隔离的 MCC，通过租户成员关系授权
      (mcc_accounts.is_tenant_isolated = 1)
      AND EXISTS (
        SELECT 1 FROM user_tenant_memberships utm
        WHERE utm.tenant_id = mcc_accounts.tenant_id
          AND utm.user_id = ?
          AND (utm.role IN ('owner', 'admin') OR utm.mcc_account_id = mcc_accounts.id)
      )
    )
  `;

  return {
    query: `${baseQuery} ${tenantWhere}`,
    params: [...existingParams, userId, userId],
  };
}

/**
 * 获取用户的租户列表
 */
export async function getUserTenants(userId: number): Promise<Array<{
  tenantId: string;
  role: string;
  mccAccountId: number | null;
  mccCustomerId: string | null;
}>> {
  const tenants = db.query(`
    SELECT 
      utm.tenant_id,
      utm.role,
      utm.mcc_account_id,
      ma.mcc_customer_id
    FROM user_tenant_memberships utm
    LEFT JOIN mcc_accounts ma ON utm.mcc_account_id = ma.id
    WHERE utm.user_id = ?
    ORDER BY utm.role DESC, utm.joined_at DESC
  `, [userId]) as Array<{
    tenant_id: string;
    role: string;
    mcc_account_id: number | null;
    mcc_customer_id: string | null;
  }>;

  return tenants.map(t => ({
    tenantId: t.tenant_id,
    role: t.role,
    mccAccountId: t.mcc_account_id,
    mccCustomerId: t.mcc_customer_id,
  }));
}
