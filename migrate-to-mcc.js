#!/usr/bin/env node

/**
 * Google Ads MCC 自动化迁移脚本
 * 
 * 功能：
 * 1. 分析现有用户数据
 * 2. 创建 MCC 账号配置
 * 3. 批量迁移用户到 MCC 模式
 * 4. 验证迁移结果
 * 5. 生成迁移报告
 * 
 * 使用方法：
 * node migrate-to-mcc.js [options]
 * 
 * 选项：
 * --mcc-id <MCC_ID>          MCC Customer ID（10 位数字）
 * --client-id <CLIENT_ID>    OAuth Client ID
 * --client-secret <SECRET>   OAuth Client Secret
 * --dev-token <TOKEN>        Developer Token
 * --dry-run                  仅预览，不执行迁移
 * --user-ids <1,2,3>         指定要迁移的用户 ID（可选）
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 配置
const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, 'data/autoads.db');
const LOG_FILE = path.join(__dirname, 'migration-report.txt');

// 命令行参数解析
const args = process.argv.slice(2);
const options = {
  mccId: null,
  clientId: null,
  clientSecret: null,
  developerToken: null,
  dryRun: false,
  userIds: null,
};

args.forEach((arg, index) => {
  if (arg === '--mcc-id' && args[index + 1]) {
    options.mccId = args[index + 1].trim();
  } else if (arg === '--client-id' && args[index + 1]) {
    options.clientId = args[index + 1].trim();
  } else if (arg === '--client-secret' && args[index + 1]) {
    options.clientSecret = args[index + 1].trim();
  } else if (arg === '--dev-token' && args[index + 1]) {
    options.developerToken = args[index + 1].trim();
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--user-ids' && args[index + 1]) {
    options.userIds = args[index + 1].split(',').map(id => parseInt(id.trim()));
  }
});

// 日志函数
let logContent = '';
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: 'ℹ',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  }[type] || 'ℹ';
  
  const logLine = `[${timestamp}] ${prefix} ${message}`;
  console.log(logLine);
  logContent += logLine + '\n';
}

// 验证输入
function validateInputs() {
  log('验证输入参数...');
  
  if (!options.mccId) {
    log('错误：缺少 --mcc-id 参数', 'error');
    process.exit(1);
  }
  
  if (!/^\d{10}$/.test(options.mccId)) {
    log('错误：MCC Customer ID 必须是 10 位数字', 'error');
    process.exit(1);
  }
  
  if (!options.clientId || !options.clientSecret || !options.developerToken) {
    log('错误：缺少必要的 OAuth 配置参数', 'error');
    process.exit(1);
  }
  
  log('输入参数验证通过', 'success');
}

// 连接数据库
function connectDB() {
  log(`连接数据库：${DB_PATH}`);
  
  if (!fs.existsSync(DB_PATH)) {
    log('错误：数据库文件不存在', 'error');
    process.exit(1);
  }
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  log('数据库连接成功', 'success');
  return db;
}

// 分析现有数据
function analyzeExistingData(db) {
  log('分析现有用户数据...');
  
  // 统计现有配置
  const stats = db.prepare(`
    SELECT 
      COUNT(DISTINCT user_id) as total_users,
      COUNT(DISTINCT login_customer_id) as unique_mccs,
      login_customer_id,
      COUNT(*) as user_count
    FROM google_ads_credentials
    WHERE is_active = 1
    GROUP BY login_customer_id
    ORDER BY user_count DESC
  `).all();
  
  log(`现有用户总数：${stats[0]?.total_users || 0}`, 'info');
  log(`独立 MCC 账号数：${stats[0]?.unique_mccs || 0}`, 'info');
  
  if (stats.length > 0) {
    log('MCC 账号分布:', 'info');
    stats.forEach((row, index) => {
      if (index < 5) {
        log(`  ${row.login_customer_id}: ${row.user_count} 个用户`, 'info');
      }
    });
  }
  
  // 检查目标 MCC 的用户
  const targetMCCUsers = db.prepare(`
    SELECT COUNT(*) as count
    FROM google_ads_credentials
    WHERE login_customer_id = ? AND is_active = 1
  `).get(options.mccId);
  
  log(`目标 MCC (${options.mccId}) 下的用户数：${targetMCCUsers.count}`, 'info');
  
  return { stats, targetMCCUsers };
}

// 创建 MCC 账号
function createMCCAccount(db) {
  log(`创建 MCC 账号配置：${options.mccId}`);
  
  if (options.dryRun) {
    log('[DRY RUN] 跳过 MCC 账号创建', 'warning');
    return 1;
  }
  
  try {
    const result = db.prepare(`
      INSERT INTO mcc_accounts (
        mcc_customer_id,
        oauth_client_id,
        oauth_client_secret,
        developer_token,
        is_authorized,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
      ON CONFLICT(mcc_customer_id) DO UPDATE SET
        oauth_client_id = excluded.oauth_client_id,
        oauth_client_secret = excluded.oauth_client_secret,
        developer_token = excluded.developer_token,
        updated_at = datetime('now')
    `).run(
      options.mccId,
      options.clientId,
      options.clientSecret,
      options.developerToken
    );
    
    log(`MCC 账号创建成功，ID: ${result.lastInsertRowid}`, 'success');
    return result.lastInsertRowid;
  } catch (error) {
    log(`创建 MCC 账号失败：${error.message}`, 'error');
    throw error;
  }
}

// 迁移用户
function migrateUsers(db, mccAccountId) {
  log('开始迁移用户...');
  
  // 获取要迁移的用户
  let usersToMigrate;
  
  if (options.userIds) {
    // 迁移指定用户
    const userIdList = options.userIds.join(',');
    usersToMigrate = db.prepare(`
      SELECT 
        gac.user_id,
        gac.refresh_token,
        gac.developer_token,
        gaa.customer_id,
        u.username,
        u.email
      FROM google_ads_credentials gac
      JOIN users u ON u.id = gac.user_id
      LEFT JOIN google_ads_accounts gaa ON gaa.user_id = gac.user_id AND gaa.is_active = 1
      WHERE gac.user_id IN (${userIdList})
        AND gac.is_active = 1
        AND gac.login_customer_id = ?
    `).all(options.mccId);
  } else {
    // 迁移所有使用该 MCC 的用户
    usersToMigrate = db.prepare(`
      SELECT 
        gac.user_id,
        gac.refresh_token,
        gac.developer_token,
        gaa.customer_id,
        u.username,
        u.email
      FROM google_ads_credentials gac
      JOIN users u ON u.id = gac.user_id
      LEFT JOIN google_ads_accounts gaa ON gaa.user_id = gac.user_id AND gaa.is_active = 1
      WHERE gac.is_active = 1
        AND gac.login_customer_id = ?
    `).all(options.mccId);
  }
  
  log(`找到 ${usersToMigrate.length} 个待迁移用户`, 'info');
  
  if (usersToMigrate.length === 0) {
    log('没有需要迁移的用户', 'warning');
    return { migrated: 0, failed: 0 };
  }
  
  let migrated = 0;
  let failed = 0;
  
  usersToMigrate.forEach((user, index) => {
    try {
      log(`[${index + 1}/${usersToMigrate.length}] 迁移用户：${user.username} (${user.email})`, 'info');
      
      if (options.dryRun) {
        log(`  [DRY RUN] 跳过用户迁移`, 'warning');
        migrated++;
        return;
      }
      
      // 检查用户是否已绑定
      const existingBinding = db.prepare(`
        SELECT id FROM user_mcc_bindings WHERE user_id = ?
      `).get(user.user_id);
      
      if (existingBinding) {
        log(`  用户已绑定 MCC，跳过`, 'warning');
        migrated++;
        return;
      }
      
      // 检查是否有 Customer ID
      if (!user.customer_id) {
        log(`  用户没有 Customer ID，跳过`, 'warning');
        failed++;
        return;
      }
      
      // 创建绑定
      db.prepare(`
        INSERT INTO user_mcc_bindings (
          user_id,
          mcc_account_id,
          customer_id,
          user_refresh_token,
          is_authorized,
          needs_reauth,
          bound_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'), datetime('now'))
      `).run(
        user.user_id,
        mccAccountId,
        user.customer_id,
        user.refresh_token
      );
      
      log(`  迁移成功`, 'success');
      migrated++;
    } catch (error) {
      log(`  迁移失败：${error.message}`, 'error');
      failed++;
    }
  });
  
  return { migrated, failed };
}

// 验证迁移结果
function verifyMigration(db) {
  log('验证迁移结果...');
  
  // 检查 MCC 账号
  const mccAccount = db.prepare(`
    SELECT 
      mcc_customer_id,
      is_authorized,
      is_active
    FROM mcc_accounts
    WHERE mcc_customer_id = ?
  `).get(options.mccId);
  
  if (!mccAccount) {
    log('MCC 账号不存在', 'error');
    return false;
  }
  
  log(`MCC 账号状态：${mccAccount.is_authorized ? '已授权' : '未授权'}，${mccAccount.is_active ? '活跃' : '未激活'}`, 'info');
  
  // 检查绑定的用户
  const boundUsers = db.prepare(`
    SELECT 
      COUNT(*) as count,
      SUM(CASE WHEN is_authorized = 1 THEN 1 ELSE 0 END) as authorized,
      SUM(CASE WHEN needs_reauth = 1 THEN 1 ELSE 0 END) as needs_reauth
    FROM user_mcc_bindings
    WHERE mcc_account_id = (SELECT id FROM mcc_accounts WHERE mcc_customer_id = ?)
  `).get(options.mccId);
  
  log(`绑定用户数：${boundUsers.count}`, 'info');
  log(`已授权：${boundUsers.authorized}`, 'info');
  log(`需要重新授权：${boundUsers.needs_reauth}`, 'info');
  
  // 检查未迁移的用户
  const remainingUsers = db.prepare(`
    SELECT COUNT(*) as count
    FROM google_ads_credentials gac
    WHERE gac.is_active = 1
      AND gac.login_customer_id = ?
      AND gac.user_id NOT IN (
        SELECT user_id FROM user_mcc_bindings
      )
  `).get(options.mccId);
  
  if (remainingUsers.count > 0) {
    log(`仍有 ${remainingUsers.count} 个用户未迁移`, 'warning');
  } else {
    log('所有用户都已迁移', 'success');
  }
  
  return true;
}

// 生成报告
function generateReport(analysis, migrationResult) {
  const report = `
========================================
Google Ads MCC 迁移报告
========================================
生成时间：${new Date().toISOString()}
MCC Customer ID: ${options.mccId}
运行模式：${options.dryRun ? 'DRY RUN' : '实际迁移'}

【现有数据分析】
- 总用户数：${analysis.stats[0]?.total_users || 0}
- 独立 MCC 数：${analysis.stats[0]?.unique_mccs || 0}
- 目标 MCC 用户数：${analysis.targetMCCUsers.count}

【迁移结果】
- 成功迁移：${migrationResult.migrated}
- 迁移失败：${migrationResult.failed}
- 成功率：${migrationResult.migrated / (migrationResult.migrated + migrationResult.failed) * 100 || 0}%

【后续步骤】
1. 验证迁移用户是否可以正常访问
2. 通知用户重新授权（如需要）
3. 监控错误日志
4. 清理旧数据（确认无误后）

========================================
`;
  
  console.log(report);
  
  // 保存到文件
  fs.writeFileSync(LOG_FILE, logContent + '\n' + report);
  log(`报告已保存到：${LOG_FILE}`, 'success');
}

// 主函数
async function main() {
  log('========================================');
  log('Google Ads MCC 自动化迁移脚本');
  log('========================================');
  
  let db;
  
  try {
    // 1. 验证输入
    validateInputs();
    
    // 2. 连接数据库
    db = connectDB();
    
    // 3. 分析现有数据
    const analysis = analyzeExistingData(db);
    
    // 4. 创建 MCC 账号
    const mccAccountId = createMCCAccount(db);
    
    // 5. 迁移用户
    const migrationResult = migrateUsers(db, mccAccountId);
    
    // 6. 验证迁移结果
    verifyMigration(db);
    
    // 7. 生成报告
    generateReport(analysis, migrationResult);
    
    log('========================================');
    log('迁移完成！', 'success');
    log('========================================');
    
  } catch (error) {
    log(`迁移失败：${error.message}`, 'error');
    log(error.stack, 'error');
    process.exit(1);
  } finally {
    if (db) {
      db.close();
      log('数据库连接已关闭', 'info');
    }
  }
}

// 运行
main();
