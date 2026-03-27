'use client';

/**
 * 用户 MCC 账号选择器
 * 支持一个用户绑定多个 MCC，用户可在此切换
 */

import { useState, useEffect } from 'react';

interface MCCBinding {
  id: number;
  mccAccountId: number;
  mccCustomerId: string;
  customerId: string;
  isAuthorized: boolean;
  needsReauth: boolean;
  lastAuthorizedAt?: string | null;
  boundAt: string;
}

interface MCCSelectorProps {
  onMCCChange?: (mccAccountId: number, mccCustomerId: string) => void;
}

export function MCCSelector({ onMCCChange }: MCCSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [bindings, setBindings] = useState<MCCBinding[]>([]);
  const [selectedMCC, setSelectedMCC] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBindings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/user-mcc-bindings/my');
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '加载失败');
      }
      
      setBindings(result.bindings || []);
      
      // 默认选择第一个已授权的 MCC
      const authorizedMCC = result.bindings.find((b: MCCBinding) => b.isAuthorized);
      if (authorizedMCC) {
        setSelectedMCC(authorizedMCC.mccAccountId);
        onMCCChange?.(authorizedMCC.mccAccountId, authorizedMCC.mccCustomerId);
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBindings();
  }, []);

  const handleMCCChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mccAccountId = parseInt(e.target.value);
    const binding = bindings.find(b => b.mccAccountId === mccAccountId);
    
    if (binding) {
      setSelectedMCC(mccAccountId);
      onMCCChange?.(mccAccountId, binding.mccCustomerId);
      
      // 保存到 localStorage
      localStorage.setItem('selectedMCCAccountId', String(mccAccountId));
      localStorage.setItem('selectedMCCCustomerId', binding.mccCustomerId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span>加载 MCC 账号...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        加载失败：{error}
      </div>
    );
  }

  if (bindings.length === 0) {
    return (
      <div className="text-sm text-gray-600">
        暂无绑定的 MCC 账号
      </div>
    );
  }

  if (bindings.length === 1) {
    const binding = bindings[0];
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">当前 MCC:</span>
        <span className="font-mono font-medium text-gray-900">{binding.mccCustomerId}</span>
        {binding.isAuthorized ? (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            已授权
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            需要授权
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        选择 MCC 账号
      </label>
      <select
        value={selectedMCC || ''}
        onChange={handleMCCChange}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {bindings.map(binding => (
          <option key={binding.id} value={binding.mccAccountId}>
            {binding.mccCustomerId} {binding.isAuthorized ? '(已授权)' : '(未授权)'}
            {binding.needsReauth ? ' (需重新授权)' : ''}
          </option>
        ))}
      </select>
      
      {bindings.length > 1 && (
        <p className="text-xs text-gray-500">
          已绑定 {bindings.length} 个 MCC 账号，可在此切换
        </p>
      )}
    </div>
  );
}
