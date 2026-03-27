-- 支持一个用户绑定多个 MCC 账号 (PostgreSQL)
-- 2026-03-27

-- 1. 删除旧的 user_mcc_bindings 表（备份数据）
CREATE TABLE IF NOT EXISTS user_mcc_bindings_backup AS SELECT * FROM user_mcc_bindings;

-- 2. 删除旧表
DROP TABLE IF EXISTS user_mcc_bindings;

-- 3. 创建新表（支持一个用户绑定多个 MCC）
CREATE TABLE user_mcc_bindings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,           -- 平台用户 ID（移除 UNIQUE，支持多 MCC）
  mcc_account_id INTEGER NOT NULL,    -- 关联的 MCC 账号
  customer_id TEXT NOT NULL,          -- 用户具体的广告账户 ID
  
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
  UNIQUE(user_id, mcc_account_id, customer_id)  -- 唯一约束：用户 + MCC + Customer ID
);

-- 4. 创建索引
CREATE INDEX idx_user_mcc_bindings_user_id ON user_mcc_bindings(user_id);
CREATE INDEX idx_user_mcc_bindings_mcc_id ON user_mcc_bindings(mcc_account_id);
CREATE INDEX idx_user_mcc_bindings_user_mcc ON user_mcc_bindings(user_id, mcc_account_id);

-- 5. 恢复备份数据（如果存在）
INSERT INTO user_mcc_bindings (
  id, user_id, mcc_account_id, customer_id,
  user_refresh_token, user_access_token, user_token_expires_at,
  is_authorized, needs_reauth, bound_by, bound_at, last_authorized_at,
  created_at, updated_at
)
SELECT 
  id, user_id, mcc_account_id, customer_id,
  user_refresh_token, user_access_token, user_token_expires_at,
  is_authorized, needs_reauth, bound_by, bound_at, last_authorized_at,
  created_at, updated_at
FROM user_mcc_bindings_backup;

-- 6. 删除备份表
DROP TABLE IF EXISTS user_mcc_bindings_backup;

-- 7. 更新迁移历史
INSERT INTO migration_history (name, applied_at) 
VALUES ('214_user_multi_mcc_binding', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO NOTHING;
