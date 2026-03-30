/**
 * 数据库辅助函数
 * 提供 SQLite 和 PostgreSQL 兼容性支持
 */

import { getDatabase } from './db';

export type DatabaseType = 'sqlite' | 'postgres';

/**
 * 获取当前数据库类型
 */
export async function getDatabaseType(): Promise<DatabaseType> {
  const db = await getDatabase();
  return db.type as DatabaseType;
}

/**
 * 获取数据库特定的 NOW() 函数语法
 * SQLite: datetime('now')
 * PostgreSQL: NOW()
 */
export async function getNowFunction(): Promise<string> {
  const dbType = await getDatabaseType();
  return dbType === 'postgres' ? 'NOW()' : "datetime('now')";
}

/**
 * 获取数据库特定的 INTERVAL 语法
 * SQLite: datetime('now', '-X days')
 * PostgreSQL: NOW() - INTERVAL 'X days'
 */
export async function getIntervalSubtract(days: number, unit: 'days' | 'hours' | 'minutes' = 'days'): Promise<string> {
  const dbType = await getDatabaseType();
  if (dbType === 'postgres') {
    return `NOW() - INTERVAL '${days} ${unit}'`;
  }
  return `datetime('now', '-${days} ${unit}')`;
}

/**
 * 获取数据库特定的 JSON 字段访问语法
 * SQLite: json_extract(column, '$.field')
 * PostgreSQL: column->>'field'
 */
export async function getJsonExtractSql(column: string, field: string): Promise<string> {
  const dbType = await getDatabaseType();
  if (dbType === 'postgres') {
    return `${column}->>'${field}'`;
  }
  return `json_extract(${column}, '$.${field}')`;
}

/**
 * 获取数据库特定的 JSON 包含检查语法
 * SQLite: json_type(column, '$.field') IS NOT NULL
 * PostgreSQL: column ? 'field'
 */
export async function getJsonHasKeySql(column: string, field: string): Promise<string> {
  const dbType = await getDatabaseType();
  if (dbType === 'postgres') {
    return `${column} ? '${field}'`;
  }
  return `json_type(${column}, '$.${field}') IS NOT NULL`;
}

/**
 * 获取数据库特定的 LIMIT/OFFSET 语法（PostgreSQL 需要参数化）
 */
export function buildLimitOffsetSql(limit: number, offset: number, dbType: DatabaseType): string {
  if (dbType === 'postgres') {
    return `LIMIT $1 OFFSET $2`;
  }
  return `LIMIT ? OFFSET ?`;
}

/**
 * 规范化 SQL 中的日期时间函数
 * 自动替换 datetime('now') 为对应数据库的语法
 */
export async function normalizeDateTimeSql(sql: string): Promise<string> {
  const dbType = await getDatabaseType();
  
  if (dbType === 'postgres') {
    // SQLite -> PostgreSQL
    return sql
      .replace(/datetime\('now'\)/g, 'NOW()')
      .replace(/datetime\('now',\s*'(-?\d+)\s*(days?|hours?|minutes?|seconds?)'\)/g, (match, value, unit) => {
        return `NOW() - INTERVAL '${value} ${unit}'`;
      });
  }
  
  // SQLite 保持不变
  return sql;
}

/**
 * 获取数据库特定的自增主键返回值语法
 * SQLite: lastInsertRowid
 * PostgreSQL: RETURNING id
 */
export function getReturningIdSql(dbType: DatabaseType): string {
  if (dbType === 'postgres') {
    return 'RETURNING id';
  }
  return '';
}

/**
 * 构建插入 SQL（兼容两种数据库）
 */
export async function buildInsertSql(
  table: string,
  columns: string[],
  valuesCount: number
): Promise<string> {
  const dbType = await getDatabaseType();
  
  const columnList = columns.join(', ');
  const placeholders = [];
  
  for (let i = 0; i < valuesCount; i++) {
    const rowPlaceholders = [];
    for (let j = 0; j < columns.length; j++) {
      if (dbType === 'postgres') {
        // PostgreSQL 使用 $1, $2, $3...
        rowPlaceholders.push(`$${i * columns.length + j + 1}`);
      } else {
        // SQLite 使用 ?
        rowPlaceholders.push('?');
      }
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }
  
  const returning = getReturningIdSql(dbType);
  
  return `INSERT INTO ${table} (${columnList}) VALUES ${placeholders.join(', ')}${returning ? ' ' + returning : ''}`;
}

/**
 * 获取数据库特定的布尔值表示
 * SQLite: 0/1
 * PostgreSQL: FALSE/TRUE
 */
export function getBooleanValue(value: boolean, dbType?: DatabaseType): number | boolean {
  if (!dbType) {
    dbType = getDatabaseType() as DatabaseType;
  }
  
  if (dbType === 'postgres') {
    return value;
  }
  return value ? 1 : 0;
}

/**
 * 从数据库值转换布尔值
 */
export function fromDatabaseBoolean(value: any, dbType?: DatabaseType): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return value === 1 || value === true || value === '1' || value === 'true';
}
