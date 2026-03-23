# Google Ads MCC 统一授权使用指南

## 📋 概述

本功能实现了 Google Ads API 的统一授权管理，解决了以下问题：

**之前的问题：**
- ❌ 每个用户都需要自己填写 Developer Token
- ❌ 每个用户都需要单独配置 OAuth Client
- ❌ 管理员无法统一管理多个用户的授权

**现在的解决方案：**
- ✅ 管理员统一配置 MCC 账号（OAuth Client + Developer Token）
- ✅ 管理员完成 MCC 层级 OAuth 授权
- ✅ 用户只需一次 OAuth 授权即可使用
- ✅ 支持多个 MCC 账号配置
- ✅ 配置变更自动触发重新授权

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│  平台管理员                                                  │
│  1. 配置 MCC 账号（OAuth Client + Developer Token）           │
│  2. 完成 MCC 层级 OAuth 授权                                   │
│  3. 绑定用户到 MCC + CustomerId                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  MCC Accounts 表                                             │
│  - mcc_customer_id (MCC ID)                                 │
│  - oauth_client_id, oauth_client_secret                     │
│  - developer_token                                          │
│  - mcc_refresh_token (MCC 层级 token)                         │
│  - is_authorized (授权状态)                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  User MCC Bindings 表                                        │
│  - user_id (平台用户)                                        │
│  - mcc_account_id (关联的 MCC)                               │
│  - customer_id (用户的具体广告账户)                            │
│  - user_refresh_token (用户层级 token)                        │
│  - is_authorized (用户授权状态)                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  平台用户                                                    │
│  1. 登录平台                                                 │
│  2. 点击"授权 Google Ads"                                     │
│  3. 完成 OAuth 授权                                           │
│  4. 开始创建广告系列                                          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 步骤 1：数据库迁移

```bash
cd autoads

# 运行迁移
npm run db:migrate

# 或手动执行（SQLite）
sqlite3 data/autoads.db < migrations/213_google_ads_mcc_unified_auth.sql

# 验证迁移
sqlite3 data/autoads.db ".tables"
# 应看到：mcc_accounts, user_mcc_bindings
```

### 步骤 2：配置环境变量

```bash
# 复制示例配置
cp .env.google-ads.example .env.local

# 编辑 .env.local，填写必要配置
vi .env.local
```

**必填配置：**
```bash
# OAuth 重定向 URI（根据实际域名修改）
GOOGLE_ADS_OAUTH_REDIRECT_URI=http://localhost:3000/api/google-ads/oauth/callback
GOOGLE_ADS_MCC_CALLBACK_URI=http://localhost:3000/api/admin/google-ads-mcc/callback

# State Token 加密密钥（生产环境请用强随机字符串）
GOOGLE_ADS_STATE_SECRET=your-super-secret-key-change-in-production-min-32-chars
```

### 步骤 3：在 Google Cloud Console 配置 OAuth

1. 访问 https://console.cloud.google.com/
2. 选择或创建项目
3. 启用 Google Ads API
4. 创建 OAuth 2.0 凭证：
   - 应用类型：Web application
   - 授权重定向 URI：添加 `GOOGLE_ADS_OAUTH_REDIRECT_URI` 和 `GOOGLE_ADS_MCC_CALLBACK_URI`
5. 记录 Client ID 和 Client Secret

### 步骤 4：管理员配置 MCC 账号

1. 登录平台，进入 **管理员后台 → Google Ads MCC 管理**
2. 点击"新增 MCC 配置"
3. 填写信息：
   - **MCC Customer ID**: 10 位数字的 MCC 账号 ID
   - **OAuth Client ID**: Google Cloud Console 创建的 Client ID
   - **OAuth Client Secret**: Google Cloud Console 创建的 Client Secret
   - **Developer Token**: Google Ads API Developer Token
4. 点击"保存配置"
5. 点击"启动 OAuth 授权"
6. 在新窗口中使用 MCC 账号登录 Google 并完成授权
7. 返回页面，状态应显示为"已授权"

### 步骤 5：管理员绑定用户

1. 进入 **管理员后台 → 用户管理 → 绑定 MCC**
2. 选择用户
3. 选择已授权的 MCC 账号
4. 填写 Customer ID（用户要管理的具体广告账户 ID，10 位数字）
5. 点击"绑定用户"

### 步骤 6：用户完成授权

1. 用户登录平台
2. 系统提示需要授权 Google Ads
3. 点击"授权 Google Ads"按钮
4. 跳转到 Google 授权页面
5. 使用 Google 账号登录（需有 Customer ID 的访问权限）
6. 授予 AutoAds 访问权限
7. 授权完成后自动返回平台
8. 现在可以创建和管理广告系列了！

## 📖 功能详解

### 管理员功能

#### 1. MCC 配置管理

**API:** `GET/POST /api/admin/google-ads-mcc`

```typescript
// 创建 MCC 配置
POST /api/admin/google-ads-mcc
{
  "mccCustomerId": "1234567890",
  "oauthClientId": "xxx.apps.googleusercontent.com",
  "oauthClientSecret": "secret",
  "developerToken": "token"
}

// 获取 MCC 列表
GET /api/admin/google-ads-mcc
```

#### 2. MCC OAuth 授权

**API:** `GET /api/admin/google-ads-mcc/[id]/authorize`

生成 MCC 层级的 OAuth 授权 URL，管理员在新窗口完成授权。

**回调:** `GET /api/admin/google-ads-mcc/callback`

处理授权回调，保存 MCC 层级的 refresh token。

#### 3. 用户绑定管理

**API:** `POST /api/admin/user-mcc-binding`

```typescript
POST /api/admin/user-mcc-binding
{
  "userId": 123,
  "mccAccountId": 1,
  "customerId": "9876543210"
}
```

**获取绑定列表:** `GET /api/admin/google-ads-mcc/[id]/bindings`

### 用户功能

#### 1. 检查授权状态

**API:** `GET /api/admin/user-mcc-binding`

返回：
```json
{
  "isAuthorized": true,
  "needsReauth": false,
  "customerId": "9876543210",
  "mccName": "1234567890"
}
```

#### 2. 用户 OAuth 授权

**API:** `GET /api/google-ads/oauth`

生成用户 OAuth 授权 URL。

**回调:** `GET /api/google-ads/oauth/callback`

处理授权回调，保存用户层级的 refresh token。

## 🔐 安全机制

### 1. State Token 验证

所有 OAuth 流程都使用带签名的 State Token，防止 CSRF 攻击：

```typescript
// 生成 State Token
const payload = { id, type, customerId, timestamp };
const signature = HMAC_SHA256(payload, secret);
const state = BASE64(payload + ':' + signature);

// 验证 State Token
// 1. 验证签名
// 2. 验证类型
// 3. 验证有效期（5 分钟）
```

### 2. 敏感信息加密

- `oauth_client_secret`: 建议数据库层面加密存储
- `refresh_token`: 建议数据库层面加密存储
- `developer_token`: 建议数据库层面加密存储

### 3. 权限控制

- MCC 配置管理：仅管理员（role='admin'）
- 用户绑定：仅管理员
- 用户授权：用户本人

### 4. Token 刷新机制

Access Token 过期时自动刷新：

```typescript
async refreshUserAccessToken(userId: number) {
  const binding = getUserMCCBinding(userId);
  const oauth2Client = new google.auth.OAuth2(...);
  oauth2Client.setCredentials({ refresh_token: binding.user_refresh_token });
  const { credentials } = await oauth2Client.refreshAccessToken();
  // 更新数据库
}
```

## 🔄 配置变更处理

### MCC 配置修改

当管理员修改敏感配置时：

```typescript
updateMCCConfig(mccId, updates) {
  const sensitiveFields = ['oauth_client_id', 'oauth_client_secret', 'developer_token'];
  const hasSensitiveUpdate = sensitiveFields.some(field => field in updates);
  
  if (hasSensitiveUpdate) {
    // 1. 清除 MCC 的 token
    mcc.is_authorized = 0;
    mcc.refresh_token = null;
    
    // 2. 标记所有关联用户需要重新授权
    UPDATE user_mcc_bindings SET
      is_authorized = 0,
      needs_reauth = 1,
      user_refresh_token = NULL
    WHERE mcc_account_id = mccId;
  }
}
```

### 用户重新授权流程

1. 用户登录平台
2. 系统检测到 `needs_reauth = 1`
3. 显示"需要重新授权"提示
4. 用户点击"重新授权"
5. 完成 OAuth 流程

## 📊 数据库表结构

### mcc_accounts

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| mcc_customer_id | TEXT | MCC 账号 ID（10 位数字） |
| oauth_client_id | TEXT | OAuth Client ID |
| oauth_client_secret | TEXT | OAuth Client Secret |
| developer_token | TEXT | Developer Token |
| mcc_refresh_token | TEXT | MCC 层级 Refresh Token |
| is_authorized | INTEGER | 授权状态（0/1） |
| configured_by | INTEGER | 配置管理员 ID |
| created_at | TEXT | 创建时间 |

### user_mcc_bindings

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 平台用户 ID |
| mcc_account_id | INTEGER | 关联的 MCC ID |
| customer_id | TEXT | 用户广告账户 ID（10 位数字） |
| user_refresh_token | TEXT | 用户层级 Refresh Token |
| is_authorized | INTEGER | 授权状态（0/1） |
| needs_reauth | INTEGER | 是否需要重新授权（0/1） |
| bound_at | TEXT | 绑定时间 |

## 🛠️ API 端点总览

| 端点 | 方法 | 权限 | 说明 |
|------|------|------|------|
| `/api/admin/google-ads-mcc` | GET | 管理员 | 获取 MCC 列表 |
| `/api/admin/google-ads-mcc` | POST | 管理员 | 创建/更新 MCC 配置 |
| `/api/admin/google-ads-mcc/[id]/authorize` | GET | 管理员 | 生成 MCC OAuth URL |
| `/api/admin/google-ads-mcc/callback` | GET | 管理员 | MCC OAuth 回调 |
| `/api/admin/google-ads-mcc/[id]/bindings` | GET | 管理员 | 获取 MCC 绑定用户列表 |
| `/api/admin/user-mcc-binding` | GET | 用户 | 检查用户授权状态 |
| `/api/admin/user-mcc-binding` | POST | 管理员 | 绑定用户到 MCC |
| `/api/google-ads/oauth` | GET | 用户 | 生成用户 OAuth URL |
| `/api/google-ads/oauth/callback` | GET | 用户 | 用户 OAuth 回调 |

## 🧪 测试指南

### 1. 测试 MCC 配置

```bash
# 创建测试 MCC 配置
curl -X POST http://localhost:3000/api/admin/google-ads-mcc \
  -H "Content-Type: application/json" \
  -H "Cookie: session=xxx" \
  -d '{
    "mccCustomerId": "1234567890",
    "oauthClientId": "test.apps.googleusercontent.com",
    "oauthClientSecret": "test-secret",
    "developerToken": "test-token"
  }'
```

### 2. 测试用户绑定

```bash
curl -X POST http://localhost:3000/api/admin/user-mcc-binding \
  -H "Content-Type: application/json" \
  -H "Cookie: session=xxx" \
  -d '{
    "userId": 2,
    "mccAccountId": 1,
    "customerId": "9876543210"
  }'
```

### 3. 测试授权状态

```bash
curl http://localhost:3000/api/admin/user-mcc-binding \
  -H "Cookie: session=xxx"
```

## ❓ 常见问题

### Q1: 一个 MCC 账号可以绑定多少个用户？

A: 不限制。一个 MCC 账号可以绑定多个用户，每个用户关联不同的 CustomerId。

### Q2: 用户可以绑定多个 MCC 账号吗？

A: 当前设计是一个用户只能绑定一个 MCC 账号。如需支持多个，需修改 `user_mcc_bindings` 表的 UNIQUE 约束。

### Q3: 配置修改后用户多久需要重新授权？

A: 立即生效。配置修改后，系统会自动标记所有关联用户 `needs_reauth = 1`，用户下次登录时会被要求重新授权。

### Q4: 如何查看用户的授权状态？

A: 管理员可以在 MCC 管理页面查看每个 MCC 账号下的绑定用户列表和授权状态。

### Q5: Developer Token 在哪里获取？

A: 在 Google Ads 开发者中心申请：https://developers.google.com/google-ads/api/docs/first-call/dev-token

### Q6: OAuth 授权失败怎么办？

A: 检查以下几点：
1. Google Cloud Console 中是否启用了 Google Ads API
2. 授权重定向 URI 是否配置正确
3. OAuth Client ID 和 Secret 是否正确
4. 用户 Google 账号是否有 CustomerId 的访问权限

## 📝 更新日志

### v1.0.0 (2026-03-23)
- ✅ 初始版本
- ✅ MCC 账号配置管理
- ✅ 用户绑定功能
- ✅ 统一 OAuth 授权流程
- ✅ 配置变更自动触发重新授权
- ✅ 完整的前端界面

## 🔗 相关资源

- [Google Ads API 文档](https://developers.google.com/google-ads/api/docs/start)
- [Google OAuth 2.0 文档](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Developer Token 申请](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
