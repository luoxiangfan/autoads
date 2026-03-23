-- ==========================================
-- Google Ads MCC 统一授权
-- ==========================================
-- 管理员统一配置 MCC 账号，用户只需 OAuth 授权即可使用
-- Created: 2026-03-23
-- Migration ID: 213

BEGIN TRANSACTION;

-- 1. 创建 MCC 账号配置表
CREATE TABLE IF NOT EXISTS mcc_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mcc_customer_id TEXT NOT NULL UNIQUE,  -- 10 位数字 MCC ID
  
  -- OAuth 配置（管理员填写）
  oauth_client_id TEXT NOT NULL,
  oauth_client_secret TEXT NOT NULL,
  developer_token TEXT NOT NULL,
  
  -- MCC 层级的 OAuth Token（管理员授权）
  mcc_refresh_token TEXT,
  mcc_access_token TEXT,
  mcc_token_expires_at TEXT,
  
  -- 状态
  is_active INTEGER NOT NULL DEFAULT 1,
  is_authorized INTEGER NOT NULL DEFAULT 0,  -- MCC 是否已完成 OAuth 授权
  
  -- 元数据
  configured_by INTEGER REFERENCES users(id),
  last_authorized_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 创建用户与 MCC 的关联表
CREATE TABLE IF NOT EXISTS user_mcc_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,  -- 平台用户 ID
  mcc_account_id INTEGER NOT NULL,  -- 关联的 MCC 账号
  customer_id TEXT NOT NULL,        -- 用户具体的广告账户 ID
  
  -- 用户层级的 OAuth Token（用户授权）
  user_refresh_token TEXT,
  user_access_token TEXT,
  user_token_expires_at TEXT,
  
  -- 状态
  is_authorized INTEGER NOT NULL DEFAULT 0,  -- 用户是否已完成 OAuth 授权
  needs_reauth INTEGER NOT NULL DEFAULT 0,   -- 是否需要重新授权
  
  -- 元数据
  bound_by INTEGER REFERENCES users(id),  -- 管理员绑定
  bound_at TEXT DEFAULT (datetime('now')),
  last_authorized_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mcc_account_id) REFERENCES mcc_accounts(id) ON DELETE CASCADE,
  UNIQUE(user_id, customer_id)
);

-- 3. 修改 google_ads_accounts 表，添加 mcc_account_id 关联
-- 注意：SQLite 不支持直接添加带外键的列，需要重建表
-- 这里我们先添加列（不带外键约束），应用层保证完整性
ALTER TABLE google_ads_accounts ADD COLUMN mcc_account_id INTEGER;

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_mcc_bindings_user_id ON user_mcc_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_mcc_bindings_mcc_id ON user_mcc_bindings(mcc_account_id);
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_mcc_id ON mcc_accounts(mcc_customer_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_accounts_mcc_id ON google_ads_accounts(mcc_account_id);

-- 5. 记录迁移历史
INSERT OR IGNORE INTO migration_history (migration_id, applied_at) 
VALUES (213, datetime('now'));

COMMIT;
