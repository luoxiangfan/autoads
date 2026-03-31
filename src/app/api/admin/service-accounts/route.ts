/**
 * 管理员服务账号管理 API
 * GET: 获取所有服务账号配置列表
 * POST: 创建/更新服务账号配置
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/structured-logger';
import crypto from 'crypto';

const db = getDb();

/**
 * 生成请求 ID 用于追踪
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 加密服务账号密钥
 */
function encryptServiceAccountKey(key: string): string {
  const encryptionKey = process.env.SERVICE_ACCOUNT_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'fallback-key-change-in-production';
  const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * 生成密钥哈希（用于验证）
 */
function hashServiceAccountKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('service_accounts_get_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const nowFunc = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
    const serviceAccounts = db.query(`
      SELECT 
        ma.id,
        ma.mcc_customer_id,
        ma.service_account_email,
        ma.service_account_id,
        ma.auth_type,
        ma.is_active,
        ma.configured_by,
        u.username as configured_by_username,
        ma.created_at,
        ma.updated_at,
        (SELECT COUNT(*) FROM service_account_configs sac WHERE sac.mcc_account_id = ma.id AND sac.is_active = 1) as config_count
      FROM mcc_accounts ma
      LEFT JOIN users u ON ma.configured_by = u.id
      WHERE ma.auth_type = 'service_account'
      ORDER BY ma.created_at DESC
    `) as Array<{
      id: number;
      mcc_customer_id: string;
      service_account_email: string;
      service_account_id: string;
      auth_type: string;
      is_active: number;
      configured_by: number | null;
      configured_by_username: string | null;
      created_at: string;
      updated_at: string;
      config_count: number;
    }>;

    logger.info('service_accounts_get_success', { 
      requestId,
      userId: user.id,
      count: serviceAccounts.length,
      durationMs: Date.now() - startTime 
    });

    return NextResponse.json({ 
      serviceAccounts: serviceAccounts.map(sa => ({
        id: sa.id,
        mccCustomerId: sa.mcc_customer_id,
        serviceAccountEmail: sa.service_account_email,
        serviceAccountId: sa.service_account_id,
        authType: sa.auth_type,
        isActive: sa.is_active === 1,
        configuredBy: sa.configured_by,
        configuredByUsername: sa.configured_by_username,
        configCount: sa.config_count,
        createdAt: sa.created_at,
        updatedAt: sa.updated_at,
      })),
      count: serviceAccounts.length,
      requestId
    });
  } catch (error: any) {
    logger.error('service_accounts_get_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '获取服务账号列表失败',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') {
      logger.warn('service_accounts_post_unauthorized', { 
        requestId, 
        userId: user?.id,
        role: user?.role,
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      mccCustomerId,
      serviceAccountName,  // 配置名称（可选）
      serviceAccountEmail,
      serviceAccountId,
      serviceAccountKey,  // JSON 格式的密钥
    } = body;

    // 验证必填字段
    if (!mccCustomerId || !serviceAccountEmail || !serviceAccountId || !serviceAccountKey) {
      logger.warn('service_accounts_post_missing_fields', { 
        requestId, 
        userId: user.id,
        missingFields: { mccCustomerId, serviceAccountEmail, serviceAccountId, serviceAccountKey },
      });
      return NextResponse.json(
        { error: '缺少必填字段', requestId },
        { status: 400 }
      );
    }

    // 验证 MCC Customer ID 格式（10 位数字）
    if (!/^\d{10}$/.test(mccCustomerId.trim())) {
      logger.warn('service_accounts_post_invalid_mcc_format', { 
        requestId, 
        userId: user.id,
        mccCustomerId,
      });
      return NextResponse.json(
        { 
          error: 'MCC Customer ID 格式不正确',
          details: '必须是 10 位数字（不含连字符）',
          requestId
        },
        { status: 400 }
      );
    }

    // 验证服务账号邮箱格式
    if (!serviceAccountEmail.endsWith('@iam.gserviceaccount.com')) {
      logger.warn('service_accounts_post_invalid_email_format', { 
        requestId, 
        userId: user.id,
        serviceAccountEmail,
      });
      return NextResponse.json(
        { 
          error: '服务账号邮箱格式不正确',
          details: '应该是 xxx@xxx.iam.gserviceaccount.com 格式',
          requestId
        },
        { status: 400 }
      );
    }

    const nowFunc = db.type === 'postgres' ? 'NOW()' : "datetime('now')";
    const conflictColumn = db.type === 'postgres' ? 'mcc_customer_id, service_account_email' : 'mcc_customer_id';
    
    // 检查是否已存在
    const existing = db.queryOne(`
      SELECT id FROM mcc_accounts 
      WHERE mcc_customer_id = ? AND service_account_email = ?
    `, [mccCustomerId.trim(), serviceAccountEmail.trim()]) as { id: number } | undefined;

    let mccAccountId: number;

    if (existing) {
      // 更新现有配置
      const encryptedKey = encryptServiceAccountKey(serviceAccountKey);
      const keyHash = hashServiceAccountKey(serviceAccountKey);
      
      db.exec(`
        UPDATE mcc_accounts SET
          service_account_id = ?,
          service_account_key = ?,
          auth_type = 'service_account',
          is_active = 1,
          configured_by = ?,
          updated_at = ${nowFunc}
        WHERE id = ?
      `, [serviceAccountId.trim(), encryptedKey, user.id, existing.id]);
      
      mccAccountId = existing.id;

      // 记录配置历史
      db.exec(`
        INSERT INTO service_account_configs (
          mcc_account_id, service_account_email, service_account_id,
          service_account_key_hash, configured_by, is_active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ${nowFunc}, ${nowFunc})
      `, [mccAccountId, serviceAccountEmail.trim(), serviceAccountId.trim(), keyHash, user.id]);

      logger.info('service_accounts_post_updated', { 
        requestId,
        userId: user.id,
        mccAccountId,
        serviceAccountEmail,
      });
    } else {
      // 创建新配置
      const encryptedKey = encryptServiceAccountKey(serviceAccountKey);
      const keyHash = hashServiceAccountKey(serviceAccountKey);
      
      const result = db.exec(`
        INSERT INTO mcc_accounts (
          mcc_customer_id, service_account_email, service_account_id,
          service_account_key, auth_type, is_active, configured_by,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'service_account', 1, ?, ${nowFunc}, ${nowFunc})
      `, [mccCustomerId.trim(), serviceAccountEmail.trim(), serviceAccountId.trim(), encryptedKey, user.id]);
      
      mccAccountId = result.lastInsertRowid as number;

      // 记录配置历史
      db.exec(`
        INSERT INTO service_account_configs (
          mcc_account_id, service_account_email, service_account_id,
          service_account_key_hash, configured_by, is_active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ${nowFunc}, ${nowFunc})
      `, [mccAccountId, serviceAccountEmail.trim(), serviceAccountId.trim(), keyHash, user.id]);

      logger.info('service_accounts_post_created', { 
        requestId,
        userId: user.id,
        mccAccountId,
        serviceAccountEmail,
      });
    }

    return NextResponse.json({ 
      success: true, 
      mccAccountId,
      message: '服务账号配置成功',
      requestId
    });
  } catch (error: any) {
    logger.error('service_accounts_post_error', { 
      requestId,
      error: error.message || String(error),
      stack: error.stack,
      durationMs: Date.now() - startTime 
    });
    
    return NextResponse.json(
      { 
        error: '保存服务账号配置失败',
        details: error.message || (process.env.NODE_ENV === 'development' ? String(error) : undefined),
        requestId
      },
      { status: 500 }
    );
  }
}
