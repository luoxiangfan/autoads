import { describe, expect, it, vi } from 'vitest'
import { buildCreativeKeywordSet } from '../creative-keyword-set-builder'

const mocks = vi.hoisted(() => ({
  applyKeywordSupplementationOnce: vi.fn(),
  filterCreativeKeywordsByOfferContext: vi.fn(),
  normalizeCreativeKeywordCandidatesForContextFilter: vi.fn(),
  selectCreativeKeywords: vi.fn(),
}))

vi.mock('../ad-creative-gen', () => ({
  applyKeywordSupplementationOnce: mocks.applyKeywordSupplementationOnce,
}))

vi.mock('../creative-keyword-context-filter', () => ({
  filterCreativeKeywordsByOfferContext: mocks.filterCreativeKeywordsByOfferContext,
  normalizeCreativeKeywordCandidatesForContextFilter: mocks.normalizeCreativeKeywordCandidatesForContextFilter,
}))

vi.mock('../creative-keyword-selection', () => ({
  CREATIVE_BRAND_KEYWORD_RESERVE: 10,
  CREATIVE_KEYWORD_MAX_COUNT: 50,
  selectCreativeKeywords: mocks.selectCreativeKeywords,
}))

describe('buildCreativeKeywordSet keyword source audit', () => {
  it('builds source audit with counts/ratios and carries source quota metadata', async () => {
    const selectedKeywords = [
      {
        keyword: 'brandx x200 vacuum',
        searchVolume: 1600,
        source: 'SEARCH_TERM_HIGH_PERFORMING',
        sourceType: 'SEARCH_TERM_HIGH_PERFORMING',
        sourceSubtype: 'SEARCH_TERM_HIGH_PERFORMING',
        rawSource: 'SEARCH_TERM',
        sourceField: 'search_terms',
      },
      {
        keyword: 'brandx vacuum cleaner',
        searchVolume: 0,
        source: 'AI_GENERATED',
        sourceType: 'AI_LLM_RAW',
        sourceSubtype: 'AI_LLM_RAW',
        rawSource: 'AI',
        sourceField: 'ai',
        volumeUnavailableReason: 'DEV_TOKEN_INSUFFICIENT_ACCESS',
      },
    ]

    mocks.normalizeCreativeKeywordCandidatesForContextFilter.mockImplementation((input: any[]) => input)
    mocks.filterCreativeKeywordsByOfferContext.mockImplementation(({ keywordsWithVolume }: any) => keywordsWithVolume)
    mocks.selectCreativeKeywords.mockReturnValue({
      keywords: selectedKeywords.map((item) => item.keyword),
      keywordsWithVolume: selectedKeywords,
      truncated: false,
      sourceQuotaAudit: {
        enabled: true,
        fallbackMode: true,
        targetCount: 2,
        requiredBrandCount: 0,
        acceptedBrandCount: 2,
        acceptedCount: 2,
        deferredCount: 3,
        deferredRefillCount: 1,
        deferredRefillTriggered: true,
        underfillBeforeRefill: 1,
        quota: {
          combinedLowTrustCap: 1,
          aiCap: 1,
          aiLlmRawCap: 1,
        },
        acceptedByClass: {
          lowTrust: 1,
          ai: 1,
          aiLlmRaw: 1,
        },
        blockedByCap: {
          lowTrust: 2,
          ai: 1,
          aiLlmRaw: 1,
        },
      },
    })
    mocks.applyKeywordSupplementationOnce.mockResolvedValue({
      keywordsWithVolume: selectedKeywords,
      keywordSupplementation: {
        triggered: false,
        beforeCount: 2,
        afterCount: 2,
        addedKeywords: [],
        supplementCapApplied: false,
      },
    })

    const result = await buildCreativeKeywordSet({
      offer: { brand: 'BrandX' },
      userId: 1,
      brandName: 'BrandX',
      targetLanguage: 'en',
      scopeLabel: 'unit-test',
      keywordsWithVolume: selectedKeywords as any,
      keywords: selectedKeywords.map((item) => item.keyword),
      enableSupplementation: true,
      fallbackMode: true,
    })

    expect(result.keywords).toEqual(['brandx x200 vacuum', 'brandx vacuum cleaner'])
    expect(result.executableKeywords).toEqual(result.keywords)
    expect(result.promptKeywords).toEqual(['brandx x200 vacuum', 'brandx vacuum cleaner'])
    expect(result).toEqual(expect.objectContaining({
      promptKeywords: expect.any(Array),
      executableKeywords: expect.any(Array),
      candidatePool: expect.any(Array),
      audit: expect.any(Object),
    }))
    expect(result.audit).toEqual(result.keywordSourceAudit)
    expect(result.keywordSourceAudit).toMatchObject({
      totalKeywords: 2,
      withSearchVolumeKeywords: 1,
      zeroVolumeKeywords: 1,
      volumeUnavailableKeywords: 1,
      noVolumeMode: true,
      fallbackMode: true,
      contextFallbackStrategy: 'filtered',
      sourceQuotaAudit: {
        deferredRefillTriggered: true,
        quota: {
          combinedLowTrustCap: 1,
        },
      },
      byRawSource: {
        SEARCH_TERM: { count: 1, ratio: 0.5 },
        AI: { count: 1, ratio: 0.5 },
      },
      bySourceSubtype: {
        SEARCH_TERM_HIGH_PERFORMING: { count: 1, ratio: 0.5 },
        AI_LLM_RAW: { count: 1, ratio: 0.5 },
      },
      bySourceField: {
        SEARCH_TERMS: { count: 1, ratio: 0.5 },
        AI: { count: 1, ratio: 0.5 },
      },
      creativeAffinityByLabel: {
        MIXED: { count: 2, ratio: 1 },
      },
      creativeAffinityByLevel: {
        HIGH: { count: 2, ratio: 1 },
      },
    })
  })

  it('uses fixed fallback order filtered -> keyword_pool -> original and merges bucket seeds without entry override', async () => {
    const aiCandidates = [
      {
        keyword: 'brandx ai vacuum',
        searchVolume: 300,
        source: 'AI_GENERATED',
        sourceType: 'AI_LLM_RAW',
      },
    ]
    const bucketSeeds = [
      {
        keyword: 'brandx x300 vacuum',
        searchVolume: 900,
        source: 'KEYWORD_POOL',
        sourceType: 'CANONICAL_BUCKET_VIEW',
      },
    ]

    mocks.normalizeCreativeKeywordCandidatesForContextFilter.mockImplementation((input: any[]) => input)
    mocks.filterCreativeKeywordsByOfferContext.mockReturnValue([])
    mocks.selectCreativeKeywords.mockImplementation(({ keywordsWithVolume }: any) => ({
      keywords: (keywordsWithVolume || []).map((item: any) => item.keyword),
      keywordsWithVolume: keywordsWithVolume || [],
      truncated: false,
      sourceQuotaAudit: {
        enabled: true,
        fallbackMode: false,
        targetCount: 1,
        requiredBrandCount: 0,
        acceptedBrandCount: 1,
        acceptedCount: 1,
        deferredCount: 0,
        deferredRefillCount: 0,
        deferredRefillTriggered: false,
        underfillBeforeRefill: 0,
        quota: { combinedLowTrustCap: 1, aiCap: 1, aiLlmRawCap: 1 },
        acceptedByClass: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
        blockedByCap: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
      },
    }))
    mocks.applyKeywordSupplementationOnce.mockImplementation(async ({ keywordsWithVolume }: any) => ({
      keywordsWithVolume,
      keywords: (keywordsWithVolume || []).map((item: any) => item.keyword),
      keywordSupplementation: {
        triggered: false,
        beforeCount: 2,
        afterCount: 2,
        addedKeywords: [],
        supplementCapApplied: false,
      },
    }))

    const result = await buildCreativeKeywordSet({
      offer: { brand: 'BrandX' },
      userId: 1,
      brandName: 'BrandX',
      targetLanguage: 'en',
      scopeLabel: 'unit-fallback-order',
      keywordsWithVolume: aiCandidates as any,
      keywords: aiCandidates.map((item) => item.keyword),
      seedCandidates: bucketSeeds as any,
      enableSupplementation: true,
      fallbackMode: false,
    })

    expect(mocks.applyKeywordSupplementationOnce).toHaveBeenCalledWith(expect.objectContaining({
      poolCandidates: ['brandx x300 vacuum'],
    }))
    expect(mocks.selectCreativeKeywords).toHaveBeenCalledWith(expect.objectContaining({
      preferredBucketKeywords: ['brandx x300 vacuum'],
    }))
    expect(result.contextFallbackStrategy).toBe('keyword_pool')
    expect(result.keywordsWithVolume.map((item) => item.keyword)).toEqual(['brandx x300 vacuum'])
    expect(result.executableKeywords).toEqual(['brandx x300 vacuum'])
    expect(result.promptKeywords).toEqual(['brandx x300 vacuum', 'brandx ai vacuum'])
  })

  it('merges same-keyword provenance across primary and seed candidates', async () => {
    const primaryCandidates = [
      {
        keyword: 'brandx x200 vacuum',
        searchVolume: 1600,
        source: 'SEARCH_TERM_HIGH_PERFORMING',
        sourceType: 'SEARCH_TERM_HIGH_PERFORMING',
        sourceSubtype: 'SEARCH_TERM_HIGH_PERFORMING',
        rawSource: 'SEARCH_TERM',
        sourceField: 'search_terms',
        derivedTags: ['SEARCH_TERM'],
        evidence: ['x200'],
      },
    ]
    const seedCandidates = [
      {
        keyword: 'brandx x200 vacuum',
        searchVolume: 900,
        source: 'KEYWORD_POOL',
        sourceType: 'CANONICAL_BUCKET_VIEW',
        sourceSubtype: 'CANONICAL_BUCKET_VIEW',
        rawSource: 'DERIVED_VIEW',
        sourceField: 'keyword_pool',
        derivedTags: ['CANONICAL_BUCKET_VIEW'],
        evidence: ['bucket_b'],
      },
    ]

    mocks.normalizeCreativeKeywordCandidatesForContextFilter.mockImplementation((input: any[]) => input)
    mocks.filterCreativeKeywordsByOfferContext.mockImplementation(({ keywordsWithVolume }: any) => keywordsWithVolume)
    mocks.selectCreativeKeywords.mockImplementation(({ keywordsWithVolume }: any) => ({
      keywords: (keywordsWithVolume || []).map((item: any) => item.keyword),
      keywordsWithVolume: keywordsWithVolume || [],
      truncated: false,
      sourceQuotaAudit: {
        enabled: true,
        fallbackMode: false,
        targetCount: 1,
        requiredBrandCount: 0,
        acceptedBrandCount: 1,
        acceptedCount: 1,
        deferredCount: 0,
        deferredRefillCount: 0,
        deferredRefillTriggered: false,
        underfillBeforeRefill: 0,
        quota: { combinedLowTrustCap: 1, aiCap: 1, aiLlmRawCap: 1 },
        acceptedByClass: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
        blockedByCap: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
      },
    }))
    mocks.applyKeywordSupplementationOnce.mockImplementation(async ({ keywordsWithVolume }: any) => ({
      keywordsWithVolume,
      keywordSupplementation: {
        triggered: false,
        beforeCount: 1,
        afterCount: 1,
        addedKeywords: [],
        supplementCapApplied: false,
      },
    }))

    const result = await buildCreativeKeywordSet({
      offer: { brand: 'BrandX' },
      userId: 1,
      brandName: 'BrandX',
      targetLanguage: 'en',
      scopeLabel: 'unit-provenance-merge',
      keywordsWithVolume: primaryCandidates as any,
      seedCandidates: seedCandidates as any,
      enableSupplementation: true,
    })

    expect(result.executableKeywords).toEqual(['brandx x200 vacuum'])
    expect(result.keywordsWithVolume).toHaveLength(1)
    expect(result.keywordsWithVolume[0]).toMatchObject({
      keyword: 'brandx x200 vacuum',
      searchVolume: 1600,
      source: 'SEARCH_TERM_HIGH_PERFORMING',
      rawSource: 'SEARCH_TERM',
    })
    expect(result.candidatePool).toHaveLength(1)
    expect(result.candidatePool[0]).toMatchObject({
      keyword: 'brandx x200 vacuum',
      sourceSubtype: 'SEARCH_TERM_HIGH_PERFORMING',
      sourceField: 'search_terms',
    })
    expect(result.candidatePool[0].derivedTags || []).toEqual(
      expect.arrayContaining(['SEARCH_TERM', 'CANONICAL_BUCKET_VIEW'])
    )
    expect(result.candidatePool[0].evidence || []).toEqual(
      expect.arrayContaining(['x200', 'bucket_b'])
    )
    expect(result.candidatePool[0].provenance || []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSubtype: 'SEARCH_TERM_HIGH_PERFORMING',
          rawSource: 'SEARCH_TERM',
        }),
        expect.objectContaining({
          sourceSubtype: 'CANONICAL_BUCKET_VIEW',
          rawSource: 'DERIVED_VIEW',
        }),
      ])
    )
    expect(result.candidatePool[0].creativeAffinity).toMatchObject({
      label: 'mixed',
      level: 'high',
    })
    expect(result.audit.creativeAffinityByLabel).toMatchObject({
      MIXED: { count: 1, ratio: 1 },
    })
  })

  it('normalizes raw bucket seed candidates inside builder', async () => {
    const aiCandidates = [
      {
        keyword: 'brandx ai vacuum',
        searchVolume: 300,
        source: 'AI_GENERATED',
        sourceType: 'AI_LLM_RAW',
      },
    ]
    const rawSeedCandidates = [
      'brandx x200 vacuum',
      {
        keyword: 'brandx x300 vacuum',
        searchVolume: '800',
      },
    ]

    mocks.normalizeCreativeKeywordCandidatesForContextFilter.mockImplementation((input: any[]) => input)
    mocks.filterCreativeKeywordsByOfferContext.mockReturnValue([])
    mocks.selectCreativeKeywords.mockImplementation(({ keywordsWithVolume }: any) => ({
      keywords: (keywordsWithVolume || []).map((item: any) => item.keyword),
      keywordsWithVolume: keywordsWithVolume || [],
      truncated: false,
      sourceQuotaAudit: {
        enabled: true,
        fallbackMode: false,
        targetCount: 2,
        requiredBrandCount: 0,
        acceptedBrandCount: 2,
        acceptedCount: 2,
        deferredCount: 0,
        deferredRefillCount: 0,
        deferredRefillTriggered: false,
        underfillBeforeRefill: 0,
        quota: { combinedLowTrustCap: 1, aiCap: 1, aiLlmRawCap: 1 },
        acceptedByClass: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
        blockedByCap: { lowTrust: 0, ai: 0, aiLlmRaw: 0 },
      },
    }))
    mocks.applyKeywordSupplementationOnce.mockImplementation(async ({ keywordsWithVolume }: any) => ({
      keywordsWithVolume,
      keywords: (keywordsWithVolume || []).map((item: any) => item.keyword),
      keywordSupplementation: {
        triggered: false,
        beforeCount: 2,
        afterCount: 2,
        addedKeywords: [],
        supplementCapApplied: false,
      },
    }))

    const result = await buildCreativeKeywordSet({
      offer: { brand: 'BrandX' },
      userId: 1,
      brandName: 'BrandX',
      targetLanguage: 'en',
      scopeLabel: 'unit-seed-normalization',
      keywordsWithVolume: aiCandidates as any,
      keywords: aiCandidates.map((item) => item.keyword),
      seedCandidates: rawSeedCandidates as any,
      enableSupplementation: true,
      fallbackMode: false,
    })

    expect(result.contextFallbackStrategy).toBe('keyword_pool')
    expect(result.executableKeywords).toEqual(['brandx x200 vacuum', 'brandx x300 vacuum'])
    expect(result.keywordsWithVolume).toEqual([
      expect.objectContaining({
        keyword: 'brandx x200 vacuum',
        searchVolume: 0,
        source: 'KEYWORD_POOL',
        sourceType: 'CANONICAL_BUCKET_VIEW',
      }),
      expect.objectContaining({
        keyword: 'brandx x300 vacuum',
        searchVolume: 800,
        source: 'KEYWORD_POOL',
        sourceType: 'CANONICAL_BUCKET_VIEW',
      }),
    ])
  })
})
