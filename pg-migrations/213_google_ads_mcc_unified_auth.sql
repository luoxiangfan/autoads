-- ==========================================
-- Google Ads MCC 统一授权 (PostgreSQL)
-- ==========================================
-- 管理员统一配置 MCC 账号，用户只需 OAuth 授权即可使用
-- Created: 2026-03-23
-- Migration ID: 213

BEGIN;

-- 1. 创建 MCC 账号配置表
CREATE TABLE IF NOT EXISTS mcc_accounts (
  id SERIAL PRIMARY KEY,
  mcc_customer_id TEXT NOT NULL UNIQUE,  -- 10 位数字 MCC ID
  
  -- OAuth 配置（管理员填写）
  oauth_client_id TEXT NOT NULL,
  oauth_client_secret TEXT NOT NULL,
  developer_token TEXT NOT NULL,
  
  -- MCC 层级的 OAuth Token（管理员授权）
  mcc_refresh_token TEXT,
  mcc_access_token TEXT,
  mcc_token_expires_at TIMESTAMP,
  
  -- 状态
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_authorized BOOLEAN NOT NULL DEFAULT FALSE,  -- MCC 是否已完成 OAuth 授权
  
  -- 元数据
  configured_by INTEGER REFERENCES users(id),
  last_authorized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 创建用户与 MCC 的关联表
CREATE TABLE IF NOT EXISTS user_mcc_bindings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,  -- 平台用户 ID
  mcc_account_id INTEGER NOT NULL,  -- 关联的 MCC 账号
  customer_id TEXT NOT NULL,        -- 用户具体的广告账户 ID
  
  -- 用户层级的 OAuth Token（用户授权）
  user_refresh_token TEXT,
  user_access_token TEXT,
  user_token_expires_at TIMESTAMP,
  
  -- 状态
  is_authorized BOOLEAN NOT NULL DEFAULT FALSE,  -- 用户是否已完成 OAuth 授权
  needs_reauth BOOLEAN NOT NULL DEFAULT FALSE,   -- 是否需要重新授权
  
  -- 元数据
  bound_by INTEGER REFERENCES users(id),  -- 管理员绑定
  bound_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_authorized_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mcc_account_id) REFERENCES mcc_accounts(id) ON DELETE CASCADE,
  UNIQUE(user_id, customer_id)
);

-- 3. 修改 google_ads_accounts 表，添加 mcc_account_id 关联
-- 注意：如果列已存在则跳过
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'google_ads_accounts' AND column_name = 'mcc_account_id'
  ) THEN
    ALTER TABLE google_ads_accounts ADD COLUMN mcc_account_id INTEGER;
  END IF;
END $$;

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_mcc_bindings_user_id ON user_mcc_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mcc_bindings_mcc_id ON user_mcc_bindings(mcc_account_id);
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_mcc_id ON mcc_accounts(mcc_customer_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_accounts_mcc_id ON google_ads_accounts(mcc_account_id);

-- 5. 记录迁移历史
INSERT INTO migration_history (migration_id, applied_at) 
VALUES (213, CURRENT_TIMESTAMP)
ON CONFLICT (migration_id) DO NOTHING;

COMMIT;
