import { normalizeGoogleAdsKeyword } from './google-ads-keyword-normalizer'
import { getMinContextTokenMatchesForKeywordQualityFilter } from './keyword-context-filter'
import { filterKeywordQuality } from './keyword-quality-filter'
import { containsPureBrand, getPureBrandKeywords, isPureBrandKeyword } from './brand-keyword-utils'
import type { CanonicalCreativeType } from './creative-type'
import type { PoolKeywordData } from './offer-keyword-pool'
import {
  buildProductModelFamilyContext,
  buildProductModelFamilyFallbackKeywords,
  filterKeywordObjectsByProductModelFamily,
  isKeywordInProductModelFamily,
  MODEL_INTENT_MIN_KEYWORD_FLOOR,
  type ProductModelFamilyContext,
  supplementModelIntentKeywordsWithFallback,
} from './model-intent-family-filter'

interface OfferKeywordContext {
  brand?: string | null
  category?: string | null
  product_name?: string | null
  offer_name?: string | null
  target_country?: string | null
  target_language?: string | null
  final_url?: string | null
  url?: string | null
  page_type?: string | null
  scraped_data?: string | null
}

const CREATIVE_CONTEXT_GENERIC_TOKENS = new Set([
  'with',
  'without',
  'from',
  'for',
  'into',
  'your',
  'more',
  'less',
  'extra',
  'battery',
  'batteries',
  'power',
  'portable',
  'electric',
  'outdoor',
  'travel',
  'camping',
  'fishing',
  'truck',
  'trucks',
  'solar',
  'ac',
  'dc',
  'and',
  'the',
  'new',
  'best',
  'official',
  'shop',
  'store',
  'buy',
  'price',
  'cost',
  'sale',
  'deal',
  'offer',
  'promo',
])

const CREATIVE_CONTEXT_MODEL_CODE_PATTERN = /\b(?:[a-z]{1,6}\d{2,5}[a-z]{0,2}|\d{3,4})\b/i
const CREATIVE_CONTEXT_MAX_WORDS_BY_TYPE: Record<CanonicalCreativeType, number> = {
  brand_intent: 6,
  model_intent: 7,
  product_intent: 8,
}

function resolveCreativeContextMaxWordCount(creativeType: CanonicalCreativeType | null | undefined): number {
  if (!creativeType) return 6
  return CREATIVE_CONTEXT_MAX_WORDS_BY_TYPE[creativeType] || 6
}

function resolveOfferPageTypeForKeywordContext(offer: OfferKeywordContext): 'store' | 'product' {
  const explicit = String(offer.page_type || '').trim().toLowerCase()
  if (explicit === 'store') return 'store'
  if (explicit === 'product') return 'product'

  if (offer.scraped_data) {
    try {
      const parsed = JSON.parse(offer.scraped_data)
      const pageType = String((parsed as any)?.pageType || '').trim().toLowerCase()
      if (pageType === 'store' || pageType === 'product') return pageType

      const productsLen = Array.isArray((parsed as any)?.products) ? (parsed as any).products.length : 0
      const hasStoreName = typeof (parsed as any)?.storeName === 'string' && (parsed as any).storeName.trim().length > 0
      const hasDeep = Boolean((parsed as any)?.deepScrapeResults)
      if (hasStoreName || hasDeep || productsLen >= 2) return 'store'
    } catch {
      // Ignore invalid scraped_data JSON
    }
  }

  return 'product'
}

function extractCategorySignalsForKeywordContext(scrapedData: string | null | undefined): string[] {
  if (!scrapedData) return []

  try {
    const parsed = JSON.parse(scrapedData)
    if (!parsed || typeof parsed !== 'object') return []

    const candidates: string[] = []
    const push = (value: unknown) => {
      if (typeof value !== 'string') return
      const trimmed = value.trim()
      if (trimmed) candidates.push(trimmed)
    }

    push((parsed as any).productCategory)
    push((parsed as any).category)

    const primaryCategories = (parsed as any)?.productCategories?.primaryCategories
    if (Array.isArray(primaryCategories)) {
      for (const item of primaryCategories) {
        push(item?.name)
      }
    }

    const breadcrumbs = (parsed as any)?.breadcrumbs
    if (Array.isArray(breadcrumbs)) {
      for (const item of breadcrumbs) {
        push(item)
      }
    }

    return Array.from(new Set(candidates))
  } catch {
    return []
  }
}

function normalizeContextToken(token: string): string {
  const normalized = String(token || '').trim().toLowerCase()
  if (!normalized) return ''

  if (normalized.endsWith('ies') && normalized.length > 4) return `${normalized.slice(0, -3)}y`
  if (normalized.endsWith('es') && normalized.length > 4) return normalized.slice(0, -2)
  if (normalized.endsWith('s') && normalized.length > 3 && !normalized.endsWith('ss')) return normalized.slice(0, -1)
  return normalized
}

function tokenizeContext(text: string): string[] {
  const normalized = normalizeGoogleAdsKeyword(text)
  if (!normalized) return []
  return normalized.split(/\s+/).map(normalizeContextToken).filter(Boolean)
}

function buildIntentContextAnchorTokens(params: {
  brandName?: string | null
  categoryContext: string
  productName?: string | null
  modelFamilyContext?: ProductModelFamilyContext | null
  creativeType?: CanonicalCreativeType | null
}): Set<string> {
  const brandTokens = new Set(tokenizeContext(params.brandName || ''))
  const categoryTokens = tokenizeContext(params.categoryContext)
    .filter((token) => token.length >= 3)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !CREATIVE_CONTEXT_GENERIC_TOKENS.has(token))
  const shouldIncludeLineTerms =
    params.creativeType === 'model_intent'
    || (params.modelFamilyContext?.modelCodes.length || 0) === 0
  const modelFamilyTokens = new Set([
    ...(params.modelFamilyContext?.modelCodes || []),
    ...(shouldIncludeLineTerms ? (params.modelFamilyContext?.lineTerms || []) : []),
    ...(params.modelFamilyContext?.specTerms || []),
  ]
    .flatMap((value) => tokenizeContext(value))
    .filter(Boolean))
  const shouldAllowLongProductTokens =
    (params.modelFamilyContext?.modelCodes.length || 0) === 0
    && (params.modelFamilyContext?.lineTerms.length || 0) === 0

  const productTokens = tokenizeContext(params.productName || '')
    .filter((token) => token.length >= 3)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !CREATIVE_CONTEXT_GENERIC_TOKENS.has(token))
    .filter((token) =>
      categoryTokens.includes(token)
      || modelFamilyTokens.has(token)
      || (/[a-z]/i.test(token) && /\d/.test(token))
      || (shouldAllowLongProductTokens && token.length >= 7)
    )

  return new Set([...categoryTokens, ...modelFamilyTokens, ...productTokens])
}

function hasIntentContextAnchor(params: {
  keyword: string
  anchorTokens: Set<string>
  brandName?: string | null
}): boolean {
  const { keyword, anchorTokens, brandName } = params
  if (anchorTokens.size === 0) return true

  const brandTokens = new Set(tokenizeContext(brandName || ''))
  const keywordTokens = tokenizeContext(keyword)
    .filter((token) => !brandTokens.has(token))
    .filter((token) => !CREATIVE_CONTEXT_GENERIC_TOKENS.has(token))

  if (keywordTokens.length === 0) return false
  return keywordTokens.some((token) => anchorTokens.has(token))
}

function shouldKeepAfterIntentTightening(params: {
  creativeType: CanonicalCreativeType
  keyword: string
  brandName?: string | null
  anchorTokens: Set<string>
  pageType?: 'store' | 'product'
  modelFamilyContext?: ProductModelFamilyContext | null
}): boolean {
  const {
    creativeType,
    keyword,
    brandName,
    anchorTokens,
    pageType,
    modelFamilyContext,
  } = params
  const pureBrandKeywords = getPureBrandKeywords(brandName || '')
  const hasBrand = containsPureBrand(keyword, pureBrandKeywords)
  const isPureBrand = isPureBrandKeyword(keyword, pureBrandKeywords)
  const hasAnchor = hasIntentContextAnchor({ keyword, anchorTokens, brandName })
  const normalizedKeyword = normalizeGoogleAdsKeyword(keyword) || ''
  const hasExplicitModelCode = CREATIVE_CONTEXT_MODEL_CODE_PATTERN.test(normalizedKeyword)
  const isForeignExplicitModel =
    pageType === 'product'
    && hasExplicitModelCode
    && modelFamilyContext
    && !isKeywordInProductModelFamily(keyword, modelFamilyContext)

  if (creativeType === 'brand_intent') {
    if (isPureBrand) return true
    if (!hasBrand) return false
    if (isForeignExplicitModel) return false
    return hasAnchor
  }

  if (creativeType === 'model_intent') {
    return hasAnchor
  }

  if (creativeType === 'product_intent') {
    if (isPureBrand) return true
    if (isForeignExplicitModel) return false
    return hasAnchor
  }

  return true
}

export function normalizeCreativeKeywordCandidatesForContextFilter(
  keywordsWithVolume: unknown[],
  fallbackSource: string
): PoolKeywordData[] {
  return keywordsWithVolume
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const keyword = String((item as any).keyword || '').trim()
      if (!keyword) return null

      return {
        ...item,
        keyword,
        searchVolume: typeof (item as any).searchVolume === 'number'
          ? (item as any).searchVolume
          : Number((item as any).searchVolume) || 0,
        source: String((item as any).source || fallbackSource || 'KEYWORD_POOL').trim() || 'KEYWORD_POOL',
        matchType: ((item as any).matchType || 'PHRASE') as 'EXACT' | 'PHRASE' | 'BROAD',
      } as PoolKeywordData
    })
    .filter((item): item is PoolKeywordData => item !== null)
}

export function filterCreativeKeywordsByOfferContextDetailed(params: {
  offer: OfferKeywordContext
  keywordsWithVolume: PoolKeywordData[]
  scopeLabel: string
  creativeType?: CanonicalCreativeType | null
}): {
  keywords: PoolKeywordData[]
  contextMismatchRemovedCount: number
  intentTighteningRemovedCount: number
} {
  const { offer, keywordsWithVolume, scopeLabel, creativeType } = params
  if (keywordsWithVolume.length === 0) {
    return {
      keywords: keywordsWithVolume,
      contextMismatchRemovedCount: 0,
      intentTighteningRemovedCount: 0,
    }
  }

  const pageType = resolveOfferPageTypeForKeywordContext(offer)
  const minContextTokenMatches = getMinContextTokenMatchesForKeywordQualityFilter({ pageType })
  const categorySignals = extractCategorySignalsForKeywordContext(offer.scraped_data || null)
  const categoryContext = [offer.category, ...categorySignals]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
  const productPageModelFamilyContext = pageType === 'product'
    ? buildProductModelFamilyContext({
      brand: offer.brand,
      product_name: offer.product_name,
      offer_name: offer.offer_name,
      scraped_data: offer.scraped_data || null,
      final_url: offer.final_url,
      url: offer.url,
    })
    : null

  const qualityFiltered = filterKeywordQuality(keywordsWithVolume, {
    brandName: offer.brand || '',
    category: categoryContext || undefined,
    productName: offer.product_name || undefined,
    targetCountry: offer.target_country || undefined,
    targetLanguage: offer.target_language || undefined,
    productUrl: offer.final_url || offer.url || undefined,
    minWordCount: 1,
    maxWordCount: resolveCreativeContextMaxWordCount(creativeType),
    mustContainBrand: creativeType === 'brand_intent' && String(offer.brand || '').trim().length > 0,
    minContextTokenMatches,
  })

  const contextMismatchRemovedCount = qualityFiltered.removed
    .filter(item => item.reason.includes('与商品无关'))
    .length
  if (qualityFiltered.removed.length > 0) {
    console.log(
      `🧹 创意关键词过滤(${scopeLabel}): ${keywordsWithVolume.length} → ${qualityFiltered.filtered.length} ` +
      `(移除 ${qualityFiltered.removed.length}，其中上下文不相关 ${contextMismatchRemovedCount})`
    )
  }

  let modelFamilyFilteredKeywords = qualityFiltered.filtered
  if (creativeType === 'model_intent' && pageType === 'product' && qualityFiltered.filtered.length > 0) {
    const modelFamilyContext = productPageModelFamilyContext || buildProductModelFamilyContext({
      brand: offer.brand,
      product_name: offer.product_name,
      offer_name: offer.offer_name,
      scraped_data: offer.scraped_data || null,
      final_url: offer.final_url,
      url: offer.url,
    })

    const modelFamilyFiltered = filterKeywordObjectsByProductModelFamily(
      qualityFiltered.filtered,
      modelFamilyContext
    )

    if (modelFamilyFiltered.removed.length > 0) {
      console.log(
        `🧬 model_intent 型号族过滤(${scopeLabel}): ${qualityFiltered.filtered.length} → ${modelFamilyFiltered.filtered.length} ` +
        `(移除 ${modelFamilyFiltered.removed.length})`
      )
    }

    if (modelFamilyFiltered.filtered.length > 0) {
      modelFamilyFilteredKeywords = modelFamilyFiltered.filtered
    } else {
      const fallbackKeywords = buildProductModelFamilyFallbackKeywords({
        context: modelFamilyContext,
        brandName: offer.brand,
      })

      if (fallbackKeywords.length > 0) {
        const seed = qualityFiltered.filtered[0]
        modelFamilyFilteredKeywords = fallbackKeywords.map((keyword) => ({
          ...seed,
          keyword,
          searchVolume: 0,
          source: 'MODEL_FAMILY_GUARD',
          matchType: 'EXACT',
        }))
        console.warn(
          `⚠️ model_intent 型号族过滤后无关键词，已注入 ${modelFamilyFilteredKeywords.length} 个兜底型号词 (${scopeLabel})`
        )
      }
    }

    if (modelFamilyFilteredKeywords.length > 0 && modelFamilyFilteredKeywords.length < MODEL_INTENT_MIN_KEYWORD_FLOOR) {
      const seed = modelFamilyFilteredKeywords[0]
      const supplemented = supplementModelIntentKeywordsWithFallback({
        items: modelFamilyFilteredKeywords,
        context: modelFamilyContext,
        brandName: offer.brand,
        minKeywords: MODEL_INTENT_MIN_KEYWORD_FLOOR,
        buildFallbackItem: (keyword) => ({
          ...seed,
          keyword,
          searchVolume: 0,
          source: 'MODEL_FAMILY_GUARD',
          matchType: 'EXACT' as const,
        }),
      })

      if (supplemented.addedKeywords.length > 0) {
        modelFamilyFilteredKeywords = supplemented.items
        console.log(
          `🧩 model_intent 关键词补足(${scopeLabel}): +${supplemented.addedKeywords.length} ` +
          `(总计 ${modelFamilyFilteredKeywords.length})`
        )
      }
    }
  }

  if (
    (creativeType === 'brand_intent' || creativeType === 'model_intent' || creativeType === 'product_intent')
    && modelFamilyFilteredKeywords.length > 0
  ) {
    const anchorTokens = buildIntentContextAnchorTokens({
      brandName: offer.brand,
      categoryContext,
      productName: offer.product_name,
      modelFamilyContext: productPageModelFamilyContext,
      creativeType,
    })

    if (anchorTokens.size > 0) {
      const tightened = modelFamilyFilteredKeywords.filter((item) =>
        shouldKeepAfterIntentTightening({
          creativeType,
          keyword: item.keyword,
          brandName: offer.brand,
          anchorTokens,
          pageType,
          modelFamilyContext: productPageModelFamilyContext,
        })
      )

      if (tightened.length > 0) {
        const intentTighteningRemovedCount = Math.max(0, modelFamilyFilteredKeywords.length - tightened.length)
        if (intentTighteningRemovedCount > 0) {
          console.log(
            `🎯 ${creativeType} 上下文收紧(${scopeLabel}): ${modelFamilyFilteredKeywords.length} → ${tightened.length}`
          )
        }

        return {
          keywords: tightened,
          contextMismatchRemovedCount,
          intentTighteningRemovedCount,
        }
      }

      console.warn(
        `⚠️ ${creativeType} 上下文收紧后无可用关键词，保留首轮过滤结果 (${modelFamilyFilteredKeywords.length})`
      )
    }
  }

  return {
    keywords: modelFamilyFilteredKeywords,
    contextMismatchRemovedCount,
    intentTighteningRemovedCount: 0,
  }
}

export function filterCreativeKeywordsByOfferContext(params: {
  offer: OfferKeywordContext
  keywordsWithVolume: PoolKeywordData[]
  scopeLabel: string
  creativeType?: CanonicalCreativeType | null
}): PoolKeywordData[] {
  return filterCreativeKeywordsByOfferContextDetailed(params).keywords
}

export const __testOnly = {
  normalizeContextToken,
  tokenizeContext,
  buildIntentContextAnchorTokens,
  hasIntentContextAnchor,
  shouldKeepAfterIntentTightening,
}
