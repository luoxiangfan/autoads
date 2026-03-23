'use client';

/**
 * 用户 MCC 绑定组件
 * 用于管理员将用户绑定到 MCC 账号
 */

import { useState, useEffect } from 'react';

interface MCCAccount {
  id: number;
  mcc_customer_id: string;
  is_authorized: boolean;
}

interface User {
  id: number;
  username: string;
  email: string;
}

interface UserMCCBindingProps {
  userId?: number;
}

export function UserMCCBinding({ userId }: UserMCCBindingProps) {
  const [loading, setLoading] = useState(false);
  const [mccAccounts, setMccAccounts] = useState<MCCAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedMccId, setSelectedMccId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState(userId?.toString() || '');
  const [customerId, setCustomerId] = useState('');

  // 加载 MCC 账号列表
  useEffect(() => {
    loadMCCAccounts();
    if (!userId) {
      loadUsers();
    }
  }, [userId]);

  const loadMCCAccounts = async () => {
    try {
      const response = await fetch('/api/admin/google-ads-mcc');
      const data = await response.json();
      setMccAccounts(data.mccAccounts || []);
    } catch (error) {
      console.error('Failed to load MCC accounts:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/user-mcc-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          mccAccountId: selectedMccId,
          customerId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '绑定失败');
      }

      alert('用户绑定成功！用户需登录并完成 OAuth 授权。');
      
      // 清空表单
      setSelectedMccId('');
      setSelectedUserId('');
      setCustomerId('');
    } catch (error) {
      alert(error instanceof Error ? error.message : '绑定失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!userId && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            选择用户 *
          </label>
          <select
            required
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">请选择用户</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.username} ({user.email})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          选择 MCC 账号 *
        </label>
        <select
          required
          value={selectedMccId}
          onChange={(e) => setSelectedMccId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">请选择 MCC 账号</option>
          {mccAccounts.map(mcc => (
            <option key={mcc.id} value={mcc.id} disabled={!mcc.is_authorized}>
              {mcc.mcc_customer_id} {mcc.is_authorized ? '✓' : '(未授权)'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500">
          只有已授权的 MCC 账号可用于绑定
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Customer ID *
        </label>
        <input
          type="text"
          required
          pattern="\d{10}"
          title="Customer ID 必须是 10 位数字"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="1234567890"
        />
        <p className="mt-1 text-sm text-gray-500">
          用户要管理的具体 Google Ads 账户 ID（10 位数字）
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? '绑定中...' : '绑定用户'}
      </button>

      <div className="mt-4 p-4 bg-gray-50 rounded-md">
        <h4 className="text-sm font-medium text-gray-900 mb-2">绑定流程：</h4>
        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
          <li>选择要绑定的用户（或从用户页面进入）</li>
          <li>选择已授权的 MCC 账号</li>
          <li>填写用户要管理的 Customer ID</li>
          <li>点击"绑定用户"保存关联关系</li>
          <li>用户登录后点击"授权 Google Ads"完成 OAuth 授权</li>
          <li>授权完成后用户即可创建和管理广告系列</li>
        </ol>
      </div>
    </form>
  );
}
