-- MCC 细粒度权限控制
-- 2026-03-27

-- 1. 创建权限定义表
CREATE TABLE IF NOT EXISTS mcc_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_code TEXT NOT NULL UNIQUE,  -- 权限代码，如 mcc:read, mcc:write
  permission_name TEXT NOT NULL,  -- 权限名称
  resource_type TEXT NOT NULL,  -- 资源类型：mcc_account, user_binding, tenant
  action_type TEXT NOT NULL,  -- 操作类型：read, write, delete, admin
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 2. 创建角色 - 权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,  -- 角色：owner, admin, member, custom
  permission_id INTEGER NOT NULL,
  tenant_id TEXT,  -- 租户级别权限（NULL 表示全局权限）
  
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (permission_id) REFERENCES mcc_permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id, tenant_id)
);

-- 3. 创建用户 - 角色关联表（扩展 user_tenant_memberships）
ALTER TABLE user_tenant_memberships ADD COLUMN custom_permissions TEXT;  -- JSON 格式的特殊权限

-- 4. 创建用户 - 权限直接关联表（用于特殊授权）
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  tenant_id TEXT,  -- 租户级别权限
  mcc_account_id INTEGER,  -- MCC 级别权限
  granted_by INTEGER REFERENCES users(id),
  expires_at TEXT,  -- 权限过期时间（NULL 表示永久）
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES mcc_permissions(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, permission_id, tenant_id, mcc_account_id)
);

-- 5. 创建索引
CREATE INDEX IF NOT EXISTS idx_mcc_permissions_code ON mcc_permissions(permission_code);
CREATE INDEX IF NOT EXISTS idx_mcc_permissions_resource ON mcc_permissions(resource_type, action_type);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON role_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant ON user_permissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_mcc ON user_permissions(mcc_account_id);

-- 6. 插入默认权限定义
INSERT INTO mcc_permissions (permission_code, permission_name, resource_type, action_type, description) VALUES
  -- MCC 账号权限
  ('mcc:read', '查看 MCC', 'mcc_account', 'read', '查看 MCC 账号基本信息'),
  ('mcc:write', '编辑 MCC', 'mcc_account', 'write', '编辑 MCC 账号配置'),
  ('mcc:delete', '删除 MCC', 'mcc_account', 'delete', '删除 MCC 账号'),
  ('mcc:authorize', '授权 MCC', 'mcc_account', 'write', '执行 MCC OAuth 授权'),
  ('mcc:token_refresh', '刷新 Token', 'mcc_account', 'write', '刷新 MCC Token'),
  
  -- 用户绑定权限
  ('binding:read', '查看绑定', 'user_binding', 'read', '查看用户绑定信息'),
  ('binding:create', '创建绑定', 'user_binding', 'write', '创建用户绑定'),
  ('binding:update', '更新绑定', 'user_binding', 'write', '更新用户绑定'),
  ('binding:delete', '删除绑定', 'user_binding', 'delete', '删除用户绑定'),
  
  -- 租户权限
  ('tenant:read', '查看租户', 'tenant', 'read', '查看租户信息'),
  ('tenant:write', '编辑租户', 'tenant', 'write', '编辑租户配置'),
  ('tenant:manage_members', '管理成员', 'tenant', 'admin', '管理租户成员'),
  ('tenant:delete', '删除租户', 'tenant', 'delete', '删除租户'),
  
  -- 批量操作权限
  ('bulk:import', '批量导入', 'user_binding', 'write', '批量导入用户'),
  ('bulk:export', '批量导出', 'user_binding', 'read', '批量导出用户'),
  
  -- 审计日志权限
  ('audit:read', '查看审计日志', 'audit_log', 'read', '查看审计日志'),
  ('audit:export', '导出审计日志', 'audit_log', 'read', '导出审计日志'),
  ('audit:cleanup', '清理审计日志', 'audit_log', 'admin', '清理审计日志'),
  
  -- 监控权限
  ('monitoring:read', '查看监控', 'monitoring', 'read', '查看监控面板'),
  ('monitoring:refresh', '刷新 Token', 'monitoring', 'write', '手动刷新 Token');

-- 7. 插入默认角色 - 权限关联
-- owner 角色（所有权限）
INSERT INTO role_permissions (role, permission_id)
SELECT 'owner', id FROM mcc_permissions;

-- admin 角色（除删除租户外的所有权限）
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM mcc_permissions WHERE permission_code != 'tenant:delete';

-- member 角色（只读 + 自己的绑定）
INSERT INTO role_permissions (role, permission_id)
SELECT 'member', id FROM mcc_permissions 
WHERE action_type = 'read' OR resource_type = 'user_binding';

-- 8. 更新迁移历史
INSERT OR IGNORE INTO migration_history (name, applied_at) 
VALUES ('217_mcc_fine_grained_permissions', datetime('now'));

-- 说明：
-- 权限代码格式：resource:action
-- 资源类型：mcc_account, user_binding, tenant, audit_log, monitoring
-- 操作类型：read, write, delete, admin
-- 
-- 角色层级：
-- - owner: 租户所有者，拥有所有权限
-- - admin: 租户管理员，拥有大部分权限（除删除租户）
-- - member: 普通成员，只读权限 + 自己的绑定管理
-- - custom: 自定义角色，通过 user_permissions 表单独授权
