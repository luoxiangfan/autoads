'use client';

/**
 * 批量导入用户组件
 * 用于管理员批量绑定用户到 MCC 账号
 */

import { useState } from 'react';

interface BatchImportProps {
  mccAccountId: number;
  onSuccess?: () => void;
}

interface UserRow {
  id: string;
  userId: string;
  customerId: string;
  error?: string;
}

export function BatchImportUsers({ mccAccountId, onSuccess }: BatchImportProps) {
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<Array<{ userId: number; success: boolean; error?: string }>>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parseUserInput = (text: string): UserRow[] => {
    const lines = text.split('\n').filter(line => line.trim());
    const users: UserRow[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const parts = line.split(/[\t,，\s]+/).filter(p => p.trim());
      
      if (parts.length >= 2) {
        users.push({
          id: `row-${i}`,
          userId: parts[0].trim(),
          customerId: parts[1].trim().replace(/-/g, ''),
        });
      }
    }

    return users;
  };

  const validateUsers = (users: UserRow[]): string[] => {
    const errors: string[] = [];
    
    users.forEach((user, idx) => {
      if (!/^\d+$/.test(user.userId)) {
        errors.push(`第 ${idx + 1} 行：User ID 必须是数字`);
      }
      if (!/^\d{10}$/.test(user.customerId)) {
        errors.push(`第 ${idx + 1} 行：Customer ID 必须是 10 位数字`);
      }
    });

    return errors;
  };

  const handleImport = async () => {
    const users = parseUserInput(inputText);
    
    if (users.length === 0) {
      setParseError('未检测到有效数据，请按格式输入');
      return;
    }

    const validationErrors = validateUsers(users);
    if (validationErrors.length > 0) {
      setParseError(validationErrors.join('\n'));
      return;
    }

    setParseError(null);
    setImporting(true);
    setResults([]);

    try {
      const response = await fetch('/api/admin/user-mcc-bindings/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mccAccountId,
          users: users.map(u => ({
            userId: parseInt(u.userId),
            customerId: u.customerId,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '导入失败');
      }

      setResults(data.results || []);
      
      if (data.successCount > 0) {
        onSuccess?.();
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const clearAll = () => {
    setInputText('');
    setResults([]);
    setParseError(null);
  };

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  return (
    <div className="space-y-4">
      {!showImport ? (
        <button
          onClick={() => setShowImport(true)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          📥 批量导入用户
        </button>
      ) : (
        <div className="border rounded-lg p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">批量导入用户</h3>
            <button
              onClick={() => {
                setShowImport(false);
                clearAll();
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ✕ 关闭
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              用户列表（每行一个用户）
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={`格式：User ID, Customer ID\n示例：\n123, 1234567890\n456, 0987654321`}
              disabled={importing}
            />
            <p className="mt-1 text-xs text-gray-500">
              支持 Tab、逗号、空格分隔。Customer ID 会自动移除连字符。
            </p>
          </div>

          {parseError && (
            <div className="mb-4 rounded-md bg-red-50 p-3">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-red-800 whitespace-pre-line">{parseError}</p>
                </div>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="mb-4">
              <div className={`rounded-md p-3 ${failedCount > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                <div className="flex items-center gap-2">
                  <svg className={`h-5 w-5 ${failedCount > 0 ? 'text-yellow-400' : 'text-green-400'}`} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <p className={`text-sm font-medium ${failedCount > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                    导入完成：成功 {successCount} 个，失败 {failedCount} 个
                  </p>
                </div>
              </div>

              {failedCount > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto">
                  <div className="text-xs font-medium text-gray-700 mb-1">失败详情：</div>
                  <ul className="space-y-1">
                    {results.filter(r => !r.success).map((r, idx) => (
                      <li key={idx} className="text-xs text-red-600">
                        User #{r.userId}: {r.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing || !inputText.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? '导入中...' : `导入 ${parseUserInput(inputText).length} 个用户`}
            </button>
            
            <button
              onClick={clearAll}
              disabled={importing}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              清空
            </button>
          </div>

          <div className="mt-4 p-3 bg-white rounded-md border">
            <h4 className="text-sm font-medium text-gray-900 mb-2">使用说明：</h4>
            <ol className="list-decimal list-inside space-y-1 text-xs text-gray-600">
              <li>从 Excel 或其他来源复制用户列表</li>
              <li>每行格式：User ID 分隔符 Customer ID</li>
              <li>分隔符支持：Tab、逗号、空格</li>
              <li>Customer ID 必须是 10 位数字（不含连字符）</li>
              <li>点击"导入"按钮执行批量绑定</li>
              <li>导入成功后，用户需完成 OAuth 授权</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
