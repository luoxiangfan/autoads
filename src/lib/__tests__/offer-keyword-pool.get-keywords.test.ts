import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dbFns = vi.hoisted(() => ({
  getDatabase: vi.fn(),
  queryOne: vi.fn(),
}))

vi.mock('../db', () => ({
  getDatabase: dbFns.getDatabase,
}))

import { getKeywords } from '../offer-keyword-pool'

function createKeywordRow() {
  return {
    id: 1,
    offer_id: 77,
    user_id: 1,
    brand_keywords: JSON.stringify([
      { keyword: 'brandx', searchVolume: 1000, source: 'BRAND', matchType: 'EXACT', isPureBrand: true },
    ]),
    bucket_a_keywords: JSON.stringify([
      { keyword: 'brandx vacuum', searchVolume: 500, source: 'A', matchType: 'PHRASE' },
      { keyword: 'brandx cordless vacuum', searchVolume: 450, source: 'A', matchType: 'PHRASE' },
    ]),
    bucket_b_keywords: JSON.stringify([
      { keyword: 'brandx x200 vacuum', searchVolume: 900, source: 'B', matchType: 'EXACT' },
      { keyword: 'x200 vacuum', searchVolume: 850, source: 'B', matchType: 'EXACT' },
      { keyword: 'home cleaning', searchVolume: 300, source: 'B', matchType: 'PHRASE' },
    ]),
    bucket_c_keywords: JSON.stringify([
      { keyword: 'brandx series x100 vacuum', searchVolume: 650, source: 'C', matchType: 'EXACT' },
      { keyword: 'robot vacuum', searchVolume: 550, source: 'C', matchType: 'PHRASE' },
    ]),
    bucket_d_keywords: JSON.stringify([
      { keyword: 'brandx coupon', searchVolume: 400, source: 'D', matchType: 'PHRASE' },
      { keyword: 'robot vacuum for pet hair', searchVolume: 600, source: 'D', matchType: 'PHRASE' },
      { keyword: 'brandx official store', searchVolume: 700, source: 'D', matchType: 'PHRASE' },
    ]),
    bucket_a_intent: '品牌商品锚点',
    bucket_b_intent: '商品需求场景',
    bucket_c_intent: '功能规格特性',
    bucket_d_intent: '商品需求扩展',
    store_bucket_a_keywords: JSON.stringify([]),
    store_bucket_b_keywords: JSON.stringify([]),
    store_bucket_c_keywords: JSON.stringify([]),
    store_bucket_d_keywords: JSON.stringify([]),
    store_bucket_s_keywords: JSON.stringify([]),
    store_bucket_a_intent: '品牌商品集合',
    store_bucket_b_intent: '商品需求场景',
    store_bucket_c_intent: '热门商品线',
    store_bucket_d_intent: '信任服务信号',
    store_bucket_s_intent: '店铺全量覆盖',
    link_type: 'product',
    total_keywords: 11,
    clustering_model: 'gemini',
    clustering_prompt_version: 'v1',
    balance_score: 0.93,
    created_at: '2026-03-16T00:00:00.000Z',
    updated_at: '2026-03-16T00:00:00.000Z',
  }
}

function createOfferContextRow() {
  return {
    brand: 'BrandX',
    page_type: 'product',
    category: 'Vacuums',
    product_name: 'BrandX X200 Robot Vacuum with Self-Empty Station',
    offer_name: 'BrandX_X200_US',
    target_country: 'US',
    target_language: 'en',
    scraped_data: JSON.stringify({
      productTitle: 'BrandX X200 Robot Vacuum with Self-Empty Station',
      productCategory: 'Home & Kitchen > Vacuums & Floor Care > Robotic Vacuums',
      category: 'Home & Kitchen > Vacuums & Floor Care > Robotic Vacuums',
    }),
    final_url: 'https://example.com/brandx-x200',
    url: 'https://example.com/brandx-x200',
  }
}

describe('getKeywords canonical retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dbFns.getDatabase.mockResolvedValue({
      queryOne: dbFns.queryOne,
    })
    dbFns.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM offers')) {
        return createOfferContextRow()
      }
      return createKeywordRow()
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('maps legacy bucket C to canonical model intent keywords', async () => {
    const result = await getKeywords(77, {
      bucket: 'C',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    const keywords = result.keywords.map((item) => item.keyword)

    expect(keywords).toContain('brandx x200 vacuum')
    expect(keywords).toContain('x200 vacuum')
    expect(keywords).not.toContain('brandx series x100 vacuum')
    expect(keywords).not.toContain('brandx')
    expect(keywords).not.toContain('brandx vacuum')
    expect(result.stats.bucketBCount).toBe(result.stats.bucketCCount)
  })

  it('maps legacy bucket S to canonical product intent keywords', async () => {
    const resultByLegacyBucket = await getKeywords(77, {
      bucket: 'S' as any,
      minSearchVolume: 0,
      maxKeywords: 20,
    })
    const resultByCanonicalBucket = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    expect(resultByLegacyBucket.keywords.map((item) => item.keyword)).toEqual(
      resultByCanonicalBucket.keywords.map((item) => item.keyword)
    )
  })

  it('returns canonical ALL view with deduped A/B/D keywords and compatibility buckets', async () => {
    const result = await getKeywords(77, {
      bucket: 'ALL',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    const keywords = result.keywords.map((item) => item.keyword)
    const bucketBKeywords = result.buckets?.B?.keywords.map((item) => item.keyword)
    const bucketCKeywords = result.buckets?.C?.keywords.map((item) => item.keyword)

    expect(keywords[0]).toBe('brandx')
    expect(keywords).toContain('brandx vacuum')
    expect(keywords).toContain('brandx x200 vacuum')
    expect(keywords).toContain('robot vacuum')
    expect(keywords).toContain('robot vacuum for pet hair')
    expect(keywords).not.toContain('brandx coupon')
    expect(keywords).not.toContain('brandx official store')
    expect(result.buckets?.A?.intent).toBe('品牌意图')
    expect(result.buckets?.B?.intent).toBe('商品型号意图')
    expect(result.buckets?.C?.intent).toBe('商品型号意图')
    expect(result.buckets?.D?.intent).toBe('商品需求意图')
    expect(bucketBKeywords).toEqual(bucketCKeywords)
  })

  it('narrows ALL queries to canonical brand intent while keeping branded model anchors', async () => {
    const result = await getKeywords(77, {
      intent: 'brand',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    const keywords = result.keywords.map((item) => item.keyword)

    expect(keywords).toContain('brandx')
    expect(keywords).toContain('brandx vacuum')
    // brand_intent 允许品牌+型号锚点词参与排序（仅禁止无商品锚点的纯导航词占前排）
    expect(keywords).toContain('brandx x200 vacuum')
    expect(keywords).not.toContain('robot vacuum')
  })

  it('keeps pure brand fallback for brand intent even under strict maxKeywords', async () => {
    const result = await getKeywords(77, {
      intent: 'brand',
      minSearchVolume: 0,
      maxKeywords: 1,
    })

    expect(result.keywords.map((item) => item.keyword)).toEqual(['brandx'])
  })

  it('does not silently degrade canonical model intent to brand intent when no model anchors exist', async () => {
    dbFns.queryOne.mockResolvedValue({
      ...createKeywordRow(),
      bucket_b_keywords: JSON.stringify([
        { keyword: 'home cleaning', searchVolume: 300, source: 'B', matchType: 'PHRASE' },
      ]),
      bucket_c_keywords: JSON.stringify([
        { keyword: 'robot vacuum', searchVolume: 550, source: 'C', matchType: 'PHRASE' },
      ]),
      bucket_d_keywords: JSON.stringify([
        { keyword: 'brandx official store', searchVolume: 700, source: 'D', matchType: 'PHRASE' },
      ]),
    })

    const result = await getKeywords(77, {
      bucket: 'B',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    expect(result.keywords).toEqual([])
  })

  it('maps canonical model_intent alias to canonical B retrieval', async () => {
    const resultByIntent = await getKeywords(77, {
      intent: 'model_intent',
      minSearchVolume: 0,
      maxKeywords: 20,
    })
    const resultByBucket = await getKeywords(77, {
      bucket: 'B',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    expect(resultByIntent.keywords.map((item) => item.keyword)).toEqual(
      resultByBucket.keywords.map((item) => item.keyword)
    )
  })

  it('maps canonical product_intent alias to canonical D retrieval', async () => {
    const resultByIntent = await getKeywords(77, {
      intent: 'product_intent',
      minSearchVolume: 0,
      maxKeywords: 20,
    })
    const resultByBucket = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    expect(resultByIntent.keywords.map((item) => item.keyword)).toEqual(
      resultByBucket.keywords.map((item) => item.keyword)
    )
  })

  it('keeps one pure brand fallback in product intent results without occupying top rank', async () => {
    const result = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    const keywords = result.keywords.map((item) => item.keyword)
    const pureBrandIndexes = keywords
      .map((keyword, index) => ({ keyword, index }))
      .filter((item) => item.keyword === 'brandx')
      .map((item) => item.index)

    expect(pureBrandIndexes).toEqual([keywords.length - 1])
  })

  it('keeps pure brand fallback for product intent after maxKeywords truncation', async () => {
    const result = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 2,
    })

    const keywords = result.keywords.map((item) => item.keyword)

    expect(keywords).toContain('brandx')
    expect(keywords[keywords.length - 1]).toBe('brandx')
  })

  it('filters foreign product lines and foreign model codes from product-page canonical D retrieval', async () => {
    dbFns.queryOne.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM offers')) {
        return createOfferContextRow()
      }
      return {
        ...createKeywordRow(),
        bucket_a_keywords: JSON.stringify([
          { keyword: 'brandx robot vacuum', searchVolume: 900, source: 'A', matchType: 'PHRASE' },
        ]),
        bucket_b_keywords: JSON.stringify([
          { keyword: 'brandx x200 robot vacuum', searchVolume: 800, source: 'B', matchType: 'EXACT' },
          { keyword: 'brandx x300 robot vacuum', searchVolume: 780, source: 'B', matchType: 'EXACT' },
        ]),
        bucket_c_keywords: JSON.stringify([]),
        bucket_d_keywords: JSON.stringify([
          { keyword: 'brandx self empty robot vacuum', searchVolume: 700, source: 'D', matchType: 'PHRASE' },
          { keyword: 'brandx laptop docking station', searchVolume: 650, source: 'D', matchType: 'PHRASE' },
          { keyword: 'brandx x300 robot vacuum', searchVolume: 640, source: 'D', matchType: 'PHRASE' },
          { keyword: 'robot vacuum for pet hair', searchVolume: 630, source: 'D', matchType: 'PHRASE' },
        ]),
      }
    })

    const result = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    const keywords = result.keywords.map((item) => item.keyword)

    expect(keywords).toContain('brandx robot vacuum')
    expect(keywords).toContain('brandx self empty robot vacuum')
    expect(keywords).toContain('robot vacuum for pet hair')
    expect(keywords).toContain('brandx')
    expect(keywords).not.toContain('brandx laptop docking station')
    expect(keywords).not.toContain('brandx x300 robot vacuum')
  })

  it('prefers creativeType narrowing over intent when both are provided', async () => {
    const resultByCreativeType = await getKeywords(77, {
      intent: 'brand',
      creativeType: 'brand_product',
      minSearchVolume: 0,
      maxKeywords: 20,
    })
    const resultByBucket = await getKeywords(77, {
      bucket: 'D',
      minSearchVolume: 0,
      maxKeywords: 20,
    })

    expect(resultByCreativeType.keywords.map((item) => item.keyword)).toEqual(
      resultByBucket.keywords.map((item) => item.keyword)
    )
  })
})
