import { afterEach, describe, expect, it, vi } from 'vitest'
import { logKeywordSourceAudit, summarizeKeywordSourceAudit } from '../creative-keyword-audit-log'

describe('creative-keyword-audit-log', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('summarizes keyword source audit payload for structured logging', () => {
    const summary = summarizeKeywordSourceAudit({
      totalKeywords: 10,
      withSearchVolumeKeywords: 7,
      zeroVolumeKeywords: 3,
      volumeUnavailableKeywords: 2,
      noVolumeMode: true,
      fallbackMode: false,
      contextFallbackStrategy: 'filtered',
      byRawSource: {
        SEARCH_TERM: { count: 6, ratio: 0.6 },
        AI: { count: 3, ratio: 0.3 },
        GAP_ANALYSIS: { count: 1, ratio: 0.1 },
      },
      creativeAffinityByLabel: {
        PRODUCT: { count: 6, ratio: 0.6 },
        MIXED: { count: 3, ratio: 0.3 },
        BRAND: { count: 1, ratio: 0.1 },
      },
      creativeAffinityByLevel: {
        HIGH: { count: 7, ratio: 0.7 },
        MEDIUM: { count: 3, ratio: 0.3 },
      },
      sourceQuotaAudit: {
        acceptedCount: 10,
        deferredCount: 2,
        deferredRefillTriggered: true,
        deferredRefillCount: 1,
        underfillBeforeRefill: 1,
        blockedByCap: {
          lowTrust: 2,
          ai: 1,
          aiLlmRaw: 1,
        },
      },
    }, {
      triggered: true,
      beforeCount: 8,
      afterCount: 10,
      addedKeywords: [
        { keyword: 'brandx x200 vacuum', source: 'keyword_pool' },
        { keyword: 'brandx cordless vacuum', source: 'title_about' },
      ],
      supplementCapApplied: false,
    })

    expect(summary).toMatchObject({
      totalKeywords: 10,
      noVolumeMode: true,
      fallbackMode: false,
      contextFallbackStrategy: 'filtered',
      gateStates: {
        supplementTriggered: true,
        supplementBeforeCount: 8,
        supplementAfterCount: 10,
        supplementAddedCount: 2,
        sourceQuotaDeferredRefillTriggered: true,
      },
      topRawSources: [
        { key: 'SEARCH_TERM', count: 6 },
        { key: 'AI', count: 3 },
        { key: 'GAP_ANALYSIS', count: 1 },
      ],
      topCreativeAffinityLabels: [
        { key: 'PRODUCT', count: 6 },
        { key: 'MIXED', count: 3 },
        { key: 'BRAND', count: 1 },
      ],
      topCreativeAffinityLevels: [
        { key: 'HIGH', count: 7 },
        { key: 'MEDIUM', count: 3 },
      ],
      topFilterReasons: [
        { reason: 'blocked_low_trust_cap', count: 2 },
        { reason: 'blocked_ai_cap', count: 1 },
        { reason: 'blocked_ai_llm_raw_cap', count: 1 },
      ],
      sourceQuotaAudit: {
        acceptedCount: 10,
        deferredCount: 2,
        blockedByCap: {
          lowTrust: 2,
        },
        deferredRefillTriggered: true,
        deferredRefillCount: 1,
      },
    })
  })

  it('does not emit logs when audit log flag is disabled', () => {
    vi.stubEnv('CREATIVE_KEYWORD_AUDIT_LOG_ENABLED', 'false')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logKeywordSourceAudit({
      scopeLabel: 'unit-test',
      creativeType: 'product_intent',
      bucket: 'D',
      audit: {
        totalKeywords: 5,
      },
    })

    expect(logSpy).not.toHaveBeenCalled()
  })
})
