import { describe, expect, it } from 'vitest'
import {
  buildProductModelFamilyContext,
  buildProductModelFamilyFallbackKeywords,
  filterKeywordObjectsByProductModelFamily,
  isKeywordInProductModelFamily,
  MODEL_INTENT_MIN_KEYWORD_FLOOR,
  supplementModelIntentKeywordsWithFallback,
} from '../model-intent-family-filter'

describe('model-intent-family-filter', () => {
  it('extracts current product model family signals from product evidence', () => {
    const context = buildProductModelFamilyContext({
      brand: 'Anker',
      product_name: 'Anker SOLIX F3800 Portable Power Station, 3840Wh, 6000W AC Output',
      offer_name: 'Anker_US_07',
      scraped_data: JSON.stringify({
        title: 'Anker SOLIX F3800 Portable Power Station',
        productTitle: 'Anker SOLIX F3800',
      }),
    })

    expect(context.modelCodes).toContain('f3800')
    expect(context.lineTerms).toContain('solix')
    expect(context.specTerms).toContain('3840wh')
    expect(context.specTerms).toContain('6000w')
  })

  it('keeps only keywords within current product model family', () => {
    const context = buildProductModelFamilyContext({
      brand: 'Anker',
      product_name: 'Anker SOLIX F3800 Portable Power Station, 3840Wh, 6000W AC Output',
      scraped_data: JSON.stringify({ productTitle: 'Anker SOLIX F3800' }),
    })

    const input = [
      { keyword: 'anker solix f3800 price', searchVolume: 100 },
      { keyword: 'anker solix portable power station', searchVolume: 80 },
      { keyword: 'anker solix c300x', searchVolume: 90 },
      { keyword: 'anker 25k power bank', searchVolume: 120 },
      { keyword: 'anker generator', searchVolume: 70 },
    ]

    const result = filterKeywordObjectsByProductModelFamily(input, context)
    const keywords = result.filtered.map((item) => item.keyword)

    expect(keywords).toContain('anker solix f3800 price')
    expect(keywords).not.toContain('anker solix portable power station')
    expect(keywords).not.toContain('anker solix c300x')
    expect(keywords).not.toContain('anker 25k power bank')
    expect(keywords).not.toContain('anker generator')
  })

  it('returns unchanged when offer has no model-family signals', () => {
    const context = buildProductModelFamilyContext({
      brand: 'BrandX',
      product_name: 'BrandX portable speaker',
    })

    const input = [
      { keyword: 'brandx speaker', searchVolume: 100 },
      { keyword: 'brandx bluetooth speaker', searchVolume: 80 },
    ]
    const result = filterKeywordObjectsByProductModelFamily(input, context)

    expect(result.filtered).toEqual(input)
    expect(result.removed).toHaveLength(0)
  })

  it('provides deterministic fallback keywords', () => {
    const context = buildProductModelFamilyContext({
      brand: 'Anker',
      product_name: 'Anker SOLIX F3800 Portable Power Station, 3840Wh',
      scraped_data: JSON.stringify({ productTitle: 'Anker SOLIX F3800' }),
    })
    const fallback = buildProductModelFamilyFallbackKeywords({
      context,
      brandName: 'Anker',
    })

    expect(fallback.some((item) => item.includes('f3800'))).toBe(true)
    expect(fallback.some((item) => item.includes('solix'))).toBe(true)
  })

  it('rejects foreign model code even when line term overlaps', () => {
    const context = {
      modelCodes: ['f3800'],
      lineTerms: ['solix'],
      specTerms: [],
      evidenceTexts: [],
    }

    expect(isKeywordInProductModelFamily('anker solix f3800', context)).toBe(true)
    expect(isKeywordInProductModelFamily('anker solix c300x', context)).toBe(false)
    expect(isKeywordInProductModelFamily('anker solix portable power station', context)).toBe(false)
  })

  it('extracts and matches numeric-only model codes', () => {
    const context = buildProductModelFamilyContext({
      brand: 'Anker',
      product_name: 'Anker 767 Solar Generator, 2048Wh Portable Power Station',
      scraped_data: JSON.stringify({ productTitle: 'Anker 767 Solar Generator' }),
    })

    expect(context.modelCodes).toContain('767')
    expect(isKeywordInProductModelFamily('anker 767 solar generator', context)).toBe(true)
    expect(isKeywordInProductModelFamily('anker 521 solar generator', context)).toBe(false)
  })

  it('supplements model_intent keywords to minimum floor with family fallback', () => {
    const context = buildProductModelFamilyContext({
      brand: 'Anker',
      product_name: 'Anker SOLIX F3800 Portable Power Station, 3840Wh, 6000W AC Output',
      scraped_data: JSON.stringify({ productTitle: 'Anker SOLIX F3800' }),
    })

    const base = [
      { keyword: 'anker solix f3800 price', searchVolume: 880, source: 'KEYWORD_POOL', matchType: 'EXACT' as const },
    ]

    const supplemented = supplementModelIntentKeywordsWithFallback({
      items: base,
      context,
      brandName: 'Anker',
      minKeywords: MODEL_INTENT_MIN_KEYWORD_FLOOR,
      buildFallbackItem: (keyword) => ({
        ...base[0],
        keyword,
        searchVolume: 0,
        source: 'MODEL_FAMILY_GUARD',
      }),
    })

    expect(supplemented.items.length).toBeGreaterThanOrEqual(MODEL_INTENT_MIN_KEYWORD_FLOOR)
    expect(supplemented.items.some((item) => item.keyword === 'anker solix f3800 price')).toBe(true)
    expect(supplemented.items.every((item) => item.keyword.includes('f3800') || item.keyword.includes('solix'))).toBe(true)
    expect(supplemented.addedKeywords.length).toBeGreaterThan(0)
  })

  it('builds fallback keywords from spec terms when model code is absent', () => {
    const fallback = buildProductModelFamilyFallbackKeywords({
      context: {
        modelCodes: [],
        lineTerms: ['everfrost'],
        specTerms: ['58l', '288wh'],
        evidenceTexts: [],
      },
      brandName: 'Anker',
    })

    expect(fallback).toContain('anker everfrost 58l')
    expect(fallback).toContain('anker 288wh')
    expect(fallback.length).toBeGreaterThanOrEqual(3)
  })
})
