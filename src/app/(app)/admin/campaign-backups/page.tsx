'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { showSuccess, showError, showConfirm } from '@/lib/toast-utils'

/**
 * 广告系列备份接口
 */
interface CampaignBackup {
  id: number
  campaignId: number | null
  userId: number
  offerId: number
  googleAdsAccountId: number | null
  campaignData: any
  campaignConfig: any | null
  backupType: 'auto_created' | 'sync_initial' | 'sync_7day' | 'manual'
  backupReason: string | null
  publishStatus: 'pending' | 'published' | 'failed' | 'skipped'
  publishedAt: string | null
  publishedCampaignId: number | null
  publishError: string | null
  createdAt: string
  updatedAt: string
}

interface BackupStats {
  total: number
  pending: number
  published: number
  failed: number
  skipped: number
  byType: Record<string, number>
}

export default function CampaignBackupsPage() {
  const router = useRouter()
  
  // State
  const [backups, setBackups] = useState<CampaignBackup[]>([])
  const [stats, setStats] = useState<BackupStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [selectedBackups, setSelectedBackups] = useState<Set<number>>(new Set())
  
  // 筛选条件
  const [filters, setFilters] = useState({
    backupType: '',
    publishStatus: '',
    offerId: '',
    googleAdsAccountId: ''
  })

  // 发布对话框
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [publishCustomerId, setPublishCustomerId] = useState('')
  const [pauseOldCampaigns, setPauseOldCampaigns] = useState(true)

  // 加载备份列表
  const loadBackups = async () => {
    try {
      setLoading(true)
      
      // 构建查询参数
      const params = new URLSearchParams()
      params.set('limit', '100')
      
      if (filters.backupType) params.set('backupType', filters.backupType)
      if (filters.publishStatus) params.set('publishStatus', filters.publishStatus)
      if (filters.offerId) params.set('offerId', filters.offerId)
      if (filters.googleAdsAccountId) params.set('googleAdsAccountId', filters.googleAdsAccountId)

      const response = await fetch(`/api/campaigns/backups?${params.toString()}`, {
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '加载失败')
      }

      setBackups(data.data.backups)
      setStats(data.data.stats)
    } catch (err: any) {
      console.error('加载备份列表失败:', err)
      showError('加载失败', err.message || '请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBackups()
  }, [filters])

  // 切换选择
  const toggleSelection = (backupId: number) => {
    const newSelected = new Set(selectedBackups)
    if (newSelected.has(backupId)) {
      newSelected.delete(backupId)
    } else {
      newSelected.add(backupId)
    }
    setSelectedBackups(newSelected)
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedBackups.size === backups.length) {
      setSelectedBackups(new Set())
    } else {
      setSelectedBackups(new Set(backups.map(b => b.id)))
    }
  }

  // 批量发布
  const handleBatchPublish = async () => {
    if (!publishCustomerId) {
      showError('参数错误', '请输入 Google Ads 账号 ID')
      return
    }

    try {
      setPublishing(true)

      const response = await fetch('/api/campaigns/backups/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          backupIds: Array.from(selectedBackups),
          googleAdsAccountId: parseInt(publishCustomerId),
          pauseOldCampaigns
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '发布失败')
      }

      const { queued, failed, results } = data.data
      
      showSuccess(
        '发布成功',
        `已提交 ${queued} 个发布任务，${failed} 个失败`
      )

      setShowPublishDialog(false)
      setSelectedBackups(new Set())
      setPublishCustomerId('')
      
      // 刷新列表
      await loadBackups()

    } catch (err: any) {
      console.error('批量发布失败:', err)
      showError('发布失败', err.message || '请稍后重试')
    } finally {
      setPublishing(false)
    }
  }

  // 打开发布对话框
  const openPublishDialog = () => {
    if (selectedBackups.size === 0) {
      showError('提示', '请至少选择一个备份')
      return
    }
    setShowPublishDialog(true)
  }

  // 格式化日期时间
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // 渲染备份类型标签
  const renderBackupTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      auto_created: 'bg-blue-100 text-blue-800',
      sync_initial: 'bg-purple-100 text-purple-800',
      sync_7day: 'bg-indigo-100 text-indigo-800',
      manual: 'bg-gray-100 text-gray-800',
    }
    const labels: Record<string, string> = {
      auto_created: '自动创建',
      sync_initial: '同步初始',
      sync_7day: '7 天备份',
      manual: '手动备份',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[type] || 'bg-gray-100 text-gray-800'}`}>
        {labels[type] || type}
      </span>
    )
  }

  // 渲染发布状态标签
  const renderPublishStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      skipped: 'bg-gray-100 text-gray-800',
    }
    const labels: Record<string, string> = {
      pending: '待发布',
      published: '已发布',
      failed: '失败',
      skipped: '跳过',
    }
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* 标题栏 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">广告系列备份管理</h1>
          <p className="mt-2 text-sm text-gray-600">
            批量选择备份并发布广告系列到 Google Ads
          </p>
        </div>

        {/* 统计卡片 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">总备份数</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{stats.total}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">待发布</div>
              <div className="mt-1 text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">已发布</div>
              <div className="mt-1 text-2xl font-bold text-green-600">{stats.published}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">失败</div>
              <div className="mt-1 text-2xl font-bold text-red-600">{stats.failed}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">跳过</div>
              <div className="mt-1 text-2xl font-bold text-gray-600">{stats.skipped}</div>
            </div>
          </div>
        )}

        {/* 筛选器 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                备份类型
              </label>
              <select
                value={filters.backupType}
                onChange={(e) => setFilters({ ...filters, backupType: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              >
                <option value="">全部</option>
                <option value="auto_created">自动创建</option>
                <option value="sync_initial">同步初始</option>
                <option value="sync_7day">7 天备份</option>
                <option value="manual">手动备份</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                发布状态
              </label>
              <select
                value={filters.publishStatus}
                onChange={(e) => setFilters({ ...filters, publishStatus: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              >
                <option value="">全部</option>
                <option value="pending">待发布</option>
                <option value="published">已发布</option>
                <option value="failed">失败</option>
                <option value="skipped">跳过</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Offer ID
              </label>
              <input
                type="number"
                value={filters.offerId}
                onChange={(e) => setFilters({ ...filters, offerId: e.target.value })}
                placeholder="筛选 Offer"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Ads 账号 ID
              </label>
              <input
                type="text"
                value={filters.googleAdsAccountId}
                onChange={(e) => setFilters({ ...filters, googleAdsAccountId: e.target.value })}
                placeholder="筛选账号"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              已选择 <span className="font-medium text-indigo-600">{selectedBackups.size}</span> 个备份
            </span>
          </div>
          <button
            onClick={openPublishDialog}
            disabled={selectedBackups.size === 0}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            批量发布
          </button>
        </div>

        {/* 备份列表 */}
        {loading ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
            <p className="mt-2 text-gray-600">加载中...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">暂无备份记录</p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedBackups.size === backups.length && backups.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    备份 ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Offer ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    备份类型
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    发布状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    发布时间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建时间
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedBackups.has(backup.id)}
                        onChange={() => toggleSelection(backup.id)}
                        disabled={backup.publishStatus === 'published'}
                        className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      #{backup.id}
                      {backup.campaignId && (
                        <div className="text-xs text-gray-500">
                          Campaign: #{backup.campaignId}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      #{backup.offerId}
                    </td>
                    <td className="px-6 py-4">
                      {renderBackupTypeBadge(backup.backupType)}
                      {backup.backupReason && (
                        <div className="text-xs text-gray-500 mt-1">
                          {backup.backupReason}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {renderPublishStatusBadge(backup.publishStatus)}
                      {backup.publishError && (
                        <div className="text-xs text-red-600 mt-1" title={backup.publishError}>
                          {backup.publishError}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDateTime(backup.publishedAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatDateTime(backup.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 发布对话框 */}
        {showPublishDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                批量发布广告系列
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    已选择备份数量
                  </label>
                  <div className="text-2xl font-bold text-indigo-600">
                    {selectedBackups.size} 个
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Google Ads 账号 ID (customerId)
                  </label>
                  <input
                    type="text"
                    value={publishCustomerId}
                    onChange={(e) => setPublishCustomerId(e.target.value)}
                    placeholder="例如：3178223819"
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    请输入 Google Ads 账号的 customer ID（不含连字符）
                  </p>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="pauseOldCampaigns"
                    checked={pauseOldCampaigns}
                    onChange={(e) => setPauseOldCampaigns(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                  <label htmlFor="pauseOldCampaigns" className="ml-2 text-sm text-gray-700">
                    暂停旧广告系列后再发布
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowPublishDialog(false)}
                  disabled={publishing}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleBatchPublish}
                  disabled={publishing || !publishCustomerId}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {publishing ? '发布中...' : '确认发布'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 说明信息 */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-blue-900 mb-3">使用说明</h3>
          <ul className="text-sm text-blue-700 space-y-2">
            <li>• <strong>自动创建备份</strong>：通过系统创建广告系列时自动备份</li>
            <li>• <strong>同步初始备份</strong>：从 Google Ads 同步广告系列时首次备份</li>
            <li>• <strong>7 天备份</strong>：同步后第 7 天自动创建备份（每天凌晨 3 点执行）</li>
            <li>• <strong>批量发布</strong>：选择多个备份，指定 Google Ads 账号批量发布</li>
            <li>• <strong>发布状态</strong>：待发布 → 已提交队列 → 发布成功/失败</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
