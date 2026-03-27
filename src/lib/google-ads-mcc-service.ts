/**
 * Google Ads MCC 统一授权服务
 * 
 * 功能：
 * - 管理员配置 MCC 账号（OAuth Client + Developer Token）
 * - 管理员完成 MCC 层级 OAuth 授权
 * - 用户绑定到 MCC + CustomerId
 * - 用户完成 OAuth 授权后即可使用
 * - 配置变更自动触发重新授权
 */

import Database from 'better-sqlite3';
import { google } from 'googleapis';
import crypto from 'crypto';
import { logger } from './structured-logger';

export interface MCCAccount {
  id: number;
  mcc_customer_id: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  developer_token: string;
  mcc_refresh_token?: string | null;
  mcc_access_token?: string | null;
  mcc_token_expires_at?: string | null;
  is_authorized: number;
  is_active: number;
  configured_by?: number | null;
  last_authorized_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserMCCBinding {
  id: number;
  user_id: number;
  mcc_account_id: number;
  customer_id: string;
  user_refresh_token?: string | null;
  user_access_token?: string | null;
  user_token_expires_at?: string | null;
  is_authorized: number;
  needs_reauth: number;
  bound_by?: number | null;
  bound_at: string;
  last_authorized_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface StateTokenPayload {
  id: number;
  type: 'mcc' | 'user';
  customerId?: string;
  timestamp: number;
}

export class GoogleAdsMCCService {
  private db: Database;
  private stateSecret: string;

  constructor(db: Database) {
    this.db = db;
    this.stateSecret = process.env.GOOGLE_ADS_STATE_SECRET || 'fallback-secret-change-in-production';
  }

  // ==================== 管理员功能 ====================

  /**
   * 保存 MCC 账号配置
   */
  saveMCCConfig(
    mccCustomerId: string,
    clientId: string,
    clientSecret: string,
    developerToken: string,
    configuredBy: number
  ): number {
    try {
      // 验证 MCC Customer ID 是否已存在
      const existing = this.db.prepare(`
        SELECT id, is_authorized FROM mcc_accounts WHERE mcc_customer_id = ?
      `).get(mccCustomerId.trim()) as { id: number; is_authorized: number } | undefined;

      if (existing) {
        logger.warn('mcc_config_update', {
          operation: 'saveMCCConfig',
          mccCustomerId: mccCustomerId.substring(0, 4) + '***',
          existingId: existing.id,
          wasAuthorized: existing.is_authorized === 1,
          configuredBy
        });
      }

      const stmt = this.db.prepare(`
        INSERT INTO mcc_accounts (
          mcc_customer_id, oauth_client_id, oauth_client_secret, 
          developer_token, configured_by, is_authorized
        ) VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(mcc_customer_id) DO UPDATE SET
          oauth_client_id = excluded.oauth_client_id,
          oauth_client_secret = excluded.oauth_client_secret,
          developer_token = excluded.developer_token,
          configured_by = excluded.configured_by,
          updated_at = datetime('now'),
          is_authorized = 0,
          mcc_refresh_token = NULL,
          mcc_access_token = NULL
        `);

      const result = stmt.run(
        mccCustomerId.trim(),
        clientId.trim(),
        clientSecret.trim(),
        developerToken.trim(),
        configuredBy
      );

      logger.info('mcc_config_saved', {
        operation: 'saveMCCConfig',
        mccId: result.lastInsertRowid,
        mccCustomerId: mccCustomerId.substring(0, 4) + '***',
        configuredBy,
        isUpdate: !!existing
      });

      return result.lastInsertRowid as number;
    } catch (error: any) {
      logger.error('mcc_config_save_error', {
        operation: 'saveMCCConfig',
        mccCustomerId: mccCustomerId.substring(0, 4) + '***',
        configuredBy,
        error: error.message || String(error)
      });
      throw error;
    }
  }

    return result.lastInsertRowid as number;
  }

  /**
   * 生成 MCC 层级的 OAuth 授权 URL
   */
  generateMCCOAuthUrl(mccId: number, redirectUri: string): string {
    const mcc = this.db.prepare(`
      SELECT * FROM mcc_accounts WHERE id = ?
    `).get(mccId) as MCCAccount | undefined;

    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }

    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret,
      redirectUri
    );

    const state = this.generateStateToken(mccId, 'mcc');
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/adwords'],
      prompt: 'consent',
      state,
    });

    return authUrl;
  }

  /**
   * 处理 MCC OAuth 回调
   */
  async handleMCCOAuthCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{ mccId: number }> {
    const payload = this.verifyStateToken(state, 'mcc');
    const mccId = payload.id;

    const mcc = this.db.prepare(`
      SELECT * FROM mcc_accounts WHERE id = ?
    `).get(mccId) as MCCAccount | undefined;

    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }

    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    this.db.prepare(`
      UPDATE mcc_accounts SET
        mcc_refresh_token = ?,
        mcc_access_token = ?,
        mcc_token_expires_at = ?,
        is_authorized = 1,
        last_authorized_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      tokens.refresh_token || null,
      tokens.access_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      mccId
    );

    return { mccId };
  }

  /**
   * 获取所有可用的 MCC 账号
   */
  getAvailableMCCAccounts(): MCCAccount[] {
    return this.db.prepare(`
      SELECT * FROM mcc_accounts WHERE is_active = 1
      ORDER BY created_at DESC
    `).all() as MCCAccount[];
  }

  /**
   * 获取 MCC 账号详情
   */
  getMCCAccount(mccId: number): MCCAccount | null {
    return this.db.prepare(`
      SELECT * FROM mcc_accounts WHERE id = ?
    `).get(mccId) as MCCAccount | null;
  }

  /**
   * 获取 MCC 下的所有 CustomerId 列表（从已绑定的用户中获取）
   */
  getMCCCustomerIds(mccAccountId: number): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT customer_id FROM user_mcc_bindings
      WHERE mcc_account_id = ?
    `).all(mccAccountId) as { customer_id: string }[];

    return rows.map(row => row.customer_id);
  }

  /**
   * 删除 MCC 配置
   */
  deleteMCCConfig(mccId: number): void {
    const mcc = this.getMCCAccount(mccId);
    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }

    // 标记所有关联用户需要重新授权
    this.db.prepare(`
      UPDATE user_mcc_bindings SET
        is_authorized = 0,
        needs_reauth = 1,
        user_refresh_token = NULL,
        user_access_token = NULL,
        updated_at = datetime('now')
      WHERE mcc_account_id = ?
    `).run(mccId);

    // 删除 MCC 配置
    this.db.prepare(`
      DELETE FROM mcc_accounts WHERE id = ?
    `).run(mccId);
  }

  // ==================== 用户绑定功能 ====================

  /**
   * 绑定用户到 MCC 账号
   */
  bindUserToMCC(
    userId: number,
    mccAccountId: number,
    customerId: string,
    boundBy: number
  ): number {
    // 验证 MCC 账号存在且已授权
    const mcc = this.getMCCAccount(mccAccountId);
    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }
    if (!mcc.is_authorized) {
      throw new Error('MCC 账号未完成 OAuth 授权，请先完成授权');
    }

    const stmt = this.db.prepare(`
      INSERT INTO user_mcc_bindings (
        user_id, mcc_account_id, customer_id, bound_by, is_authorized
      ) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(user_id) DO UPDATE SET
        mcc_account_id = excluded.mcc_account_id,
        customer_id = excluded.customer_id,
        bound_by = excluded.bound_by,
        is_authorized = 0,
        needs_reauth = 1,
        user_refresh_token = NULL,
        user_access_token = NULL,
        updated_at = datetime('now')
      `);

    const result = stmt.run(userId, mccAccountId, customerId.trim(), boundBy);
    return result.lastInsertRowid as number;
  }

  /**
   * 批量绑定用户到 MCC 账号
   * @returns Array of { userId, success, error? }
   */
  batchBindUsersToMCC(
    mccAccountId: number,
    users: Array<{ userId: number; customerId: string }>,
    boundBy: number
  ): Array<{ userId: number; success: boolean; error?: string }> {
    const startTime = Date.now();
    
    try {
      // 验证 MCC 账号存在且已授权
      const mcc = this.getMCCAccount(mccAccountId);
      if (!mcc) {
        logger.error('mcc_batch_bind_account_not_found', {
          operation: 'batchBindUsersToMCC',
          mccAccountId,
          boundBy
        });
        throw new Error(`MCC 账号不存在 (ID: ${mccAccountId})`);
      }
      if (!mcc.is_authorized) {
        logger.error('mcc_batch_bind_not_authorized', {
          operation: 'batchBindUsersToMCC',
          mccAccountId,
          mccCustomerId: mcc.mcc_customer_id,
          boundBy
        });
        throw new Error(`MCC 账号 ${mcc.mcc_customer_id} 未完成 OAuth 授权，请先完成授权`);
      }

      logger.info('mcc_batch_bind_start', {
        operation: 'batchBindUsersToMCC',
        mccAccountId,
        mccCustomerId: mcc.mcc_customer_id,
        userCount: users.length,
        boundBy
      });

      const stmt = this.db.prepare(`
        INSERT INTO user_mcc_bindings (
          user_id, mcc_account_id, customer_id, bound_by, is_authorized
        ) VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(user_id) DO UPDATE SET
          mcc_account_id = excluded.mcc_account_id,
          customer_id = excluded.customer_id,
          bound_by = excluded.bound_by,
          is_authorized = 0,
          needs_reauth = 1,
          user_refresh_token = NULL,
          user_access_token = NULL,
          updated_at = datetime('now')
        `);

      const results: Array<{ userId: number; success: boolean; error?: string }> = [];

      // 使用事务确保原子性
      const transaction = this.db.transaction((users: Array<{ userId: number; customerId: string }>) => {
        for (const { userId, customerId } of users) {
          try {
            stmt.run(userId, mccAccountId, customerId.trim(), boundBy);
            results.push({ userId, success: true });
          } catch (error: any) {
            logger.warn('mcc_batch_bind_user_failed', {
              userId,
              mccAccountId,
              error: error.message || String(error)
            });
            results.push({ 
              userId, 
              success: false, 
              error: error.message || '绑定失败' 
            });
          }
        }
      });

      transaction(users);

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      logger.info('mcc_batch_bind_complete', {
        operation: 'batchBindUsersToMCC',
        mccAccountId,
        userCount: users.length,
        successCount,
        failedCount,
        durationMs: Date.now() - startTime
      });

      return results;
    } catch (error: any) {
      logger.error('mcc_batch_bind_error', {
        operation: 'batchBindUsersToMCC',
        mccAccountId,
        userCount: users.length,
        error: error.message || String(error),
        durationMs: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * 获取用户的 MCC 绑定信息
   */
  getUserMCCBinding(userId: number): UserMCCBinding | null {
    return this.db.prepare(`
      SELECT * FROM user_mcc_bindings WHERE user_id = ?
    `).get(userId) as UserMCCBinding | null;
  }

  /**
   * 获取 MCC 账号下的所有绑定用户
   */
  getMCCBindings(mccAccountId: number): (UserMCCBinding & { username?: string; email?: string })[] {
    return this.db.prepare(`
      SELECT umb.*, u.username, u.email
      FROM user_mcc_bindings umb
      JOIN users u ON umb.user_id = u.id
      WHERE umb.mcc_account_id = ?
      ORDER BY umb.created_at DESC
    `).all(mccAccountId) as (UserMCCBinding & { username?: string; email?: string })[];
  }

  /**
   * 解除用户绑定
   */
  unbindUser(userId: number): void {
    this.db.prepare(`
      UPDATE user_mcc_bindings SET
        is_authorized = 0,
        needs_reauth = 1,
        user_refresh_token = NULL,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(userId);
  }

  // ==================== 用户 OAuth 功能 ====================

  /**
   * 生成用户 OAuth 授权 URL
   */
  generateUserOAuthUrl(userId: number, redirectUri: string): string {
    const binding = this.getUserMCCBinding(userId);
    
    if (!binding) {
      throw new Error('用户未绑定 MCC 账号，请联系管理员');
    }

    const mcc = this.getMCCAccount(binding.mcc_account_id);
    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }
    if (!mcc.is_authorized) {
      throw new Error('MCC 账号未完成 OAuth 授权，请联系管理员');
    }

    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret,
      redirectUri
    );

    const state = this.generateStateToken(userId, 'user', binding.customer_id);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/adwords'],
      prompt: 'consent',
      state,
      login_hint: mcc.mcc_customer_id,
    });

    return authUrl;
  }

  /**
   * 处理用户 OAuth 回调
   */
  async handleUserOAuthCallback(
    userId: number,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<{ customerId: string }> {
    const payload = this.verifyStateToken(state, 'user');
    
    if (payload.id !== userId) {
      throw new Error('State token 验证失败');
    }

    const binding = this.getUserMCCBinding(userId);
    if (!binding) {
      throw new Error('用户未绑定 MCC 账号');
    }

    const mcc = this.getMCCAccount(binding.mcc_account_id);
    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }

    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    this.db.prepare(`
      UPDATE user_mcc_bindings SET
        user_refresh_token = ?,
        user_access_token = ?,
        user_token_expires_at = ?,
        is_authorized = 1,
        needs_reauth = 0,
        last_authorized_at = datetime('now'),
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      tokens.refresh_token || null,
      tokens.access_token || null,
      tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      userId
    );

    return { customerId: binding.customer_id };
  }

  /**
   * 检查用户授权状态
   */
  checkUserAuthorization(userId: number): {
    isAuthorized: boolean;
    needsReauth: boolean;
    customerId?: string;
    mccName?: string;
  } {
    const binding = this.getUserMCCBinding(userId);
    
    if (!binding) {
      return { isAuthorized: false, needsReauth: false };
    }

    const mcc = this.getMCCAccount(binding.mcc_account_id);
    
    // 检查 MCC 是否仍然授权
    if (!mcc || !mcc.is_authorized) {
      return {
        isAuthorized: false,
        needsReauth: true,
        customerId: binding.customer_id,
      };
    }

    // 检查用户授权状态
    if (binding.needs_reauth || !binding.is_authorized) {
      return {
        isAuthorized: false,
        needsReauth: true,
        customerId: binding.customer_id,
        mccName: mcc.mcc_customer_id,
      };
    }

    // 检查 token 是否过期
    if (binding.user_token_expires_at) {
      const expiresAt = new Date(binding.user_token_expires_at);
      if (expiresAt < new Date()) {
        return {
          isAuthorized: false,
          needsReauth: true,
          customerId: binding.customer_id,
          mccName: mcc.mcc_customer_id,
        };
      }
    }

    return {
      isAuthorized: true,
      needsReauth: false,
      customerId: binding.customer_id,
      mccName: mcc.mcc_customer_id,
    };
  }

  // ==================== API 客户端配置 ====================

  /**
   * 获取用户的 Google Ads API 客户端配置
   */
  getUserAdsApiClientConfig(userId: number): {
    credentials: {
      client_id: string;
      client_secret: string;
      refresh_token: string;
    };
    developerToken: string;
    loginCustomerId: string;
    customerId: string;
  } {
    const authStatus = this.checkUserAuthorization(userId);
    
    if (!authStatus.isAuthorized) {
      throw new Error(
        authStatus.needsReauth
          ? '需要重新授权 Google Ads API'
          : '未授权 Google Ads API，请先完成授权'
      );
    }

    const binding = this.getUserMCCBinding(userId)!;
    const mcc = this.getMCCAccount(binding.mcc_account_id)!;

    return {
      credentials: {
        client_id: mcc.oauth_client_id,
        client_secret: mcc.oauth_client_secret,
        refresh_token: binding.user_refresh_token!,
      },
      developerToken: mcc.developer_token,
      loginCustomerId: mcc.mcc_customer_id,
      customerId: binding.customer_id,
    };
  }

  /**
   * 刷新用户 Access Token
   */
  async refreshUserAccessToken(userId: number): Promise<void> {
    const binding = this.getUserMCCBinding(userId);
    
    if (!binding || !binding.user_refresh_token) {
      throw new Error('用户未授权');
    }

    const mcc = this.getMCCAccount(binding.mcc_account_id);
    if (!mcc) {
      throw new Error('MCC 账号不存在');
    }

    const oauth2Client = new google.auth.OAuth2(
      mcc.oauth_client_id,
      mcc.oauth_client_secret
    );

    oauth2Client.setCredentials({
      refresh_token: binding.user_refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    this.db.prepare(`
      UPDATE user_mcc_bindings SET
        user_access_token = ?,
        user_token_expires_at = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      credentials.access_token || null,
      credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
      userId
    );
  }

  // ==================== 配置变更处理 ====================

  /**
   * 更新 MCC 配置（敏感字段变更会触发重新授权）
   */
  updateMCCConfig(
    mccId: number,
    updates: Partial<Pick<MCCAccount, 'oauth_client_id' | 'oauth_client_secret' | 'developer_token'>>
  ): void {
    const sensitiveFields = ['oauth_client_id', 'oauth_client_secret', 'developer_token'];
    const hasSensitiveUpdate = sensitiveFields.some(field => field in updates);

    const updateFields: string[] = [];
    const values: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      updateFields.push(`${key} = ?`);
      values.push(value);
    });

    if (hasSensitiveUpdate) {
      updateFields.push('is_authorized = 0');
      updateFields.push('mcc_refresh_token = NULL');
      updateFields.push('mcc_access_token = NULL');
      updateFields.push('mcc_token_expires_at = NULL');
    }

    updateFields.push("updated_at = datetime('now')");
    values.push(mccId);

    this.db.prepare(`
      UPDATE mcc_accounts SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...values);

    // 如果敏感字段被修改，标记所有关联用户需要重新授权
    if (hasSensitiveUpdate) {
      this.db.prepare(`
        UPDATE user_mcc_bindings SET
          is_authorized = 0,
          needs_reauth = 1,
          user_refresh_token = NULL,
          user_access_token = NULL,
          updated_at = datetime('now')
        WHERE mcc_account_id = ?
      `).run(mccId);
    }
  }

  // ==================== 工具方法 ====================

  private generateStateToken(
    id: number,
    type: 'mcc' | 'user',
    customerId?: string
  ): string {
    const payload: StateTokenPayload = {
      id,
      type,
      customerId,
      timestamp: Date.now(),
    };
    const data = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', this.stateSecret)
      .update(data)
      .digest('hex');
    return Buffer.from(`${data}:${signature}`).toString('base64');
  }

  private verifyStateToken(
    state: string,
    expectedType: 'mcc' | 'user'
  ): StateTokenPayload {
    try {
      const decoded = Buffer.from(state, 'base64').toString('utf-8');
      const [data, signature] = decoded.split(':');
      
      const expectedSignature = crypto
        .createHmac('sha256', this.stateSecret)
        .update(data)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new Error('Invalid signature');
      }

      const payload = JSON.parse(data) as StateTokenPayload;
      
      if (payload.type !== expectedType) {
        throw new Error('Invalid token type');
      }

      // 检查时间戳（5 分钟有效期）
      if (Date.now() - payload.timestamp > 5 * 60 * 1000) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      console.error('State token verification failed:', error);
      throw new Error('State token 验证失败，请重新发起授权');
    }
  }
}
