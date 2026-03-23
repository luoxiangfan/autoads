# API 端点测试报告

**测试时间**: 2026-03-23 11:27 GMT+8  
**测试目标**: Google Ads MCC 统一授权 API 端点  
**测试状态**: ⚠️ 服务未运行（需要部署到实际项目）

## 📊 测试结果

### 服务连通性测试

| 测试项 | 状态 | 说明 |
|--------|------|------|
| 服务运行检查 | ❌ 失败 | `localhost:3000` 无服务运行 |

### API 端点列表

以下是已实现的 API 端点，需要在实际项目中测试：

#### 管理员端点（需要认证）

| 端点 | 方法 | 权限 | 测试状态 |
|------|------|------|----------|
| `/api/admin/google-ads-mcc` | GET | 管理员 | ⏳ 待测试 |
| `/api/admin/google-ads-mcc` | POST | 管理员 | ⏳ 待测试 |
| `/api/admin/google-ads-mcc/[id]/authorize` | GET | 管理员 | ⏳ 待测试 |
| `/api/admin/google-ads-mcc/callback` | GET | 管理员 | ⏳ 待测试 |
| `/api/admin/google-ads-mcc/[id]/bindings` | GET | 管理员 | ⏳ 待测试 |
| `/api/admin/user-mcc-binding` | GET | 用户 | ⏳ 待测试 |
| `/api/admin/user-mcc-binding` | POST | 管理员 | ⏳ 待测试 |

#### 用户端点（需要认证）

| 端点 | 方法 | 权限 | 测试状态 |
|------|------|------|----------|
| `/api/google-ads/oauth` | GET | 用户 | ⏳ 待测试 |
| `/api/google-ads/oauth/callback` | GET | 用户 | ⏳ 待测试 |

## 🔧 测试脚本

已创建测试脚本：`test-api-endpoints.js`

### 使用方法

```bash
# 基本用法（测试 localhost:3000）
node test-api-endpoints.js

# 指定 baseURL
node test-api-endpoints.js http://your-domain.com

# 带认证 cookie 测试
TEST_COOKIES="session=xxx" node test-api-endpoints.js
```

### 测试覆盖

测试脚本验证以下内容：

1. **认证检查** - 未认证请求应返回 403
2. **参数验证** - 缺少/错误参数应返回 400
3. **响应格式** - 返回正确的 JSON 结构
4. **错误处理** - 适当的错误消息

## 📋 手动测试指南

### 1. 管理员 MCC 配置测试

```bash
# 创建 MCC 配置
curl -X POST http://localhost:3000/api/admin/google-ads-mcc \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_ADMIN_SESSION" \
  -d '{
    "mccCustomerId": "1234567890",
    "oauthClientId": "xxx.apps.googleusercontent.com",
    "oauthClientSecret": "secret",
    "developerToken": "token"
  }'

# 预期响应：
# {
#   "success": true,
#   "mccId": 1,
#   "message": "MCC 配置已保存，请进行 OAuth 授权"
# }
```

### 2. MCC OAuth 授权测试

```bash
# 生成 OAuth URL
curl http://localhost:3000/api/admin/google-ads-mcc/1/authorize \
  -H "Cookie: session=YOUR_ADMIN_SESSION"

# 预期响应：
# {
#   "authUrl": "https://accounts.google.com/..."
# }
```

### 3. 用户绑定测试

```bash
# 绑定用户到 MCC
curl -X POST http://localhost:3000/api/admin/user-mcc-binding \
  -H "Content-Type: application/json" \
  -H "Cookie: session=YOUR_ADMIN_SESSION" \
  -d '{
    "userId": 2,
    "mccAccountId": 1,
    "customerId": "9876543210"
  }'

# 预期响应：
# {
#   "success": true,
#   "bindingId": 1,
#   "message": "用户绑定成功，用户需完成 OAuth 授权"
# }
```

### 4. 用户授权状态测试

```bash
# 检查用户授权状态
curl http://localhost:3000/api/admin/user-mcc-binding \
  -H "Cookie: session=YOUR_USER_SESSION"

# 预期响应（未授权）：
# {
#   "isAuthorized": false,
#   "needsReauth": true,
#   "customerId": "9876543210",
#   "mccName": "1234567890"
# }
```

### 5. 用户 OAuth 授权测试

```bash
# 生成用户 OAuth URL
curl http://localhost:3000/api/google-ads/oauth \
  -H "Cookie: session=YOUR_USER_SESSION"

# 预期响应：
# {
#   "authUrl": "https://accounts.google.com/..."
# }
```

## 🧪 服务层单元测试

服务层单元测试已创建：`src/lib/__tests__/google-ads-mcc-service.test.ts`

### 测试覆盖

- ✅ MCC 配置保存
- ✅ MCC 列表获取
- ✅ State Token 生成和验证
- ✅ State Token 过期验证
- ✅ 用户绑定
- ✅ 授权状态检查
- ✅ MCC 绑定用户列表
- ✅ 用户重新绑定
- ✅ MCC 配置更新（敏感字段）
- ✅ MCC 配置删除
- ✅ Customer ID 格式验证
- ✅ 获取不存在的用户绑定
- ✅ 绑定到未授权的 MCC

### 运行单元测试

```bash
# 需要 TypeScript 环境和测试依赖
cd /path/to/autoads
npm test -- src/lib/__tests__/google-ads-mcc-service.test.ts
```

## ⚠️ 当前状态

**服务未运行原因**:
- 代码位于 `/home/admin/openclaw/workspace/autoads/`（工作目录）
- 需要集成到实际的 autoads 项目中
- 实际的 autoads 项目路径未知

## 📝 下一步

### 1. 部署到实际项目

```bash
# 复制代码到实际项目
cd /path/to/autoads

# 复制所有文件
cp -r /home/admin/openclaw/workspace/autoads/migrations/ ./
cp -r /home/admin/openclaw/workspace/autoads/src/lib/google-ads-mcc-service.ts ./src/lib/
cp -r /home/admin/openclaw/workspace/autoads/src/app/api/ ./src/app/api/
cp -r /home/admin/openclaw/workspace/autoads/src/components/admin/ ./src/components/admin/
cp -r /home/admin/openclaw/workspace/autoads/src/app/google-ads/ ./src/app/google-ads/
```

### 2. 安装依赖

```bash
npm install googleapis
```

### 3. 配置环境变量

```bash
cp .env.google-ads.example .env.local
vi .env.local
# 配置必要的环境变量
```

### 4. 运行数据库迁移

```bash
npm run db:migrate
```

### 5. 启动服务

```bash
npm run dev  # 开发环境
# 或
npm run build && npm start  # 生产环境
```

### 6. 运行测试

```bash
# API 端点测试
node test-api-endpoints.js http://localhost:3000

# 带认证测试
TEST_COOKIES="session=xxx" node test-api-endpoints.js
```

## 📊 测试检查清单

部署后，请验证以下功能：

### 管理员功能
- [ ] 创建 MCC 配置
- [ ] MCC OAuth 授权流程
- [ ] 查看 MCC 列表
- [ ] 绑定用户到 MCC
- [ ] 查看 MCC 绑定用户列表
- [ ] 修改 MCC 配置
- [ ] 删除 MCC 配置

### 用户功能
- [ ] 检查授权状态
- [ ] 用户 OAuth 授权流程
- [ ] 授权回调处理
- [ ] 授权后访问广告管理

### 配置变更
- [ ] MCC 配置修改后用户自动标记为需要重新授权
- [ ] 用户重新授权流程
- [ ] Token 自动刷新

### 安全测试
- [ ] 未认证请求返回 403
- [ ] 非管理员访问管理端点返回 403
- [ ] State Token 验证
- [ ] CSRF 保护

## 📞 问题反馈

如果测试中遇到问题，请检查：

1. **日志文件** - 查看 Next.js 服务器日志
2. **数据库** - 验证表结构和数据
3. **环境变量** - 确认配置正确
4. **权限** - 确认用户角色正确

**详细文档**: `GOOGLE_ADS_MCC_GUIDE.md`

---

**报告生成时间**: 2026-03-23 11:27 GMT+8  
**测试脚本**: `test-api-endpoints.js`  
**单元测试**: `src/lib/__tests__/google-ads-mcc-service.test.ts`
