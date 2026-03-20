import { applyKeywordSupplementationOnce, type KeywordSupplementationReport } from './ad-creative-gen'
import {
  filterCreativeKeywordsByOfferContext,
  normalizeCreativeKeywordCandidatesForContextFilter,
} from './creative-keyword-context-filter'
import {
  CREATIVE_BRAND_KEYWORD_RESERVE,
  CREATIVE_KEYWORD_MAX_COUNT,
  selectCreativeKeywords,
  type CreativeKeywordSourceQuotaAudit,
} from './creative-keyword-selection'
import { logKeywordSourceAudit } from './creative-keyword-audit-log'
import type { CanonicalCreativeType } from './creative-type'
import { getKeywordSourcePriorityScoreFromInput } from './creative-keyword-source-priority'
import { containsPureBrand, getPureBrandKeywords } from './brand-keyword-utils'
import { normalizeGoogleAdsKeyword } from './google-ads-keyword-normalizer'
import { KEYWORD_POLICY } from './keyword-policy'
import type { PoolKeywordData } from './offer-keyword-pool'

export interface BuildCreativeKeywordSetInput {
  offer: {
    brand?: string | null
    category?: string | null
    product_name?: string | null
    target_country?: string | null
    target_language?: string | null
    final_url?: string | null
    url?: string | null
    page_type?: string | null
    scraped_data?: string | null
  }
  userId: number
  brandName: string
  targetLanguage: string
  creativeType?: CanonicalCreativeType | null
  bucket?: 'A' | 'B' | 'C' | 'D' | 'S' | null
  scopeLabel: string
  keywordsWithVolume?: unknown[]
  keywords?: string[]
  promptKeywords?: string[]
  seedCandidates?: unknown[]
  fallbackSource?: string
  enableSupplementation?: boolean
  continueOnSupplementError?: boolean
  fallbackMode?: boolean
  maxKeywords?: number
  brandReserve?: number
  minBrandKeywords?: number
  brandOnly?: boolean
}

export interface BuildCreativeKeywordSetOutput {
  promptKeywords: string[]
  executableKeywords: string[]
  executableKeywordCandidates: CreativeKeywordCandidate[]
  candidatePool: CreativeKeywordCandidate[]
  // Deprecated compatibility projection. Prefer `executableKeywords`.
  keywords: string[]
  keywordsWithVolume: PoolKeywordData[]
  keywordSupplementation?: KeywordSupplementationReport
  contextFallbackStrategy: 'filtered' | 'keyword_pool' | 'original'
  audit: CreativeKeywordAudit
  // Deprecated compatibility field. Prefer `audit`.
  keywordSourceAudit: CreativeKeywordSourceAudit
}

interface CreativeKeywordCandidateProvenance {
  source?: string
  sourceType?: string
  sourceSubtype?: string
  rawSource?: string
  sourceField?: string
}

export interface CreativeKeywordCandidate {
  keyword: string
  searchVolume: number
  rawSource?: string
  sourceSubtype?: string
  derivedTags?: string[]
  sourceField?: string
  evidence?: string[]
  creativeAffinity?: {
    label: 'brand' | 'model' | 'product' | 'mixed' | 'unknown'
    score: number
    level: 'high' | 'medium' | 'low'
  }
  promptEligible?: boolean
  executableEligible?: boolean
  provenance?: CreativeKeywordCandidateProvenance[]
}

interface CreativeKeywordSourceRatioItem {
  count: number
  ratio: number
}

const CREATIVE_PROMPT_KEYWORD_LIMIT = KEYWORD_POLICY.creative.promptKeywordLimit

export interface CreativeKeywordSourceAudit {
  totalKeywords: number
  withSearchVolumeKeywords: number
  zeroVolumeKeywords: number
  volumeUnavailableKeywords: number
  noVolumeMode: boolean
  fallbackMode: boolean
  contextFallbackStrategy: 'filtered' | 'keyword_pool' | 'original'
  sourceQuotaAudit: CreativeKeywordSourceQuotaAudit
  byRawSource: Record<string, CreativeKeywordSourceRatioItem>
  bySourceSubtype: Record<string, CreativeKeywordSourceRatioItem>
  bySourceField: Record<string, CreativeKeywordSourceRatioItem>
  creativeAffinityByLabel: Record<string, CreativeKeywordSourceRatioItem>
  creativeAffinityByLevel: Record<string, CreativeKeywordSourceRatioItem>
}

export type CreativeKeywordAudit = CreativeKeywordSourceAudit

function toFallbackKeywords(input: {
  keywords: string[]
  fallbackSource: string
}): Array<{
  keyword: string
  searchVolume: number
  matchType: 'PHRASE'
  source: string
  sourceType: string
}> {
  return input.keywords.map((keyword) => ({
    keyword,
    searchVolume: 0,
    matchType: 'PHRASE',
    source: input.fallbackSource,
    sourceType: 'AI_FALLBACK_PLACEHOLDER',
  }))
}

function normalizeCandidateKey(keyword: unknown): string {
  return String(keyword || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeStringList(values: unknown, max = 8): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const unique = Array.from(
    new Set(
      values
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  ).slice(0, max)
  return unique.length > 0 ? unique : undefined
}

function normalizeSeedCandidates(seedCandidates: unknown[]): Array<Record<string, any>> {
  return seedCandidates
    .map((item): Record<string, any> | null => {
      if (typeof item === 'string') {
        const keyword = item.trim()
        if (!keyword) return null
        return {
          keyword,
          searchVolume: 0,
          matchType: 'PHRASE' as const,
          source: 'KEYWORD_POOL' as const,
          sourceType: 'CANONICAL_BUCKET_VIEW' as const,
        }
      }

      if (!item || typeof item !== 'object') return null
      const keyword = String((item as any).keyword || '').trim()
      if (!keyword) return null

      return {
        ...(item as Record<string, any>),
        keyword,
        searchVolume: typeof (item as any).searchVolume === 'number'
          ? (item as any).searchVolume
          : Number((item as any).searchVolume) || 0,
        matchType: ((item as any).matchType || 'PHRASE') as 'EXACT' | 'PHRASE' | 'BROAD',
        source: String((item as any).source || 'KEYWORD_POOL').trim() || 'KEYWORD_POOL',
        sourceType: String((item as any).sourceType || 'CANONICAL_BUCKET_VIEW').trim() || 'CANONICAL_BUCKET_VIEW',
      }
    })
    .filter((item): item is Record<string, any> => item !== null)
}

function hasDemandIntentSignal(keyword: string): boolean {
  const normalized = normalizeGoogleAdsKeyword(keyword) || ''
  if (!normalized) return false
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length
  if (tokenCount >= 3) return true
  return /\b(for|with|buy|best|price|deal|review|solution|kit|set|replacement)\b/i.test(normalized)
}

function inferCreativeAffinity(params: {
  keyword: string
  creativeType?: CanonicalCreativeType | null
  brandName?: string
}): {
  label: 'brand' | 'model' | 'product' | 'mixed' | 'unknown'
  score: number
  level: 'high' | 'medium' | 'low'
} {
  const keyword = String(params.keyword || '').trim()
  const normalized = normalizeGoogleAdsKeyword(keyword) || ''
  const pureBrandKeywords = getPureBrandKeywords(params.brandName || '')
  const hasBrand = pureBrandKeywords.length > 0
    ? containsPureBrand(keyword, pureBrandKeywords)
    : false
  const hasModel = /\b[a-z]*\d+[a-z0-9-]*\b/i.test(normalized)
  const hasDemand = hasDemandIntentSignal(keyword)

  let label: 'brand' | 'model' | 'product' | 'mixed' | 'unknown' = 'unknown'
  if (hasModel && hasBrand) label = 'mixed'
  else if (hasModel) label = 'model'
  else if (hasBrand && hasDemand) label = 'mixed'
  else if (hasBrand) label = 'brand'
  else if (hasDemand) label = 'product'

  const creativeType = params.creativeType || null
  let score = 0.42
  if (creativeType === 'brand_intent') {
    if (label === 'brand') score = 0.9
    else if (label === 'mixed') score = 0.78
    else if (label === 'model') score = 0.62
    else if (label === 'product') score = 0.55
  } else if (creativeType === 'model_intent') {
    if (label === 'model') score = 0.92
    else if (label === 'mixed') score = 0.88
    else if (label === 'brand') score = 0.56
    else if (label === 'product') score = 0.48
  } else if (creativeType === 'product_intent') {
    if (label === 'product') score = 0.9
    else if (label === 'mixed') score = 0.84
    else if (label === 'brand') score = 0.52
    else if (label === 'model') score = 0.58
  } else {
    if (label === 'mixed') score = 0.8
    else if (label === 'model') score = 0.74
    else if (label === 'product') score = 0.72
    else if (label === 'brand') score = 0.7
  }

  const normalizedScore = Math.max(0.3, Math.min(0.99, Math.round(score * 100) / 100))
  const level = normalizedScore >= 0.75
    ? 'high'
    : normalizedScore >= 0.5
      ? 'medium'
      : 'low'

  return {
    label,
    score: normalizedScore,
    level,
  }
}

function normalizeCandidateProvenance(item: PoolKeywordData): CreativeKeywordCandidateProvenance | undefined {
  const source = String((item as any)?.source || '').trim()
  const sourceType = String((item as any)?.sourceType || '').trim()
  const sourceSubtype = String((item as any)?.sourceSubtype || '').trim()
  const rawSource = String((item as any)?.rawSource || '').trim()
  const sourceField = String((item as any)?.sourceField || '').trim()
  if (!source && !sourceType && !sourceSubtype && !rawSource && !sourceField) {
    return undefined
  }
  return {
    source: source || undefined,
    sourceType: sourceType || undefined,
    sourceSubtype: sourceSubtype || undefined,
    rawSource: rawSource || undefined,
    sourceField: sourceField || undefined,
  }
}

function mergeCandidateProvenanceRecords(records: Array<CreativeKeywordCandidateProvenance | undefined>): CreativeKeywordCandidateProvenance[] | undefined {
  const merged = new Map<string, CreativeKeywordCandidateProvenance>()
  for (const record of records) {
    if (!record) continue
    const key = [
      record.source || '',
      record.sourceType || '',
      record.sourceSubtype || '',
      record.rawSource || '',
      record.sourceField || '',
    ].join('::')
    if (!key.replace(/:/g, '').trim()) continue
    if (!merged.has(key)) merged.set(key, record)
  }
  const values = Array.from(merged.values())
  return values.length > 0 ? values : undefined
}

function normalizeSourceScore(item: PoolKeywordData): number {
  return getKeywordSourcePriorityScoreFromInput({
    source: String((item as any)?.source || '').trim() || undefined,
    sourceType: String((item as any)?.sourceSubtype || (item as any)?.sourceType || '').trim() || undefined,
  })
}

function mergeKeywordCandidateRecords(existing: PoolKeywordData, incoming: PoolKeywordData): PoolKeywordData {
  const existingScore = normalizeSourceScore(existing)
  const incomingScore = normalizeSourceScore(incoming)
  const incomingVolume = Number((incoming as any)?.searchVolume || 0)
  const existingVolume = Number((existing as any)?.searchVolume || 0)
  const preferIncoming = incomingScore > existingScore || (incomingScore === existingScore && incomingVolume > existingVolume)
  const preferred = preferIncoming ? incoming : existing
  const secondary = preferIncoming ? existing : incoming

  const mergedProvenance = mergeCandidateProvenanceRecords([
    ...((existing as any)?.provenance || []),
    normalizeCandidateProvenance(existing),
    ...((incoming as any)?.provenance || []),
    normalizeCandidateProvenance(incoming),
  ])

  return {
    ...secondary,
    ...preferred,
    keyword: String((existing as any)?.keyword || (incoming as any)?.keyword || '').trim(),
    searchVolume: Math.max(existingVolume, incomingVolume),
    source: String((preferred as any)?.source || (secondary as any)?.source || '').trim() || 'KEYWORD_POOL',
    sourceType: String((preferred as any)?.sourceType || (secondary as any)?.sourceType || '').trim() || undefined,
    sourceSubtype: String((preferred as any)?.sourceSubtype || (secondary as any)?.sourceSubtype || '').trim() || undefined,
    rawSource: String((preferred as any)?.rawSource || (secondary as any)?.rawSource || '').trim() || undefined,
    sourceField: String((preferred as any)?.sourceField || (secondary as any)?.sourceField || '').trim() || undefined,
    derivedTags: normalizeStringList([
      ...((existing as any)?.derivedTags || []),
      ...((incoming as any)?.derivedTags || []),
    ]),
    evidence: normalizeStringList([
      ...((existing as any)?.evidence || []),
      ...((incoming as any)?.evidence || []),
    ], 12),
    provenance: mergedProvenance,
  } as PoolKeywordData
}

function mergeSeedCandidates(input: {
  primaryCandidates: PoolKeywordData[]
  seedCandidates: PoolKeywordData[]
}): PoolKeywordData[] {
  const mergedByKey = new Map<string, PoolKeywordData>()
  const order: string[] = []
  const upsert = (candidate: PoolKeywordData) => {
    const key = normalizeCandidateKey((candidate as any)?.keyword)
    if (!key) return
    const existing = mergedByKey.get(key)
    if (!existing) {
      order.push(key)
      mergedByKey.set(key, candidate)
      return
    }
    mergedByKey.set(key, mergeKeywordCandidateRecords(existing, candidate))
  }

  for (const candidate of input.primaryCandidates) upsert(candidate)
  for (const candidate of input.seedCandidates) upsert(candidate)

  return order
    .map((key) => mergedByKey.get(key))
    .filter((candidate): candidate is PoolKeywordData => Boolean(candidate))
}

function extractPoolCandidatesFromSeedCandidates(seedCandidates: PoolKeywordData[]): string[] {
  const seen = new Set<string>()
  const results: string[] = []
  for (const candidate of seedCandidates) {
    const normalized = normalizeCandidateKey((candidate as any)?.keyword)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    results.push(String((candidate as any)?.keyword || '').trim())
  }
  return results
}

function buildPromptKeywordSubset(input: {
  selectedKeywords: string[]
  candidates: PoolKeywordData[]
  maxKeywords?: number
}): string[] {
  const maxKeywords = Number.isFinite(input.maxKeywords)
    ? Math.max(1, Math.floor(Number(input.maxKeywords)))
    : CREATIVE_PROMPT_KEYWORD_LIMIT
  const ordered = [
    ...(Array.isArray(input.selectedKeywords) ? input.selectedKeywords : []),
    ...input.candidates.map((item) => String((item as any)?.keyword || '')),
  ]

  const seen = new Set<string>()
  const promptKeywords: string[] = []
  for (const keywordRaw of ordered) {
    const keyword = String(keywordRaw || '').trim()
    if (!keyword) continue
    const normalized = normalizeCandidateKey(keyword)
    if (!normalized || seen.has(normalized)) continue
    promptKeywords.push(keyword)
    seen.add(normalized)
    if (promptKeywords.length >= maxKeywords) break
  }

  return promptKeywords
}

function toCreativeKeywordCandidate(item: PoolKeywordData, flags?: {
  promptEligible?: boolean
  executableEligible?: boolean
  creativeType?: CanonicalCreativeType | null
  brandName?: string
}): CreativeKeywordCandidate {
  const keyword = String((item as any)?.keyword || '').trim()
  return {
    keyword,
    searchVolume: Number((item as any)?.searchVolume || 0),
    rawSource: String((item as any)?.rawSource || '').trim() || undefined,
    sourceSubtype: String((item as any)?.sourceSubtype || (item as any)?.sourceType || '').trim() || undefined,
    derivedTags: normalizeStringList((item as any)?.derivedTags),
    sourceField: String((item as any)?.sourceField || '').trim() || undefined,
    evidence: normalizeStringList((item as any)?.evidence, 12),
    creativeAffinity: inferCreativeAffinity({
      keyword,
      creativeType: flags?.creativeType || null,
      brandName: flags?.brandName,
    }),
    promptEligible: Boolean(flags?.promptEligible),
    executableEligible: Boolean(flags?.executableEligible),
    provenance: mergeCandidateProvenanceRecords([
      ...((item as any)?.provenance || []),
      normalizeCandidateProvenance(item),
    ]),
  }
}

function isKeywordPoolCandidate(item: PoolKeywordData): boolean {
  const source = String((item as any)?.source || '').trim().toUpperCase()
  const sourceType = String((item as any)?.sourceType || '').trim().toUpperCase()
  const sourceSubtype = String((item as any)?.sourceSubtype || '').trim().toUpperCase()
  const sourceField = String((item as any)?.sourceField || '').trim().toLowerCase()

  return (
    source === 'KEYWORD_POOL'
    || sourceType === 'KEYWORD_POOL'
    || sourceType === 'CANONICAL_BUCKET_VIEW'
    || sourceSubtype === 'KEYWORD_POOL'
    || sourceSubtype === 'CANONICAL_BUCKET_VIEW'
    || sourceField === 'keyword_pool'
  )
}

function resolveKeywordCandidatesAfterContextFilter(params: {
  contextFilteredCandidates: PoolKeywordData[]
  originalCandidates: PoolKeywordData[]
}): {
  keywords: PoolKeywordData[]
  strategy: 'filtered' | 'keyword_pool' | 'original'
} {
  if (params.contextFilteredCandidates.length > 0) {
    return {
      keywords: params.contextFilteredCandidates,
      strategy: 'filtered',
    }
  }

  const keywordPoolCandidates = params.originalCandidates.filter(isKeywordPoolCandidate)
  if (keywordPoolCandidates.length > 0) {
    return {
      keywords: keywordPoolCandidates,
      strategy: 'keyword_pool',
    }
  }

  return {
    keywords: params.originalCandidates,
    strategy: 'original',
  }
}

function countToRatioMap(counts: Record<string, number>, total: number): Record<string, CreativeKeywordSourceRatioItem> {
  const safeTotal = total > 0 ? total : 1
  const entries = Object.entries(counts)
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  return entries.reduce<Record<string, CreativeKeywordSourceRatioItem>>((acc, [key, count]) => {
    acc[key] = {
      count,
      ratio: Math.round((count / safeTotal) * 10000) / 10000,
    }
    return acc
  }, {})
}

function bumpCount(target: Record<string, number>, key: string | undefined, fallbackKey: string): void {
  const normalized = String(key || '').trim().toUpperCase() || fallbackKey
  target[normalized] = (target[normalized] || 0) + 1
}

function buildKeywordSourceAudit(input: {
  keywordsWithVolume: PoolKeywordData[]
  fallbackMode: boolean
  contextFallbackStrategy: 'filtered' | 'keyword_pool' | 'original'
  sourceQuotaAudit: CreativeKeywordSourceQuotaAudit
  creativeType?: CanonicalCreativeType | null
  brandName?: string
}): CreativeKeywordSourceAudit {
  const keywords = Array.isArray(input.keywordsWithVolume) ? input.keywordsWithVolume : []
  const totalKeywords = keywords.length

  let withSearchVolumeKeywords = 0
  let volumeUnavailableKeywords = 0
  const byRawSourceCount: Record<string, number> = {}
  const bySourceSubtypeCount: Record<string, number> = {}
  const bySourceFieldCount: Record<string, number> = {}
  const creativeAffinityByLabelCount: Record<string, number> = {}
  const creativeAffinityByLevelCount: Record<string, number> = {}

  for (const item of keywords) {
    const searchVolume = Number((item as any)?.searchVolume || 0)
    if (searchVolume > 0) withSearchVolumeKeywords += 1
    if ((item as any)?.volumeUnavailableReason === 'DEV_TOKEN_INSUFFICIENT_ACCESS') {
      volumeUnavailableKeywords += 1
    }

    bumpCount(byRawSourceCount, (item as any)?.rawSource, 'UNKNOWN')
    bumpCount(
      bySourceSubtypeCount,
      (item as any)?.sourceSubtype || (item as any)?.sourceType,
      'UNKNOWN'
    )
    bumpCount(bySourceFieldCount, (item as any)?.sourceField, 'UNKNOWN')
    const affinity = inferCreativeAffinity({
      keyword: String((item as any)?.keyword || ''),
      creativeType: input.creativeType || null,
      brandName: input.brandName,
    })
    bumpCount(creativeAffinityByLabelCount, affinity.label, 'UNKNOWN')
    bumpCount(creativeAffinityByLevelCount, affinity.level, 'UNKNOWN')
  }

  const zeroVolumeKeywords = Math.max(0, totalKeywords - withSearchVolumeKeywords)
  const noVolumeMode = volumeUnavailableKeywords > 0

  return {
    totalKeywords,
    withSearchVolumeKeywords,
    zeroVolumeKeywords,
    volumeUnavailableKeywords,
    noVolumeMode,
    fallbackMode: input.fallbackMode,
    contextFallbackStrategy: input.contextFallbackStrategy,
    sourceQuotaAudit: input.sourceQuotaAudit,
    byRawSource: countToRatioMap(byRawSourceCount, totalKeywords),
    bySourceSubtype: countToRatioMap(bySourceSubtypeCount, totalKeywords),
    bySourceField: countToRatioMap(bySourceFieldCount, totalKeywords),
    creativeAffinityByLabel: countToRatioMap(creativeAffinityByLabelCount, totalKeywords),
    creativeAffinityByLevel: countToRatioMap(creativeAffinityByLevelCount, totalKeywords),
  }
}

export async function buildCreativeKeywordSet(
  input: BuildCreativeKeywordSetInput
): Promise<BuildCreativeKeywordSetOutput> {
  const fallbackSource = String(input.fallbackSource || 'AI_GENERATED').trim().toUpperCase() || 'AI_GENERATED'
  const primaryCandidates = normalizeCreativeKeywordCandidatesForContextFilter(
    Array.isArray(input.keywordsWithVolume) && input.keywordsWithVolume.length > 0
      ? input.keywordsWithVolume
      : toFallbackKeywords({
        keywords: Array.isArray(input.keywords) ? input.keywords : [],
        fallbackSource,
      }),
    fallbackSource
  )
  const rawSeedCandidates = Array.isArray(input.seedCandidates) && input.seedCandidates.length > 0
    ? input.seedCandidates
    : []
  const normalizedSeedCandidates = normalizeCreativeKeywordCandidatesForContextFilter(
    normalizeSeedCandidates(rawSeedCandidates),
    'KEYWORD_POOL'
  )
  const poolCandidates = extractPoolCandidatesFromSeedCandidates(
    normalizedSeedCandidates as PoolKeywordData[]
  )
  const originalCandidates = mergeSeedCandidates({
    primaryCandidates: primaryCandidates as PoolKeywordData[],
    seedCandidates: normalizedSeedCandidates as PoolKeywordData[],
  })

  let candidates = originalCandidates
  let keywordSupplementation: KeywordSupplementationReport | undefined

  if (input.enableSupplementation) {
    try {
      const supplemented = await applyKeywordSupplementationOnce({
        offer: input.offer,
        userId: input.userId,
        brandName: input.brandName,
        targetLanguage: input.targetLanguage,
        keywordsWithVolume: candidates as any,
        poolCandidates,
        bucket: input.bucket,
      })
      keywordSupplementation = supplemented.keywordSupplementation
      candidates = normalizeCreativeKeywordCandidatesForContextFilter(
        supplemented.keywordsWithVolume as unknown[],
        fallbackSource
      )
    } catch (error: any) {
      if (!input.continueOnSupplementError) {
        throw error
      }
      console.warn(
        `[buildCreativeKeywordSet] 补词失败（继续执行）: ${error?.message || error}`
      )
    }
  }

  const contextFilteredCandidates = filterCreativeKeywordsByOfferContext({
    offer: input.offer,
    keywordsWithVolume: candidates,
    creativeType: input.creativeType,
    scopeLabel: input.scopeLabel,
  })

  const fallbackResolved = resolveKeywordCandidatesAfterContextFilter({
    contextFilteredCandidates,
    originalCandidates: candidates,
  })

  const selected = selectCreativeKeywords({
    keywords: fallbackResolved.keywords.map((item) => item.keyword),
    keywordsWithVolume: fallbackResolved.keywords as any,
    brandName: input.brandName,
    creativeType: input.creativeType,
    bucket: input.bucket,
    preferredBucketKeywords: poolCandidates,
    fallbackMode: input.fallbackMode,
    maxKeywords: input.maxKeywords ?? CREATIVE_KEYWORD_MAX_COUNT,
    brandReserve: input.brandReserve ?? CREATIVE_BRAND_KEYWORD_RESERVE,
    minBrandKeywords: input.minBrandKeywords ?? CREATIVE_BRAND_KEYWORD_RESERVE,
    brandOnly: input.brandOnly,
  })

  const audit = buildKeywordSourceAudit({
    keywordsWithVolume: selected.keywordsWithVolume as PoolKeywordData[],
    fallbackMode: Boolean(input.fallbackMode),
    contextFallbackStrategy: fallbackResolved.strategy,
    sourceQuotaAudit: selected.sourceQuotaAudit,
    creativeType: input.creativeType || null,
    brandName: input.brandName,
  })
  logKeywordSourceAudit({
    scopeLabel: input.scopeLabel,
    audit,
    keywordSupplementation,
    creativeType: input.creativeType || null,
    bucket: input.bucket || null,
  })

  const promptKeywords =
    Array.isArray(input.promptKeywords) && input.promptKeywords.length > 0
      ? buildPromptKeywordSubset({
        selectedKeywords: input.promptKeywords,
        candidates: [],
        maxKeywords: CREATIVE_PROMPT_KEYWORD_LIMIT,
      })
      : buildPromptKeywordSubset({
        selectedKeywords: selected.keywords,
        candidates: candidates as PoolKeywordData[],
        maxKeywords: CREATIVE_PROMPT_KEYWORD_LIMIT,
      })
  const promptKeywordSet = new Set(promptKeywords.map((item) => normalizeCandidateKey(item)))
  const executableKeywordSet = new Set(selected.keywords.map((item) => normalizeCandidateKey(item)))
  const candidatePool = (candidates as PoolKeywordData[]).map((item) =>
    toCreativeKeywordCandidate(item, {
      promptEligible: promptKeywordSet.has(normalizeCandidateKey((item as any)?.keyword)),
      executableEligible: executableKeywordSet.has(normalizeCandidateKey((item as any)?.keyword)),
      creativeType: input.creativeType || null,
      brandName: input.brandName,
    })
  )
  const executableKeywordCandidates = (selected.keywordsWithVolume as PoolKeywordData[]).map((item) =>
    toCreativeKeywordCandidate(item, {
      promptEligible: promptKeywordSet.has(normalizeCandidateKey((item as any)?.keyword)),
      executableEligible: true,
      creativeType: input.creativeType || null,
      brandName: input.brandName,
    })
  )

  return {
    promptKeywords,
    executableKeywords: selected.keywords,
    executableKeywordCandidates,
    candidatePool,
    keywords: selected.keywords,
    keywordsWithVolume: selected.keywordsWithVolume as PoolKeywordData[],
    keywordSupplementation,
    contextFallbackStrategy: fallbackResolved.strategy,
    audit,
    keywordSourceAudit: audit,
  }
}
