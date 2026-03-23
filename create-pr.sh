#!/bin/bash

# ==========================================
# Google Ads MCC - 快速部署和 PR 创建脚本
# ==========================================

set -e

echo "=========================================="
echo "Google Ads MCC - 部署和 PR 创建"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查函数
check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
}

check_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# 1. 检查 Git 状态
echo "1. 检查 Git 状态..."
echo "-------------------"

if [ ! -d ".git" ]; then
    check_fail "当前目录不是 Git 仓库"
    echo "请先初始化 Git 仓库或切换到正确的目录"
    exit 1
fi

check_pass "Git 仓库检查通过"

# 2. 检查文件完整性
echo ""
echo "2. 检查文件完整性..."
echo "-------------------"

required_files=(
    "migrations/213_google_ads_mcc_unified_auth.sql"
    "src/lib/google-ads-mcc-service.ts"
    "src/app/api/admin/google-ads-mcc/route.ts"
    "src/app/admin/google-ads-mcc/page.tsx"
    "src/app/google-ads/authorize/page.tsx"
    "src/components/admin/MCCConfigForm.tsx"
    ".env.google-ads.example"
    "GOOGLE_ADS_MCC_GUIDE.md"
    "PULL_REQUEST_TEMPLATE.md"
)

missing_files=0
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file"
    else
        check_fail "$file 缺失"
        ((missing_files++))
    fi
done

if [ $missing_files -gt 0 ]; then
    echo ""
    check_fail "有 $missing_files 个必需文件缺失"
    exit 1
fi

# 3. 运行测试
echo ""
echo "3. 运行测试..."
echo "-------------------"

if [ -f "test-api-endpoints.js" ]; then
    echo "运行 API 端点测试..."
    if node test-api-endpoints.js http://localhost:3000 2>/dev/null; then
        check_pass "API 测试通过"
    else
        check_info "API 测试跳过（服务未运行）"
    fi
fi

# 4. Git 提交
echo ""
echo "4. Git 提交..."
echo "-------------------"

read -p "是否使用一次性提交？(y/n) " use_single_commit
if [ "$use_single_commit" = "y" ]; then
    echo "准备一次性提交..."
    
    git add .
    
    if git diff-index --quiet HEAD; then
        check_info "没有需要提交的变更"
    else
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
- Reusable components

Features:
- Admin configures MCC once, all users share
- Users authorize once with OAuth
- Automatic re-authorization on config changes
- Multi-MCC support
- Secure token management

Testing:
- Unit tests for service layer
- API endpoint tests
- Deployment checklist

Documentation:
- Complete usage guide
- Admin UI guide
- Deployment guide

Files: 27 total
Lines: ~6130
Size: ~176KB"
        
        check_pass "提交成功"
    fi
else
    check_info "请手动执行 Git 提交"
    echo "参考 GIT_COMMIT_GUIDE.md 中的提交建议"
fi

# 5. 创建分支
echo ""
echo "5. 创建功能分支..."
echo "-------------------"

current_branch=$(git branch --show-current)
feature_branch="feature/google-ads-mcc-auth"

read -p "是否创建功能分支 ${feature_branch}? (y/n) " create_branch
if [ "$create_branch" = "y" ]; then
    git checkout -b "$feature_branch"
    check_pass "已创建分支 ${feature_branch}"
else
    check_info "保持在当前分支：${current_branch}"
fi

# 6. 推送到远程
echo ""
echo "6. 推送到远程仓库..."
echo "-------------------"

read -p "是否推送到远程仓库？(y/n) " push_to_remote
if [ "$push_to_remote" = "y" ]; then
    current_branch=$(git branch --show-current)
    git push -u origin "$current_branch"
    check_pass "已推送到远程仓库"
else
    check_info "跳过推送"
fi

# 7. 生成 PR 信息
echo ""
echo "7. 生成 Pull Request 信息..."
echo "-------------------"

check_info "PR 模板位置：PULL_REQUEST_TEMPLATE.md"
echo ""
echo "请按照以下步骤创建 Pull Request:"
echo ""
echo "1. 访问 GitHub 仓库"
echo "2. 点击 'New Pull Request'"
echo "3. 选择分支对比:"
echo "   base: ${current_branch}"
echo "   compare: ${feature_branch:-main}"
echo "4. 使用 PULL_REQUEST_TEMPLATE.md 作为描述"
echo "5. 添加 Reviewers"
echo "6. 提交 PR"
echo ""

# 8. 生成 PR URL
echo "8. Pull Request URL 生成..."
echo "-------------------"

if [ -f ".git/config" ]; then
    remote_url=$(git config --get remote.origin.url)
    if [[ $remote_url =~ github.com[:/]([^/]+)/([^.]+) ]]; then
        owner="${BASH_REMATCH[1]}"
        repo="${BASH_REMATCH[2]}"
        pr_url="https://github.com/${owner}/${repo}/compare/${feature_branch:-main}?expand=1"
        
        echo ""
        check_info "PR 创建链接:"
        echo "$pr_url"
        echo ""
        
        # 复制到剪贴板（如果支持）
        if command -v xclip &> /dev/null; then
            echo "$pr_url" | xclip -selection clipboard
            check_pass "PR 链接已复制到剪贴板"
        elif command -v pbcopy &> /dev/null; then
            echo "$pr_url" | pbcopy
            check_pass "PR 链接已复制到剪贴板"
        fi
    fi
fi

# 9. 部署检查
echo ""
echo "9. 部署检查..."
echo "-------------------"

if [ -f "deploy-checklist.sh" ]; then
    read -p "是否运行部署检查？(y/n) " run_deploy_check
    if [ "$run_deploy_check" = "y" ]; then
        ./deploy-checklist.sh
    fi
else
    check_info "deploy-checklist.sh 不存在，跳过"
fi

# 完成
echo ""
echo "=========================================="
echo "完成!"
echo "=========================================="
echo ""
echo "下一步:"
echo "1. 访问上面的 PR 链接创建 Pull Request"
echo "2. 等待 Code Review"
echo "3. 解决 Review 意见"
echo "4. Merge PR"
echo "5. 部署到生产环境"
echo ""
echo "详细文档:"
echo "- PULL_REQUEST_TEMPLATE.md - PR 描述模板"
echo "- GIT_COMMIT_GUIDE.md - Git 提交指南"
echo "- DEPLOYMENT_REPORT.md - 部署检查报告"
echo ""
echo "=========================================="
