'use client';

/**
 * MCC 授权状态监控面板
 * 显示所有 MCC 账号的授权状态、Token 过期情况、用户绑定统计
 */

import { useState, useEffect } from 'react';

interface MCCStat {
  id: number;
  mccCustomerId: string;
  oauthClientId: string;
  isAuthorized: boolean;
  isActive: boolean;
  lastAuthorizedAt?: string | null;
  tokenExpiresAt?: string | null;
  tokenStatus: 'valid' | 'expiring_soon' | 'expired';
  hoursUntilExpiry: number | null;
  totalBindings: number;
  authorizedBindings: number;
  needsReauthBindings: number;
  pendingBindings: number;
  authorizationRate: number;
}

interface MonitoringData {
  summary: {
    totalMccCount: number;
    authorizedMccCount: number;
    unauthorizedMccCount: number;
    totalBindings: number;
    totalAuthorizedBindings: number;
    totalNeedsReauth: number;
    expiringTokens: number;
    expiredTokens: number;
    overallAuthorizationRate: number;
  };
  mccStats: MCCStat[];
  mccByStatus: {
    all: MCCStat[];
    authorized: MCCStat[];
    unauthorized: MCCStat[];
    expiringTokens: MCCStat[];
    expiredTokens: MCCStat[];
    lowAuthorizationRate: MCCStat[];
  };
}

interface MonitoringPanelProps {
  onRefresh?: () => void;
}

export function MonitoringPanel({ onRefresh }: MonitoringPanelProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'issues' | 'details'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/google-ads-mcc/monitoring');
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '加载失败');
      }
      
      setData(result);
      onRefresh?.();
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshTokens = async () => {
    if (!confirm('确定要刷新所有即将过期的 Token 吗？\n\n系统将自动刷新 24 小时内过期的 Token。')) {
      return;
    }

    try {
      setRefreshing(true);
      const response = await fetch('/api/admin/google-ads-mcc/refresh-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiryThresholdHours: 24,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '刷新失败');
      }

      alert(`Token 刷新完成！\n\n成功：${result.result.successCount} 个\n失败：${result.result.failedCount} 个`);
      
      // 刷新监控数据
      await loadData();
    } catch (err: any) {
      alert(`Token 刷新失败：${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusColor = (stat: MCCStat) => {
    if (!stat.isAuthorized) return 'bg-red-100 text-red-800';
    if (stat.tokenStatus === 'expired') return 'bg-red-100 text-red-800';
    if (stat.tokenStatus === 'expiring_soon') return 'bg-yellow-100 text-yellow-800';
    if (stat.authorizationRate < 50) return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  };

  const getTokenStatusText = (stat: MCCStat) => {
    if (!stat.isAuthorized) return '未授权';
    if (stat.tokenStatus === 'expired') return 'Token 已过期';
    if (stat.tokenStatus === 'expiring_soon') return `即将过期 (${stat.hoursUntilExpiry}小时)`;
    return '正常';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">加载监控数据...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={loadData} className="ml-auto text-red-500 hover:text-red-700">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, mccStats, mccByStatus } = data;

  return (
    <div className="space-y-6">
      {/* 总体统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard
          label="MCC 总数"
          value={summary.totalMccCount}
          icon="🏢"
          color="blue"
        />
        <StatCard
          label="已授权"
          value={summary.authorizedMccCount}
          icon="✅"
          color="green"
        />
        <StatCard
          label="未授权"
          value={summary.unauthorizedMccCount}
          icon="❌"
          color="red"
        />
        <StatCard
          label="总绑定用户"
          value={summary.totalBindings}
          icon="👥"
          color="purple"
        />
        <StatCard
          label="已授权用户"
          value={summary.totalAuthorizedBindings}
          icon="✓"
          color="green"
        />
        <StatCard
          label="需重新授权"
          value={summary.totalNeedsReauth}
          icon="⚠️"
          color="yellow"
        />
        <StatCard
          label="Token 即将过期"
          value={summary.expiringTokens}
          icon="⏰"
          color="orange"
        />
        <StatCard
          label="Token 已过期"
          value={summary.expiredTokens}
          icon="🔴"
          color="red"
        />
      </div>

      {/* 总体授权率进度条 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">总体授权率</h3>
          <span className="text-sm font-bold text-gray-900">{summary.overallAuthorizationRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              summary.overallAuthorizationRate >= 80 ? 'bg-green-500' :
              summary.overallAuthorizationRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${summary.overallAuthorizationRate}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {summary.totalAuthorizedBindings} / {summary.totalBindings} 用户已完成授权
        </p>
      </div>

      {/* 选项卡 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4">
          <TabButton
            active={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            label={`全部 (${mccStats.length})`}
          />
          <TabButton
            active={activeTab === 'issues'}
            onClick={() => setActiveTab('issues')}
            label={`问题 (${mccByStatus.expiredTokens.length + mccByStatus.expiringTokens.length + mccByStatus.lowAuthorizationRate.length})`}
            hasIssues={mccByStatus.expiredTokens.length + mccByStatus.expiringTokens.length + mccByStatus.lowAuthorizationRate.length > 0}
          />
          <TabButton
            active={activeTab === 'details'}
            onClick={() => setActiveTab('details')}
            label="详情"
          />
        </nav>
      </div>

      {/* MCC 列表 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700">
            {activeTab === 'all' && '所有 MCC 账号'}
            {activeTab === 'issues' && '需要关注的 MCC 账号'}
            {activeTab === 'details' && '详细信息'}
          </h3>
        </div>

        <div className="divide-y divide-gray-200">
          {(activeTab === 'all' ? mccStats :
            activeTab === 'issues' ? 
              [...mccByStatus.expiredTokens, ...mccByStatus.expiringTokens, ...mccByStatus.lowAuthorizationRate] :
              mccStats
          ).map((stat) => (
            <div key={stat.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {stat.mccCustomerId}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(stat)}`}>
                      {getTokenStatusText(stat)}
                    </span>
                    {stat.isActive && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        活跃
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600 mt-2">
                    <div>
                      <span className="text-gray-500">绑定用户:</span>{' '}
                      <span className="font-medium">{stat.totalBindings}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">已授权:</span>{' '}
                      <span className="font-medium text-green-600">{stat.authorizedBindings}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">待授权:</span>{' '}
                      <span className="font-medium text-orange-600">{stat.pendingBindings}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">授权率:</span>{' '}
                      <span className={`font-medium ${
                        stat.authorizationRate >= 80 ? 'text-green-600' :
                        stat.authorizationRate >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {stat.authorizationRate}%
                      </span>
                    </div>
                  </div>

                  {stat.needsReauthBindings > 0 && (
                    <div className="mt-2 text-xs text-yellow-600">
                      ⚠️ {stat.needsReauthBindings} 个用户需要重新授权
                    </div>
                  )}

                  {stat.tokenExpiresAt && (
                    <div className="mt-1 text-xs text-gray-500">
                      Token 过期时间：{new Date(stat.tokenExpiresAt).toLocaleString('zh-CN')}
                    </div>
                  )}

                  {stat.lastAuthorizedAt && (
                    <div className="mt-1 text-xs text-gray-500">
                      最后授权：{new Date(stat.lastAuthorizedAt).toLocaleString('zh-CN')}
                    </div>
                  )}
                </div>

                <div className="ml-4">
                  <a
                    href={`/admin/google-ads-mcc`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                    onClick={(e) => {
                      e.preventDefault();
                      // 可以通过 URL hash 或 state 传递选中的 MCC
                      window.location.href = '/admin/google-ads-mcc';
                    }}
                  >
                    管理 →
                  </a>
                </div>
              </div>

              {/* 授权率进度条 */}
              <div className="mt-3">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      stat.authorizationRate >= 80 ? 'bg-green-500' :
                      stat.authorizationRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${stat.authorizationRate}%` }}
                  />
                </div>
              </div>
            </div>
          ))}

          {(activeTab === 'all' ? mccStats :
            activeTab === 'issues' ? 
              [...mccByStatus.expiredTokens, ...mccByStatus.expiringTokens, ...mccByStatus.lowAuthorizationRate] :
              mccStats
          ).length === 0 && (
            <div className="p-8 text-center text-gray-500">
              暂无数据
            </div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-between items-center">
        <button
          onClick={handleRefreshTokens}
          disabled={refreshing}
          className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
        >
          {refreshing ? '🔄 刷新中...' : '⚡ 刷新即将过期的 Token'}
        </button>
        <button
          onClick={loadData}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          🔄 刷新数据
        </button>
      </div>
    </div>
  );
}

// 统计卡片组件
function StatCard({ 
  label, 
  value, 
  icon, 
  color 
}: { 
  label: string; 
  value: number; 
  icon: string;
  color: 'blue' | 'green' | 'red' | 'yellow' | 'orange' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className="text-2xl font-bold">{value}</span>
      </div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}

// 选项卡按钮组件
function TabButton({ 
  active, 
  onClick, 
  label,
  hasIssues 
}: { 
  active: boolean; 
  onClick: () => void; 
  label: string;
  hasIssues?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        py-2 px-1 border-b-2 font-medium text-sm transition-colors
        ${active 
          ? 'border-blue-500 text-blue-600' 
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
        }
      `}
    >
      {label}
      {hasIssues && (
        <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
          !
        </span>
      )}
    </button>
  );
}
