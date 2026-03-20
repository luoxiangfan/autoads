import type { GeneratedAdCreativeData } from './ad-creative'
import type {
  CreativeAttemptEvaluation,
  CreativeGenerationHistoryItem,
  CreativeQualityEvaluationInput,
} from './ad-creative-quality-loop'
import type {
  BuildCreativeKeywordSetInput,
  BuildCreativeKeywordSetOutput,
  CreativeKeywordSourceAudit,
} from './creative-keyword-set-builder'
import type { ComprehensiveAdStrengthResult } from './scoring'

type CreativeKeywordSupplementation = GeneratedAdCreativeData['keywordSupplementation']
type CreativeKeywordsWithVolume = BuildCreativeKeywordSetOutput['keywordsWithVolume']

interface KeywordSetAssignmentInput {
  executableKeywords: string[]
  keywordsWithVolume: CreativeKeywordsWithVolume
  promptKeywords: string[]
  keywordSupplementation?: CreativeKeywordSupplementation
  audit?: CreativeKeywordSourceAudit
}

interface ApplyCreativeKeywordSetOptions {
  includeKeywordSupplementation?: boolean
}

interface CreateCreativeKeywordSetBuilderInputOptions {
  offer: BuildCreativeKeywordSetInput['offer']
  userId: number
  creative: Pick<GeneratedAdCreativeData, 'keywords' | 'keywordsWithVolume' | 'promptKeywords'>
  creativeType?: BuildCreativeKeywordSetInput['creativeType']
  bucket?: BuildCreativeKeywordSetInput['bucket']
  scopeLabel: string
  seedCandidates?: BuildCreativeKeywordSetInput['seedCandidates']
  enableSupplementation?: boolean
  continueOnSupplementError?: boolean
  fallbackMode?: boolean
}

interface MergeUsedKeywordsExcludingBrandInput {
  usedKeywords: string[]
  candidateKeywords?: Array<string | null | undefined>
  brandKeywords: string[]
}

interface CreativeEvaluationOfferContext {
  brand?: string | null
  category?: string | null
  product_name?: string | null
  product_title?: string | null
  title?: string | null
  name?: string | null
  brand_description?: string | null
  unique_selling_points?: string | null
  product_highlights?: string | null
  target_country?: string | null
  target_language?: string | null
}

interface CreateCreativeQualityEvaluationInputOptions {
  creative: GeneratedAdCreativeData
  minimumScore?: number
  offer: CreativeEvaluationOfferContext
  userId: number
  bucket?: string | null
  keywords?: string[]
  productNameFallback?: string | null
  productTitleFallback?: string | null
}

interface CreateCreativeAdStrengthPayloadOptions {
  includeRsaQualityGate?: boolean
}

interface CreateCreativeScoreBreakdownOptions {
  allowPartialMetrics?: boolean
}

interface CreateCreativeOptimizationPayloadOptions<THistory> {
  attempts: number
  targetRating: string
  achieved: boolean
  history: THistory[]
  qualityGatePassed?: boolean
}

interface CreativeOfferSummaryInput {
  id?: number | null
  brand?: string | null
  url?: string | null
  affiliate_link?: string | null
}

interface CreativeBucketSummaryInput {
  creativeType: string
  bucket: string
  bucketIntent: string
  generatedBuckets: string[]
}

interface CreateCreativeResponsePayloadOptions {
  id?: number | null
  creative: GeneratedAdCreativeData
  audit?: CreativeKeywordSourceAudit
  includeNegativeKeywords?: boolean
  includeKeywordSupplementation?: boolean
}

const DEFAULT_FINAL_PUBLISH_DECISION = {
  status: 'PENDING_LAUNCH_SCORE_CHECK',
  stage: 'campaign_publish',
  hardBlockSource: 'launch_score',
} as const

type CreativeKeywordRuntimeCarrier = Pick<
  GeneratedAdCreativeData,
  'keywords' | 'keywordsWithVolume' | 'promptKeywords' | 'keywordSupplementation'
> & {
  executableKeywords?: string[]
  audit?: CreativeKeywordSourceAudit
  keywordSourceAudit?: CreativeKeywordSourceAudit
  adStrength?: {
    audit?: CreativeKeywordSourceAudit
    keywordSourceAudit?: CreativeKeywordSourceAudit
  } | null
}

export function applyCreativeKeywordSetToCreative<T extends CreativeKeywordRuntimeCarrier>(
  creative: T,
  keywordSet: KeywordSetAssignmentInput,
  options?: ApplyCreativeKeywordSetOptions
): T {
  creative.executableKeywords = keywordSet.executableKeywords
  creative.keywords = keywordSet.executableKeywords
  creative.keywordsWithVolume = keywordSet.keywordsWithVolume as any
  creative.promptKeywords = keywordSet.promptKeywords

  if (options?.includeKeywordSupplementation !== false && keywordSet.keywordSupplementation !== undefined) {
    creative.keywordSupplementation = keywordSet.keywordSupplementation
  }

  if (keywordSet.audit) {
    creative.audit = keywordSet.audit
  }

  return creative
}

export function createCreativeKeywordSetBuilderInput(
  input: CreateCreativeKeywordSetBuilderInputOptions
): BuildCreativeKeywordSetInput {
  return {
    offer: input.offer,
    userId: input.userId,
    brandName: input.offer.brand || 'Unknown',
    targetLanguage: input.offer.target_language || 'English',
    creativeType: input.creativeType,
    bucket: input.bucket,
    scopeLabel: input.scopeLabel,
    keywordsWithVolume: input.creative.keywordsWithVolume as any,
    keywords: input.creative.keywords || [],
    promptKeywords: input.creative.promptKeywords,
    seedCandidates: input.seedCandidates,
    enableSupplementation: input.enableSupplementation,
    continueOnSupplementError: input.continueOnSupplementError,
    fallbackMode: input.fallbackMode,
  }
}

export function buildCreativeBrandKeywords(brandName: string | null | undefined): string[] {
  const normalized = String(brandName || '').trim().toLowerCase()
  return normalized ? [normalized] : []
}

export function createCreativeQualityEvaluationInput(
  input: CreateCreativeQualityEvaluationInputOptions
): CreativeQualityEvaluationInput {
  const targetLanguage = input.offer.target_language || 'en'

  return {
    creative: input.creative,
    minimumScore: input.minimumScore,
    adStrengthContext: {
      brandName: input.offer.brand,
      targetCountry: input.offer.target_country || 'US',
      targetLanguage,
      userId: input.userId,
    },
    ruleContext: {
      brandName: input.offer.brand,
      category: input.offer.category,
      productName: input.offer.product_name || input.productNameFallback,
      productTitle: input.offer.product_title || input.productTitleFallback,
      productDescription: input.offer.brand_description,
      uniqueSellingPoints: input.offer.unique_selling_points || input.offer.product_highlights,
      keywords: input.keywords || input.creative.keywords || [],
      targetLanguage,
      bucket: input.bucket,
    }
  }
}

export function createCreativeAdStrengthPayload(
  evaluation: Pick<
    ComprehensiveAdStrengthResult,
    'finalRating' | 'finalScore' | 'localEvaluation' | 'combinedSuggestions' | 'rsaQualityGate'
  >,
  audit?: CreativeKeywordSourceAudit,
  options?: CreateCreativeAdStrengthPayloadOptions
) {
  return {
    rating: evaluation.finalRating,
    score: evaluation.finalScore,
    isExcellent: evaluation.finalRating === 'EXCELLENT',
    ...(options?.includeRsaQualityGate ? { rsaQualityGate: evaluation.rsaQualityGate } : {}),
    dimensions: evaluation.localEvaluation.dimensions,
    suggestions: evaluation.combinedSuggestions,
    audit,
    keywordSourceAudit: audit,
  }
}

export function createCreativeScoreBreakdown(
  evaluation: Pick<ComprehensiveAdStrengthResult, 'localEvaluation'>,
  options?: CreateCreativeScoreBreakdownOptions
) {
  const dimensions = evaluation.localEvaluation.dimensions as any

  return {
    relevance: dimensions.relevance.score,
    quality: dimensions.quality.score,
    engagement: dimensions.completeness.score,
    diversity: dimensions.diversity.score,
    clarity: dimensions.compliance.score,
    brandSearchVolume: options?.allowPartialMetrics
      ? dimensions.brandSearchVolume?.score || 0
      : dimensions.brandSearchVolume.score,
    competitivePositioning: options?.allowPartialMetrics
      ? dimensions.competitivePositioning?.score || 0
      : dimensions.competitivePositioning.score,
  }
}

export function createCreativeApiRetryHistory(history: CreativeGenerationHistoryItem[]) {
  return history.map(item => ({
    ...item,
    gatePassed: item.passed,
    gateReasons: item.reasons,
  }))
}

export function createCreativeTaskRetryHistory(history: CreativeGenerationHistoryItem[]) {
  return history.map(item => ({
    attempt: item.attempt,
    rating: item.rating,
    score: item.score,
    suggestions: item.suggestions,
    failureType: item.failureType,
    reasons: item.reasons,
    passed: item.passed,
  }))
}

export function createCreativeOptimizationPayload<THistory>(
  input: CreateCreativeOptimizationPayloadOptions<THistory>
) {
  return {
    attempts: input.attempts,
    targetRating: input.targetRating,
    achieved: input.achieved,
    ...(input.qualityGatePassed !== undefined
      ? { qualityGatePassed: input.qualityGatePassed }
      : {}),
    history: input.history,
  }
}

export function createCreativeOfferSummaryPayload(offer: CreativeOfferSummaryInput) {
  return {
    id: offer.id,
    brand: offer.brand,
    url: offer.url,
    affiliateLink: offer.affiliate_link,
  }
}

export function createCreativeBucketSummaryPayload(input: CreativeBucketSummaryInput) {
  return {
    creativeType: input.creativeType,
    bucket: input.bucket,
    bucketIntent: input.bucketIntent,
    generatedBuckets: input.generatedBuckets,
  }
}

export function createCreativeResponsePayload(
  input: CreateCreativeResponsePayloadOptions
) {
  return {
    ...(input.id !== undefined ? { id: input.id } : {}),
    headlines: input.creative.headlines,
    descriptions: input.creative.descriptions,
    keywords: input.creative.keywords,
    keywordsWithVolume: input.creative.keywordsWithVolume,
    ...(input.includeNegativeKeywords ? { negativeKeywords: input.creative.negativeKeywords } : {}),
    callouts: input.creative.callouts,
    sitelinks: input.creative.sitelinks,
    theme: input.creative.theme,
    explanation: input.creative.explanation,
    headlinesWithMetadata: input.creative.headlinesWithMetadata,
    descriptionsWithMetadata: input.creative.descriptionsWithMetadata,
    qualityMetrics: input.creative.qualityMetrics,
    ...(input.includeKeywordSupplementation
      ? { keywordSupplementation: input.creative.keywordSupplementation || null }
      : {}),
    audit: input.audit,
    keywordSourceAudit: input.audit,
  }
}

export function createCreativeQualityGatePayload(evaluation: CreativeAttemptEvaluation) {
  return {
    passed: evaluation.passed,
    warning: !evaluation.passed,
    reasons: evaluation.reasons,
    failureType: evaluation.failureType,
    rsaGatePassed: evaluation.rsaGate.passed,
    ruleGatePassed: evaluation.ruleGate.passed,
    rsaQualityGate: evaluation.adStrength.rsaQualityGate,
    ruleGate: evaluation.ruleGate,
  }
}

export function createCreativePublishDecisionPayload(forcePublishRequested: boolean) {
  return {
    forcePublish: false,
    forcedPublish: false,
    qualityGateBypassed: false,
    forcePublishIgnored: forcePublishRequested,
    finalPublishDecision: { ...DEFAULT_FINAL_PUBLISH_DECISION },
  }
}

export function mergeUsedKeywordsExcludingBrand(
  input: MergeUsedKeywordsExcludingBrandInput
): string[] {
  const brandKeywords = Array.isArray(input.brandKeywords)
    ? input.brandKeywords
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
    : []
  const nonBrandKeywords = (Array.isArray(input.candidateKeywords) ? input.candidateKeywords : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((keyword) => {
      const keywordLower = keyword.toLowerCase()
      return !brandKeywords.some((brand) => keywordLower.includes(brand) || brand.includes(keywordLower))
    })

  return Array.from(new Set([
    ...(Array.isArray(input.usedKeywords) ? input.usedKeywords : []),
    ...nonBrandKeywords,
  ]))
}

export function resolveCreativeKeywordAudit(creative: CreativeKeywordRuntimeCarrier | null | undefined): CreativeKeywordSourceAudit | undefined {
  return (
    creative?.audit
    || creative?.keywordSourceAudit
    || creative?.adStrength?.audit
    || creative?.adStrength?.keywordSourceAudit
    || undefined
  )
}
