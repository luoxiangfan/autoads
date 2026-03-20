/**
 * 商品推荐指数计算任务执行器
 *
 * 功能:
 * - 批量计算商品推荐指数
 * - 支持全量计算和增量计算
 * - 支持季节性分析(可选)
 */

import type { Task } from '@/lib/queue/types'
import { getDatabase } from '@/lib/db'
import { nowFunc } from '@/lib/db-helpers'
import { getQueueManagerForTaskType } from '@/lib/queue/queue-routing'
import {
  calculateHybridProductRecommendationScores,
} from '@/lib/product-recommendation-scoring'
import type { AffiliateProduct } from '@/lib/affiliate-products'
import {
  cacheProductRecommendationScore,
} from '@/lib/product-score-cache'
import {
  acquireProductScoreExecutionMutex,
  consumeProductScoreRequeueRequest,
  findExistingProductScoreTask,
  markProductScoreRequeueNeeded,
} from '@/lib/product-score-coordination'

export type ProductScoreCalculationTaskData = {
  userId: number
  productIds?: number[] // 指定商品ID列表(可选)
  forceRecalculate?: boolean // 强制重新计算
  batchSize?: number // 批次大小
  includeSeasonalityAnalysis?: boolean // 是否包含季节性分析
  trigger?: 'manual' | 'schedule' | 'sync-complete' // 触发来源
}

/**
 * 商品推荐指数计算执行器
 */
export async function executeProductScoreCalculation(
  task: Task<ProductScoreCalculationTaskData>
): Promise<void> {
  const {
    userId,
    productIds,
    forceRecalculate = false,
    batchSize = 100,
    includeSeasonalityAnalysis = true,
    trigger = 'manual'
  } = task.data

  console.log(`[ProductScoreCalculation] 开始执行任务 ${task.id}`)
  console.log(`[ProductScoreCalculation] 用户: ${userId}, 触发: ${trigger}, 批次大小: ${batchSize}`)

  const db = await getDatabase()
  const startTime = Date.now()
  const nowSql = nowFunc(db.type)
  const queue = await getQueueManagerForTaskType('product-score-calculation')
  const lockTtlMs = Math.max(queue.getConfig().taskTimeout || 900000, 15 * 60 * 1000) + 5 * 60 * 1000
  const executionMutex = await acquireProductScoreExecutionMutex(userId, task.id, lockTtlMs)

  if (!executionMutex.acquired) {
    await markProductScoreRequeueNeeded(userId, {
      includeSeasonalityAnalysis,
      forceRecalculate,
      trigger,
      productIds,
    })
    console.warn(
      `[ProductScoreCalculation] 用户${userId}已有运行中的评分任务，本任务 ${task.id} 跳过并合并`
    )
    return
  }

  const refreshTimer = setInterval(() => {
    executionMutex.refresh().catch((error) => {
      console.warn(
        `[ProductScoreCalculation] 刷新用户${userId}互斥锁失败:`,
        error
      )
    })
  }, Math.max(30_000, Math.floor(lockTtlMs / 3)))
  refreshTimer.unref?.()

  try {
    // 构建查询条件
    let whereClause = 'user_id = ?'
    const params: any[] = [userId]

    if (productIds && productIds.length > 0) {
      // 指定商品ID列表
      const placeholders = productIds.map(() => '?').join(',')
      whereClause += ` AND id IN (${placeholders})`
      params.push(...productIds)
    }

    if (!forceRecalculate) {
      // 默认仅计算未算分或“同步后算分已过期”的商品，避免重复计算
      if (db.type === 'postgres') {
        whereClause += ` AND (
          recommendation_score IS NULL
          OR score_calculated_at IS NULL
          OR (
            last_synced_at IS NOT NULL
            AND score_calculated_at < (last_synced_at AT TIME ZONE 'UTC')
          )
        )`
      } else {
        whereClause += ` AND (
          recommendation_score IS NULL
          OR score_calculated_at IS NULL
          OR (
            last_synced_at IS NOT NULL
            AND datetime(score_calculated_at) < datetime(last_synced_at)
          )
        )`
      }
    }

    // 查询需要计算的商品
    const products = await db.query<AffiliateProduct>(
      `SELECT * FROM affiliate_products WHERE ${whereClause} LIMIT ?`,
      [...params, batchSize]
    )

    if (products.length === 0) {
      console.log(`[ProductScoreCalculation] 没有需要计算的商品`)
    } else {
      console.log(`[ProductScoreCalculation] 找到${products.length}个商品需要计算`)
    }

    let successCount = 0
    let failedCount = 0
    const failedProducts: Array<{ id: number; error: string }> = []

    if (products.length > 0) {
      const hybridResults = await calculateHybridProductRecommendationScores(products, userId, {
        includeSeasonalityAnalysis,
      })

      console.log(
        `[ProductScoreCalculation] 混合精排完成: 规则粗排 ${hybridResults.summary.totalProducts}, ` +
        `AI候选 ${hybridResults.summary.aiCandidates}, AI完成 ${hybridResults.summary.aiCompleted}, ` +
        `规则直出 ${hybridResults.summary.ruleOnly}`
      )

      const productMap = new Map(products.map((product) => [product.id, product]))
      for (const result of hybridResults.results) {
        const product = productMap.get(result.productId)
        if (!product || !result.score) {
          failedCount++
          failedProducts.push({
            id: result.productId,
            error: result.error || '评分结果为空',
          })
          console.error(
            `[ProductScoreCalculation] ❌ 商品${result.productId}计算失败: ${result.error || '评分结果为空'}`
          )
          continue
        }

        try {
          const score = result.score
          const now = new Date().toISOString()
          await db.exec(
            `UPDATE affiliate_products
             SET recommendation_score = ?,
                 recommendation_reasons = ?,
                 seasonality_score = ?,
                 seasonality_analysis = ?,
                 product_analysis = ?,
                 score_calculated_at = ${nowSql},
                 updated_at = ${nowSql}
             WHERE id = ?`,
            [
              score.starRating,
              JSON.stringify(score.reasons),
              score.seasonalityAnalysis?.score || null,
              score.seasonalityAnalysis ? JSON.stringify(score.seasonalityAnalysis) : null,
              score.productAnalysis ? JSON.stringify(score.productAnalysis) : null,
              product.id
            ]
          )

          cacheProductRecommendationScore(userId, product.id, {
            recommendationScore: score.starRating,
            recommendationReasons: score.reasons,
            seasonalityScore: score.seasonalityAnalysis?.score || null,
            productAnalysis: score.productAnalysis || null,
            scoreCalculatedAt: now,
            cachedAt: Date.now()
          }).catch(err => {
            console.warn(`[ProductScoreCalculation] 缓存商品${product.id}失败:`, err)
          })

          successCount++
          console.log(
            `[ProductScoreCalculation] ✅ 商品${product.id}: ${score.starRating}星 (${score.totalScore.toFixed(1)}分)` +
            `${result.usedAI ? ' [AI精排]' : ' [规则粗排]'}`
          )
        } catch (error: any) {
          failedCount++
          failedProducts.push({
            id: product.id,
            error: error.message
          })
          console.error(`[ProductScoreCalculation] ❌ 商品${product.id}计算失败:`, error.message)
        }
      }
    }

    const processingTime = Date.now() - startTime

    console.log(`[ProductScoreCalculation] 任务完成`)
    console.log(`[ProductScoreCalculation] 成功: ${successCount}, 失败: ${failedCount}`)
    console.log(`[ProductScoreCalculation] 耗时: ${(processingTime / 1000).toFixed(2)}秒`)

    if (failedCount > 0) {
      console.warn(`[ProductScoreCalculation] 失败商品列表:`, failedProducts)
    }

    // 续跑机制：无指定 productIds 且非 force 模式下，按批次持续推进，直到清空待计算集合
    const shouldScheduleContinuation = !productIds
      && !forceRecalculate
      && products.length >= batchSize
      && successCount > 0

    const deferredRequest = await consumeProductScoreRequeueRequest(userId)
    const shouldScheduleFollowUp = shouldScheduleContinuation || !!deferredRequest

    if (shouldScheduleFollowUp) {
      try {
        const existingTask = await findExistingProductScoreTask(queue, userId, task.id)
        if (existingTask && existingTask.status === 'pending') {
          console.log(
            `[ProductScoreCalculation] 已存在后续任务 ${existingTask.id}，跳过重复续跑`
          )
        } else {
          const nextTaskId = await queue.enqueue(
            'product-score-calculation',
            {
              userId,
              forceRecalculate: deferredRequest?.forceFullRescore ?? false,
              batchSize,
              includeSeasonalityAnalysis:
                includeSeasonalityAnalysis || Boolean(deferredRequest?.includeSeasonalityAnalysis),
              trigger: deferredRequest?.trigger || trigger,
            },
            userId,
            {
              priority: 'normal',
            }
          )
          console.log(`[ProductScoreCalculation] 已续跑入队: ${nextTaskId}`)
        }
      } catch (enqueueError: any) {
        await markProductScoreRequeueNeeded(userId, {
          includeSeasonalityAnalysis:
            includeSeasonalityAnalysis || Boolean(deferredRequest?.includeSeasonalityAnalysis),
          forceRecalculate: deferredRequest?.forceFullRescore ?? false,
          trigger: deferredRequest?.trigger || trigger,
        }).catch(() => {})
        console.warn(
          `[ProductScoreCalculation] 续跑任务入队失败: ${enqueueError?.message || enqueueError}`
        )
      }
    }
  } catch (error: any) {
    console.error(`[ProductScoreCalculation] 任务执行失败:`, error)
    throw error
  } finally {
    clearInterval(refreshTimer)
    await executionMutex.release().catch((error) => {
      console.warn(
        `[ProductScoreCalculation] 释放用户${userId}互斥锁失败:`,
        error
      )
    })
  }
}
