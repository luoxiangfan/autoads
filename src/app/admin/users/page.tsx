'use client';

/**
 * 用户管理页面
 * 管理员在此绑定用户到 MCC 账号
 */

import { useState, useEffect } from 'react';
import { UserMCCBinding } from '@/components/admin/UserMCCBinding';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  created_at: string;
}

interface MCCAccount {
  id: number;
  mcc_customer_id: string;
  is_authorized: boolean;
}

interface UserBinding {
  id: number;
  user_id: number;
  username?: string;
  email?: string;
  mcc_customer_id: string;
  customer_id: string;
  is_authorized: boolean;
  needs_reauth: boolean;
  bound_at: string;
}

export default function UserManagementPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [bindings, setBindings] = useState<UserBinding[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userBindings, setUserBindings] = useState<UserBinding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
    loadAllBindings();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '加载失败');
      }
      
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      // 非致命错误，继续执行
    } finally {
      setLoading(false);
    }
  };

  const loadAllBindings = async () => {
    try {
      const response = await fetch('/api/admin/user-mcc-bindings');
      const data = await response.json();
      
      if (response.ok) {
        setBindings(data.bindings || []);
      }
    } catch (error) {
      console.error('Failed to load all bindings:', error);
    }
  };

  const loadUserBinding = async (userId: number) => {
    try {
      const response = await fetch(`/api/admin/user-mcc-binding?userId=${userId}`);
      const data = await response.json();
      
      if (response.ok) {
        setUserBindings(data.binding);
      } else {
        setUserBindings(null);
      }
    } catch (error) {
      console.error('Failed to load user binding:', error);
      setUserBindings(null);
    }
  };

  const handleUnbind = async (userId: number) => {
    if (!confirm('确定要解除该用户的 MCC 绑定吗？用户需要重新授权。')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/user-mcc-binding/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '解绑失败');
      }

      setSuccess('用户绑定已解除');
      loadAllBindings();
      if (selectedUser?.id === userId) {
        loadUserBinding(userId);
      }
    } catch (error) {
      console.error('Failed to unbind user:', error);
      setError(error instanceof Error ? error.message : '解绑失败');
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
                用户 MCC 绑定管理
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                管理用户与 MCC 账号的绑定关系
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
          {/* 左侧：用户列表 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  用户列表
                </h2>
              </div>

              {loading ? (
                <div className="p-6 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-600">加载中...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="p-6 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">暂无用户</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
                  {users.map((user) => {
                    const binding = bindings.find(b => b.user_id === user.id);
                    return (
                      <li
                        key={user.id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                          selectedUser?.id === user.id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => {
                          setSelectedUser(user);
                          loadUserBinding(user.id);
                        }}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {user.username}
                            </span>
                            {binding ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                已绑定
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                未绑定
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {user.email}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            角色：{user.role === 'admin' ? '管理员' : '用户'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 右侧：绑定表单和详情 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 绑定表单 */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {selectedUser ? `绑定用户：${selectedUser.username}` : '选择用户'}
                </h2>
              </div>
              <div className="p-6">
                {selectedUser ? (
                  <UserMCCBinding
                    userId={selectedUser.id}
                    onSuccess={() => {
                      setSuccess('用户绑定成功');
                      loadAllBindings();
                      loadUserBinding(selectedUser.id);
                    }}
                  />
                ) : (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-600">请从左侧选择要绑定的用户</p>
                  </div>
                )}
              </div>
            </div>

            {/* 绑定详情 */}
            {selectedUser && userBindings && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">
                    绑定详情
                  </h2>
                  <button
                    onClick={() => handleUnbind(selectedUser.id)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    解除绑定
                  </button>
                </div>
                <div className="p-6">
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">用户</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {userBindings.username || '用户 #' + userBindings.user_id}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm font-medium text-gray-500">邮箱</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {userBindings.email || '-'}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm font-medium text-gray-500">MCC 账号</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {userBindings.mcc_customer_id}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm font-medium text-gray-500">Customer ID</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        <code>{userBindings.customer_id}</code>
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm font-medium text-gray-500">授权状态</dt>
                      <dd className="mt-1">
                        {userBindings.is_authorized ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            已授权
                          </span>
                        ) : userBindings.needs_reauth ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            需要重新授权
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            未授权
                          </span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-sm font-medium text-gray-500">绑定时间</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(userBindings.bound_at).toLocaleString('zh-CN')}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
