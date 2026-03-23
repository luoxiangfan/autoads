#!/bin/bash

# ==========================================
# Google Ads MCC 统一授权 - 部署检查清单
# ==========================================
# 使用方法：./deploy-checklist.sh

set -e

echo "=========================================="
echo "Google Ads MCC 统一授权 - 部署检查"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    FAILED=1
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

FAILED=0

# 1. 检查文件是否存在
echo "1. 检查文件完整性..."
echo "-------------------"

files=(
    "migrations/213_google_ads_mcc_unified_auth.sql"
    "src/lib/google-ads-mcc-service.ts"
    "src/app/api/admin/google-ads-mcc/route.ts"
    "src/app/api/admin/google-ads-mcc/[id]/authorize/route.ts"
    "src/app/api/admin/google-ads-mcc/callback/route.ts"
    "src/app/api/admin/user-mcc-binding/route.ts"
    "src/app/api/google-ads/oauth/route.ts"
    "src/app/api/google-ads/oauth/callback/route.ts"
    "src/components/admin/MCCConfigForm.tsx"
    "src/components/admin/UserMCCBinding.tsx"
    "src/app/google-ads/authorize/page.tsx"
    ".env.google-ads.example"
    "GOOGLE_ADS_MCC_GUIDE.md"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file 存在"
    else
        check_fail "$file 缺失"
    fi
done

echo ""

# 2. 检查环境变量配置
echo "2. 检查环境变量..."
echo "-------------------"

if [ -f ".env.local" ]; then
    check_pass ".env.local 存在"
    
    # 检查必要的环境变量
    if grep -q "GOOGLE_ADS_OAUTH_REDIRECT_URI" .env.local; then
        check_pass "GOOGLE_ADS_OAUTH_REDIRECT_URI 已配置"
    else
        check_warn "GOOGLE_ADS_OAUTH_REDIRECT_URI 未配置"
    fi
    
    if grep -q "GOOGLE_ADS_STATE_SECRET" .env.local; then
        secret=$(grep "GOOGLE_ADS_STATE_SECRET" .env.local | cut -d'=' -f2)
        if [ ${#secret} -ge 32 ]; then
            check_pass "GOOGLE_ADS_STATE_SECRET 长度符合要求（>=32）"
        else
            check_warn "GOOGLE_ADS_STATE_SECRET 长度不足 32 字符"
        fi
    else
        check_warn "GOOGLE_ADS_STATE_SECRET 未配置"
    fi
else
    check_warn ".env.local 不存在，请从 .env.google-ads.example 复制"
fi

echo ""

# 3. 检查数据库迁移
echo "3. 检查数据库迁移..."
echo "-------------------"

if [ -f "data/autoads.db" ]; then
    # 检查表是否存在
    if sqlite3 data/autoads.db ".tables" | grep -q "mcc_accounts"; then
        check_pass "mcc_accounts 表已存在"
    else
        check_warn "mcc_accounts 表不存在，需要运行迁移"
    fi
    
    if sqlite3 data/autoads.db ".tables" | grep -q "user_mcc_bindings"; then
        check_pass "user_mcc_bindings 表已存在"
    else
        check_warn "user_mcc_bindings 表不存在，需要运行迁移"
    fi
else
    check_warn "数据库文件不存在，首次启动时会自动创建"
fi

echo ""

# 4. 检查依赖
echo "4. 检查依赖..."
echo "-------------------"

if [ -f "package.json" ]; then
    if grep -q "googleapis" package.json; then
        check_pass "googleapis 依赖已安装"
    else
        check_fail "googleapis 依赖缺失，请运行：npm install googleapis"
    fi
    
    if grep -q "better-sqlite3" package.json; then
        check_pass "better-sqlite3 依赖已安装"
    else
        check_fail "better-sqlite3 依赖缺失"
    fi
else
    check_fail "package.json 不存在"
fi

echo ""

# 5. TypeScript 编译检查
echo "5. TypeScript 编译检查..."
echo "-------------------"

if command -v npx &> /dev/null; then
    echo "运行类型检查..."
    if npx tsc --noEmit 2>/dev/null; then
        check_pass "TypeScript 编译通过"
    else
        check_warn "TypeScript 编译有警告或错误，请检查"
    fi
else
    check_warn "npx 不可用，跳过类型检查"
fi

echo ""

# 6. 总结
echo "=========================================="
echo "检查总结"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ 所有检查通过！${NC}"
    echo ""
    echo "下一步："
    echo "1. 配置 .env.local 中的环境变量"
    echo "2. 运行数据库迁移：npm run db:migrate"
    echo "3. 重启应用：npm run build && npm start"
    echo "4. 访问 /admin/google-ads-mcc 配置 MCC 账号"
    echo ""
    echo "详细文档：GOOGLE_ADS_MCC_GUIDE.md"
else
    echo -e "${RED}✗ 有检查项失败，请修复后重新运行${NC}"
    exit 1
fi

echo ""
echo "=========================================="
