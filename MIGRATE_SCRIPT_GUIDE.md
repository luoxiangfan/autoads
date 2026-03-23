# 自动化迁移脚本使用说明

## 📋 功能

自动化迁移脚本 `migrate-to-mcc.js` 帮助你：

1. ✅ 分析现有用户数据
2. ✅ 创建 MCC 账号配置
3. ✅ 批量迁移用户到 MCC 模式
4. ✅ 验证迁移结果
5. ✅ 生成迁移报告

---

## 🚀 使用方法

### 基本语法

```bash
cd /home/admin/openclaw/workspace/autoads

node migrate-to-mcc.js [选项]
```

### 必需参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--mcc-id` | MCC Customer ID（10 位数字） | `1234567890` |
| `--client-id` | OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `--client-secret` | OAuth Client Secret | `GOCSPX-xxx` |
| `--dev-token` | Developer Token | `xxx` |

### 可选参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `--dry-run` | 仅预览，不执行迁移 | `--dry-run` |
| `--user-ids` | 指定要迁移的用户 ID | `--user-ids 1,2,3` |

---

## 📖 使用示例

### 示例 1: 预览迁移（推荐先执行）

```bash
node migrate-to-mcc.js \
  --mcc-id 1234567890 \
  --client-id xxx.apps.googleusercontent.com \
  --client-secret GOCSPX-xxx \
  --dev-token xxx \
  --dry-run
```

**输出**:
```
[2026-03-23T08:00:00.000Z] ℹ 验证输入参数...
[2026-03-23T08:00:00.001Z] ✅ 输入参数验证通过
[2026-03-23T08:00:00.002Z] ℹ 连接数据库：data/autoads.db
[2026-03-23T08:00:00.010Z] ✅ 数据库连接成功
[2026-03-23T08:00:00.011Z] ℹ 分析现有用户数据...
[2026-03-23T08:00:00.020Z] ℹ 现有用户总数：50
[2026-03-23T08:00:00.021Z] ℹ 独立 MCC 账号数：3
[2026-03-23T08:00:00.022Z] ℹ MCC 账号分布:
[2026-03-23T08:00:00.023Z] ℹ   1234567890: 30 个用户
[2026-03-23T08:00:00.024Z] ℹ   0987654321: 15 个用户
[2026-03-23T08:00:00.025Z] ℹ   1111111111: 5 个用户
[2026-03-23T08:00:00.026Z] ℹ 目标 MCC (1234567890) 下的用户数：30
[2026-03-23T08:00:00.027Z] ℹ 创建 MCC 账号配置：1234567890
[2026-03-23T08:00:00.028Z] ⚠️ [DRY RUN] 跳过 MCC 账号创建
[2026-03-23T08:00:00.029Z] ℹ 开始迁移用户...
[2026-03-23T08:00:00.030Z] ℹ 找到 30 个待迁移用户
[2026-03-23T08:00:00.031Z] ⚠️ [DRY RUN] 跳过用户迁移
[2026-03-23T08:00:00.032Z] ℹ 验证迁移结果...
[2026-03-23T08:00:00.040Z] ℹ MCC 账号状态：未授权，活跃
[2026-03-23T08:00:00.041Z] ℹ 绑定用户数：0
[2026-03-23T08:00:00.042Z] ℹ 仍有 30 个用户未迁移
[2026-03-23T08:00:00.043Z] ✅ 报告已保存到：migration-report.txt
```

### 示例 2: 执行完整迁移

```bash
node migrate-to-mcc.js \
  --mcc-id 1234567890 \
  --client-id xxx.apps.googleusercontent.com \
  --client-secret GOCSPX-xxx \
  --dev-token xxx
```

### 示例 3: 迁移指定用户

```bash
node migrate-to-mcc.js \
  --mcc-id 1234567890 \
  --client-id xxx.apps.googleusercontent.com \
  --client-secret GOCSPX-xxx \
  --dev-token xxx \
  --user-ids 1,5,10
```

---

## 📊 迁移报告

脚本会生成两个报告：

### 1. 控制台输出

实时显示迁移进度和结果。

### 2. 文件报告

保存到 `migration-report.txt`，包含完整的迁移日志。

---

## 🔍 迁移步骤详解

### 步骤 1: 数据准备

1. 确保数据库已包含 MCC 相关表
2. 运行 `npm run db:migrate`
3. 备份数据库（重要！）

```bash
# SQLite 备份
cp data/autoads.db data/autoads.db.backup

# PostgreSQL 备份
pg_dump autoads > autoads_backup.sql
```

### 步骤 2: 收集 MCC 配置信息

从 Google Cloud Console 获取：
- MCC Customer ID（10 位数字）
- OAuth Client ID
- OAuth Client Secret
- Developer Token

### 步骤 3: 运行预览

```bash
node migrate-to-mcc.js \
  --mcc-id YOUR_MCC_ID \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --dev-token YOUR_DEV_TOKEN \
  --dry-run
```

检查输出，确认：
- ✅ 目标 MCC 正确
- ✅ 用户数量符合预期
- ✅ 没有错误

### 步骤 4: 执行迁移

```bash
node migrate-to-mcc.js \
  --mcc-id YOUR_MCC_ID \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --dev-token YOUR_DEV_TOKEN
```

### 步骤 5: 验证结果

检查迁移报告：
- ✅ MCC 账号创建成功
- ✅ 用户迁移成功
- ✅ 没有失败记录

### 步骤 6: 后续操作

1. **管理员完成 MCC OAuth 授权**
   ```
   访问：/admin/google-ads-mcc
   点击"启动 OAuth 授权"
   ```

2. **通知用户重新授权**
   - 用户访问：/google-ads/authorize
   - 完成 OAuth 授权

3. **监控和验证**
   - 检查错误日志
   - 验证广告功能正常

---

## ⚠️ 注意事项

### 安全提醒

1. **不要在命令行中直接传递敏感信息**
   ```bash
   # ❌ 不安全（会保存在 bash history）
   node migrate-to-mcc.js --client-secret GOCSPX-xxx
   
   # ✅ 安全（使用环境变量）
   export CLIENT_SECRET=GOCSPX-xxx
   node migrate-to-mcc.js --client-secret $CLIENT_SECRET
   ```

2. **迁移报告包含敏感信息**
   ```bash
   # 迁移完成后删除或加密报告
   rm migration-report.txt
   # 或
   chmod 600 migration-report.txt
   ```

### 数据备份

**迁移前必须备份数据库！**

```bash
# SQLite
cp data/autoads.db data/autoads.db.backup.$(date +%Y%m%d)

# PostgreSQL
pg_dump autoads > autoads_backup_$(date +%Y%m%d).sql
```

### 回滚方案

如果迁移失败，需要回滚：

```sql
-- SQLite
DELETE FROM user_mcc_bindings WHERE mcc_account_id = ?;
DELETE FROM mcc_accounts WHERE mcc_customer_id = ?;

-- 或者恢复备份
cp data/autoads.db.backup data/autoads.db
```

---

## 🐛 故障排查

### 问题 1: 数据库表不存在

**错误**: `table mcc_accounts does not exist`

**解决**:
```bash
npm run db:migrate
```

### 问题 2: 用户没有 Customer ID

**警告**: `用户没有 Customer ID，跳过`

**解决**:
- 这些用户需要先创建 Google Ads 账户
- 或者手动指定 Customer ID

### 问题 3: 迁移后用户无法访问

**原因**: MCC 未完成 OAuth 授权

**解决**:
1. 管理员访问 `/admin/google-ads-mcc`
2. 完成 MCC OAuth 授权
3. 通知用户重新授权

---

## 📖 相关文档

- [MIGRATION_TO_MCC.md](./MIGRATION_TO_MCC.md) - 完整迁移指南
- [GOOGLE_ADS_MCC_GUIDE.md](./GOOGLE_ADS_MCC_GUIDE.md) - MCC 使用指南
- [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md) - 部署报告

---

**更新时间**: 2026-03-23  
**版本**: v1.0
