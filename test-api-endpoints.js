#!/usr/bin/env node

/**
 * Google Ads MCC API 端点测试脚本
 * 
 * 测试 API 端点的连通性和响应
 * 使用方法：node test-api-endpoints.js [base-url]
 * 默认：http://localhost:3000
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// 配置
const BASE_URL = process.argv[2] || 'http://localhost:3000';
const TEST_COOKIES = process.env.TEST_COOKIES || '';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

// 测试结果统计
let passed = 0;
let failed = 0;
let skipped = 0;

// HTTP 请求函数
function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (TEST_COOKIES) {
      options.headers['Cookie'] = TEST_COOKIES;
    }

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body ? JSON.parse(body) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: body,
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 测试函数
async function test(name, fn, skip = false) {
  try {
    if (skip) {
      log(colors.yellow, `⊘ ${name} (跳过)`);
      skipped++;
      return;
    }
    
    await fn();
    log(colors.green, `✓ ${name}`);
    passed++;
  } catch (error) {
    log(colors.red, `✗ ${name}`);
    log(colors.red, `  Error: ${error.message}`);
    failed++;
  }
}

// 断言函数
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertStatus(response, expected, message) {
  assert(
    response.status === expected,
    message || `Expected status ${expected}, got ${response.status}`
  );
}

function assertHasProperty(obj, prop, message) {
  assert(
    obj && (prop in obj),
    message || `Expected object to have property '${prop}'`
  );
}

// 主测试流程
async function runTests() {
  log(colors.cyan, '\n==========================================');
  log(colors.cyan, 'Google Ads MCC API 端点测试');
  log(colors.cyan, `Base URL: ${BASE_URL}`);
  log(colors.cyan, '==========================================\n');

  // 检查服务是否运行
  await test('检查服务是否运行', async () => {
    try {
      await request('GET', '/');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`服务未运行在 ${BASE_URL}`);
      }
      throw error;
    }
  });

  log(colors.blue, '\n--- 管理员 MCC 配置 API ---\n');

  // 测试 1: GET /api/admin/google-ads-mcc (需要认证)
  await test('GET /api/admin/google-ads-mcc (未认证)', async () => {
    const res = await request('GET', '/api/admin/google-ads-mcc');
    assertStatus(res, 403, '未认证应该返回 403');
  });

  // 测试 2: POST /api/admin/google-ads-mcc (缺少字段)
  await test('POST /api/admin/google-ads-mcc (缺少字段)', async () => {
    const res = await request('POST', '/api/admin/google-ads-mcc', {
      mccCustomerId: '1234567890',
      // 缺少其他必填字段
    });
    // 应该返回 400 或 403
    assert(
      res.status === 400 || res.status === 403,
      `应该返回 400 或 403，实际返回 ${res.status}`
    );
  });

  // 测试 3: POST /api/admin/google-ads-mcc (MCC ID 格式错误)
  await test('POST /api/admin/google-ads-mcc (MCC ID 格式错误)', async () => {
    const res = await request('POST', '/api/admin/google-ads-mcc', {
      mccCustomerId: 'invalid',
      oauthClientId: 'test.apps.googleusercontent.com',
      oauthClientSecret: 'secret',
      developerToken: 'token',
    });
    assert(
      res.status === 400 || res.status === 403,
      `应该返回 400 或 403，实际返回 ${res.status}`
    );
  });

  log(colors.blue, '\n--- 管理员 MCC OAuth API ---\n');

  // 测试 4: GET /api/admin/google-ads-mcc/1/authorize (未认证)
  await test('GET /api/admin/google-ads-mcc/1/authorize (未认证)', async () => {
    const res = await request('GET', '/api/admin/google-ads-mcc/1/authorize');
    assertStatus(res, 403, '未认证应该返回 403');
  });

  // 测试 5: GET /api/admin/google-ads-mcc/999/authorize (不存在的 MCC)
  await test('GET /api/admin/google-ads-mcc/999/authorize (需要认证)', async () => {
    const res = await request('GET', '/api/admin/google-ads-mcc/999/authorize');
    // 应该返回 403（未认证）或 404（未找到）
    assert(
      res.status === 403 || res.status === 404 || res.status === 500,
      `应该返回 403/404/500，实际返回 ${res.status}`
    );
  });

  log(colors.blue, '\n--- 用户绑定 API ---\n');

  // 测试 6: GET /api/admin/user-mcc-binding (未认证)
  await test('GET /api/admin/user-mcc-binding (未认证)', async () => {
    const res = await request('GET', '/api/admin/user-mcc-binding');
    assertStatus(res, 403, '未认证应该返回 403');
  });

  // 测试 7: POST /api/admin/user-mcc-binding (缺少字段)
  await test('POST /api/admin/user-mcc-binding (缺少字段)', async () => {
    const res = await request('POST', '/api/admin/user-mcc-binding', {
      userId: 1,
      // 缺少其他字段
    });
    assert(
      res.status === 400 || res.status === 403,
      `应该返回 400 或 403，实际返回 ${res.status}`
    );
  });

  // 测试 8: POST /api/admin/user-mcc-binding (Customer ID 格式错误)
  await test('POST /api/admin/user-mcc-binding (Customer ID 格式错误)', async () => {
    const res = await request('POST', '/api/admin/user-mcc-binding', {
      userId: 1,
      mccAccountId: 1,
      customerId: 'invalid',
    });
    assert(
      res.status === 400 || res.status === 403,
      `应该返回 400 或 403，实际返回 ${res.status}`
    );
  });

  log(colors.blue, '\n--- 用户 OAuth API ---\n');

  // 测试 9: GET /api/google-ads/oauth (未认证)
  await test('GET /api/google-ads/oauth (未认证)', async () => {
    const res = await request('GET', '/api/google-ads/oauth');
    assertStatus(res, 403, '未认证应该返回 403');
  });

  // 测试 10: GET /api/google-ads/oauth/callback (缺少参数)
  await test('GET /api/google-ads/oauth/callback (缺少参数)', async () => {
    const res = await request('GET', '/api/google-ads/oauth/callback');
    // 应该返回 400 或重定向
    assert(
      res.status === 400 || res.status === 302 || res.status === 403,
      `应该返回 400/302/403，实际返回 ${res.status}`
    );
  });

  // 测试 11: GET /api/google-ads/oauth/callback (有错误参数)
  await test('GET /api/google-ads/oauth/callback (错误参数)', async () => {
    const res = await request('GET', '/api/google-ads/oauth/callback?error=access_denied');
    // 应该重定向到错误页面
    assert(
      res.status === 302,
      `应该重定向，实际返回 ${res.status}`
    );
  });

  log(colors.blue, '\n--- MCC 绑定列表 API ---\n');

  // 测试 12: GET /api/admin/google-ads-mcc/1/bindings (未认证)
  await test('GET /api/admin/google-ads-mcc/1/bindings (未认证)', async () => {
    const res = await request('GET', '/api/admin/google-ads-mcc/1/bindings');
    assertStatus(res, 403, '未认证应该返回 403');
  });

  log(colors.cyan, '\n==========================================');
  log(colors.cyan, '测试结果汇总');
  log(colors.cyan, '==========================================\n');

  const total = passed + failed + skipped;
  console.log(`总测试数：${total}`);
  log(colors.green, `✓ 通过：${passed}`);
  log(colors.red, `✗ 失败：${failed}`);
  log(colors.yellow, `⊘ 跳过：${skipped}`);
  
  if (failed === 0) {
    log(colors.green, '\n🎉 所有测试通过！\n');
  } else {
    log(colors.red, `\n⚠️  有 ${failed} 个测试失败\n`);
  }

  log(colors.cyan, '==========================================\n');
}

// 运行测试
runTests().catch(error => {
  log(colors.red, '\n测试执行失败:');
  log(colors.red, error.message);
  process.exit(1);
});
