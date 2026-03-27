-- MCC 审计日志支持
-- 2026-03-27

-- 1. 创建审计日志表
CREATE TABLE IF NOT EXISTS mcc_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- 操作信息
  action_type TEXT NOT NULL,  -- CREATE, UPDATE, DELETE, AUTHORIZE, BIND, UNBIND, etc.
  resource_type TEXT NOT NULL DEFAULT 'mcc_account',  -- mcc_account, user_binding, tenant
  resource_id INTEGER,  -- 关联的资源 ID
  tenant_id TEXT,  -- 租户 ID（如果适用）
  
  -- 用户信息
  user_id INTEGER NOT NULL,
  user_role TEXT,
  user_email TEXT,
  
  -- 操作详情
  action_details TEXT,  -- JSON 格式的操作详情
  old_values TEXT,  -- JSON 格式的旧值（更新/删除时）
  new_values TEXT,  -- JSON 格式的新值（创建/更新时）
  
  -- 请求信息
  request_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- 结果
  status TEXT NOT NULL DEFAULT 'success',  -- success, failure, warning
  error_message TEXT,
  
  -- 时间戳
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_user_id ON mcc_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_resource ON mcc_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_tenant ON mcc_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_action_type ON mcc_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_status ON mcc_audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_created_at ON mcc_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_mcc_audit_logs_request_id ON mcc_audit_logs(request_id);

-- 3. 更新迁移历史
INSERT OR IGNORE INTO migration_history (name, applied_at) 
VALUES ('216_mcc_audit_log', datetime('now'));

-- 说明：
-- action_type: 
--   - MCC_CREATE, MCC_UPDATE, MCC_DELETE
--   - MCC_AUTHORIZE, MCC_TOKEN_REFRESH
--   - USER_BIND, USER_UNBIND, USER_BINDING_UPDATE
--   - TENANT_CREATE, TENANT_MEMBER_ADD, TENANT_MEMBER_REMOVE
--   - BULK_IMPORT, BULK_EXPORT
--
-- status:
--   - success: 操作成功
--   - failure: 操作失败
--   - warning: 操作成功但有警告
