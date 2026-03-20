import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbState = vi.hoisted(() => ({
  exec: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}))

const offerFns = vi.hoisted(() => ({
  findOfferById: vi.fn(),
}))

const generatorFns = vi.hoisted(() => ({
  generateAdCreative: vi.fn(),
}))

const builderFns = vi.hoisted(() => ({
  buildCreativeKeywordSet: vi.fn(),
}))

const qualityLoopFns = vi.hoisted(() => ({
  runCreativeGenerationQualityLoop: vi.fn(),
  evaluateCreativeForQuality: vi.fn(),
}))

const keywordPoolFns = vi.hoisted(() => ({
  getOrCreateKeywordPool: vi.fn(),
  getAvailableBuckets: vi.fn(),
  getBucketInfo: vi.fn(),
}))

const creativeTypeFns = vi.hoisted(() => ({
  getCreativeTypeForBucketSlot: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({
    type: 'sqlite' as const,
    exec: dbState.exec,
    query: dbState.query,
    queryOne: dbState.queryOne,
    transaction: dbState.transaction,
  }),
}))

vi.mock('@/lib/offers', () => ({
  findOfferById: offerFns.findOfferById,
}))

vi.mock('@/lib/ad-creative-gen', () => ({
  generateAdCreative: generatorFns.generateAdCreative,
}))

vi.mock('@/lib/creative-keyword-set-builder', () => ({
  buildCreativeKeywordSet: builderFns.buildCreativeKeywordSet,
}))

vi.mock('@/lib/ad-creative-quality-loop', () => ({
  AD_CREATIVE_MAX_AUTO_RETRIES: 2,
  AD_CREATIVE_REQUIRED_MIN_SCORE: 70,
  evaluateCreativeForQuality: qualityLoopFns.evaluateCreativeForQuality,
  runCreativeGenerationQualityLoop: qualityLoopFns.runCreativeGenerationQualityLoop,
}))

vi.mock('@/lib/offer-keyword-pool', () => ({
  getOrCreateKeywordPool: keywordPoolFns.getOrCreateKeywordPool,
  getAvailableBuckets: keywordPoolFns.getAvailableBuckets,
  getBucketInfo: keywordPoolFns.getBucketInfo,
}))

vi.mock('@/lib/creative-type', () => ({
  getCreativeTypeForBucketSlot: creativeTypeFns.getCreativeTypeForBucketSlot,
}))

vi.mock('@/lib/json-field', () => ({
  toDbJsonObjectField: (value: unknown) => value,
}))

describe('executeAdCreativeGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    dbState.exec.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO ad_creatives')) {
        return { lastInsertRowid: 901, changes: 1 }
      }

      return { changes: 1 }
    })
    dbState.query.mockResolvedValue([])
    dbState.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM ad_creatives WHERE id = ?')) {
        return {
          id: 901,
          offer_id: 96,
          user_id: 1,
        }
      }
      return null
    })
    dbState.transaction.mockImplementation(async (callback: () => Promise<void>) => {
      await callback()
    })

    offerFns.findOfferById.mockResolvedValue({
      id: 96,
      brand: 'BrandX',
      url: 'https://example.com/product',
      final_url: 'https://example.com/product',
      final_url_suffix: null,
      scrape_status: 'completed',
      page_type: 'product',
      target_country: 'US',
      target_language: 'en',
      category: 'robot vacuum',
      product_name: 'BrandX X200',
      brand_description: 'Robot vacuum',
      affiliate_link: null,
    })

    keywordPoolFns.getOrCreateKeywordPool.mockResolvedValue({
      id: 77,
    })
    keywordPoolFns.getAvailableBuckets.mockResolvedValue(['B'])
    keywordPoolFns.getBucketInfo.mockReturnValue({
      keywords: [{ keyword: 'brandx x200 vacuum', searchVolume: 1200 }],
      intent: '商品型号意图',
      intentEn: 'Model Intent',
    })
    creativeTypeFns.getCreativeTypeForBucketSlot.mockReturnValue('model_intent')

    generatorFns.generateAdCreative.mockResolvedValue({
      headlines: ['BrandX X200 Vacuum'],
      descriptions: ['Clean faster with BrandX X200'],
      keywords: ['brandx x200 vacuum', 'brandx official store'],
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 800 },
      ],
      promptKeywords: ['brandx x200 vacuum'],
      negativeKeywords: ['manual'],
      callouts: [],
      sitelinks: [],
      theme: '商品型号意图',
      explanation: 'Focus on the verified model.',
      ai_model: 'gemini-test',
    })

    builderFns.buildCreativeKeywordSet.mockResolvedValue({
      executableKeywords: ['brandx x200 vacuum'],
      executableKeywordCandidates: [],
      candidatePool: [],
      keywords: ['brandx x200 vacuum'],
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 1200, matchType: 'EXACT' },
      ],
      promptKeywords: ['brandx x200 vacuum', 'buy brandx x200 vacuum'],
      keywordSupplementation: {
        triggered: true,
        beforeCount: 1,
        afterCount: 2,
        addedKeywords: [{ keyword: 'buy brandx x200 vacuum', source: 'title_about' }],
        supplementCapApplied: false,
      },
      contextFallbackStrategy: 'filtered',
      audit: {
        totalKeywords: 1,
        withSearchVolumeKeywords: 1,
        zeroVolumeKeywords: 0,
        volumeUnavailableKeywords: 0,
        noVolumeMode: false,
        fallbackMode: false,
        contextFallbackStrategy: 'filtered',
        sourceQuotaAudit: {} as any,
        byRawSource: {},
        bySourceSubtype: {},
        bySourceField: {},
        creativeAffinityByLabel: {},
        creativeAffinityByLevel: {},
      },
      keywordSourceAudit: {
        totalKeywords: 1,
      },
    })

    qualityLoopFns.runCreativeGenerationQualityLoop.mockImplementation(async ({ generate }: any) => {
      const creative = await generate({ attempt: 1, retryFailureType: null })
      return {
        attempts: 1,
        selectedCreative: creative,
        selectedEvaluation: {
          passed: true,
          adStrength: {
            finalRating: 'GOOD',
            finalScore: 84,
            localEvaluation: {
              dimensions: {
                relevance: { score: 12 },
                quality: { score: 12 },
                completeness: { score: 12 },
                diversity: { score: 12 },
                compliance: { score: 12 },
                brandSearchVolume: { score: 12 },
                competitivePositioning: { score: 12 },
              },
            },
            combinedSuggestions: [],
          },
        },
        history: [],
      }
    })
  })

  it('persists builder-applied keyword audit metadata into final result payload', async () => {
    const { executeAdCreativeGeneration } = await import('./ad-creative-executor')

    const result = await executeAdCreativeGeneration({
      id: 501,
      userId: 1,
      data: {
        offerId: 96,
        bucket: 'B',
      },
    } as any)

    expect(builderFns.buildCreativeKeywordSet).toHaveBeenCalledWith(expect.objectContaining({
      promptKeywords: ['brandx x200 vacuum'],
    }))
    expect(result.creative.keywords).toEqual(['brandx x200 vacuum'])
    expect(result.creative.keywordSupplementation).toMatchObject({
      triggered: true,
      afterCount: 2,
    })
    expect(result.creative.audit).toMatchObject({
      totalKeywords: 1,
      contextFallbackStrategy: 'filtered',
    })
    expect(result.creative.keywordSourceAudit).toMatchObject({
      totalKeywords: 1,
    })
    expect(result.adStrength.audit).toMatchObject({
      totalKeywords: 1,
    })
  })
})
