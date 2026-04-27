-- =====================================================
-- 广告系列备份表 - 用于支持批量发布功能
-- 创建时间：2026-04-27
-- 描述：存储广告系列的备份数据，支持批量选择和发布
-- =====================================================

-- 创建 campaign_backups 表
CREATE TABLE IF NOT EXISTS campaign_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,           -- campaigns 表的 ID（如果是 Google Ads 同步的）
  user_id INTEGER NOT NULL,               -- 用户 ID
  offer_id INTEGER NOT NULL,              -- Offer ID
  google_ads_account_id INTEGER,          -- Google Ads 账号 ID
  
  -- 备份数据
  campaign_data TEXT NOT NULL,            -- JSON 格式的完整 campaign 数据
  campaign_config TEXT,                   -- campaign_config JSON
  
  -- 备份元数据
  backup_type TEXT NOT NULL,              -- auto_created | sync_initial | sync_7day | manual
  backup_reason TEXT,                     -- 备份原因描述
  
  -- 发布状态
  publish_status TEXT DEFAULT 'pending',  -- pending | published | failed | skipped
  published_at TIMESTAMP,                 -- 发布时间
  published_campaign_id INTEGER,          -- 发布后生成的 campaign ID
  publish_error TEXT,                     -- 发布错误信息
  
  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 外键约束
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_campaign_backups_user_id ON campaign_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_campaign_id ON campaign_backups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_offer_id ON campaign_backups(offer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_google_ads_account_id ON campaign_backups(google_ads_account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_backup_type ON campaign_backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_publish_status ON campaign_backups(publish_status);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_created_at ON campaign_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_backups_composite_lookup 
  ON campaign_backups(user_id, backup_type, publish_status, created_at DESC);

-- 添加迁移历史记录
INSERT OR IGNORE INTO migration_history (migration_name, applied_at)
VALUES ('009_add_campaign_backups_table', CURRENT_TIMESTAMP);

-- =====================================================
-- 说明
-- =====================================================
-- backup_type 枚举值:
--   - auto_created: 广告系列创建时自动备份（autoads 创建）
--   - sync_initial: Google Ads 同步时首次备份
--   - sync_7day: Google Ads 同步后第 7 天备份
--   - manual: 手动备份
--
-- publish_status 枚举值:
--   - pending: 待发布
--   - published: 已发布
--   - failed: 发布失败
--   - skipped: 跳过（如重复发布）
--
-- 使用场景:
-- 1. 创建广告系列时自动备份（auto_created）
-- 2. 从 Google Ads 同步广告系列时备份（sync_initial）
-- 3. 同步后第 7 天再次备份（sync_7day）- 通过定时任务
-- 4. 在备份页面批量选择备份，选择 customerId 批量发布
-- =====================================================
