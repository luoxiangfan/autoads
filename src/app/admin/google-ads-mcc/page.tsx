'use client';

/**
 * MCC 账号管理页面
 * 管理员在此管理所有 MCC 账号配置
 */

import { useState, useEffect } from 'react';
import { MCCConfigForm } from '@/components/admin/MCCConfigForm';
import { BatchImportUsers } from '@/components/admin/BatchImportUsers';

interface MCCAccount {
  id: number;
  mcc_customer_id: string;
  oauth_client_id: string;
  is_authorized: boolean;
  is_active: boolean;
  last_authorized_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface Binding {
  id: number;
  user_id: number;
  username?: string;
  email?: string;
  customer_id: string;
  is_authorized: boolean;
  needs_reauth: boolean;
  last_authorized_at?: string | null;
  bound_at: string;
}

export default function MCCManagementPage() {
  const [loading, setLoading] = useState(true);
  const [mccAccounts, setMccAccounts] = useState<MCCAccount[]>([]);
  const [selectedMcc, setSelectedMcc] = useState<MCCAccount | null>(null);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [showBindings, setShowBindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadMCCAccounts();
  }, []);

  const loadMCCAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/google-ads-mcc');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '加载失败');
      }
      
      setMccAccounts(data.mccAccounts || []);
    } catch (error) {
      console.error('Failed to load MCC accounts:', error);
      setError(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadBindings = async (mccId: number) => {
    try {
      const response = await fetch(`/api/admin/google-ads-mcc/${mccId}/bindings`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '加载失败');
      }
      
      setBindings(data.bindings || []);
      setShowBindings(true);
    } catch (error) {
      console.error('Failed to load bindings:', error);
      setError(error instanceof Error ? error.message : '加载绑定用户失败');
    }
  };

  const handleDelete = async (mccId: number, mccCustomerId: string) => {
    if (!confirm(`确定要删除 MCC 账号 ${mccCustomerId} 吗？此操作将解除所有用户绑定。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/google-ads-mcc/${mccId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '删除失败');
      }

      setSuccess('MCC 账号已删除');
      loadMCCAccounts();
      if (selectedMcc?.id === mccId) {
        setSelectedMcc(null);
        setShowBindings(false);
      }
    } catch (error) {
      console.error('Failed to delete MCC:', error);
      setError(error instanceof Error ? error.message : '删除失败');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Google Ads MCC 管理
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                管理 MCC 账号配置和用户绑定
              </p>
            </div>
            <a
              href="/admin"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← 返回管理后台
            </a>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 错误和成功提示 */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:text-red-700"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800">{success}</p>
              </div>
              <button
                onClick={() => setSuccess(null)}
                className="ml-auto text-green-500 hover:text-green-700"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左侧：MCC 列表 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  MCC 账号列表
                </h2>
              </div>

              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">加载中...</p>
                </div>
              ) : mccAccounts.length === 0 ? (
                <div className="p-6 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">暂无 MCC 账号</p>
                  <p className="mt-1 text-xs text-gray-500">点击右侧"新增 MCC 配置"创建</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {mccAccounts.map((mcc) => (
                    <li
                      key={mcc.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedMcc?.id === mcc.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedMcc(mcc);
                        loadBindings(mcc.id);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <span className="text-sm font-medium text-gray-900">
                              {mcc.mcc_customer_id}
                            </span>
                            {mcc.is_authorized ? (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                已授权
                              </span>
                            ) : (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                未授权
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {mcc.oauth_client_id}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            创建于 {new Date(mcc.created_at).toLocaleDateString('zh-CN')}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(mcc.id, mcc.mcc_customer_id);
                          }}
                          className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 右侧：配置表单和绑定用户 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 新增/编辑 MCC 配置 */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedMcc ? '编辑 MCC 配置' : '新增 MCC 配置'}
                </h2>
              </div>
              <div className="p-6">
                <MCCConfigForm
                  onSuccess={() => {
                    loadMCCAccounts();
                    setSuccess('配置已保存');
                  }}
                  existingMcc={selectedMcc}
                />
              </div>
            </div>

            {/* 绑定用户列表 */}
            {selectedMcc && showBindings && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      绑定用户列表
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                      MCC: {selectedMcc.mcc_customer_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <BatchImportUsers
                      mccAccountId={selectedMcc.id}
                      onSuccess={() => loadBindings(selectedMcc.id)}
                    />
                    <a
                      href={`/admin/users?mcc=${selectedMcc.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      + 绑定新用户
                    </a>
                  </div>
                </div>

                {bindings.length === 0 ? (
                  <div className="p-6 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">暂无绑定用户</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            用户
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            授权状态
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            绑定时间
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {bindings.map((binding) => (
                          <tr key={binding.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {binding.username || '用户 #' + binding.user_id}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {binding.email}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <code className="text-sm text-gray-600">
                                {binding.customer_id}
                              </code>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {binding.is_authorized ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  已授权
                                </span>
                              ) : binding.needs_reauth ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                  需要重新授权
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                  未授权
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(binding.bound_at).toLocaleDateString('zh-CN')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
