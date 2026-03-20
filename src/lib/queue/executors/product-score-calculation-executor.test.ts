import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = {
  type: 'sqlite',
  query: vi.fn(),
  exec: vi.fn(),
}

const queueMock = {
  getConfig: vi.fn(() => ({ taskTimeout: 900000 })),
  enqueue: vi.fn(),
}

const calculateHybridProductRecommendationScoresMock = vi.fn()
const cacheProductRecommendationScoreMock = vi.fn()
const acquireProductScoreExecutionMutexMock = vi.fn()
const consumeProductScoreRequeueRequestMock = vi.fn()
const findExistingProductScoreTaskMock = vi.fn()
const markProductScoreRequeueNeededMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(async () => dbMock),
}))

vi.mock('@/lib/db-helpers', () => ({
  nowFunc: vi.fn(() => "datetime('now')"),
}))

vi.mock('@/lib/queue/queue-routing', () => ({
  getQueueManagerForTaskType: vi.fn(async () => queueMock),
}))

vi.mock('@/lib/product-recommendation-scoring', () => ({
  calculateHybridProductRecommendationScores: calculateHybridProductRecommendationScoresMock,
}))

vi.mock('@/lib/product-score-cache', () => ({
  cacheProductRecommendationScore: cacheProductRecommendationScoreMock,
}))

vi.mock('@/lib/product-score-coordination', () => ({
  acquireProductScoreExecutionMutex: acquireProductScoreExecutionMutexMock,
  consumeProductScoreRequeueRequest: consumeProductScoreRequeueRequestMock,
  findExistingProductScoreTask: findExistingProductScoreTaskMock,
  markProductScoreRequeueNeeded: markProductScoreRequeueNeededMock,
}))

function createTask(overrides: Record<string, any> = {}) {
  return {
    id: 'task-1',
    type: 'product-score-calculation',
    userId: 1,
    priority: 'normal',
    status: 'running',
    createdAt: Date.now(),
    data: {
      userId: 1,
      batchSize: 2,
      includeSeasonalityAnalysis: true,
      forceRecalculate: false,
      trigger: 'manual',
      ...overrides,
    },
  } as any
}

describe('executeProductScoreCalculation', () => {
  beforeEach(() => {
    dbMock.query.mockReset().mockResolvedValue([])
    dbMock.exec.mockReset().mockResolvedValue(undefined)
    queueMock.getConfig.mockClear()
    queueMock.enqueue.mockReset().mockResolvedValue('next-task-id')

    calculateHybridProductRecommendationScoresMock.mockReset()
    cacheProductRecommendationScoreMock.mockReset().mockResolvedValue(undefined)
    acquireProductScoreExecutionMutexMock.mockReset().mockResolvedValue({
      acquired: true,
      refresh: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
    })
    consumeProductScoreRequeueRequestMock.mockReset().mockResolvedValue(null)
    findExistingProductScoreTaskMock.mockReset().mockResolvedValue(null)
    markProductScoreRequeueNeededMock.mockReset().mockResolvedValue(undefined)
  })

  it('skips execution when another task already holds the user mutex', async () => {
    acquireProductScoreExecutionMutexMock.mockResolvedValue({
      acquired: false,
      refresh: vi.fn(),
      release: vi.fn(),
    })

    const { executeProductScoreCalculation } = await import('./product-score-calculation-executor')
    await executeProductScoreCalculation(createTask())

    expect(markProductScoreRequeueNeededMock).toHaveBeenCalledWith(1, expect.objectContaining({
      includeSeasonalityAnalysis: true,
      forceRecalculate: false,
      trigger: 'manual',
    }))
    expect(calculateHybridProductRecommendationScoresMock).not.toHaveBeenCalled()
  })

  it('schedules a follow-up task when a deferred request exists', async () => {
    dbMock.query.mockResolvedValue([
      { id: 101 },
    ])
    calculateHybridProductRecommendationScoresMock.mockResolvedValue({
      results: [
        {
          productId: 101,
          usedAI: false,
          score: {
            starRating: 4,
            totalScore: 78,
            reasons: ['rule-based'],
            seasonalityAnalysis: null,
            productAnalysis: null,
          },
        },
      ],
      summary: {
        totalProducts: 1,
        aiCandidates: 0,
        aiCompleted: 0,
        ruleOnly: 1,
      },
    })
    consumeProductScoreRequeueRequestMock.mockResolvedValue({
      includeSeasonalityAnalysis: true,
      forceFullRescore: true,
      trigger: 'sync-complete',
      updatedAt: new Date().toISOString(),
    })

    const { executeProductScoreCalculation } = await import('./product-score-calculation-executor')
    await executeProductScoreCalculation(createTask())

    expect(queueMock.enqueue).toHaveBeenCalledWith(
      'product-score-calculation',
      expect.objectContaining({
        userId: 1,
        forceRecalculate: true,
        includeSeasonalityAnalysis: true,
        trigger: 'sync-complete',
      }),
      1,
      expect.objectContaining({ priority: 'normal' })
    )
  })
})
