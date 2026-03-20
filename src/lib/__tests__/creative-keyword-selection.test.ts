import { describe, expect, it } from 'vitest'
import { getPureBrandKeywords, isPureBrandKeyword } from '../brand-keyword-utils'
import { hasModelAnchorEvidence } from '../creative-type'
import {
  CREATIVE_BRAND_KEYWORD_RESERVE,
  CREATIVE_KEYWORD_MAX_COUNT,
  CREATIVE_KEYWORD_MAX_WORDS,
  selectCreativeKeywords,
} from '../creative-keyword-selection'

describe('creative-keyword-selection', () => {
  it('caps total creative keywords to 50', () => {
    const keywordsWithVolume = Array.from({ length: 80 }, (_, index) => ({
      keyword: `brandx keyword ${index + 1}`,
      searchVolume: 1000 - index,
      source: 'KEYWORD_POOL',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume,
      brandName: 'BrandX',
    })

    expect(result.keywordsWithVolume).toHaveLength(CREATIVE_KEYWORD_MAX_COUNT)
    expect(result.keywords).toHaveLength(CREATIVE_KEYWORD_MAX_COUNT)
    expect(result.truncated).toBe(true)
  })

  it('reserves at least 10 branded slots when available', () => {
    const brandKeywords = Array.from({ length: 12 }, (_, index) => ({
      keyword: `brandx model ${index + 1}`,
      searchVolume: 10,
      source: 'AI_GENERATED',
      matchType: 'PHRASE' as const,
    }))
    const nonBrandKeywords = Array.from({ length: 70 }, (_, index) => ({
      keyword: `generic landscape light ${index + 1}`,
      searchVolume: 10000 - index,
      source: 'KEYWORD_POOL',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...brandKeywords, ...nonBrandKeywords],
      brandName: 'BrandX',
    })

    const brandedCount = result.keywords.filter(keyword => keyword.toLowerCase().includes('brandx')).length
    expect(brandedCount).toBeGreaterThanOrEqual(CREATIVE_BRAND_KEYWORD_RESERVE)
  })

  it('deduplicates normalized keyword variants', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'BrandX-Laser', searchVolume: 100, source: 'AI_GENERATED', matchType: 'PHRASE' },
        { keyword: 'brandx laser', searchVolume: 200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx_laser', searchVolume: 150, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
    })

    expect(result.keywordsWithVolume).toHaveLength(1)
    expect(result.keywords[0].toLowerCase()).toContain('brandx')
  })

  it('prefers higher-priority source for equal keyword', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx spotlight', searchVolume: 20, source: 'AI_GENERATED', matchType: 'PHRASE' },
        { keyword: 'brandx spotlight', searchVolume: 20, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
    })

    expect(result.keywordsWithVolume).toHaveLength(1)
    expect(result.keywordsWithVolume[0].source).toBe('KEYWORD_POOL')
  })

  it('drops keywords exceeding global max word count', () => {
    const tooLongKeyword = 'ninja bn401 nutri pro compact personal blender auto iq technology 1100 peak watts for frozen drinks smoothies sauces'
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: tooLongKeyword, searchVolume: 120000, source: 'KEYWORD_POOL', matchType: 'EXACT' },
        { keyword: 'lampick hair dryer', searchVolume: 4000, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'Lampick',
    })

    expect(result.keywords).toContain('lampick hair dryer')
    expect(result.keywords).not.toContain(tooLongKeyword)
    expect(
      result.keywords.every(keyword => keyword.trim().split(/\s+/).filter(Boolean).length <= CREATIVE_KEYWORD_MAX_WORDS)
    ).toBe(true)
  })

  it('enforces at least 10 branded keywords by synthesizing from non-brand candidates', () => {
    const brandedSeed = [{
      keyword: 'lampick hair dryer',
      searchVolume: 5000,
      source: 'KEYWORD_POOL',
      matchType: 'PHRASE' as const,
    }]
    const nonBrandKeywords = Array.from({ length: 30 }, (_, index) => ({
      keyword: `hair dryer ${index + 1}`,
      searchVolume: 3000 - index,
      source: 'KEYWORD_POOL',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...brandedSeed, ...nonBrandKeywords],
      brandName: 'Lampick',
      maxKeywords: 30,
      minBrandKeywords: 10,
    })

    const brandedCount = result.keywords.filter(keyword => keyword.toLowerCase().includes('lampick')).length
    expect(brandedCount).toBeGreaterThanOrEqual(10)
    expect(
      result.keywords.every(keyword => keyword.trim().split(/\s+/).filter(Boolean).length <= CREATIVE_KEYWORD_MAX_WORDS)
    ).toBe(true)
  })

  it('supports brand-only mode and emits only branded keywords', () => {
    const brandKeywords = [
      { keyword: 'lampick hair dryer', searchVolume: 5000, source: 'KEYWORD_POOL', matchType: 'PHRASE' as const },
      { keyword: 'lampick ionic dryer', searchVolume: 4200, source: 'KEYWORD_POOL', matchType: 'PHRASE' as const },
    ]
    const nonBrandKeywords = Array.from({ length: 20 }, (_, index) => ({
      keyword: `hair dryer ${index + 1}`,
      searchVolume: 3500 - index,
      source: 'KEYWORD_POOL',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...brandKeywords, ...nonBrandKeywords],
      brandName: 'Lampick',
      maxKeywords: 12,
      brandOnly: true,
    })

    expect(result.keywordsWithVolume).toHaveLength(12)
    expect(result.keywords.every(keyword => keyword.toLowerCase().includes('lampick'))).toBe(true)
  })

  it('synthesizes branded demand terms for brand_intent when only generic demand tails are available', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'security camera', searchVolume: 5200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'outdoor camera', searchVolume: 4100, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'camera for home', searchVolume: 3600, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
      ],
      brandName: 'Eufy',
      creativeType: 'brand_intent',
      maxKeywords: 6,
      brandOnly: true,
    })

    expect(result.keywords.length).toBeGreaterThan(0)
    expect(result.keywords.every(keyword => keyword.toLowerCase().includes('eufy'))).toBe(true)
    expect(result.keywords).toContain('eufy security camera')
  })

  it('keeps pure brand terms for brand_intent while still dropping promo-only noise', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx', searchVolume: 9000, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'brandx sale', searchVolume: 4200, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'brandx security camera', searchVolume: 3200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'brand_intent',
      maxKeywords: 10,
    })

    expect(result.keywords).toContain('brandx')
    expect(result.keywords).toContain('brandx security camera')
    expect(result.keywords).not.toContain('brandx sale')
  })

  it('enforces exact match and model anchors for model_intent', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 5000, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx vacuum', searchVolume: 4200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx official store', searchVolume: 4100, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'x200 vacuum', searchVolume: 3800, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 10,
    })

    expect(result.keywords).toContain('brandx x200 vacuum')
    expect(result.keywords).toContain('x200 vacuum')
    expect(result.keywords).not.toContain('brandx vacuum')
    expect(result.keywords).not.toContain('brandx official store')
    expect(result.keywordsWithVolume.every((item) => item.matchType === 'EXACT')).toBe(true)
  })

  it('keeps a small branded floor for model_intent by synthesizing branded model tails when needed', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'x200 vacuum', searchVolume: 5000, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'x300 vacuum', searchVolume: 4200, source: 'KEYWORD_PLANNER' as any, matchType: 'PHRASE' },
        { keyword: 'brandx official store', searchVolume: 4100, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 6,
    })

    const brandedKeywords = result.keywords.filter(keyword => keyword.toLowerCase().includes('brandx'))

    expect(brandedKeywords.length).toBeGreaterThanOrEqual(2)
    expect(brandedKeywords).toContain('brandx x200 vacuum')
    expect(result.keywordsWithVolume.every((item) => item.matchType === 'EXACT')).toBe(true)
    expect(result.keywords).not.toContain('brandx official store')
  })

  it('prefers real search-term and planner sources over lower-priority duplicates', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 100, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx x200 vacuum', searchVolume: 100, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'brandx x300 vacuum', searchVolume: 100, source: 'AI_GENERATED', matchType: 'PHRASE' },
        { keyword: 'brandx x300 vacuum', searchVolume: 100, source: 'KEYWORD_PLANNER' as any, matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 10,
    })

    expect(
      result.keywordsWithVolume.find((item) => item.keyword === 'brandx x200 vacuum')?.source
    ).toBe('SEARCH_TERM_HIGH_PERFORMING')
    expect(
      result.keywordsWithVolume.find((item) => item.keyword === 'brandx x300 vacuum')?.source
    ).toBe('KEYWORD_PLANNER')
  })

  it('drops low-quality informational and platform keywords', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx', searchVolume: 5000, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'what is brandx camera', searchVolume: 1200, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'brandx camera review', searchVolume: 1100, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'brandx amazon camera', searchVolume: 1000, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'brandx security camera', searchVolume: 2200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'brand_intent',
      maxKeywords: 10,
    })

    expect(result.keywords).toContain('brandx')
    expect(result.keywords).toContain('brandx security camera')
    expect(result.keywords).not.toContain('what is brandx camera')
    expect(result.keywords).not.toContain('brandx camera review')
    expect(result.keywords).not.toContain('brandx amazon camera')
  })

  it('drops community/question/price-tracker query noise', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx vacuum cleaner', searchVolume: 3200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx vacuum reddit', searchVolume: 1600, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'are brandx vacuums good', searchVolume: 1400, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
        { keyword: 'brandx vacuum price tracker', searchVolume: 1200, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    expect(result.keywords).toContain('brandx vacuum cleaner')
    expect(result.keywords).not.toContain('brandx vacuum reddit')
    expect(result.keywords).not.toContain('are brandx vacuums good')
    expect(result.keywords).not.toContain('brandx vacuum price tracker')
  })

  it('drops stacked noun noise terms from weak page extraction phrases', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'ringconn smart ring price', searchVolume: 1100, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'ringconn electronics photo wearable technology rings cost', searchVolume: 900, source: 'PAGE_EXTRACT' as any, matchType: 'PHRASE' },
      ],
      brandName: 'Ringconn',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    expect(result.keywords).toContain('ringconn smart ring price')
    expect(result.keywords).not.toContain('ringconn electronics photo wearable technology rings cost')
  })

  it('deduplicates token-order permutations and keeps the better candidate', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 1800, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'x200 brandx vacuum', searchVolume: 2500, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 10,
    })

    expect(result.keywordsWithVolume).toHaveLength(1)
    expect(result.keywords[0]).toBe('brandx x200 vacuum')
  })

  it('injects a pure brand keyword floor for product_intent when missing from candidates', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx security camera', searchVolume: 4200, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx outdoor camera', searchVolume: 3500, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' },
      ],
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
    })

    expect(result.keywords).toContain('brandx')
    expect(result.keywords).toContain('brandx security camera')
  })

  it('preserves source priority and enriches keyword audit metadata', () => {
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        {
          keyword: 'brandx x200 vacuum',
          searchVolume: 1600,
          source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
          matchType: 'PHRASE',
          evidence: ['x200', 'vacuum'],
          confidence: 0.93,
        },
      ],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 5,
    })

    expect(result.keywordsWithVolume).toHaveLength(1)
    expect(result.keywordsWithVolume[0]).toMatchObject({
      source: 'SEARCH_TERM_HIGH_PERFORMING',
      sourceType: 'SEARCH_TERM_HIGH_PERFORMING',
      sourceSubtype: 'SEARCH_TERM_HIGH_PERFORMING',
      rawSource: 'SEARCH_TERM',
      derivedTags: undefined,
      sourceField: 'search_terms',
      anchorType: 'brand_model',
      suggestedMatchType: 'EXACT',
      matchType: 'EXACT',
      confidence: 0.93,
      evidence: ['x200', 'vacuum'],
    })
    expect(result.keywordsWithVolume[0].qualityReason).toContain('真实搜索词')
  })

  it('caps low-trust sources in normal mode when enough trusted alternatives exist', () => {
    const trusted = Array.from({ length: 12 }, (_, index) => ({
      keyword: `brandx ${200 + index}`,
      searchVolume: 5000 - index,
      source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
      matchType: 'PHRASE' as const,
    }))
    const lowTrustAi = [
      'brandx vacuum cleaner',
      'brandx vacuum for home',
      'brandx vacuum cordless',
      'brandx vacuum waterproof',
      'brandx vacuum portable',
      'brandx vacuum lightweight',
    ].map((keyword, index) => ({
      keyword,
      searchVolume: 8000 - index,
      source: 'AI_GENERATED' as any,
      sourceType: 'AI_LLM_RAW',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...lowTrustAi, ...trusted],
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    const lowTrustCount = result.keywordsWithVolume.filter((item) =>
      ['AI_LLM_RAW', 'AI_GENERATED', 'SCORING_SUGGESTION', 'GAP_INDUSTRY_BRANDED'].includes(
        String(item.sourceSubtype || item.sourceType || '').toUpperCase()
      )
    ).length
    const aiRawCount = result.keywordsWithVolume.filter((item) =>
      ['AI_LLM_RAW', 'AI_GENERATED'].includes(
        String(item.sourceSubtype || item.sourceType || '').toUpperCase()
      )
    ).length

    expect(lowTrustCount).toBeLessThanOrEqual(2)
    expect(aiRawCount).toBeLessThanOrEqual(1)
    expect(result.sourceQuotaAudit.blockedByCap.lowTrust).toBeGreaterThanOrEqual(0)
    expect(result.sourceQuotaAudit.acceptedByClass.aiLlmRaw).toBeLessThanOrEqual(1)
  })

  it('loosens low-trust source quota in fallback mode', () => {
    const trusted = Array.from({ length: 12 }, (_, index) => ({
      keyword: `brandx ${300 + index}`,
      searchVolume: 4800 - index,
      source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
      matchType: 'PHRASE' as const,
    }))
    const lowTrustAi = [
      'brandx vacuum cleaner',
      'brandx vacuum for home',
      'brandx vacuum cordless',
      'brandx vacuum waterproof',
      'brandx vacuum portable',
      'brandx vacuum lightweight',
    ].map((keyword, index) => ({
      keyword,
      searchVolume: 8100 - index,
      source: 'AI_GENERATED' as any,
      sourceType: 'AI_LLM_RAW',
      matchType: 'PHRASE' as const,
    }))

    const normal = selectCreativeKeywords({
      keywordsWithVolume: [...lowTrustAi, ...trusted],
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
    })
    const fallback = selectCreativeKeywords({
      keywordsWithVolume: [...lowTrustAi, ...trusted],
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
      fallbackMode: true,
    })

    const countAiRaw = (items: typeof normal.keywordsWithVolume) =>
      items.filter((item) =>
        ['AI_LLM_RAW', 'AI_GENERATED'].includes(
          String(item.sourceSubtype || item.sourceType || '').toUpperCase()
        )
      ).length

    expect(countAiRaw(fallback.keywordsWithVolume)).toBeGreaterThanOrEqual(countAiRaw(normal.keywordsWithVolume))
    expect(countAiRaw(fallback.keywordsWithVolume)).toBeLessThanOrEqual(2)
    expect(fallback.sourceQuotaAudit.fallbackMode).toBe(true)
    expect(fallback.sourceQuotaAudit.quota.combinedLowTrustCap).toBeGreaterThan(
      normal.sourceQuotaAudit.quota.combinedLowTrustCap
    )
  })

  it('records deferred refill when quota would otherwise underfill the final list', () => {
    const mostlyLowTrust = Array.from({ length: 12 }, (_, index) => ({
      keyword: `brandx vacuum long tail ${index + 1}`,
      searchVolume: 1000 - index,
      source: 'AI_GENERATED' as any,
      sourceType: 'AI_LLM_RAW',
      matchType: 'PHRASE' as const,
    }))

    const result = selectCreativeKeywords({
      keywordsWithVolume: mostlyLowTrust,
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 10,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    expect(result.keywordsWithVolume).toHaveLength(10)
    expect(result.sourceQuotaAudit.deferredCount).toBeGreaterThan(0)
    expect(result.sourceQuotaAudit.deferredRefillTriggered).toBe(true)
    expect(result.sourceQuotaAudit.deferredRefillCount).toBeGreaterThan(0)
    expect(result.sourceQuotaAudit.underfillBeforeRefill).toBeGreaterThan(0)
  })

  it('keeps A/D top20 overlap within 20%-35% under mixed brand + demand corpus', () => {
    const sharedBrandDemand = [
      'brandx robot vacuum for home',
      'brandx robot vacuum for pet hair',
      'brandx cordless vacuum for stairs',
      'brandx self empty vacuum for apartment',
      'brandx quiet vacuum for office',
    ].map((keyword, index) => ({
      keyword,
      searchVolume: 7950 - index * 80,
      source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
      matchType: 'PHRASE' as const,
    }))

    const brandTailTokens = [
      'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot',
      'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima',
      'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo',
    ]
    const brandOnlyDemand = brandTailTokens.map((token, index) => ({
      keyword: `brandx vacuum collection ${token}`,
      searchVolume: 5000 - index * 30,
      source: 'KEYWORD_POOL' as any,
      matchType: 'PHRASE' as const,
    }))

    const genericDemand = Array.from({ length: 30 }, (_, index) => ({
      keyword: `cordless robot vacuum for home variant ${index + 1}`,
      searchVolume: 6800 - index * 45,
      source: 'KEYWORD_PLANNER' as any,
      matchType: 'PHRASE' as const,
    }))

    const corpus = [...sharedBrandDemand, ...brandOnlyDemand, ...genericDemand]

    const brandTop20 = selectCreativeKeywords({
      keywordsWithVolume: corpus,
      brandName: 'BrandX',
      creativeType: 'brand_intent',
      maxKeywords: 20,
    }).keywords.slice(0, 20)

    const demandTop20 = selectCreativeKeywords({
      keywordsWithVolume: corpus,
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 20,
      minBrandKeywords: 0,
      brandReserve: 0,
    }).keywords.slice(0, 20)

    const brandSet = new Set(brandTop20.map((item) => item.toLowerCase().trim()))
    const overlapCount = demandTop20.filter((item) => brandSet.has(item.toLowerCase().trim())).length
    const overlapRate = overlapCount / Math.max(brandTop20.length, demandTop20.length)

    expect(brandTop20).toHaveLength(20)
    expect(demandTop20).toHaveLength(20)
    expect(overlapRate).toBeGreaterThanOrEqual(0.2)
    expect(overlapRate).toBeLessThanOrEqual(0.35)
  })

  it('keeps D top20 pure-brand ratio <= 15%', () => {
    const keywordsWithVolume = [
      ...Array.from({ length: 28 }, (_, index) => ({
        keyword: `robot vacuum cleaner ${index + 1}`,
        searchVolume: 9000 - index * 70,
        source: 'KEYWORD_PLANNER' as any,
        matchType: 'PHRASE' as const,
      })),
      { keyword: 'brandx', searchVolume: 6000, source: 'SEARCH_TERM' as any, matchType: 'PHRASE' as const },
      { keyword: 'brandx official store', searchVolume: 5000, source: 'KEYWORD_POOL' as any, matchType: 'PHRASE' as const },
    ]

    const result = selectCreativeKeywords({
      keywordsWithVolume,
      brandName: 'BrandX',
      creativeType: 'product_intent',
      maxKeywords: 20,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    const pureBrandKeywords = getPureBrandKeywords('BrandX')
    const pureBrandCount = result.keywords.slice(0, 20).filter((keyword) =>
      isPureBrandKeyword(keyword, pureBrandKeywords)
    ).length
    const pureBrandRatio = pureBrandCount / Math.max(1, result.keywords.slice(0, 20).length)

    expect(result.keywords.slice(0, 20)).toHaveLength(20)
    expect(pureBrandRatio).toBeLessThanOrEqual(0.15)
  })

  it('keeps B top20 model-anchor hit-rate >= 90%', () => {
    const modelAnchors = Array.from({ length: 22 }, (_, index) => {
      const modelNo = 200 + index
      return {
        keyword: index % 2 === 0 ? `brandx x${modelNo} vacuum` : `x${modelNo} vacuum`,
        searchVolume: 7000 - index * 45,
        source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
        matchType: 'PHRASE' as const,
      }
    })
    const noise = [
      { keyword: 'brandx vacuum', searchVolume: 6500, source: 'KEYWORD_POOL' as any, matchType: 'PHRASE' as const },
      { keyword: 'vacuum cleaner for home', searchVolume: 6400, source: 'KEYWORD_PLANNER' as any, matchType: 'PHRASE' as const },
    ]

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...modelAnchors, ...noise],
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 20,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    const top20 = result.keywords.slice(0, 20)
    const modelAnchorHits = top20.filter((keyword) => hasModelAnchorEvidence({ keywords: [keyword] })).length
    const hitRate = modelAnchorHits / Math.max(1, top20.length)

    expect(top20).toHaveLength(20)
    expect(hitRate).toBeGreaterThanOrEqual(0.9)
  })

  it('keeps preferred-bucket demand terms in model_intent to avoid severe underfill', () => {
    const preferredBucketKeywords = [
      'brandx vacuum cleaner',
      'brandx vacuum for pet hair',
      'brandx cordless vacuum',
    ]
    const result = selectCreativeKeywords({
      keywordsWithVolume: [
        { keyword: 'brandx x200 vacuum', searchVolume: 4200, source: 'SEARCH_TERM_HIGH_PERFORMING' as any, matchType: 'PHRASE' },
        { keyword: 'x300 vacuum', searchVolume: 3900, source: 'KEYWORD_PLANNER' as any, matchType: 'PHRASE' },
        { keyword: 'x400 vacuum', searchVolume: 3600, source: 'KEYWORD_PLANNER' as any, matchType: 'PHRASE' },
        { keyword: 'brandx vacuum cleaner', searchVolume: 1600, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx vacuum for pet hair', searchVolume: 1500, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
        { keyword: 'brandx cordless vacuum', searchVolume: 1400, source: 'KEYWORD_POOL', matchType: 'PHRASE' },
      ],
      preferredBucketKeywords,
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 6,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    expect(result.keywords).toEqual(expect.arrayContaining(preferredBucketKeywords))
    expect(result.keywordsWithVolume).toHaveLength(6)
  })

  it('caps non-model spillover for model_intent when preferred bucket is noisy', () => {
    const modelCandidates = [
      'brandx x200 vacuum',
      'brandx x300 vacuum',
      'brandx x400 vacuum',
      'x500 vacuum',
      'x600 vacuum',
    ].map((keyword, index) => ({
      keyword,
      searchVolume: 3000 - index * 50,
      source: 'SEARCH_TERM_HIGH_PERFORMING' as any,
      matchType: 'PHRASE' as const,
    }))
    const noisyPreferred = Array.from({ length: 24 }, (_, index) => ({
      keyword: `brandx smart vacuum option ${index + 1}`,
      searchVolume: 1500 - index * 10,
      source: 'KEYWORD_POOL' as any,
      matchType: 'PHRASE' as const,
    }))
    const preferredBucketKeywords = noisyPreferred.map((item) => item.keyword)

    const result = selectCreativeKeywords({
      keywordsWithVolume: [...modelCandidates, ...noisyPreferred],
      preferredBucketKeywords,
      brandName: 'BrandX',
      creativeType: 'model_intent',
      maxKeywords: 50,
      minBrandKeywords: 0,
      brandReserve: 0,
    })

    const modelHits = result.keywords.filter((keyword) => hasModelAnchorEvidence({ keywords: [keyword] })).length
    const nonModelCount = result.keywords.length - modelHits

    expect(modelHits).toBeGreaterThanOrEqual(5)
    expect(nonModelCount).toBeLessThanOrEqual(10)
    expect(result.keywordsWithVolume.every((item) => item.matchType === 'EXACT')).toBe(true)
  })
})
