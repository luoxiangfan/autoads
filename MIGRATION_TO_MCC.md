# 迁移到 MCC 统一授权模式指南

## 📋 概述

本指南帮助你从现有的**独立账号模式**迁移到**MCC 统一授权模式**。

### 迁移前后对比

| 项目 | 独立账号模式（迁移前） | MCC 统一授权模式（迁移后） |
|------|---------------------|------------------------|
| OAuth Client | 每个用户自己配置 | 管理员统一配置 |
| Developer Token | 每个用户自己填写 | 管理员统一填写 |
| Login Customer ID | 每个用户自己配置 | 管理员绑定用户时指定 |
| 授权流程 | 用户完整 OAuth 流程 | 用户一次 OAuth 授权 |
| 管理方式 | 用户各自管理 | 管理员统一管理 |

---

## 🎯 迁移策略

### 方案 A: 渐进式迁移（推荐）

**特点**:
- 不影响现有用户
- 新用户默认使用 MCC 模式
- 现有用户可选择迁移

**步骤**:
1. 部署 MCC 功能
2. 管理员配置 MCC 账号
3. 新用户自动使用 MCC 模式
4. 现有用户可选择迁移

### 方案 B: 一次性迁移

**特点**:
- 所有用户统一迁移
- 需要停机维护
- 迁移速度快

**步骤**:
1. 备份现有数据
2. 运行迁移脚本
3. 验证迁移结果
4. 通知用户

---

## 🔧 迁移步骤（渐进式）

### 步骤 1: 部署 MCC 功能

```bash
# 1. 合并 PR
git checkout main
git merge feature/google-ads-mcc

# 2. 运行数据库迁移
npm run db:migrate

# 3. 配置环境变量
cp .env.google-ads.example .env.local
vi .env.local

# 必填配置：
GOOGLE_ADS_OAUTH_REDIRECT_URI=http://your-domain.com/api/google-ads/oauth/callback
GOOGLE_ADS_MCC_CALLBACK_URI=http://your-domain.com/api/admin/google-ads-mcc/callback
GOOGLE_ADS_STATE_SECRET=your-secret-key-min-32-chars
```

### 步骤 2: 管理员配置 MCC

1. 访问 `/admin/google-ads-mcc`
2. 点击"新增 MCC 配置"
3. 填写：
   - MCC Customer ID（10 位数字）
   - OAuth Client ID
   - OAuth Client Secret
   - Developer Token
4. 点击"保存配置"
5. 点击"启动 OAuth 授权"
6. 完成 MCC 层级授权

### 步骤 3: 迁移现有用户

#### 方式 A: 管理员批量迁移

1. 访问 `/admin/users`
2. 选择要迁移的用户
3. 选择 MCC 账号
4. 填写 Customer ID
5. 点击"绑定用户"
6. 通知用户重新授权

#### 方式 B: 用户自助迁移

创建迁移引导页面，用户可主动选择迁移到 MCC 模式。

### 步骤 4: 更新 API 路由（可选）

如果希望默认使用 MCC 模式，更新 OAuth 路由：

**文件**: `src/app/api/google-ads/oauth/start/route.ts`

```typescript
// 在文件开头添加 MCC 模式检测
import { GoogleAdsMCCService } from '@/lib/google-ads-mcc-service';

const mccService = new GoogleAdsMCCService(getDb());

// 在验证用户后，检查是否已迁移到 MCC 模式
const binding = mccService.getUserMCCBinding(userId);

if (binding && binding.is_authorized) {
  // 使用 MCC 模式
  const authUrl = mccService.generateUserOAuthUrl(userId, redirectUri);
  return NextResponse.json({ auth_url: authUrl });
}

// 否则继续使用原有的独立账号模式
```

---

## 📊 数据迁移脚本

### 脚本 1: 从现有数据创建 MCC 配置

```sql
-- 迁移脚本：从现有用户数据提取 MCC 配置
-- 适用于：所有用户使用同一个 MCC 账号的情况

-- 1. 找出共用的 MCC 账号（login_customer_id）
SELECT login_customer_id, COUNT(*) as user_count
FROM google_ads_credentials
WHERE login_customer_id IS NOT NULL
GROUP BY login_customer_id
ORDER BY user_count DESC
LIMIT 5;

-- 2. 创建 MCC 账号（假设使用最多的 MCC）
INSERT INTO mcc_accounts (
  mcc_customer_id,
  oauth_client_id,
  oauth_client_secret,
  developer_token,
  is_authorized,
  configured_by,
  created_at,
  updated_at
)
SELECT DISTINCT
  gac.login_customer_id,
  gac.client_id,
  gac.client_secret,
  gac.developer_token,
  1, -- 假设已有 OAuth 授权
  gac.user_id,
  NOW(),
  NOW()
FROM google_ads_credentials gac
WHERE gac.login_customer_id = '1234567890'; -- 替换为你的 MCC ID

-- 3. 创建用户绑定
INSERT INTO user_mcc_bindings (
  user_id,
  mcc_account_id,
  customer_id,
  user_refresh_token,
  is_authorized,
  bound_at,
  created_at,
  updated_at
)
SELECT 
  gac.user_id,
  ma.id,
  gaa.customer_id, -- 需要关联 google_ads_accounts 表
  gac.refresh_token,
  1,
  NOW(),
  NOW(),
  NOW()
FROM google_ads_credentials gac
JOIN mcc_accounts ma ON ma.mcc_customer_id = gac.login_customer_id
LEFT JOIN google_ads_accounts gaa ON gaa.user_id = gac.user_id
WHERE gac.login_customer_id = '1234567890'; -- 替换为你的 MCC ID
```

### 脚本 2: 验证迁移结果

```sql
-- 验证脚本：检查迁移是否成功

-- 1. 检查 MCC 账号
SELECT 
  mcc_customer_id,
  is_authorized,
  COUNT(DISTINCT umb.user_id) as bound_users
FROM mcc_accounts ma
LEFT JOIN user_mcc_bindings umb ON umb.mcc_account_id = ma.id
GROUP BY ma.id, ma.mcc_customer_id, ma.is_authorized;

-- 2. 检查用户绑定状态
SELECT 
  u.username,
  u.email,
  ma.mcc_customer_id,
  umb.customer_id,
  umb.is_authorized,
  umb.needs_reauth
FROM users u
LEFT JOIN user_mcc_bindings umb ON umb.user_id = u.id
LEFT JOIN mcc_accounts ma ON ma.id = umb.mcc_account_id
ORDER BY u.id;

-- 3. 检查未迁移的用户
SELECT 
  u.username,
  u.email,
  gac.login_customer_id,
  gac.is_active
FROM users u
LEFT JOIN user_mcc_bindings umb ON umb.user_id = u.id
LEFT JOIN google_ads_credentials gac ON gac.user_id = u.id
WHERE umb.id IS NULL
  AND gac.id IS NOT NULL;
```

---

## 🔄 迁移后的 API 变更

### 端点映射

| 原端点 | 新端点（MCC 模式） | 说明 |
|--------|------------------|------|
| `/api/google-ads/oauth/start` | `/api/google-ads/oauth` | 简化版 OAuth |
| `/api/google-ads/oauth/callback` | `/api/google-ads/oauth/callback` | 保持不变 |
| `/api/google-ads/credentials` | `/api/admin/google-ads-mcc` | 管理员配置 |
| N/A | `/api/admin/user-mcc-binding` | 用户绑定 |

### 推荐做法

**保留原有端点**，在代码中自动检测使用哪种模式：

```typescript
// src/lib/google-ads-client.ts

async function getCredentials(userId: number) {
  // 1. 优先检查 MCC 模式
  const mccBinding = await db.query(
    `SELECT * FROM user_mcc_bindings WHERE user_id = ? AND is_authorized = 1`,
    [userId]
  );
  
  if (mccBinding) {
    // 使用 MCC 模式
    return getMCCCredentials(mccBinding);
  }
  
  // 2. 回退到独立账号模式
  const credentials = await db.query(
    `SELECT * FROM google_ads_credentials WHERE user_id = ? AND is_active = 1`,
    [userId]
  );
  
  if (credentials) {
    return credentials;
  }
  
  throw new Error('未配置 Google Ads API 凭证');
}
```

---

## ✅ 迁移检查清单

### 部署前
- [ ] 备份数据库
- [ ] 测试环境验证
- [ ] 准备回滚方案

### 部署中
- [ ] 运行数据库迁移
- [ ] 配置环境变量
- [ ] 配置 MCC 账号
- [ ] 测试 OAuth 流程

### 部署后
- [ ] 验证现有用户不受影响
- [ ] 测试新用户 MCC 流程
- [ ] 监控错误日志
- [ ] 用户通知

---

## 📞 用户通知模板

### 邮件通知（现有用户）

```
主题：AutoAds Google Ads 授权方式升级通知

亲爱的用户，

我们已升级 Google Ads API 授权方式，提供更便捷的管理体验。

【变化说明】
- 原方式：需要配置 OAuth Client、Developer Token 等
- 新方式：只需一次授权，平台统一管理

【对您的影响】
- 现有配置继续有效，无需任何操作
- 可选择迁移到新方式（推荐）

【迁移方式】
1. 登录平台
2. 访问"账户设置" > "Google Ads 授权"
3. 点击"迁移到统一管理"
4. 完成授权

如有任何问题，请随时联系我们。

AutoAds 团队
```

---

## 🎯 迁移时间线

### 第 1 周：准备阶段
- [ ] 部署 MCC 功能到测试环境
- [ ] 测试迁移流程
- [ ] 准备用户通知

### 第 2 周：试点迁移
- [ ] 选择 3-5 个试点用户
- [ ] 执行迁移
- [ ] 收集反馈

### 第 3 周：全面推广
- [ ] 发送用户通知
- [ ] 开放自助迁移
- [ ] 提供技术支持

### 第 4 周：收尾
- [ ] 统计迁移率
- [ ] 处理遗留问题
- [ ] 总结报告

---

## 📖 相关文档

- [MCC 使用指南](./GOOGLE_ADS_MCC_GUIDE.md)
- [部署报告](./DEPLOYMENT_REPORT.md)
- [API 测试报告](./API_TEST_REPORT.md)

---

**更新时间**: 2026-03-23  
**版本**: v1.0
