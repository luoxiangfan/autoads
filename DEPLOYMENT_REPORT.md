# Google Ads MCC 统一授权 - 部署检查报告

**检查时间**: 2026-03-23 11:19 GMT+8  
**检查目录**: `/home/admin/openclaw/workspace/autoads/`

## ✅ 检查结果

### 1. 文件完整性 - ✅ 通过 (13/13)

所有必需文件已创建：

| 文件 | 状态 |
|------|------|
| migrations/213_google_ads_mcc_unified_auth.sql | ✅ 存在 |
| src/lib/google-ads-mcc-service.ts | ✅ 存在 |
| src/app/api/admin/google-ads-mcc/route.ts | ✅ 存在 |
| src/app/api/admin/google-ads-mcc/[id]/authorize/route.ts | ✅ 存在 |
| src/app/api/admin/google-ads-mcc/callback/route.ts | ✅ 存在 |
| src/app/api/admin/user-mcc-binding/route.ts | ✅ 存在 |
| src/app/api/google-ads/oauth/route.ts | ✅ 存在 |
| src/app/api/google-ads/oauth/callback/route.ts | ✅ 存在 |
| src/components/admin/MCCConfigForm.tsx | ✅ 存在 |
| src/components/admin/UserMCCBinding.tsx | ✅ 存在 |
| src/app/google-ads/authorize/page.tsx | ✅ 存在 |
| .env.google-ads.example | ✅ 存在 |
| GOOGLE_ADS_MCC_GUIDE.md | ✅ 存在 |

### 2. 环境变量配置 - ⚠️ 待配置

- `.env.local` 文件不存在（需要从 `.env.google-ads.example` 复制）
- 这是预期的，因为这是示例配置

### 3. 数据库迁移 - ⚠️ 待执行

- 数据库文件不存在（需要在目标项目中执行迁移）

### 4. 项目依赖 - ℹ️ 不适用

- `package.json` 不存在（代码需要集成到实际的 autoads 项目中）

## 📋 部署到实际项目的步骤

### 步骤 1: 将代码复制到 autoads 项目

```bash
# 假设 autoads 项目在 /path/to/autoads
cd /path/to/autoads

# 复制迁移文件
cp /home/admin/openclaw/workspace/autoads/migrations/213_google_ads_mcc_unified_auth.sql ./migrations/

# 复制服务层
cp /home/admin/openclaw/workspace/autoads/src/lib/google-ads-mcc-service.ts ./src/lib/

# 复制 API 路由
cp /home/admin/openclaw/workspace/autoads/src/app/api/admin/google-ads-mcc/route.ts ./src/app/api/admin/google-ads-mcc/route.ts
cp -r /home/admin/openclaw/workspace/autoads/src/app/api/admin/google-ads-mcc/\[id\] ./src/app/api/admin/google-ads-mcc/
cp /home/admin/openclaw/workspace/autoads/src/app/api/admin/user-mcc-binding/route.ts ./src/app/api/admin/user-mcc-binding/route.ts
cp -r /home/admin/openclaw/workspace/autoads/src/app/api/google-ads/ ./src/app/api/

# 复制组件
cp /home/admin/openclaw/workspace/autoads/src/components/admin/MCCConfigForm.tsx ./src/components/admin/
cp /home/admin/openclaw/workspace/autoads/src/components/admin/UserMCCBinding.tsx ./src/components/admin/
cp /home/admin/openclaw/workspace/autoads/src/app/google-ads/authorize/page.tsx ./src/app/google-ads/authorize/

# 复制配置和文档
cp /home/admin/openclaw/workspace/autoads/.env.google-ads.example .
cp /home/admin/openclaw/workspace/autoads/GOOGLE_ADS_MCC_GUIDE.md .
```

### 步骤 2: 安装依赖

```bash
cd /path/to/autoads
npm install googleapis
```

### 步骤 3: 配置环境变量

```bash
cp .env.google-ads.example .env.local
vi .env.local

# 配置以下内容：
GOOGLE_ADS_OAUTH_REDIRECT_URI=http://your-domain.com/api/google-ads/oauth/callback
GOOGLE_ADS_MCC_CALLBACK_URI=http://your-domain.com/api/admin/google-ads-mcc/callback
GOOGLE_ADS_STATE_SECRET=your-super-secret-key-min-32-characters-long
```

### 步骤 4: 运行数据库迁移

```bash
# SQLite (开发环境)
npm run db:migrate

# 或手动执行
sqlite3 data/autoads.db < migrations/213_google_ads_mcc_unified_auth.sql

# PostgreSQL (生产环境)
psql autoads < migrations/213_google_ads_mcc_unified_auth.sql
```

### 步骤 5: 验证迁移

```bash
# SQLite
sqlite3 data/autoads.db ".tables"
# 应看到：mcc_accounts, user_mcc_bindings

# PostgreSQL
psql autoads -c "\dt"
# 应看到：mcc_accounts, user_mcc_bindings
```

### 步骤 6: 重启应用

```bash
npm run build
npm start
```

### 步骤 7: 访问管理后台

```
http://your-domain.com/admin/google-ads-mcc
```

## 🎯 功能验证清单

部署完成后，请按以下顺序验证功能：

### 管理员功能
- [ ] 访问 `/admin/google-ads-mcc` 页面
- [ ] 创建 MCC 配置（填写 MCC ID、OAuth Client、Developer Token）
- [ ] 点击"启动 OAuth 授权"完成 MCC 层级授权
- [ ] 验证状态显示为"已授权"
- [ ] 绑定用户到 MCC + CustomerId

### 用户功能
- [ ] 用户登录平台
- [ ] 访问 `/google-ads/authorize` 页面
- [ ] 点击"开始授权"跳转到 Google
- [ ] 完成 OAuth 授权
- [ ] 验证返回后显示"已完成授权"
- [ ] 访问广告管理页面

### 配置变更
- [ ] 管理员修改 MCC 配置（如 Developer Token）
- [ ] 验证用户状态变为"需要重新授权"
- [ ] 用户重新完成授权
- [ ] 验证恢复正常使用

## 📊 代码统计

| 类型 | 文件数 | 代码行数 |
|------|--------|----------|
| 数据库迁移 | 1 | ~80 行 |
| TypeScript 服务 | 1 | ~550 行 |
| API 路由 | 7 | ~400 行 |
| React 组件 | 3 | ~650 行 |
| 文档 | 3 | ~600 行 |
| **总计** | **15** | **~2280 行** |

## 🔗 文件位置

所有文件位于：`/home/admin/openclaw/workspace/autoads/`

```
autoads/
├── migrations/
│   └── 213_google_ads_mcc_unified_auth.sql
├── src/
│   ├── lib/
│   │   └── google-ads-mcc-service.ts
│   ├── app/
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   ├── google-ads-mcc/
│   │   │   │   │   ├── route.ts
│   │   │   │   │   ├── [id]/
│   │   │   │   │   │   ├── authorize/
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── bindings/
│   │   │   │   │   │       └── route.ts
│   │   │   │   │   └── callback/
│   │   │   │   │       └── route.ts
│   │   │   │   └── user-mcc-binding/
│   │   │   │       └── route.ts
│   │   │   └── google-ads/
│   │   │       └── oauth/
│   │   │           └── route.ts
│   │   │           └── callback/
│   │   │               └── route.ts
│   │   └── google-ads/
│   │       └── authorize/
│   │           └── page.tsx
│   └── components/
│       └── admin/
│           ├── MCCConfigForm.tsx
│           └── UserMCCBinding.tsx
├── .env.google-ads.example
├── GOOGLE_ADS_MCC_GUIDE.md
├── IMPLEMENTATION_SUMMARY.md
└── deploy-checklist.sh
```

## ✅ 总结

**实现状态**: ✅ 完成  
**文件完整性**: ✅ 13/13 通过  
**待办事项**: 
1. 将代码复制到实际的 autoads 项目
2. 配置环境变量
3. 运行数据库迁移
4. 重启应用并验证功能

**详细文档**: 查看 `GOOGLE_ADS_MCC_GUIDE.md` 获取完整的使用指南。
