import { normalizeGoogleAdsKeyword } from './google-ads-keyword-normalizer'
import { extractModelAnchorTextsFromScrapedData } from './model-anchor-evidence'

const MODEL_CODE_TOKEN_PATTERN = /^[a-z]{1,6}\d{2,5}[a-z]{0,2}$/i
const MODEL_CODE_EXTRACT_PATTERN = /\b[a-z]{1,6}\d{2,5}[a-z]{0,2}\b/gi
const NUMERIC_MODEL_CODE_TOKEN_PATTERN = /^\d{3,4}$/
const NUMERIC_MODEL_CODE_EXTRACT_PATTERN = /\b\d{3,4}\b/g
const SPEC_TERM_EXTRACT_PATTERN = /\b\d{2,5}(?:wh|mah|w|kw|v)\b/gi
export const MODEL_INTENT_MIN_KEYWORD_FLOOR = 3

const LINE_TERM_STOPWORDS = new Set([
  'with',
  'without',
  'for',
  'from',
  'and',
  'the',
  'new',
  'portable',
  'power',
  'station',
  'generator',
  'solar',
  'battery',
  'home',
  'backup',
  'output',
  'ultra',
  'high',
  'ac',
  'dc',
  'official',
  'store',
  'price',
  'buy',
  'best',
  'model',
  'series',
  'version',
  'gen',
  'generation',
])

export interface ProductModelFamilyContext {
  modelCodes: string[]
  lineTerms: string[]
  specTerms: string[]
  evidenceTexts: string[]
}

export interface ProductModelOfferLike {
  brand?: string | null
  product_name?: string | null
  offer_name?: string | null
  scraped_data?: string | null
  final_url?: string | null
  url?: string | null
}

function parseScrapedData(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return value as Record<string, unknown>

  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function pushText(target: string[], value: unknown): void {
  if (typeof value !== 'string') return
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (trimmed) target.push(trimmed)
}

function collectEvidenceTexts(offer: ProductModelOfferLike): string[] {
  const values: string[] = []
  pushText(values, offer.product_name)
  pushText(values, offer.offer_name)
  pushText(values, offer.final_url)
  pushText(values, offer.url)

  const parsed = parseScrapedData(offer.scraped_data)
  if (parsed) {
    pushText(values, parsed.title)
    pushText(values, parsed.productTitle)
    pushText(values, parsed.product_name)
    pushText(values, parsed.name)
    pushText(values, parsed.model)
    pushText(values, parsed.series)
    pushText(values, parsed.variant)
    pushText(values, parsed.sku)
  }

  const scrapedTexts = extractModelAnchorTextsFromScrapedData(offer.scraped_data)
  for (const text of scrapedTexts) {
    pushText(values, text)
  }

  return Array.from(new Set(values))
}

function toBrandTokenSet(brandName: string | null | undefined): Set<string> {
  const normalizedBrand = normalizeGoogleAdsKeyword(brandName || '')
  if (!normalizedBrand) return new Set<string>()
  return new Set(normalizedBrand.split(/\s+/).filter(Boolean))
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function extractModelCodesFromText(text: string): string[] {
  const modelLikeMatches = [
    ...(text.match(MODEL_CODE_EXTRACT_PATTERN) || []),
    ...(text.match(NUMERIC_MODEL_CODE_EXTRACT_PATTERN) || []),
  ]
  const normalized = modelLikeMatches
    .map(normalizeToken)
    .filter(Boolean)
    .filter((token) => MODEL_CODE_TOKEN_PATTERN.test(token) || NUMERIC_MODEL_CODE_TOKEN_PATTERN.test(token))
  return Array.from(new Set(normalized))
}

function extractSpecTermsFromText(text: string): string[] {
  const normalized = normalizeGoogleAdsKeyword(text)
  if (!normalized) return []
  const matches = normalized.match(SPEC_TERM_EXTRACT_PATTERN) || []
  return Array.from(new Set(matches.map((item) => item.toLowerCase())))
}

function collectLineTermsFromEvidence(params: {
  evidenceTexts: string[]
  brandTokens: Set<string>
  modelCodes: Set<string>
}): string[] {
  const { evidenceTexts, brandTokens, modelCodes } = params
  const lineTerms = new Set<string>()

  for (const text of evidenceTexts) {
    const normalized = normalizeGoogleAdsKeyword(text)
    if (!normalized) continue
    const tokens = normalized.split(/\s+/).filter(Boolean)

    for (let i = 0; i < tokens.length; i += 1) {
      const token = normalizeToken(tokens[i])
      if (!token || !modelCodes.has(token)) continue

      for (const offset of [-2, -1, 1]) {
        const candidate = normalizeToken(tokens[i + offset] || '')
        if (!candidate) continue
        if (candidate.length < 4) continue
        if (brandTokens.has(candidate)) continue
        if (MODEL_CODE_TOKEN_PATTERN.test(candidate)) continue
        if (LINE_TERM_STOPWORDS.has(candidate)) continue
        lineTerms.add(candidate)
      }
    }
  }

  return Array.from(lineTerms)
}

export function buildProductModelFamilyContext(offer: ProductModelOfferLike): ProductModelFamilyContext {
  const evidenceTexts = collectEvidenceTexts(offer)
  const brandTokens = toBrandTokenSet(offer.brand)
  const modelCodeSet = new Set<string>()
  const specTermSet = new Set<string>()

  for (const text of evidenceTexts) {
    for (const code of extractModelCodesFromText(text)) {
      if (!brandTokens.has(code)) modelCodeSet.add(code)
    }
    for (const spec of extractSpecTermsFromText(text)) {
      specTermSet.add(spec)
    }
  }

  const lineTerms = collectLineTermsFromEvidence({
    evidenceTexts,
    brandTokens,
    modelCodes: modelCodeSet,
  })

  return {
    modelCodes: Array.from(modelCodeSet),
    lineTerms,
    specTerms: Array.from(specTermSet),
    evidenceTexts,
  }
}

function extractModelCodesFromKeyword(keyword: string): string[] {
  const normalized = normalizeGoogleAdsKeyword(keyword)
  if (!normalized) return []

  const tokens = normalized
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)

  return Array.from(new Set(
    tokens.filter((token) => MODEL_CODE_TOKEN_PATTERN.test(token) || NUMERIC_MODEL_CODE_TOKEN_PATTERN.test(token))
  ))
}

function keywordContainsAnyToken(keyword: string, tokens: Set<string>): boolean {
  if (tokens.size === 0) return false
  const normalized = normalizeGoogleAdsKeyword(keyword)
  if (!normalized) return false
  const keywordTokens = normalized.split(/\s+/).map(normalizeToken).filter(Boolean)
  return keywordTokens.some((token) => tokens.has(token))
}

export function isKeywordInProductModelFamily(
  keyword: string,
  context: ProductModelFamilyContext
): boolean {
  const modelCodeSet = new Set(context.modelCodes.map(normalizeToken).filter(Boolean))
  const lineTermSet = new Set(context.lineTerms.map(normalizeToken).filter(Boolean))
  const specTermSet = new Set(context.specTerms.map((item) => item.toLowerCase()).filter(Boolean))

  if (modelCodeSet.size === 0 && lineTermSet.size === 0 && specTermSet.size === 0) {
    return true
  }

  const keywordModelCodes = extractModelCodesFromKeyword(keyword)
  if (keywordModelCodes.length > 0) {
    const hasAllowedCode = keywordModelCodes.some((code) => modelCodeSet.has(normalizeToken(code)))
    if (hasAllowedCode) return true
    return false
  }

  if (keywordContainsAnyToken(keyword, specTermSet)) return true
  if (modelCodeSet.size === 0 && keywordContainsAnyToken(keyword, lineTermSet)) return true

  return false
}

export function filterKeywordObjectsByProductModelFamily<T extends { keyword: string }>(
  items: T[],
  context: ProductModelFamilyContext
): {
  filtered: T[]
  removed: Array<{ item: T; reason: 'foreign_model_or_family_mismatch' }>
} {
  if (!Array.isArray(items) || items.length === 0) {
    return { filtered: [], removed: [] }
  }

  const hasFamilySignals =
    context.modelCodes.length > 0
    || context.lineTerms.length > 0
    || context.specTerms.length > 0
  if (!hasFamilySignals) {
    return { filtered: [...items], removed: [] }
  }

  const filtered: T[] = []
  const removed: Array<{ item: T; reason: 'foreign_model_or_family_mismatch' }> = []

  for (const item of items) {
    if (isKeywordInProductModelFamily(item.keyword, context)) {
      filtered.push(item)
    } else {
      removed.push({ item, reason: 'foreign_model_or_family_mismatch' })
    }
  }

  return { filtered, removed }
}

export function buildProductModelFamilyFallbackKeywords(params: {
  context: ProductModelFamilyContext
  brandName?: string | null
}): string[] {
  const brand = normalizeGoogleAdsKeyword(params.brandName || '')
  const code = params.context.modelCodes[0]
  const primaryLine = params.context.lineTerms[0]
  const brandTokens = toBrandTokenSet(params.brandName)
  const fallbackLineTerms = Array.from(new Set([
    ...params.context.lineTerms,
    ...params.context.evidenceTexts
      .flatMap((text) => (normalizeGoogleAdsKeyword(text) || '').split(/\s+/))
      .map(normalizeToken)
      .filter(Boolean)
      .filter((token) => token.length >= 4)
      .filter((token) => !brandTokens.has(token))
      .filter((token) => !LINE_TERM_STOPWORDS.has(token))
      .filter((token) => !MODEL_CODE_TOKEN_PATTERN.test(token))
      .filter((token) => !/^\d/.test(token)),
  ])).slice(0, 3)
  const specs = params.context.specTerms
    .map((item) => normalizeGoogleAdsKeyword(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)
  const fallback = new Set<string>()

  if (brand && code && primaryLine) fallback.add(`${brand} ${primaryLine} ${code}`.trim())
  if (brand && code) fallback.add(`${brand} ${code}`.trim())
  if (brand && primaryLine) fallback.add(`${brand} ${primaryLine}`.trim())
  if (code && primaryLine) fallback.add(`${primaryLine} ${code}`.trim())
  if (code) fallback.add(code)
  for (const line of fallbackLineTerms) {
    if (brand) fallback.add(`${brand} ${line}`.trim())
    if (code) fallback.add(`${line} ${code}`.trim())
  }
  for (const spec of specs) {
    for (const line of fallbackLineTerms) {
      if (brand) fallback.add(`${brand} ${line} ${spec}`.trim())
      fallback.add(`${line} ${spec}`.trim())
    }
    if (brand) fallback.add(`${brand} ${spec}`.trim())
    fallback.add(spec)
  }

  return Array.from(fallback)
    .map((item) => normalizeGoogleAdsKeyword(item))
    .filter((item): item is string => Boolean(item))
}

function normalizeKeywordKey(keyword: string): string {
  return normalizeGoogleAdsKeyword(keyword) || String(keyword || '').trim().toLowerCase()
}

export function supplementModelIntentKeywordsWithFallback<T extends { keyword: string }>(params: {
  items: T[]
  context: ProductModelFamilyContext
  brandName?: string | null
  minKeywords?: number
  buildFallbackItem: (keyword: string) => T
}): {
  items: T[]
  addedKeywords: string[]
} {
  const minKeywordsInput = Number(params.minKeywords)
  const minKeywords = Number.isFinite(minKeywordsInput)
    ? Math.max(1, Math.floor(minKeywordsInput))
    : MODEL_INTENT_MIN_KEYWORD_FLOOR

  if (!Array.isArray(params.items) || params.items.length >= minKeywords) {
    return {
      items: Array.isArray(params.items) ? [...params.items] : [],
      addedKeywords: [],
    }
  }

  const fallbackKeywords = buildProductModelFamilyFallbackKeywords({
    context: params.context,
    brandName: params.brandName,
  })
  if (fallbackKeywords.length === 0) {
    return {
      items: [...params.items],
      addedKeywords: [],
    }
  }

  const nextItems = [...params.items]
  const seen = new Set(nextItems.map((item) => normalizeKeywordKey(item.keyword)))
  const addedKeywords: string[] = []

  for (const keyword of fallbackKeywords) {
    const key = normalizeKeywordKey(keyword)
    if (!key || seen.has(key)) continue

    nextItems.push(params.buildFallbackItem(keyword))
    addedKeywords.push(keyword)
    seen.add(key)

    if (nextItems.length >= minKeywords) break
  }

  return {
    items: nextItems,
    addedKeywords,
  }
}
