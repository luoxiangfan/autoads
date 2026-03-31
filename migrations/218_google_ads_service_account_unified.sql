-- ==========================================
-- Google Ads 服务账号统一配置
-- ==========================================
-- 管理员统一配置服务账号，用户选择使用
-- Created: 2026-03-31
-- Migration ID: 218

BEGIN TRANSACTION;

-- 1. 扩展 mcc_accounts 表，添加服务账号字段
ALTER TABLE mcc_accounts ADD COLUMN auth_type TEXT DEFAULT 'oauth';  -- 'oauth' 或 'service_account'

-- 服务账号相关字段（当 auth_type='service_account' 时使用）
ALTER TABLE mcc_accounts ADD COLUMN service_account_email TEXT;
ALTER TABLE mcc_accounts ADD COLUMN service_account_key TEXT;  -- 加密存储
ALTER TABLE mcc_accounts ADD COLUMN service_account_id TEXT;  -- 服务账号唯一标识

-- 2. 创建服务账号配置历史表（审计用）
CREATE TABLE IF NOT EXISTS service_account_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mcc_account_id INTEGER NOT NULL,
  
  -- 服务账号信息
  service_account_email TEXT NOT NULL,
  service_account_id TEXT NOT NULL,
  service_account_key_hash TEXT,  -- 密钥哈希（用于验证，不存储明文）
  
  -- 元数据
  configured_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  
  FOREIGN KEY (mcc_account_id) REFERENCES mcc_accounts(id) ON DELETE CASCADE
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_auth_type ON mcc_accounts(auth_type);
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_service_account ON mcc_accounts(service_account_email);
CREATE INDEX IF NOT EXISTS idx_service_account_configs_mcc_id ON service_account_configs(mcc_account_id);

-- 4. 迁移现有服务账号数据（如果存在 google_ads_service_accounts 表）
-- 注意：这一步是可选的，仅在升级时执行
-- INSERT INTO mcc_accounts (service_account_email, service_account_id, auth_type)
-- SELECT service_account_email, service_account_id, 'service_account'
-- FROM google_ads_service_accounts
-- WHERE NOT EXISTS (SELECT 1 FROM mcc_accounts WHERE service_account_email = google_ads_service_accounts.service_account_email);

-- 5. 记录迁移历史
INSERT OR IGNORE INTO migration_history (migration_id, applied_at) 
VALUES (218, datetime('now'));

COMMIT;

-- 说明：
-- auth_type 字段：
--   - 'oauth': OAuth 用户授权模式（原有模式）
--   - 'service_account': 服务账号认证模式（新模式）
--
-- 服务账号存储：
--   - service_account_email: 服务账号邮箱
--   - service_account_id: 服务账号唯一标识
--   - service_account_key: 加密的私钥（使用应用层加密）
--   - service_account_key_hash: 密钥哈希（用于验证密钥是否变更）
