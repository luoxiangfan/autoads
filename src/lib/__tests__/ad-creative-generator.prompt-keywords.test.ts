import { describe, expect, it } from 'vitest'

import { resolveAdCreativePromptKeywordPlan } from '../ad-creative-generator'

describe('resolveAdCreativePromptKeywordPlan', () => {
  it('combines validated extracted keywords with capped title/about seeds', () => {
    const plan = resolveAdCreativePromptKeywordPlan({
      extractedKeywords: [
        { keyword: 'brandx x200 vacuum' },
        { keyword: 'brandx robot vacuum' },
        { keyword: 'brandx vacuum cleaner' },
        { keyword: 'brandx cordless vacuum' },
      ],
      titleAboutKeywordSeeds: [
        'buy brandx x200 vacuum',
        'brandx x200 setup guide',
      ],
      offerBrand: 'BrandX',
      targetLanguage: 'en',
    })

    expect(plan.validatedPromptKeywords).toEqual([
      'brandx x200 vacuum',
      'brandx robot vacuum',
      'brandx vacuum cleaner',
      'brandx cordless vacuum',
    ])
    expect(plan.contextualPromptKeywords).toEqual(['buy brandx x200 vacuum'])
    expect(plan.promptKeywords).toEqual([
      'brandx x200 vacuum',
      'brandx robot vacuum',
      'brandx vacuum cleaner',
      'brandx cordless vacuum',
      'buy brandx x200 vacuum',
    ])
  })

  it('falls back to brand-filtered ai keywords when extracted keywords are absent', () => {
    const plan = resolveAdCreativePromptKeywordPlan({
      aiKeywords: [
        'brandx robot vacuum',
        'robot vacuum deals',
        'brandx x200',
      ],
      offerBrand: 'BrandX',
      targetLanguage: 'en',
    })

    expect(plan.validatedPromptKeywords).toEqual([
      'brandx robot vacuum',
      'brandx x200',
    ])
    expect(plan.contextualPromptKeywords).toEqual([])
    expect(plan.promptKeywords).toEqual([
      'brandx robot vacuum',
      'brandx x200',
    ])
  })
})
