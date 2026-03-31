'use client';

/**
 * 服务账号管理页面
 * 管理员在此配置和管理服务账号
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ServiceAccount {
  id: number;
  mccCustomerId: string;
  serviceAccountEmail: string;
  serviceAccountId: string;
  authType: string;
  isActive: boolean;
  configuredBy?: number;
  configuredByUsername?: string;
  configCount?: number;
  createdAt: string;
  updatedAt: string;
}

export default function ServiceAccountManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ServiceAccount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    mccCustomerId: '',
    serviceAccountEmail: '',
    serviceAccountId: '',
    serviceAccountKey: '',
  });

  useEffect(() => {
    loadServiceAccounts();
  }, []);

  const loadServiceAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/service-accounts');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '加载失败');
      }
      
      setServiceAccounts(data.serviceAccounts || []);
    } catch (error) {
      console.error('Failed to load service accounts:', error);
      setError(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/admin/service-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '保存失败');
      }

      setSuccess('服务账号配置成功！');
      setFormData({
        mccCustomerId: '',
        serviceAccountEmail: '',
        serviceAccountId: '',
        serviceAccountKey: '',
      });
      setShowForm(false);
      loadServiceAccounts();
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败');
    }
  };

  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`确定要删除服务账号 ${email} 吗？\n\n注意：删除后使用该服务账号的用户将无法继续访问。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/service-accounts/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || '删除失败');
      }

      setSuccess(data.message || '服务账号已删除');
      if (selectedAccount?.id === id) {
        setSelectedAccount(null);
      }
      loadServiceAccounts();
    } catch (error) {
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
                Google Ads 服务账号管理
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                管理员统一配置服务账号，用户选择使用
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
          {/* 左侧：服务账号列表 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  服务账号列表
                </h2>
                <button
                  onClick={() => {
                    setSelectedAccount(null);
                    setShowForm(true);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + 新增配置
                </button>
              </div>

              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">加载中...</p>
                </div>
              ) : serviceAccounts.length === 0 ? (
                <div className="p-6 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">暂无服务账号配置</p>
                  <p className="mt-1 text-xs text-gray-500">点击"新增配置"创建</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {serviceAccounts.map((account) => (
                    <li
                      key={account.id}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedAccount?.id === account.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedAccount(account);
                        setShowForm(false);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {account.serviceAccountEmail}
                            </span>
                            {account.isActive ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                活跃
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                未激活
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            MCC: {account.mccCustomerId}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            配置数：{account.configCount || 0}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(account.id, account.serviceAccountEmail);
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

          {/* 右侧：配置表单 */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {showForm ? '新增服务账号配置' : (selectedAccount ? '服务账号详情' : '选择服务账号')}
                </h2>
              </div>
              <div className="p-6">
                {showForm ? (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        MCC Customer ID *
                      </label>
                      <input
                        type="text"
                        required
                        pattern="\d{10}"
                        title="MCC Customer ID 必须是 10 位数字"
                        value={formData.mccCustomerId}
                        onChange={(e) => setFormData({ ...formData, mccCustomerId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="1234567890"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        10 位数字的 MCC 账号 ID
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        服务账号邮箱 *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.serviceAccountEmail}
                        onChange={(e) => setFormData({ ...formData, serviceAccountEmail: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="xxx@xxx.iam.gserviceaccount.com"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        Google Cloud 服务账号邮箱
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        服务账号 ID *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.serviceAccountId}
                        onChange={(e) => setFormData({ ...formData, serviceAccountId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="123456789012345678901"
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        服务账号唯一标识（21 位数字）
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        服务账号密钥（JSON）*
                      </label>
                      <textarea
                        required
                        value={formData.serviceAccountKey}
                        onChange={(e) => setFormData({ ...formData, serviceAccountKey: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                        rows={8}
                        placeholder={`{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "...@....iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "..."
}`}
                      />
                      <p className="mt-1 text-sm text-gray-500">
                        从 Google Cloud Console 下载的服务账号 JSON 密钥文件内容
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        保存配置
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForm(false);
                          setFormData({
                            mccCustomerId: '',
                            serviceAccountEmail: '',
                            serviceAccountId: '',
                            serviceAccountKey: '',
                          });
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                      >
                        取消
                      </button>
                    </div>

                    <div className="mt-6 p-4 bg-blue-50 rounded-md">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">配置说明：</h4>
                      <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
                        <li>在 Google Cloud Console 创建服务账号</li>
                        <li>为服务账号分配 Google Ads API 权限</li>
                        <li>下载 JSON 密钥文件</li>
                        <li>填写 MCC Customer ID（10 位数字）</li>
                        <li>复制 JSON 密钥内容到上方文本框</li>
                        <li>点击"保存配置"完成配置</li>
                      </ol>
                    </div>
                  </form>
                ) : selectedAccount ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          服务账号邮箱
                        </label>
                        <p className="mt-1 text-sm text-gray-900 font-mono">
                          {selectedAccount.serviceAccountEmail}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          服务账号 ID
                        </label>
                        <p className="mt-1 text-sm text-gray-900 font-mono">
                          {selectedAccount.serviceAccountId}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          MCC Customer ID
                        </label>
                        <p className="mt-1 text-sm text-gray-900 font-mono">
                          {selectedAccount.mccCustomerId}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          认证类型
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedAccount.authType === 'service_account' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              服务账号
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              OAuth
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          状态
                        </label>
                        <p className="mt-1 text-sm">
                          {selectedAccount.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              活跃
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              未激活
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-500">
                          配置历史
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedAccount.configCount || 0} 次配置
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            创建时间
                          </label>
                          <p className="mt-1 text-gray-900">
                            {new Date(selectedAccount.createdAt).toLocaleString('zh-CN')}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-500">
                            更新时间
                          </label>
                          <p className="mt-1 text-gray-900">
                            {new Date(selectedAccount.updatedAt).toLocaleString('zh-CN')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 flex gap-2">
                      <button
                        onClick={() => {
                          setFormData({
                            mccCustomerId: selectedAccount.mccCustomerId,
                            serviceAccountEmail: selectedAccount.serviceAccountEmail,
                            serviceAccountId: selectedAccount.serviceAccountId,
                            serviceAccountKey: '',
                          });
                          setShowForm(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        编辑配置
                      </button>
                      <button
                        onClick={() => setSelectedAccount(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                      >
                        返回列表
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">从左侧选择一个服务账号查看详情</p>
                    <p className="mt-1 text-xs text-gray-500">或点击"新增配置"创建新的配置</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">服务账号配置指南</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">1. 创建 Google Cloud 服务账号</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>访问 <a href="https://console.cloud.google.com" target="_blank" className="text-blue-600 hover:underline">Google Cloud Console</a></li>
                <li>选择或创建项目</li>
                <li>导航到"IAM 和管理" → "服务账号"</li>
                <li>点击"创建服务账号"</li>
                <li>填写服务账号名称和描述</li>
                <li>分配角色（需要 Google Ads API 权限）</li>
              </ol>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">2. 配置 Google Ads API 访问</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>在服务账号详情页面，点击"密钥"</li>
                <li>点击"添加密钥" → "创建新密钥"</li>
                <li>选择 JSON 格式并下载</li>
                <li>将服务账号添加到 Google Ads MCC</li>
                <li>在服务账号管理页面填写配置信息</li>
                <li>粘贴 JSON 密钥内容并保存</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
