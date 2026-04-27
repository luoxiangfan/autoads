#!/usr/bin/env node

/**
 * 测试脚本：验证 campaign_backups 表迁移
 * 
 * 使用方法:
 *   npm run ts-node scripts/test-campaign-backups-migration.ts
 */

import { getDatabase } from '../src/lib/db'

async function testMigration() {
  console.log('🧪 开始测试 campaign_backups 表迁移...\n')

  try {
    const db = await getDatabase()
    console.log(`✅ 数据库连接成功 (类型：${db.type})\n`)

    // 1. 检查表是否存在
    console.log('1️⃣ 检查 campaign_backups 表是否存在...')
    let tableExists = false
    
    if (db.type === 'sqlite') {
      const result = await db.queryOne(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='campaign_backups'
      `)
      tableExists = !!result
    } else {
      const result = await db.queryOne(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'campaign_backups'
      `)
      tableExists = !!result
    }

    if (tableExists) {
      console.log('✅ campaign_backups 表存在\n')
    } else {
      console.log('❌ campaign_backups 表不存在！\n')
      console.log('💡 请先运行数据库迁移:\n')
      if (db.type === 'sqlite') {
        console.log('   sqlite3 data/autoads.db < migrations/009_add_campaign_backups_table.sqlite.sql\n')
      } else {
        console.log('   psql $DATABASE_URL < pg-migrations/009_add_campaign_backups_table.pg.sql\n')
      }
      return
    }

    // 2. 检查表结构
    console.log('2️⃣ 检查表结构...')
    const columns = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'campaign_backups'
      ORDER BY ordinal_position
    `)

    if (columns && columns.length > 0) {
      console.log(`✅ 表包含 ${columns.length} 个字段:\n`)
      console.log('   字段名 | 类型 | 是否可空')
      console.log('   ' + '-'.repeat(60))
      for (const col of columns) {
        console.log(`   ${String(col.column_name).padEnd(25)} | ${String(col.data_type).padEnd(20)} | ${col.is_nullable}`)
      }
      console.log('')
    } else {
      // SQLite 兼容性查询
      const sqliteCols = await db.query(`PRAGMA table_info(campaign_backups)`)
      if (sqliteCols && sqliteCols.length > 0) {
        console.log(`✅ 表包含 ${sqliteCols.length} 个字段:\n`)
        console.log('   字段名 | 类型 | 是否可空')
        console.log('   ' + '-'.repeat(60))
        for (const col of sqliteCols as any[]) {
          console.log(`   ${String(col.name).padEnd(25)} | ${String(col.type).padEnd(20)} | ${col.notnull ? 'NO' : 'YES'}`)
        }
        console.log('')
      }
    }

    // 3. 检查索引
    console.log('3️⃣ 检查索引...')
    let indexes: any[] = []
    
    if (db.type === 'sqlite') {
      indexes = await db.query(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND tbl_name='campaign_backups'
      `)
    } else {
      indexes = await db.query(`
        SELECT indexname FROM pg_indexes 
        WHERE tablename = 'campaign_backups'
      `)
    }

    if (indexes && indexes.length > 0) {
      console.log(`✅ 找到 ${indexes.length} 个索引:`)
      for (const idx of indexes) {
        const indexName = idx.name || idx.indexname
        if (!indexName.includes('_pkey')) {  // 跳过主键索引
          console.log(`   - ${indexName}`)
        }
      }
      console.log('')
    }

    // 4. 插入测试数据
    console.log('4️⃣ 测试插入备份记录...')
    const now = new Date().toISOString()
    const testBackup = {
      campaignId: 1,
      userId: 1,
      offerId: 1,
      googleAdsAccountId: 1234567890,
      campaignData: JSON.stringify({ test: 'data' }),
      campaignConfig: JSON.stringify({ budget: 100 }),
      backupType: 'manual',
      backupReason: '测试备份',
      publishStatus: 'pending'
    }

    try {
      const insertSql = db.type === 'postgres' ? `
        INSERT INTO campaign_backups (
          campaign_id, user_id, offer_id, google_ads_account_id,
          campaign_data, campaign_config, backup_type, backup_reason,
          publish_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id
      ` : `
        INSERT INTO campaign_backups (
          campaign_id, user_id, offer_id, google_ads_account_id,
          campaign_data, campaign_config, backup_type, backup_reason,
          publish_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `

      const params = db.type === 'postgres' ? [
        testBackup.campaignId,
        testBackup.userId,
        testBackup.offerId,
        testBackup.googleAdsAccountId,
        testBackup.campaignData,
        testBackup.campaignConfig,
        testBackup.backupType,
        testBackup.backupReason,
        testBackup.publishStatus
      ] : [
        testBackup.campaignId,
        testBackup.userId,
        testBackup.offerId,
        testBackup.googleAdsAccountId,
        testBackup.campaignData,
        testBackup.campaignConfig,
        testBackup.backupType,
        testBackup.backupReason,
        testBackup.publishStatus
      ]

      const result = await db.exec(insertSql, params)
      
      // 获取插入的 ID
      let insertedId: number
      if (db.type === 'postgres') {
        insertedId = (result as any)[0]?.id
      } else {
        insertedId = (result as any).lastInsertRowid
      }

      if (insertedId) {
        console.log(`✅ 测试数据插入成功 (ID: ${insertedId})\n`)

        // 5. 查询测试数据
        console.log('5️⃣ 查询测试数据...')
        const selectSql = db.type === 'postgres' ? `
          SELECT * FROM campaign_backups WHERE id = $1
        ` : `
          SELECT * FROM campaign_backups WHERE id = ?
        `

        const backup = await db.queryOne(selectSql, [insertedId]) as any
        
        if (backup) {
          console.log('✅ 查询成功:\n')
          console.log(`   ID: ${backup.id}`)
          console.log(`   Campaign ID: ${backup.campaign_id}`)
          console.log(`   User ID: ${backup.user_id}`)
          console.log(`   Offer ID: ${backup.offer_id}`)
          console.log(`   Backup Type: ${backup.backup_type}`)
          console.log(`   Publish Status: ${backup.publish_status}`)
          console.log(`   Created At: ${backup.created_at}`)
          console.log('')

          // 6. 清理测试数据
          console.log('6️⃣ 清理测试数据...')
          const deleteSql = db.type === 'postgres' ? `
            DELETE FROM campaign_backups WHERE id = $1
          ` : `
            DELETE FROM campaign_backups WHERE id = ?
          `

          await db.exec(deleteSql, [insertedId])
          console.log('✅ 测试数据已删除\n')
        } else {
          console.log('❌ 查询失败\n')
        }
      } else {
        console.log('❌ 无法获取插入的 ID\n')
      }

    } catch (insertError: any) {
      console.log('❌ 插入测试数据失败:', insertError.message)
      console.log('')
    }

    // 7. 测试工具函数
    console.log('7️⃣ 测试工具函数...')
    try {
      const { getCampaignBackups, getBackupStats } = await import('../src/lib/campaign-backup')
      
      // 测试获取统计（假设用户 ID=1）
      const stats = await getBackupStats(1)
      console.log('✅ getBackupStats 调用成功:')
      console.log(`   总备份数：${stats.total}`)
      console.log(`   待发布：${stats.pending}`)
      console.log(`   已发布：${stats.published}`)
      console.log(`   失败：${stats.failed}`)
      console.log('')
      
    } catch (funcError: any) {
      console.log('⚠️ 工具函数测试失败（可能是正常的，如果没有测试数据）:', funcError.message)
      console.log('')
    }

    console.log('🎉 测试完成！\n')

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 运行测试
testMigration()
  .then(() => {
    console.log('✅ 所有测试完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 测试过程发生未捕获错误:', error)
    process.exit(1)
  })
