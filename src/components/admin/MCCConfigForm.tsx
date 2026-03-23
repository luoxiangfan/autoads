'use client';

/**
 * MCC 配置表单组件
 * 用于管理员配置和授权 MCC 账号
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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

interface MCCConfigFormProps {
  onSuccess?: () => void;
  existingMcc?: MCCAccount | null;
}

export function MCCConfigForm({ onSuccess, existingMcc }: MCCConfigFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [formData, setFormData] = useState({
    mccCustomerId: existingMcc?.mcc_customer_id || '',
    oauthClientId: existingMcc?.oauth_client_id || '',
    oauthClientSecret: '',
    developerToken: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/google-ads-mcc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '保存失败');
      }

      alert('MCC 配置已保存！请点击"启动 OAuth 授权"完成授权流程。');
      
      // 清空敏感字段
      setFormData(prev => ({
        ...prev,
        oauthClientSecret: '',
        developerToken: '',
      }));
      
      onSuccess?.();
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (existingMcc?.id) {
      setAuthorizing(true);
      try {
        const response = await fetch(`/api/admin/google-ads-mcc/${existingMcc.id}/authorize`);
        const data = await response.json();
        
        if (data.authUrl) {
          // 在新窗口打开授权页面
          window.open(data.authUrl, '_blank');
        }
      } catch (error) {
        alert('生成授权 URL 失败');
      } finally {
        setAuthorizing(false);
      }
    } else {
      alert('请先保存配置');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          disabled={!!existingMcc}
        />
        <p className="mt-1 text-sm text-gray-500">
          10 位数字的 MCC 账号 ID
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          OAuth Client ID *
        </label>
        <input
          type="text"
          required
          value={formData.oauthClientId}
          onChange={(e) => setFormData({ ...formData, oauthClientId: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="123456789-xxx.apps.googleusercontent.com"
        />
        <p className="mt-1 text-sm text-gray-500">
          在 Google Cloud Console 创建的 OAuth 2.0 Client ID
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          OAuth Client Secret *
        </label>
        <input
          type="password"
          required
          value={formData.oauthClientSecret}
          onChange={(e) => setFormData({ ...formData, oauthClientSecret: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="••••••••••••••••"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Developer Token *
        </label>
        <input
          type="password"
          required
          value={formData.developerToken}
          onChange={(e) => setFormData({ ...formData, developerToken: e.target.value })}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="••••••••••••••••"
        />
        <p className="mt-1 text-sm text-gray-500">
          Google Ads API Developer Token
        </p>
      </div>

      {existingMcc && (
        <div className="rounded-md bg-blue-50 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              {existingMcc.is_authorized ? (
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                {existingMcc.is_authorized 
                  ? `已授权 ${existingMcc.last_authorized_at ? new Date(existingMcc.last_authorized_at).toLocaleString('zh-CN') : ''}`
                  : '未授权，请点击"启动 OAuth 授权"'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '保存中...' : (existingMcc ? '更新配置' : '保存配置')}
        </button>
        
        <button
          type="button"
          onClick={handleAuthorize}
          disabled={authorizing || !existingMcc}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {authorizing ? '生成中...' : '启动 OAuth 授权'}
        </button>
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-md">
        <h4 className="text-sm font-medium text-gray-900 mb-2">配置说明：</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>填写 MCC 账号信息和 OAuth 凭证</li>
          <li>点击"保存配置"保存基本信息</li>
          <li>点击"启动 OAuth 授权"跳转到 Google 授权页面</li>
          <li>使用 MCC 账号登录并完成授权</li>
          <li>授权完成后返回，状态将更新为"已授权"</li>
        </ol>
      </div>
    </form>
  );
}
