-- MCC 多租户隔离支持
-- 2026-03-27

-- 1. 添加租户隔离相关字段到 mcc_accounts 表
ALTER TABLE mcc_accounts ADD COLUMN tenant_id TEXT;
ALTER TABLE mcc_accounts ADD COLUMN is_tenant_isolated INTEGER DEFAULT 0;

-- 2. 添加租户 ID 索引
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_tenant_id ON mcc_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcc_accounts_is_tenant_isolated ON mcc_accounts(is_tenant_isolated);

-- 3. 添加用户 - 租户关联表（支持一个用户属于多个租户）
CREATE TABLE IF NOT EXISTS user_tenant_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',  -- owner, admin, member
  mcc_account_id INTEGER,  -- 关联的 MCC（可选，租户可以关联到特定 MCC）
  
  -- 元数据
  invited_by INTEGER REFERENCES users(id),
  joined_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, tenant_id),
  UNIQUE(tenant_id, mcc_account_id)  -- 一个 MCC 只能属于一个租户
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_tenant_user_id ON user_tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_tenant_id ON user_tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenant_mcc_id ON user_tenant_memberships(mcc_account_id);

-- 5. 更新迁移历史
INSERT OR IGNORE INTO migration_history (name, applied_at) 
VALUES ('215_mcc_tenant_isolation', datetime('now'));

-- 说明：
-- - tenant_id: 租户标识符（可以是公司 ID、团队 ID 等）
-- - is_tenant_isolated: 是否启用租户隔离（1=启用，0=不启用）
-- - user_tenant_memberships: 用户与租户的关联关系
--   - owner: 租户所有者，可以管理租户下所有资源
--   - admin: 租户管理员，可以管理 MCC 和用户
--   - member: 普通成员，只能使用已授权的 MCC
