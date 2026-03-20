import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getKeywordSourcePriority,
  getKeywordSourcePriorityScore,
  getKeywordSourceRank,
  inferKeywordDerivedTags,
  inferKeywordRawSource,
  normalizeKeywordSourceSubtype,
} from '../creative-keyword-source-priority'

describe('creative-keyword-source-priority', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps high-performing search term at top priority', () => {
    expect(getKeywordSourcePriorityScore('SEARCH_TERM_HIGH_PERFORMING')).toBe(100)
    expect(getKeywordSourcePriority('SEARCH_TERM_HIGH_PERFORMING').tier).toBe('T0')
    expect(getKeywordSourceRank('SEARCH_TERM_HIGH_PERFORMING')).toBe(10)
  })

  it('keeps scoring suggestions below planner tier', () => {
    const scoring = getKeywordSourcePriorityScore('SCORING_SUGGESTION')
    const planner = getKeywordSourcePriorityScore('KEYWORD_PLANNER')
    expect(scoring).toBeLessThan(planner)
    expect(getKeywordSourcePriority('SCORING_SUGGESTION').tier).toBe('T3')
  })

  it('keeps keyword pool as derived tier and below strong raw sources', () => {
    const keywordPool = getKeywordSourcePriority('KEYWORD_POOL')
    expect(keywordPool.tier).toBe('DERIVED')
    expect(keywordPool.score).toBeLessThan(getKeywordSourcePriorityScore('SEARCH_TERM'))
    expect(keywordPool.score).toBeGreaterThan(getKeywordSourcePriorityScore('AI_GENERATED'))
  })

  it('derives raw source/subtype/tags for legacy scoring and bucket sources', () => {
    expect(normalizeKeywordSourceSubtype({ source: 'SCORING_SUGGESTION' })).toBe('SCORING_SUGGESTION')
    expect(inferKeywordRawSource({ source: 'SCORING_SUGGESTION' })).toBe('GAP_ANALYSIS')
    expect(inferKeywordDerivedTags({ source: 'KEYWORD_POOL' })).toEqual(
      expect.arrayContaining(['KEYWORD_POOL', 'CANONICAL_BUCKET_VIEW'])
    )
  })

  it('supports rollback to legacy source ranking when unified priority is disabled', () => {
    vi.stubEnv('CREATIVE_KEYWORD_SOURCE_PRIORITY_UNIFIED_ENABLED', 'false')

    const scoring = getKeywordSourcePriorityScore('SCORING_SUGGESTION')
    const searchTerm = getKeywordSourcePriorityScore('SEARCH_TERM_HIGH_PERFORMING')

    expect(scoring).toBeGreaterThan(searchTerm)
    expect(getKeywordSourcePriority('KEYWORD_POOL').score).toBeGreaterThan(searchTerm)
  })

  it('falls back to legacy source-only subtype when ai source subtype flag is disabled', () => {
    vi.stubEnv('CREATIVE_KEYWORD_AI_SOURCE_SUBTYPE_ENABLED', 'false')

    expect(
      normalizeKeywordSourceSubtype({
        source: 'SEARCH_TERM',
        sourceType: 'AI_LLM_RAW',
      })
    ).toBe('SEARCH_TERM')
  })
})
