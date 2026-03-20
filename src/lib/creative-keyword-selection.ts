import { containsPureBrand, getPureBrandKeywords, isPureBrandKeyword } from './brand-keyword-utils'
import {
  deriveCanonicalCreativeType,
  hasModelAnchorEvidence,
  type CanonicalCreativeType,
} from './creative-type'
import {
  getKeywordSourceRankFromInput,
  inferKeywordDerivedTags,
  inferKeywordRawSource,
  normalizeKeywordSourceSubtype,
} from './creative-keyword-source-priority'
import { normalizeGoogleAdsKeyword } from './google-ads-keyword-normalizer'

export const CREATIVE_KEYWORD_MAX_COUNT = 50
export const CREATIVE_BRAND_KEYWORD_RESERVE = 10
export const CREATIVE_KEYWORD_MAX_WORDS = 6
export const CREATIVE_KEYWORD_MAX_WORDS_BY_TYPE: Record<CanonicalCreativeType, number> = {
  brand_intent: 6,
  model_intent: 7,
  product_intent: 8,
}
const MODEL_INTENT_BRAND_FLOOR = 3

type CreativeBucket = 'A' | 'B' | 'C' | 'D' | 'S'
export type CreativeKeywordMatchType = 'EXACT' | 'PHRASE' | 'BROAD'

export interface KeywordAuditMetadata {
  sourceType?: string
  sourceSubtype?: string
  rawSource?: string
  derivedTags?: string[]
  sourceField?: string
  anchorType?: string
  evidence?: string[]
  suggestedMatchType?: CreativeKeywordMatchType
  confidence?: number
  qualityReason?: string
  rejectionReason?: string
}

export interface CreativeKeywordLike extends KeywordAuditMetadata {
  keyword: string
  searchVolume: number
  competition?: string
  competitionIndex?: number
  source?: string
  matchType?: CreativeKeywordMatchType
  lowTopPageBid?: number
  highTopPageBid?: number
  volumeUnavailableReason?: 'DEV_TOKEN_INSUFFICIENT_ACCESS'
}

export interface SelectCreativeKeywordsInput {
  keywords?: string[]
  keywordsWithVolume?: CreativeKeywordLike[]
  brandName?: string
  creativeType?: CanonicalCreativeType | null
  bucket?: CreativeBucket | null
  preferredBucketKeywords?: string[]
  fallbackMode?: boolean
  maxKeywords?: number
  brandReserve?: number
  minBrandKeywords?: number
  brandOnly?: boolean
  maxWords?: number
}

export interface SelectCreativeKeywordsOutput {
  keywords: string[]
  keywordsWithVolume: CreativeKeywordLike[]
  truncated: boolean
  sourceQuotaAudit: CreativeKeywordSourceQuotaAudit
}

interface RankedCandidate extends CreativeKeywordLike {
  normalized: string
  permutationKey: string
  originalIndex: number
  isBrand: boolean
  isPureBrand: boolean
  isPreferredBucket: boolean
  sourceRank: number
  matchTypeRank: number
  intentRank: number
  wordCount: number
}

export interface SourceQuotaConfig {
  combinedLowTrustCap: number
  aiCap: number
  aiLlmRawCap: number
}

export interface CreativeKeywordSourceQuotaAudit {
  enabled: boolean
  fallbackMode: boolean
  targetCount: number
  requiredBrandCount: number
  acceptedBrandCount: number
  acceptedCount: number
  deferredCount: number
  deferredRefillCount: number
  deferredRefillTriggered: boolean
  underfillBeforeRefill: number
  quota: SourceQuotaConfig
  acceptedByClass: {
    lowTrust: number
    ai: number
    aiLlmRaw: number
  }
  blockedByCap: {
    lowTrust: number
    ai: number
    aiLlmRaw: number
  }
}

const D_INTENT_PATTERN = /\b(buy|price|deal|sale|discount|coupon|offer|cost|cheap|best|review|reviews?)\b/i
const A_TRUST_PATTERN = /\b(official|authentic|original|genuine|warranty|trusted|brand)\b/i
const B_SCENARIO_PATTERN = /\b(for|outdoor|indoor|home|office|garden|yard|driveway|wall|path|walkway|pool|tree)\b/i
const PLATFORM_PATTERN = /\b(amazon|walmart|ebay|etsy|aliexpress|temu)\b/i
const COMMUNITY_PATTERN = /\b(reddit|quora|forum|forums)\b/i
const INFO_QUERY_PATTERN = /\b(what is|meaning|tutorial|guide|manual|how to|instructions?)\b/i
const QUESTION_PREFIX_PATTERN = /^(?:what|why|how|when|where|who|which|is|are|do|does|can|should|could)\b/i
const REVIEW_COMPARE_PATTERN = /\b(review|reviews|comparison|compare|vs)\b/i
const PRICE_TRACKER_PATTERN = /\b(price\s*tracker|track(?:ing)?\s*price)\b/i
const NOISE_STACK_PATTERN = /\b(electronics?\s+photo\s+wearable\s+technology|photo\s+wearable\s+technology)\b/i
const PROMO_PATTERN = /\b(discount|coupon|cheap|sale|deal|offer|promo|price|cost)\b/i
const STORE_NAV_PATTERN = /\b(official\s+store|store\s+locator|near\s+me|shop\s+near\s+me)\b/i
const FEATURE_SCENARIO_PATTERN = /\b(cordless|wireless|portable|smart|pet|outdoor|indoor|home|office|travel|waterproof|quiet|fast|compact|lightweight)\b/i
const NON_ANCHOR_TOKENS = new Set([
  'official', 'store', 'shop', 'near', 'me', 'brand', 'buy', 'sale', 'deal', 'discount',
  'coupon', 'offer', 'promo', 'price', 'cost', 'cheap', 'best', 'review', 'reviews',
  'comparison', 'compare', 'vs', 'online', 'for', 'with', 'and', 'the', 'a', 'an',
])

function normalizeSourceRank(source: string | undefined, sourceType: string | undefined): number {
  return getKeywordSourceRankFromInput({ source, sourceType })
}

export function resolveCreativeKeywordMaxWords(creativeType: CanonicalCreativeType | null | undefined): number {
  if (!creativeType) return CREATIVE_KEYWORD_MAX_WORDS
  return CREATIVE_KEYWORD_MAX_WORDS_BY_TYPE[creativeType] || CREATIVE_KEYWORD_MAX_WORDS
}

function normalizeMatchTypeRank(matchType: string | undefined): number {
  const normalized = String(matchType || '').toUpperCase()
  if (normalized === 'EXACT') return 3
  if (normalized === 'PHRASE') return 2
  if (normalized === 'BROAD') return 1
  return 0
}

function normalizeAuditString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const normalized = Array.from(new Set(
    value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  )).slice(0, 4)

  return normalized.length > 0 ? normalized : undefined
}

function normalizeConfidence(value: unknown): number | undefined {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100))
}

function normalizeAuditTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = Array.from(
    new Set(
      value
        .map((item) => normalizeAuditString(item))
        .filter((item): item is string => Boolean(item))
    )
  ).slice(0, 8)
  return normalized.length > 0 ? normalized : undefined
}

function inferSourceField(source: string | undefined): string | undefined {
  const normalized = String(source || '').trim().toUpperCase()
  if (!normalized) return undefined

  if (normalized === 'SEARCH_TERM' || normalized === 'SEARCH_TERM_HIGH_PERFORMING') return 'search_terms'
  if (normalized.startsWith('KEYWORD_PLANNER') || normalized === 'PLANNER' || normalized === 'GLOBAL_KEYWORD') {
    return 'keyword_planner'
  }
  if (normalized === 'HOT_PRODUCT_AGGREGATE') return 'hot_products'
  if (normalized === 'PARAM_EXTRACT') return 'product_params'
  if (normalized === 'TITLE_EXTRACT') return 'title'
  if (normalized === 'ABOUT_EXTRACT') return 'about'
  if (normalized === 'PAGE_EXTRACT') return 'page_content'
  if (normalized === 'KEYWORD_POOL' || normalized === 'LEGACY_BUCKET' || normalized === 'MERGED') {
    return 'keyword_pool'
  }
  if (normalized === 'BRAND_SEED') return 'brand'
  if (
    normalized === 'AI_GENERATED'
    || normalized === 'AI_ENHANCED'
    || normalized === 'KEYWORD_EXPANSION'
    || normalized === 'SCORING_SUGGESTION'
    || normalized === 'BRANDED_INDUSTRY_TERM'
  ) {
    return 'ai'
  }

  return undefined
}

function hasDemandAnchor(keyword: string, brandName: string | undefined): boolean {
  const normalized = normalizeGoogleAdsKeyword(keyword)
  if (!normalized) return false

  const brandTokens = new Set(
    normalizeGoogleAdsKeyword(brandName || '')
      ?.split(/\s+/)
      .filter(Boolean) || []
  )
  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => token.length > 2)
    .filter((token) => !brandTokens.has(token))

  return tokens.some((token) => !NON_ANCHOR_TOKENS.has(token))
}

function buildPermutationKey(keyword: string): string {
  const normalized = normalizeGoogleAdsKeyword(keyword)
  if (!normalized) return ''
  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (tokens.length <= 1) return normalized
  return [...tokens].sort().join(' ')
}

function isLowQualityCandidate(candidate: {
  keyword: string
  normalized: string
  isBrand: boolean
  isPureBrand: boolean
  isPreferredBucket?: boolean
}, creativeType: CanonicalCreativeType | null, brandName: string | undefined): boolean {
  const text = candidate.normalized
  if (!text) return true
  const hasModelAnchor = hasModelAnchorEvidence({ keywords: [text] })
  const hasDemand = hasDemandAnchor(text, brandName)
  if (PLATFORM_PATTERN.test(text)) return true
  if (COMMUNITY_PATTERN.test(text)) return true
  if (INFO_QUERY_PATTERN.test(text)) return true
  if (QUESTION_PREFIX_PATTERN.test(text)) return true
  if (REVIEW_COMPARE_PATTERN.test(text)) return true
  if (PRICE_TRACKER_PATTERN.test(text)) return true
  if (NOISE_STACK_PATTERN.test(text)) return true
  if (STORE_NAV_PATTERN.test(text) && !hasDemand) return true
  if (PROMO_PATTERN.test(text) && !hasDemand && !hasModelAnchor) return true
  if (creativeType === 'brand_intent' && candidate.isBrand && !candidate.isPureBrand && !hasDemand && !hasModelAnchor) return true
  if (
    creativeType === 'model_intent'
    && !hasModelAnchor
    && !(candidate.isPreferredBucket && candidate.isBrand && hasDemand)
  ) {
    return true
  }
  if (creativeType === 'model_intent' && candidate.isPureBrand) return true
  return false
}

function inferAnchorType(candidate: {
  keyword: string
  isBrand: boolean
  brandName?: string
}): string | undefined {
  const hasModelAnchor = hasModelAnchorEvidence({ keywords: [candidate.keyword] })
  const hasDemand = hasDemandAnchor(candidate.keyword, candidate.brandName)

  if (hasModelAnchor && candidate.isBrand) return 'brand_model'
  if (hasModelAnchor) return 'model'
  if (candidate.isBrand && hasDemand) return 'brand_product'
  if (candidate.isBrand) return 'brand'
  if (hasDemand) return 'product'
  return undefined
}

function buildAuditEvidence(candidate: RankedCandidate, brandName: string | undefined): string[] | undefined {
  const fromInput = normalizeEvidence(candidate.evidence)
  if (fromInput) return fromInput

  const normalized = normalizeGoogleAdsKeyword(candidate.keyword)
  if (!normalized) return undefined

  const brandTokens = new Set(
    normalizeGoogleAdsKeyword(brandName || '')
      ?.split(/\s+/)
      .filter(Boolean) || []
  )
  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !NON_ANCHOR_TOKENS.has(token))
    .slice(0, 3)

  if (tokens.length > 0) return tokens
  if (brandTokens.size > 0) return Array.from(brandTokens).slice(0, 2)
  return [normalized]
}

function inferKeywordConfidence(
  candidate: RankedCandidate,
  creativeType: CanonicalCreativeType | null,
  finalMatchType: CreativeKeywordMatchType
): number {
  const provided = normalizeConfidence(candidate.confidence)
  if (provided !== undefined) return provided

  let confidence = 0.42
  confidence += Math.min(candidate.sourceRank, 10) * 0.035
  confidence += Math.max(candidate.intentRank, 0) * 0.03
  confidence += finalMatchType === 'EXACT' ? 0.08 : finalMatchType === 'PHRASE' ? 0.04 : 0
  confidence += candidate.isBrand ? 0.05 : 0
  confidence += candidate.searchVolume > 0 ? 0.03 : 0

  if (creativeType === 'model_intent' && hasModelAnchorEvidence({ keywords: [candidate.keyword] })) {
    confidence += 0.1
  }

  return Math.max(0.35, Math.min(0.99, Math.round(confidence * 100) / 100))
}

function inferQualityReason(
  candidate: RankedCandidate,
  creativeType: CanonicalCreativeType | null,
  brandName: string | undefined,
  finalMatchType: CreativeKeywordMatchType
): string | undefined {
  const existing = normalizeAuditString(candidate.qualityReason)
  if (existing) return existing

  const reasons: string[] = []
  const sourceField = inferSourceField(candidate.source)
  const hasModelAnchor = hasModelAnchorEvidence({ keywords: [candidate.keyword] })
  const hasDemand = hasDemandAnchor(candidate.keyword, brandName)

  if (sourceField === 'search_terms') reasons.push('来自真实搜索词')
  else if (sourceField === 'keyword_planner') reasons.push('来自关键词规划器')
  else if (sourceField === 'hot_products') reasons.push('来自热门商品线')
  else if (sourceField === 'product_params') reasons.push('来自商品参数')
  else if (sourceField === 'title') reasons.push('来自标题')

  if (creativeType === 'model_intent' && hasModelAnchor) reasons.push('包含型号锚点')
  else if (candidate.isBrand && hasDemand) reasons.push('品牌与商品强相关')
  else if (hasDemand) reasons.push('与商品需求相关')

  if (creativeType === 'model_intent' && finalMatchType === 'EXACT') {
    reasons.push('适合完全匹配')
  }

  return reasons.length > 0 ? reasons.slice(0, 2).join('；') : undefined
}

function computeIntentRank(params: {
  keyword: string
  creativeType: CanonicalCreativeType | null
  bucket: CreativeBucket | null | undefined
  isBrand: boolean
  isPureBrand: boolean
  brandName?: string
}): number {
  const { keyword, bucket, isBrand, isPureBrand, brandName } = params
  const creativeType = params.creativeType
    || deriveCanonicalCreativeType({ creativeType: null, keywordBucket: bucket, keywords: [keyword] })
  const text = String(keyword || '')
  const hasModelAnchor = hasModelAnchorEvidence({ keywords: [text] })
  const hasDemand = hasDemandAnchor(text, brandName)

  if (creativeType === 'brand_intent') {
    let score = 0
    if (isBrand) score += 2
    if (hasDemand) score += 3
    if (hasModelAnchor) score += 1
    if (A_TRUST_PATTERN.test(text)) score += 1
    if (isPureBrand) score -= 4
    return score
  }

  if (creativeType === 'model_intent') {
    let score = 0
    if (hasModelAnchor) score += 6
    if (isBrand) score += 1
    if (!hasModelAnchor) score -= 8
    return score
  }

  if (creativeType === 'product_intent') {
    let score = 0
    if (hasDemand) score += 3
    if (FEATURE_SCENARIO_PATTERN.test(text)) score += 2
    if (D_INTENT_PATTERN.test(text)) score -= 1
    if (B_SCENARIO_PATTERN.test(text)) score += 1
    if (isPureBrand) score -= 4
    return score
  }

  return 0
}

function compareRankedCandidates(a: RankedCandidate, b: RankedCandidate): number {
  if (a.intentRank !== b.intentRank) return b.intentRank - a.intentRank
  if (a.isPreferredBucket !== b.isPreferredBucket) return Number(b.isPreferredBucket) - Number(a.isPreferredBucket)
  if (a.isPureBrand !== b.isPureBrand) return Number(b.isPureBrand) - Number(a.isPureBrand)
  if (a.isBrand !== b.isBrand) return Number(b.isBrand) - Number(a.isBrand)
  if (a.sourceRank !== b.sourceRank) return b.sourceRank - a.sourceRank
  if (a.searchVolume !== b.searchVolume) return b.searchVolume - a.searchVolume
  if (a.matchTypeRank !== b.matchTypeRank) return b.matchTypeRank - a.matchTypeRank
  if (a.wordCount !== b.wordCount) return a.wordCount - b.wordCount
  if (a.keyword.length !== b.keyword.length) return a.keyword.length - b.keyword.length
  return a.originalIndex - b.originalIndex
}

function resolveSourceQuotaConfig(maxKeywords: number, fallbackMode: boolean): SourceQuotaConfig {
  const safeMax = Math.max(1, Math.floor(maxKeywords))
  const combinedRatio = fallbackMode ? 0.35 : 0.2
  const aiRatio = fallbackMode ? 0.25 : 0.15
  const aiLlmRawRatio = fallbackMode ? 0.15 : 0.1

  return {
    combinedLowTrustCap: Math.max(1, Math.floor(safeMax * combinedRatio)),
    aiCap: Math.max(1, Math.floor(safeMax * aiRatio)),
    aiLlmRawCap: Math.max(1, Math.floor(safeMax * aiLlmRawRatio)),
  }
}

function resolvePreferredBucketRequiredCount(params: {
  creativeType: CanonicalCreativeType | null
  maxKeywords: number
  preferredAvailableCount: number
}): number {
  if (params.preferredAvailableCount <= 0) return 0

  const creativeType = params.creativeType
  let ratio = 0.4
  let floor = 10
  if (creativeType === 'brand_intent') {
    ratio = 0.55
    floor = 15
  } else if (creativeType === 'model_intent') {
    ratio = 0.45
    floor = 8
  } else if (creativeType === 'product_intent') {
    ratio = 0.5
    floor = 15
  }

  const target = Math.max(floor, Math.ceil(params.maxKeywords * ratio))
  return Math.min(params.maxKeywords, params.preferredAvailableCount, target)
}

function isAiSubtype(sourceSubtype: string | undefined): boolean {
  const normalized = String(sourceSubtype || '').trim().toUpperCase()
  if (!normalized) return false
  if (normalized.startsWith('AI_')) return true
  return normalized === 'KEYWORD_EXPANSION'
}

function isAiLlmRawSubtype(sourceSubtype: string | undefined): boolean {
  const normalized = String(sourceSubtype || '').trim().toUpperCase()
  return (
    normalized === 'AI_LLM_RAW'
    || normalized === 'AI_GENERATED'
    || normalized === 'AI_FALLBACK_PLACEHOLDER'
  )
}

function isScoringSubtype(sourceSubtype: string | undefined): boolean {
  const normalized = String(sourceSubtype || '').trim().toUpperCase()
  return (
    normalized === 'SCORING_SUGGESTION'
    || normalized === 'GAP_INDUSTRY_BRANDED'
    || normalized === 'BRANDED_INDUSTRY_TERM'
  )
}

function classifyCandidateSource(candidate: RankedCandidate): {
  lowTrust: boolean
  ai: boolean
  aiLlmRaw: boolean
} {
  const sourceSubtype = normalizeKeywordSourceSubtype({
    source: candidate.source,
    sourceType: candidate.sourceSubtype || candidate.sourceType,
  })
  const rawSource = inferKeywordRawSource({
    source: candidate.source,
    sourceType: sourceSubtype || candidate.sourceType,
  })

  const ai = rawSource === 'AI' || isAiSubtype(sourceSubtype)
  const aiLlmRaw = isAiLlmRawSubtype(sourceSubtype)
  const lowTrust = ai || isScoringSubtype(sourceSubtype)

  return {
    lowTrust,
    ai,
    aiLlmRaw,
  }
}

function applySourceQuotaOnSelectedCandidates(input: {
  selectedList: RankedCandidate[]
  maxKeywords: number
  requiredBrandCount: number
  requiredPreferredBucketCount: number
  fallbackMode: boolean
}): {
  selectedList: RankedCandidate[]
  audit: CreativeKeywordSourceQuotaAudit
} {
  const quota = resolveSourceQuotaConfig(input.maxKeywords, input.fallbackMode)
  const targetCount = Math.min(input.maxKeywords, input.selectedList.length)
  if (targetCount <= 0) {
    return {
      selectedList: [],
      audit: {
        enabled: true,
        fallbackMode: input.fallbackMode,
        targetCount: 0,
        requiredBrandCount: Math.max(0, input.requiredBrandCount),
        acceptedBrandCount: 0,
        acceptedCount: 0,
        deferredCount: 0,
        deferredRefillCount: 0,
        deferredRefillTriggered: false,
        underfillBeforeRefill: 0,
        quota,
        acceptedByClass: {
          lowTrust: 0,
          ai: 0,
          aiLlmRaw: 0,
        },
        blockedByCap: {
          lowTrust: 0,
          ai: 0,
          aiLlmRaw: 0,
        },
      },
    }
  }

  const accepted: RankedCandidate[] = []
  const deferred: RankedCandidate[] = []

  let acceptedBrandCount = 0
  let acceptedPreferredBucketCount = 0
  let acceptedLowTrustCount = 0
  let acceptedAiCount = 0
  let acceptedAiLlmRawCount = 0
  let blockedLowTrustCount = 0
  let blockedAiCount = 0
  let blockedAiLlmRawCount = 0

  const pushAccepted = (candidate: RankedCandidate, classification: {
    lowTrust: boolean
    ai: boolean
    aiLlmRaw: boolean
  }) => {
    accepted.push(candidate)
    if (candidate.isBrand) acceptedBrandCount += 1
    if (candidate.isPreferredBucket) acceptedPreferredBucketCount += 1
    if (classification.lowTrust) acceptedLowTrustCount += 1
    if (classification.ai) acceptedAiCount += 1
    if (classification.aiLlmRaw) acceptedAiLlmRawCount += 1
  }

  for (const candidate of input.selectedList) {
    if (accepted.length >= targetCount) break
    const classification = classifyCandidateSource(candidate)

    const shouldReserveBrand = candidate.isBrand && acceptedBrandCount < input.requiredBrandCount
    const shouldReservePreferredBucket = (
      candidate.isPreferredBucket
      && acceptedPreferredBucketCount < input.requiredPreferredBucketCount
    )
    if (shouldReserveBrand || shouldReservePreferredBucket) {
      pushAccepted(candidate, classification)
      continue
    }

    if (classification.lowTrust && acceptedLowTrustCount >= quota.combinedLowTrustCap) {
      blockedLowTrustCount += 1
      deferred.push(candidate)
      continue
    }
    if (classification.ai && acceptedAiCount >= quota.aiCap) {
      blockedAiCount += 1
      deferred.push(candidate)
      continue
    }
    if (classification.aiLlmRaw && acceptedAiLlmRawCount >= quota.aiLlmRawCap) {
      blockedAiLlmRawCount += 1
      deferred.push(candidate)
      continue
    }

    pushAccepted(candidate, classification)
  }

  // fallback exit: if quota causes underfill, gradually re-introduce deferred items by original order.
  let deferredRefillCount = 0
  const underfillBeforeRefill = Math.max(0, targetCount - accepted.length)
  if (accepted.length < targetCount) {
    for (const candidate of deferred) {
      if (accepted.length >= targetCount) break
      deferredRefillCount += 1
      pushAccepted(candidate, classifyCandidateSource(candidate))
    }
  }

  return {
    selectedList: accepted.sort(compareRankedCandidates),
    audit: {
      enabled: true,
      fallbackMode: input.fallbackMode,
      targetCount,
      requiredBrandCount: Math.max(0, input.requiredBrandCount),
      acceptedBrandCount,
      acceptedCount: accepted.length,
      deferredCount: deferred.length,
      deferredRefillCount,
      deferredRefillTriggered: deferredRefillCount > 0,
      underfillBeforeRefill,
      quota,
      acceptedByClass: {
        lowTrust: acceptedLowTrustCount,
        ai: acceptedAiCount,
        aiLlmRaw: acceptedAiLlmRawCount,
      },
      blockedByCap: {
        lowTrust: blockedLowTrustCount,
        ai: blockedAiCount,
        aiLlmRaw: blockedAiLlmRawCount,
      },
    },
  }
}

function rebalanceModelIntentCandidates(input: {
  selectedList: RankedCandidate[]
  maxKeywords: number
}): RankedCandidate[] {
  const selectedList = Array.isArray(input.selectedList) ? input.selectedList : []
  if (selectedList.length <= 1) return selectedList

  const modelCandidates = selectedList
    .filter((candidate) => hasModelAnchorEvidence({ keywords: [candidate.keyword] }))
    .sort(compareRankedCandidates)
  if (modelCandidates.length === 0) return selectedList

  const nonModelCandidates = selectedList
    .filter((candidate) => !hasModelAnchorEvidence({ keywords: [candidate.keyword] }))
    .sort(compareRankedCandidates)
  if (nonModelCandidates.length === 0) return selectedList

  const maxNonModelCount = Math.max(6, Math.floor(input.maxKeywords * 0.2))
  if (nonModelCandidates.length <= maxNonModelCount) return selectedList

  return [
    ...modelCandidates,
    ...nonModelCandidates.slice(0, maxNonModelCount),
  ]
    .sort(compareRankedCandidates)
    .slice(0, input.maxKeywords)
}

function composeBrandedKeyword(keyword: string, normalizedBrand: string, maxWords: number): string | null {
  const brandTokens = normalizedBrand.split(/\s+/).filter(Boolean)
  if (brandTokens.length === 0) return null

  const normalizedKeyword = normalizeGoogleAdsKeyword(keyword)
  if (!normalizedKeyword) return null
  const keywordTokens = normalizedKeyword.split(/\s+/).filter(Boolean)
  if (keywordTokens.length === 0) return null

  const remainder: string[] = []
  for (let i = 0; i < keywordTokens.length;) {
    let matchesBrand = true
    for (let j = 0; j < brandTokens.length; j += 1) {
      if (keywordTokens[i + j] !== brandTokens[j]) {
        matchesBrand = false
        break
      }
    }

    if (matchesBrand) {
      i += brandTokens.length
      continue
    }

    remainder.push(keywordTokens[i])
    i += 1
  }

  const combinedTokens = [...brandTokens, ...remainder]
  if (combinedTokens.length < 2 || combinedTokens.length > maxWords) return null
  return combinedTokens.join(' ')
}

function ensureBrandCoverage(
  candidates: RankedCandidate[],
  input: SelectCreativeKeywordsInput,
  maxWords: number,
  targetBrandCount: number
): RankedCandidate[] {
  if (targetBrandCount <= 0) return candidates

  const normalizedBrand = normalizeGoogleAdsKeyword(input.brandName || '')
  if (!normalizedBrand || normalizedBrand === 'unknown') return candidates

  const pureBrandKeywords = getPureBrandKeywords(normalizedBrand)
  if (pureBrandKeywords.length === 0) return candidates

  const existing = new Set(candidates.map(candidate => candidate.normalized))
  const existingBrandCount = candidates.filter(candidate => candidate.isBrand).length
  if (existingBrandCount >= targetBrandCount) return candidates

  const nonBrandCandidates = candidates
    .filter(candidate => !candidate.isBrand)
    .sort(compareRankedCandidates)

  const augmented: RankedCandidate[] = [...candidates]
  let nextIndex = candidates.reduce((max, candidate) => Math.max(max, candidate.originalIndex), -1) + 1
  let brandCount = existingBrandCount

  for (const candidate of nonBrandCandidates) {
    if (brandCount >= targetBrandCount) break

    const brandedKeyword = composeBrandedKeyword(candidate.keyword, normalizedBrand, maxWords)
    if (!brandedKeyword) continue

    const normalized = normalizeGoogleAdsKeyword(brandedKeyword)
    if (!normalized || existing.has(normalized)) continue

    const wordCount = normalized.split(/\s+/).filter(Boolean).length || 1
    if (wordCount > maxWords) continue

    const isBrand = containsPureBrand(brandedKeyword, pureBrandKeywords)
    if (!isBrand) continue

    // 🐛 修复(2026-03-14): 品牌前置后的关键词不应继承原始搜索量
    const augmentedCandidate: RankedCandidate = {
      ...candidate,
      keyword: brandedKeyword,
      normalized,
      originalIndex: nextIndex,
      isBrand: true,
      isPureBrand: isPureBrandKeyword(brandedKeyword, pureBrandKeywords),
      intentRank: computeIntentRank({
        keyword: brandedKeyword,
        creativeType: input.creativeType || null,
        bucket: input.bucket,
        isBrand: true,
        isPureBrand: isPureBrandKeyword(brandedKeyword, pureBrandKeywords),
        brandName: input.brandName,
      }),
      wordCount,
      searchVolume: 0, // 品牌前置后的关键词需要重新查询真实搜索量
    }
    nextIndex += 1
    brandCount += 1
    existing.add(normalized)
    augmented.push(augmentedCandidate)
  }

  return augmented
}

function ensurePureBrandCoverage(
  candidates: RankedCandidate[],
  input: SelectCreativeKeywordsInput,
  maxWords: number,
  targetPureBrandCount: number
): RankedCandidate[] {
  if (targetPureBrandCount <= 0) return candidates
  if (input.creativeType !== 'brand_intent' && input.creativeType !== 'product_intent') return candidates

  const normalizedBrand = normalizeGoogleAdsKeyword(input.brandName || '')
  if (!normalizedBrand || normalizedBrand === 'unknown') return candidates

  const pureBrandKeywords = getPureBrandKeywords(normalizedBrand)
  if (pureBrandKeywords.length === 0) return candidates

  const existing = new Set(candidates.map((candidate) => candidate.normalized))
  const existingPureBrandCount = candidates.filter((candidate) => candidate.isPureBrand).length
  if (existingPureBrandCount >= targetPureBrandCount) return candidates

  const augmented: RankedCandidate[] = [...candidates]
  let nextIndex = candidates.reduce((max, candidate) => Math.max(max, candidate.originalIndex), -1) + 1
  let pureBrandCount = existingPureBrandCount

  for (const keyword of pureBrandKeywords) {
    if (pureBrandCount >= targetPureBrandCount) break

    const normalized = normalizeGoogleAdsKeyword(keyword)
    if (!normalized || existing.has(normalized)) continue

    const wordCount = normalized.split(/\s+/).filter(Boolean).length || 1
    if (wordCount > maxWords) continue

    augmented.push({
      keyword,
      searchVolume: 0,
      source: 'BRAND_SEED',
      matchType: 'PHRASE',
      sourceType: 'BRAND_SEED',
      sourceField: 'brand',
      anchorType: 'brand',
      evidence: pureBrandKeywords.slice(0, 2),
      suggestedMatchType: 'PHRASE',
      confidence: 0.88,
      qualityReason: '纯品牌词兜底保留',
      normalized,
      permutationKey: buildPermutationKey(keyword),
      originalIndex: nextIndex,
      isBrand: true,
      isPureBrand: true,
      isPreferredBucket: false,
      sourceRank: normalizeSourceRank('BRAND_SEED', undefined),
      matchTypeRank: normalizeMatchTypeRank('PHRASE'),
      intentRank: computeIntentRank({
        keyword,
        creativeType: input.creativeType || null,
        bucket: input.bucket,
        isBrand: true,
        isPureBrand: true,
        brandName: input.brandName,
      }),
      wordCount,
    })
    nextIndex += 1
    pureBrandCount += 1
    existing.add(normalized)
  }

  return augmented
}

function toRankedCandidates(input: SelectCreativeKeywordsInput, maxWords: number): RankedCandidate[] {
  const normalizedBrand = normalizeGoogleAdsKeyword(input.brandName || '')
  const pureBrandKeywords =
    normalizedBrand && normalizedBrand !== 'unknown'
      ? getPureBrandKeywords(normalizedBrand)
      : []

  const merged: CreativeKeywordLike[] = []
  const preferredBucketSet = new Set(
    (Array.isArray(input.preferredBucketKeywords) ? input.preferredBucketKeywords : [])
      .map((keyword) => normalizeGoogleAdsKeyword(keyword))
      .filter((keyword): keyword is string => Boolean(keyword))
  )

  if (Array.isArray(input.keywordsWithVolume)) {
    for (const item of input.keywordsWithVolume) {
      if (!item || typeof item !== 'object') continue
      merged.push({
        keyword: String(item.keyword || '').trim(),
        searchVolume: Number(item.searchVolume || 0) || 0,
        competition: item.competition,
        competitionIndex: item.competitionIndex,
        source: item.source,
        matchType: item.matchType,
        sourceType: item.sourceType,
        sourceSubtype: item.sourceSubtype,
        rawSource: item.rawSource,
        derivedTags: item.derivedTags,
        sourceField: item.sourceField,
        anchorType: item.anchorType,
        evidence: item.evidence,
        suggestedMatchType: item.suggestedMatchType,
        confidence: item.confidence,
        qualityReason: item.qualityReason,
        rejectionReason: item.rejectionReason,
        lowTopPageBid: item.lowTopPageBid,
        highTopPageBid: item.highTopPageBid,
        volumeUnavailableReason: item.volumeUnavailableReason,
      })
    }
  }

  if (Array.isArray(input.keywords)) {
    for (const rawKeyword of input.keywords) {
      const keyword = String(rawKeyword || '').trim()
      if (!keyword) continue
      merged.push({
        keyword,
        searchVolume: 0,
        source: 'AI_GENERATED',
        matchType: 'PHRASE',
        sourceType: 'AI_LLM_RAW',
        sourceSubtype: 'AI_LLM_RAW',
        rawSource: 'AI',
        derivedTags: ['AI_LLM_RAW'],
        sourceField: 'ai',
        suggestedMatchType: 'PHRASE',
      })
    }
  }

  const dedupedByNormalized = new Map<string, RankedCandidate>()
  for (let i = 0; i < merged.length; i += 1) {
    const candidate = merged[i]
    const keyword = String(candidate.keyword || '').trim()
    if (!keyword) continue

    const normalized = normalizeGoogleAdsKeyword(keyword)
    if (!normalized) continue
    const wordCount = normalized.split(/\s+/).filter(Boolean).length || 1
    if (wordCount > maxWords) continue

    const isBrand = pureBrandKeywords.length > 0
      ? containsPureBrand(keyword, pureBrandKeywords)
      : false
    const isPureBrand = pureBrandKeywords.length > 0
      ? isPureBrandKeyword(keyword, pureBrandKeywords)
      : false

    const ranked: RankedCandidate = {
      ...candidate,
      keyword,
      normalized,
      permutationKey: buildPermutationKey(keyword),
      originalIndex: i,
      isBrand,
      isPureBrand,
      isPreferredBucket: preferredBucketSet.has(normalized),
      sourceRank: normalizeSourceRank(candidate.source, candidate.sourceType),
      matchTypeRank: normalizeMatchTypeRank(candidate.matchType),
      intentRank: computeIntentRank({
        keyword,
        creativeType: input.creativeType || null,
        bucket: input.bucket,
        isBrand,
        isPureBrand,
        brandName: input.brandName,
      }),
      wordCount,
      searchVolume: Number(candidate.searchVolume || 0) || 0,
    }
    if (isLowQualityCandidate(ranked, input.creativeType || null, input.brandName)) {
      continue
    }

    const existing = dedupedByNormalized.get(normalized)
    if (!existing || compareRankedCandidates(ranked, existing) < 0) {
      dedupedByNormalized.set(normalized, ranked)
    }
  }

  const dedupedByPermutation = new Map<string, RankedCandidate>()
  for (const candidate of dedupedByNormalized.values()) {
    const permutationKey = candidate.permutationKey || candidate.normalized
    const existing = dedupedByPermutation.get(permutationKey)
    if (!existing || compareRankedCandidates(candidate, existing) < 0) {
      dedupedByPermutation.set(permutationKey, candidate)
    }
  }

  return Array.from(dedupedByPermutation.values())
}

export function selectCreativeKeywords(input: SelectCreativeKeywordsInput): SelectCreativeKeywordsOutput {
  const creativeType = input.creativeType
    || deriveCanonicalCreativeType({
      creativeType: input.creativeType,
      keywordBucket: input.bucket,
      keywords: input.keywordsWithVolume?.map((item) => item.keyword) || input.keywords,
    })
  const maxKeywordsInput = Number(input.maxKeywords)
  const maxKeywords = Number.isFinite(maxKeywordsInput)
    ? Math.max(1, Math.floor(maxKeywordsInput))
    : CREATIVE_KEYWORD_MAX_COUNT

  const brandReserveInput = Number(input.brandReserve)
  const brandReserve = Number.isFinite(brandReserveInput)
    ? Math.max(0, Math.floor(brandReserveInput))
    : CREATIVE_BRAND_KEYWORD_RESERVE
  const minBrandKeywordsInput = Number(input.minBrandKeywords)
  const minBrandKeywords = Number.isFinite(minBrandKeywordsInput)
    ? Math.max(0, Math.floor(minBrandKeywordsInput))
    : CREATIVE_BRAND_KEYWORD_RESERVE
  const requestedBrandOnly = creativeType === 'brand_intent'
    ? true
    : creativeType === 'model_intent'
      ? false
      : Boolean(input.brandOnly)

  const maxWordsInput = Number(input.maxWords)
  const maxWords = Number.isFinite(maxWordsInput)
    ? Math.max(1, Math.floor(maxWordsInput))
    : resolveCreativeKeywordMaxWords(creativeType)
  const fallbackMode = Boolean(input.fallbackMode)
    || Boolean(
      input.keywordsWithVolume?.some((item) =>
        item?.volumeUnavailableReason === 'DEV_TOKEN_INSUFFICIENT_ACCESS'
      )
    )

  const modelIntentBrandFloor = creativeType === 'model_intent'
    ? Math.min(MODEL_INTENT_BRAND_FLOOR, maxKeywords)
    : 0
  const effectiveBrandReserve = creativeType === 'model_intent'
    ? modelIntentBrandFloor
    : brandReserve
  const effectiveMinBrandKeywords = creativeType === 'model_intent'
    ? modelIntentBrandFloor
    : minBrandKeywords
  const requiredBrandCount = requestedBrandOnly
    ? maxKeywords
    : Math.min(maxKeywords, effectiveMinBrandKeywords)

  const rankedCandidates = ensureBrandCoverage(
    ensurePureBrandCoverage(
      toRankedCandidates({ ...input, creativeType }, maxWords),
      { ...input, creativeType },
      maxWords,
      creativeType === 'brand_intent' || creativeType === 'product_intent' ? 1 : 0
    ),
    { ...input, creativeType },
    maxWords,
    requiredBrandCount
  )
  const preferredBucketCandidates = rankedCandidates
    .filter((candidate) => candidate.isPreferredBucket)
    .sort(compareRankedCandidates)
  const requiredPreferredBucketCount = resolvePreferredBucketRequiredCount({
    creativeType,
    maxKeywords,
    preferredAvailableCount: preferredBucketCandidates.length,
  })
  if (rankedCandidates.length === 0) {
    return {
      keywords: [],
      keywordsWithVolume: [],
      truncated: false,
      sourceQuotaAudit: {
        enabled: true,
        fallbackMode,
        targetCount: 0,
        requiredBrandCount: Math.max(0, requiredBrandCount),
        acceptedBrandCount: 0,
        acceptedCount: 0,
        deferredCount: 0,
        deferredRefillCount: 0,
        deferredRefillTriggered: false,
        underfillBeforeRefill: 0,
        quota: resolveSourceQuotaConfig(maxKeywords, fallbackMode),
        acceptedByClass: {
          lowTrust: 0,
          ai: 0,
          aiLlmRaw: 0,
        },
        blockedByCap: {
          lowTrust: 0,
          ai: 0,
          aiLlmRaw: 0,
        },
      },
    }
  }

  const selected = new Map<string, RankedCandidate>()
  let selectedPreferredBucketCount = 0
  const pushSelected = (candidate: RankedCandidate): boolean => {
    if (selected.has(candidate.normalized)) return false
    selected.set(candidate.normalized, candidate)
    if (candidate.isPreferredBucket) selectedPreferredBucketCount += 1
    return true
  }
  const candidateCollectionBudget = Math.min(
    rankedCandidates.length,
    Math.max(maxKeywords, Math.floor(maxKeywords * 2))
  )

  const pureBrandCandidates = rankedCandidates
    .filter((candidate) => candidate.isPureBrand)
    .sort(compareRankedCandidates)
  const brandCandidates = rankedCandidates
    .filter(candidate => candidate.isBrand)
    .sort(compareRankedCandidates)
  const enforceBrandOnly = requestedBrandOnly && brandCandidates.length > 0

  if ((creativeType === 'brand_intent' || creativeType === 'product_intent') && pureBrandCandidates.length > 0) {
    pushSelected(pureBrandCandidates[0])
  }

  if (enforceBrandOnly) {
    for (const candidate of brandCandidates) {
      if (selected.size >= candidateCollectionBudget) break
      pushSelected(candidate)
    }
  } else {
    for (const candidate of brandCandidates) {
      if (selected.size >= requiredBrandCount) break
      pushSelected(candidate)
    }

    const reservedBrandCount = Math.min(maxKeywords, Math.max(requiredBrandCount, effectiveBrandReserve))
    for (const candidate of brandCandidates) {
      if (selected.size >= reservedBrandCount) break
      pushSelected(candidate)
    }

    if (requiredPreferredBucketCount > 0) {
      for (const candidate of preferredBucketCandidates) {
        if (selected.size >= candidateCollectionBudget) break
        if (selectedPreferredBucketCount >= requiredPreferredBucketCount) break
        pushSelected(candidate)
      }
    }
  }

  if (!enforceBrandOnly) {
    const allCandidates = [...rankedCandidates].sort(compareRankedCandidates)
    for (const candidate of allCandidates) {
      if (selected.size >= candidateCollectionBudget) break
      pushSelected(candidate)
    }
  }

  const sourceQuotaApplied = applySourceQuotaOnSelectedCandidates({
    selectedList: Array.from(selected.values()).sort(compareRankedCandidates),
    maxKeywords,
    requiredBrandCount,
    requiredPreferredBucketCount,
    fallbackMode,
  })
  const selectedList = creativeType === 'model_intent'
    ? rebalanceModelIntentCandidates({
      selectedList: sourceQuotaApplied.selectedList,
      maxKeywords,
    })
    : sourceQuotaApplied.selectedList
  const keywordsWithVolume: CreativeKeywordLike[] = selectedList.map((candidate) => {
    const finalMatchType: CreativeKeywordMatchType = creativeType === 'model_intent'
      ? 'EXACT'
      : candidate.matchType || candidate.suggestedMatchType || 'PHRASE'
    const sourceSubtype =
      normalizeAuditString(candidate.sourceSubtype)
      || normalizeAuditString(candidate.sourceType)?.toUpperCase()
      || normalizeKeywordSourceSubtype({
        source: candidate.source,
        sourceType: candidate.sourceType,
      })
    const rawSource =
      normalizeAuditString(candidate.rawSource)
      || inferKeywordRawSource({
        source: candidate.source,
        sourceType: sourceSubtype || candidate.sourceType,
      })
    const derivedTags =
      normalizeAuditTags(candidate.derivedTags)
      || inferKeywordDerivedTags({
        source: candidate.source,
        sourceType: sourceSubtype || candidate.sourceType,
      })

    return {
      keyword: candidate.keyword,
      searchVolume: Number(candidate.searchVolume || 0) || 0,
      competition: candidate.competition,
      competitionIndex: candidate.competitionIndex,
      source: candidate.source,
      matchType: finalMatchType,
      sourceType: normalizeAuditString(candidate.sourceType) || normalizeAuditString(candidate.source),
      sourceSubtype,
      rawSource,
      derivedTags,
      sourceField: normalizeAuditString(candidate.sourceField) || inferSourceField(candidate.source),
      anchorType: normalizeAuditString(candidate.anchorType) || inferAnchorType({
        keyword: candidate.keyword,
        isBrand: candidate.isBrand,
        brandName: input.brandName,
      }),
      evidence: buildAuditEvidence(candidate, input.brandName),
      suggestedMatchType: candidate.suggestedMatchType || finalMatchType,
      confidence: inferKeywordConfidence(candidate, creativeType, finalMatchType),
      qualityReason: inferQualityReason(candidate, creativeType, input.brandName, finalMatchType),
      rejectionReason: normalizeAuditString(candidate.rejectionReason),
      lowTopPageBid: candidate.lowTopPageBid,
      highTopPageBid: candidate.highTopPageBid,
      volumeUnavailableReason: candidate.volumeUnavailableReason,
    }
  })

  return {
    keywords: keywordsWithVolume.map(item => item.keyword),
    keywordsWithVolume,
    truncated: rankedCandidates.length > keywordsWithVolume.length,
    sourceQuotaAudit: sourceQuotaApplied.audit,
  }
}
