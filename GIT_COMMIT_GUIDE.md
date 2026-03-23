# Google Ads MCC 统一授权管理 - Git 提交指南

## 📝 建议的提交历史

### 提交 1: 数据库迁移
```bash
git add migrations/213_google_ads_mcc_unified_auth.sql
git commit -m "feat(db): add MCC unified authorization schema

- Add mcc_accounts table for MCC configuration
- Add user_mcc_bindings table for user-MCC relationships
- Add mcc_account_id column to google_ads_accounts
- Create indexes for performance optimization

Migration ID: 213
Tables: mcc_accounts, user_mcc_bindings
"
```

### 提交 2: 服务层实现
```bash
git add src/lib/google-ads-mcc-service.ts
git commit -m "feat(service): implement Google Ads MCC service

- MCC configuration management (CRUD)
- MCC OAuth authorization flow
- User binding management
- User OAuth authorization flow
- Token refresh mechanism
- Configuration change handling
- State token generation and verification

Core service for unified Google Ads authorization
"
```

### 提交 3: 管理员 API
```bash
git add src/app/api/admin/google-ads-mcc/ src/app/api/admin/users/ src/app/api/admin/user-mcc-binding/ src/app/api/admin/user-mcc-bindings/
git commit -m "feat(api): add admin Google Ads MCC endpoints

Admin endpoints:
- GET/POST /api/admin/google-ads-mcc - MCC configuration
- DELETE /api/admin/google-ads-mcc/[id] - Delete MCC
- GET /api/admin/google-ads-mcc/[id]/authorize - MCC OAuth
- GET /api/admin/google-ads-mcc/callback - MCC callback
- GET /api/admin/google-ads-mcc/[id]/bindings - Bindings list
- GET /api/admin/users - User list
- POST /api/admin/user-mcc-binding - Bind user
- DELETE /api/admin/user-mcc-binding/[userId] - Unbind user
- GET /api/admin/user-mcc-bindings - All bindings

All endpoints require admin authentication
"
```

### 提交 4: 用户 API
```bash
git add src/app/api/google-ads/
git commit -m "feat(api): add user Google Ads OAuth endpoints

User endpoints:
- GET /api/google-ads/oauth - Generate user OAuth URL
- GET /api/google-ads/oauth/callback - OAuth callback handler

Handles user-level Google Ads authorization
"
```

### 提交 5: 管理界面
```bash
git add src/app/admin/google-ads-mcc/page.tsx src/app/admin/users/page.tsx
git commit -m "feat(ui): add Google Ads MCC admin pages

Admin pages:
- /admin/google-ads-mcc - MCC account management
  - MCC list with authorization status
  - Add/Edit MCC configuration form
  - MCC OAuth authorization button
  - Delete MCC account
  - View bound users list

- /admin/users - User binding management
  - User list with binding status
  - User binding form
  - Binding details view
  - Unbind user action

Responsive design with modern UI
"
```

### 提交 6: 用户授权界面
```bash
git add src/app/google-ads/authorize/page.tsx
git commit -m "feat(ui): add user Google Ads authorization page

User authorization page:
- Check authorization status
- Start OAuth authorization flow
- Handle authorization callback
- Display authorization status
- Redirect to ads management after authorization

Clean and intuitive user interface
"
```

### 提交 7: 管理组件
```bash
git add src/components/admin/
git commit -m "feat(ui): add Google Ads admin components

Reusable components:
- MCCConfigForm - MCC configuration form
  - Add/Edit MCC configuration
  - OAuth authorization button
  - Form validation

- UserMCCBinding - User binding form
  - Select MCC account
  - Enter Customer ID
  - Bind user action

Both components with proper error handling
"
```

### 提交 8: 配置文件
```bash
git add .env.google-ads.example
git commit -m "chore(config): add Google Ads environment variables template

Variables:
- GOOGLE_ADS_OAUTH_REDIRECT_URI
- GOOGLE_ADS_MCC_CALLBACK_URI
- GOOGLE_ADS_STATE_SECRET
- GOOGLE_ADS_API_VERSION
- GOOGLE_ADS_DEVELOPER_TOKEN

Template for environment configuration
"
```

### 提交 9: 测试
```bash
git add src/lib/__tests__/google-ads-mcc-service.test.ts test-api-endpoints.js
git commit -m "test: add Google Ads MCC service tests

Test coverage:
- Unit tests for google-ads-mcc-service (13 test cases)
- API endpoint tests (13 endpoints)
- State token validation
- Authorization flow
- Configuration change handling
- Error scenarios

Run tests:
- Unit: npm test -- google-ads-mcc-service.test.ts
- API: node test-api-endpoints.js
"
```

### 提交 10: 文档
```bash
git add *.md
git commit -m "docs: add Google Ads MCC documentation

Documentation:
- GOOGLE_ADS_MCC_GUIDE.md - Complete usage guide
- ADMIN_UI_GUIDE.md - Admin UI guide
- IMPLEMENTATION_SUMMARY.md - Implementation summary
- DEPLOYMENT_REPORT.md - Deployment checklist
- API_TEST_REPORT.md - API testing guide
- FINAL_DELIVERY_REPORT.md - Final delivery report

Comprehensive documentation for users and developers
"
```

### 提交 11: PR 模板
```bash
git add PULL_REQUEST_TEMPLATE.md
git commit -m "chore: add pull request template

Template includes:
- Overview and objectives
- Change summary
- Technical implementation
- Deployment steps
- Testing guide
- Security considerations
- Checklist

Standardizes PR process
"
```

## 🎯 一次性提交（可选）

如果希望一次性提交所有变更：

```bash
git add .
git commit -m "feat: implement Google Ads MCC unified authorization

Complete implementation of unified Google Ads authorization system:

Database:
- mcc_accounts table for MCC configuration
- user_mcc_bindings table for user-MCC relationships

Backend:
- GoogleAdsMCCService for authorization management
- 11 API endpoints (admin + user)
- State token validation
- Automatic token refresh

Frontend:
- MCC management page (/admin/google-ads-mcc)
- User binding page (/admin/users)
- User authorization page (/google-ads/authorize)
- Reusable components (MCCConfigForm, UserMCCBinding)

Features:
- Admin configures MCC once, all users share
- Users authorize once with OAuth
- Automatic re-authorization on config changes
- Multi-MCC support
- Secure token management

Testing:
- 13 unit tests for service layer
- API endpoint tests
- Deployment checklist script

Documentation:
- Complete usage guide
- Admin UI guide
- Deployment guide
- API testing guide

Files: 27 total
Lines: ~6130
Size: ~176KB
"
```

## 📋 提交后操作

### 1. 推送到远程仓库
```bash
git push origin main
# 或推送到新分支
git checkout -b feature/google-ads-mcc-auth
git push origin feature/google-ads-mcc-auth
```

### 2. 创建 Pull Request
- 访问 GitHub 仓库
- 点击 "New Pull Request"
- 选择分支：`feature/google-ads-mcc-auth` → `main`
- 使用 `PULL_REQUEST_TEMPLATE.md` 作为 PR 描述
- 请求 Review

### 3. Code Review 检查清单
- [ ] 代码风格一致
- [ ] 类型定义完整
- [ ] 错误处理完善
- [ ] 测试覆盖充分
- [ ] 文档完整清晰
- [ ] 安全性考虑周全

## 🔖 标签（可选）

创建版本标签：
```bash
git tag -a v1.0.0 -m "Google Ads MCC Unified Authorization v1.0.0

Features:
- MCC unified configuration
- User OAuth authorization
- Admin management UI
- Automatic token refresh
- Configuration change handling

Security:
- State token validation
- Role-based access control
- Encrypted token storage

Documentation:
- Complete usage guide
- API documentation
- Deployment guide
"
git push origin v1.0.0
```

---

**创建时间**: 2026-03-23  
**版本**: v1.0.0
