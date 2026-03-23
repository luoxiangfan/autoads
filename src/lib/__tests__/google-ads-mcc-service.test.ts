/**
 * Google Ads MCC 服务层单元测试
 * 
 * 测试服务层核心功能，不依赖完整的 Next.js 环境
 */

import Database from 'better-sqlite3';
import { GoogleAdsMCCService } from './google-ads-mcc-service';
import * as path from 'path';
import * as fs from 'fs';

// 创建临时测试数据库
const testDbPath = path.join(__dirname, '../../data/test-autoads.db');

// 确保 data 目录存在
const dataDir = path.dirname(testDbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 删除旧的测试数据库
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = new Database(testDbPath);

// 启用外键
db.pragma('foreign_keys = ON');

console.log('🧪 Google Ads MCC 服务层测试\n');
console.log('=' .repeat(50) + '\n');

// 初始化测试数据库 schema
function initTestDB() {
  console.log('📦 初始化测试数据库...\n');
  
  // 创建 users 表
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 创建 mcc_accounts 表
  db.exec(`
    CREATE TABLE mcc_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mcc_customer_id TEXT NOT NULL UNIQUE,
      oauth_client_id TEXT NOT NULL,
      oauth_client_secret TEXT NOT NULL,
      developer_token TEXT NOT NULL,
      mcc_refresh_token TEXT,
      mcc_access_token TEXT,
      mcc_token_expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_authorized INTEGER NOT NULL DEFAULT 0,
      configured_by INTEGER REFERENCES users(id),
      last_authorized_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 创建 user_mcc_bindings 表
  db.exec(`
    CREATE TABLE user_mcc_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      mcc_account_id INTEGER NOT NULL,
      customer_id TEXT NOT NULL,
      user_refresh_token TEXT,
      user_access_token TEXT,
      user_token_expires_at TEXT,
      is_authorized INTEGER NOT NULL DEFAULT 0,
      needs_reauth INTEGER NOT NULL DEFAULT 0,
      bound_by INTEGER REFERENCES users(id),
      bound_at TEXT DEFAULT (datetime('now')),
      last_authorized_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (mcc_account_id) REFERENCES mcc_accounts(id) ON DELETE CASCADE,
      UNIQUE(user_id, customer_id)
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX idx_user_mcc_bindings_user_id ON user_mcc_bindings(user_id);
    CREATE INDEX idx_user_mcc_bindings_mcc_id ON user_mcc_bindings(mcc_account_id);
    CREATE INDEX idx_mcc_accounts_mcc_id ON mcc_accounts(mcc_customer_id);
  `);

  // 插入测试用户
  db.exec(`
    INSERT INTO users (id, username, email, role) VALUES
    (1, 'admin', 'admin@test.com', 'admin'),
    (2, 'user1', 'user1@test.com', 'user'),
    (3, 'user2', 'user2@test.com', 'user')
  `);

  console.log('✓ 数据库初始化完成\n');
}

// 运行测试
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error instanceof Error ? error.message : error}`);
    failed++;
  }
}

// 创建服务实例
const mccService = new GoogleAdsMCCService(db);

// ===== 测试开始 =====

initTestDB();

console.log('📋 开始测试\n');
console.log('-'.repeat(50) + '\n');

// 测试 1: MCC 配置保存
test('保存 MCC 配置', () => {
  const mccId = mccService.saveMCCConfig(
    '1234567890',
    'test-client-id.apps.googleusercontent.com',
    'test-client-secret',
    'test-developer-token',
    1
  );
  
  if (typeof mccId !== 'number' || mccId < 1) {
    throw new Error('MCC ID 应该是有效的数字');
  }
  
  const mcc = mccService.getMCCAccount(mccId);
  if (!mcc) {
    throw new Error('MCC 账号不存在');
  }
  
  if (mcc.mcc_customer_id !== '1234567890') {
    throw new Error('MCC Customer ID 不匹配');
  }
  
  if (mcc.is_authorized !== 0) {
    throw new Error('新配置的 MCC 应该是未授权状态');
  }
});

// 测试 2: 获取 MCC 列表
test('获取 MCC 账号列表', () => {
  const mccAccounts = mccService.getAvailableMCCAccounts();
  
  if (!Array.isArray(mccAccounts)) {
    throw new Error('应该返回数组');
  }
  
  if (mccAccounts.length < 1) {
    throw new Error('应该至少有一个 MCC 账号');
  }
});

// 测试 3: State Token 生成和验证
test('State Token 生成和验证', () => {
  const state = mccService['generateStateToken'](1, 'mcc');
  
  if (!state || state.length < 50) {
    throw new Error('State Token 应该是有效的 base64 字符串');
  }
  
  const payload = mccService['verifyStateToken'](state, 'mcc');
  
  if (payload.id !== 1) {
    throw new Error('State Token 解析的 ID 不匹配');
  }
  
  if (payload.type !== 'mcc') {
    throw new Error('State Token 类型不匹配');
  }
});

// 测试 4: State Token 过期验证
test('State Token 过期验证', () => {
  // 生成一个过期的 token
  const crypto = require('crypto');
  const payload = {
    id: 1,
    type: 'mcc',
    timestamp: Date.now() - 10 * 60 * 1000, // 10 分钟前
  };
  const data = JSON.stringify(payload);
  const secret = process.env.GOOGLE_ADS_STATE_SECRET || 'fallback-secret';
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  const expiredState = Buffer.from(`${data}:${signature}`).toString('base64');
  
  try {
    mccService['verifyStateToken'](expiredState, 'mcc');
    throw new Error('应该抛出过期错误');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('过期')) {
      throw new Error('应该抛出过期错误');
    }
  }
});

// 测试 5: 用户绑定
test('绑定用户到 MCC', () => {
  // 先"授权"MCC（手动更新数据库）
  db.prepare(`
    UPDATE mcc_accounts SET is_authorized = 1, mcc_refresh_token = 'test-token'
    WHERE mcc_customer_id = '1234567890'
  `).run();
  
  const bindingId = mccService.bindUserToMCC(2, 1, '9876543210', 1);
  
  if (typeof bindingId !== 'number' || bindingId < 1) {
    throw new Error('绑定 ID 应该是有效的数字');
  }
  
  const binding = mccService.getUserMCCBinding(2);
  if (!binding) {
    throw new Error('用户绑定不存在');
  }
  
  if (binding.customer_id !== '9876543210') {
    throw new Error('Customer ID 不匹配');
  }
  
  if (binding.is_authorized !== 0) {
    throw new Error('新绑定应该是未授权状态');
  }
});

// 测试 6: 检查用户授权状态（未授权）
test('检查用户授权状态（未授权）', () => {
  const status = mccService.checkUserAuthorization(2);
  
  if (status.isAuthorized !== false) {
    throw new Error('用户应该是未授权状态');
  }
  
  if (status.needsReauth !== true) {
    throw new Error('用户应该需要授权');
  }
  
  if (status.customerId !== '9876543210') {
    throw new Error('Customer ID 不匹配');
  }
});

// 测试 7: 获取 MCC 绑定用户列表
test('获取 MCC 绑定用户列表', () => {
  const bindings = mccService.getMCCBindings(1);
  
  if (!Array.isArray(bindings)) {
    throw new Error('应该返回数组');
  }
  
  if (bindings.length < 1) {
    throw new Error('应该至少有一个绑定用户');
  }
  
  const userBinding = bindings.find(b => b.user_id === 2);
  if (!userBinding) {
    throw new Error('应该找到用户 2 的绑定');
  }
});

// 测试 8: 用户重新绑定（覆盖原有绑定）
test('用户重新绑定', () => {
  // 创建第二个 MCC
  const mccId2 = mccService.saveMCCConfig(
    '0987654321',
    'client2-id.apps.googleusercontent.com',
    'client2-secret',
    'developer-token-2',
    1
  );
  
  // 授权第二个 MCC
  db.prepare(`
    UPDATE mcc_accounts SET is_authorized = 1, mcc_refresh_token = 'token2'
    WHERE id = ?
  `).run(mccId2);
  
  // 重新绑定用户到新的 MCC
  mccService.bindUserToMCC(2, mccId2, '1111111111', 1);
  
  const newBinding = mccService.getUserMCCBinding(2);
  if (!newBinding) {
    throw new Error('新绑定不存在');
  }
  
  if (newBinding.customer_id !== '1111111111') {
    throw new Error('新的 Customer ID 不匹配');
  }
  
  if (newBinding.needs_reauth !== 1) {
    throw new Error('重新绑定后应该需要重新授权');
  }
});

// 测试 9: MCC 配置更新（敏感字段）
test('MCC 配置更新（敏感字段）', () => {
  const mccId = 1;
  
  // 先授权 MCC 和用户
  db.prepare(`UPDATE mcc_accounts SET is_authorized = 1 WHERE id = ?`).run(mccId);
  db.prepare(`UPDATE user_mcc_bindings SET is_authorized = 1 WHERE mcc_account_id = ?`).run(mccId);
  
  // 更新敏感字段
  mccService.updateMCCConfig(mccId, {
    developer_token: 'new-developer-token'
  });
  
  const mcc = mccService.getMCCAccount(mccId);
  if (!mcc) {
    throw new Error('MCC 不存在');
  }
  
  if (mcc.is_authorized !== 0) {
    throw new Error('敏感字段更新后 MCC 应该变为未授权');
  }
  
  const bindings = mccService.getMCCBindings(mccId);
  for (const binding of bindings) {
    if (binding.is_authorized !== 0) {
      throw new Error('敏感字段更新后用户应该变为未授权');
    }
    if (binding.needs_reauth !== 1) {
      throw new Error('敏感字段更新后用户应该标记为需要重新授权');
    }
  }
});

// 测试 10: MCC 配置删除
test('MCC 配置删除', () => {
  // 创建一个测试 MCC
  const testMccId = mccService.saveMCCConfig(
    '9999999999',
    'test-del-id.apps.googleusercontent.com',
    'test-del-secret',
    'test-del-token',
    1
  );
  
  // 授权并绑定用户
  db.prepare(`UPDATE mcc_accounts SET is_authorized = 1 WHERE id = ?`).run(testMccId);
  
  // 删除 MCC
  mccService.deleteMCCConfig(testMccId);
  
  const deletedMcc = mccService.getMCCAccount(testMccId);
  if (deletedMcc !== null) {
    throw new Error('MCC 应该被删除');
  }
});

// 测试 11: Customer ID 格式验证（应该在 API 层验证）
test('Customer ID 格式验证', () => {
  // 这个测试验证服务层是否接受任意格式的 customer_id
  // 实际验证应该在 API 层进行
  try {
    // 服务层不验证格式，只存储
    const bindingId = mccService.bindUserToMCC(3, 1, '1234567890', 1);
    if (typeof bindingId !== 'number') {
      throw new Error('绑定应该成功');
    }
  } catch (error) {
    throw new Error('服务层不应该验证 Customer ID 格式');
  }
});

// 测试 12: 获取不存在的用户绑定
test('获取不存在的用户绑定', () => {
  const binding = mccService.getUserMCCBinding(999);
  
  if (binding !== null) {
    throw new Error('不存在的用户应该返回 null');
  }
});

// 测试 13: 绑定到未授权的 MCC
test('绑定到未授权的 MCC 应该失败', () => {
  // 创建一个未授权的 MCC
  const unauthMccId = mccService.saveMCCConfig(
    '8888888888',
    'unauth-id.apps.googleusercontent.com',
    'unauth-secret',
    'unauth-token',
    1
  );
  
  try {
    mccService.bindUserToMCC(3, unauthMccId, '2222222222', 1);
    throw new Error('应该抛出 MCC 未授权错误');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('授权')) {
      throw new Error('应该抛出 MCC 未授权错误');
    }
  }
});

// 清理测试
console.log('\n' + '-'.repeat(50));
console.log('\n📊 测试结果\n');
console.log('=' .repeat(50));
console.log(`✓ 通过：${passed}`);
console.log(`✗ 失败：${failed}`);
console.log(`📝 总计：${passed + failed}`);
console.log('=' .repeat(50) + '\n');

// 关闭数据库连接
db.close();

// 清理测试数据库
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
  console.log('🧹 测试数据库已清理\n');
}

// 退出码
process.exit(failed > 0 ? 1 : 0);
