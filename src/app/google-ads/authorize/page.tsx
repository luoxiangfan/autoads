'use client';

/**
 * Google Ads 授权页面
 * 用户在此页面完成 OAuth 授权
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function GoogleAdsAuthorizePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [authStatus, setAuthStatus] = useState<{
    isAuthorized: boolean;
    needsReauth: boolean;
    customerId?: string;
    mccName?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/admin/user-mcc-binding');
      const data = await response.json();
      setAuthStatus(data);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setError('检查授权状态失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    setAuthorizing(true);
    try {
      const response = await fetch('/api/google-ads/oauth');
      const data = await response.json();
      
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Failed to start authorization:', error);
      setError('生成授权 URL 失败');
    } finally {
      setAuthorizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载授权状态...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              Google Ads 授权
            </h2>
          </div>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {authStatus?.isAuthorized ? (
            <div className="mt-6">
              <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-green-800">
                      已完成授权
                    </h3>
                    <div className="mt-2 text-sm text-green-700">
                      <p>您的 Google Ads 账户已授权成功</p>
                      {authStatus.mccName && (
                        <p className="mt-1">MCC 账号：{authStatus.mccName}</p>
                      )}
                      {authStatus.customerId && (
                        <p>Customer ID: {authStatus.customerId}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => router.push('/google-ads/campaigns')}
                className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                前往广告管理
              </button>
            </div>
          ) : authStatus?.needsReauth ? (
            <div className="mt-6">
              <div className="rounded-md bg-yellow-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-yellow-800">
                      需要授权
                    </h3>
                    <div className="mt-2 text-sm text-yellow-700">
                      <p>您需要完成 Google Ads OAuth 授权才能使用广告功能</p>
                      {authStatus.mccName && (
                        <p className="mt-1">MCC 账号：{authStatus.mccName}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleAuthorize}
                disabled={authorizing}
                className="mt-6 w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authorizing ? '生成授权链接...' : '开始授权'}
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      未绑定 MCC 账号
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>请联系管理员为您绑定 MCC 账号</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 border-t pt-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3">授权说明：</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
              <li>点击"开始授权"将跳转到 Google 授权页面</li>
              <li>使用您的 Google 账号登录（需有 MCC 访问权限）</li>
              <li>授予 AutoAds 访问 Google Ads 的权限</li>
              <li>授权完成后自动返回本平台</li>
              <li>之后即可创建和管理广告系列</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
