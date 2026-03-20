const MODEL_ANCHOR_PATTERNS = [
  /\b[a-z]{1,5}[- ]?\d{2,4}[a-z0-9-]*\b/i,
  /\b(?:gen|generation|series|model|version|mk)\s*[a-z0-9-]+\b/i,
  /\b(?:type|ver)\s*[a-z0-9-]+\b/i,
]

const STORE_PRODUCT_LINK_NAME_FIELDS = [
  'name',
  'title',
  'productName',
  'product_name',
  'model',
  'series',
  'variant',
  'sku',
] as const

const STORE_PRODUCT_LINK_URL_FIELDS = [
  'url',
  'link',
  'href',
  'productUrl',
  'productLink',
] as const

function parseScrapedData(scrapedData: unknown): Record<string, unknown> | null {
  if (!scrapedData) return null

  let parsed: unknown = scrapedData
  if (typeof scrapedData === 'string') {
    const trimmed = scrapedData.trim()
    if (!trimmed) return null
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== 'object') return null
  return parsed as Record<string, unknown>
}

function pushText(values: string[], value: unknown): void {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (trimmed) values.push(trimmed)
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function appendUrlTexts(values: string[], value: string): void {
  const trimmed = value.trim()
  if (!trimmed) return

  pushText(values, trimmed)

  const decoded = safeDecodeURIComponent(trimmed)
  if (decoded !== trimmed) pushText(values, decoded)

  try {
    const parsed = new URL(trimmed)
    const pathText = safeDecodeURIComponent(parsed.pathname)
      .replace(/[/_+\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    pushText(values, pathText)

    for (const paramValue of parsed.searchParams.values()) {
      const normalizedParam = safeDecodeURIComponent(paramValue)
        .replace(/[/_+\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      pushText(values, normalizedParam)
    }
  } catch {
    const normalized = decoded
      .replace(/[/_+\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (normalized !== decoded) pushText(values, normalized)
  }
}

function normalizeStoreProductLinks(storeProductLinks: unknown): unknown[] {
  if (!storeProductLinks) return []

  if (Array.isArray(storeProductLinks)) return storeProductLinks

  if (typeof storeProductLinks === 'string') {
    const trimmed = storeProductLinks.trim()
    if (!trimmed) return []
    try {
      return normalizeStoreProductLinks(JSON.parse(trimmed))
    } catch {
      return [trimmed]
    }
  }

  if (typeof storeProductLinks === 'object') {
    const record = storeProductLinks as Record<string, unknown>
    if (Array.isArray(record.links)) return record.links
    if (Array.isArray(record.products)) return record.products
    return [record]
  }

  return []
}

function appendStoreProductLinkTexts(values: string[], storeProductLinks: unknown): void {
  const normalizedLinks = normalizeStoreProductLinks(storeProductLinks)
  for (const item of normalizedLinks) {
    if (typeof item === 'string') {
      appendUrlTexts(values, item)
      continue
    }

    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>

    for (const key of STORE_PRODUCT_LINK_NAME_FIELDS) {
      pushText(values, record[key])
    }

    for (const key of STORE_PRODUCT_LINK_URL_FIELDS) {
      const urlValue = record[key]
      if (typeof urlValue === 'string') appendUrlTexts(values, urlValue)
    }
  }
}

function appendProductTexts(values: string[], items: unknown): void {
  if (!Array.isArray(items)) return
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const product = item as Record<string, unknown>
    pushText(values, product.name)
    pushText(values, product.title)
    pushText(values, product.productName)
    pushText(values, product.model)
    pushText(values, product.series)
    pushText(values, product.variant)
    pushText(values, product.sku)
  }
}

export function extractModelAnchorTextsFromScrapedData(scrapedData: unknown): string[] {
  const parsed = parseScrapedData(scrapedData)
  if (!parsed) return []

  const values: string[] = []
  pushText(values, parsed.title)
  pushText(values, parsed.productTitle)
  pushText(values, parsed.product_name)
  pushText(values, parsed.name)
  pushText(values, parsed.model)
  pushText(values, parsed.series)
  pushText(values, parsed.variant)
  appendProductTexts(values, parsed.products)
  appendProductTexts(values, parsed.topProducts)

  const deepScrapeResults = parsed.deepScrapeResults as Record<string, unknown> | undefined
  appendProductTexts(values, deepScrapeResults?.topProducts)

  return Array.from(new Set(values))
}

export function hasModelAnchorEvidenceFromOffer(offer: unknown): boolean {
  if (!offer || typeof offer !== 'object') return false
  const data = offer as Record<string, unknown>
  const texts: string[] = []

  pushText(texts, data.product_name)
  pushText(texts, data.extracted_keywords)
  pushText(texts, data.extracted_headlines)
  pushText(texts, data.extracted_descriptions)
  pushText(texts, data.offer_name)
  pushText(texts, data.category)
  pushText(texts, data.brand_description)
  pushText(texts, data.unique_selling_points)
  pushText(texts, data.product_highlights)

  const parsed = parseScrapedData(data.scraped_data)
  if (parsed) {
    appendProductTexts(texts, parsed.products)
    appendProductTexts(texts, parsed.topProducts)
    const deepScrapeResults = parsed.deepScrapeResults as Record<string, unknown> | undefined
    appendProductTexts(texts, deepScrapeResults?.topProducts)
  }

  appendStoreProductLinkTexts(texts, data.store_product_links)

  return texts.some((text) => MODEL_ANCHOR_PATTERNS.some((pattern) => pattern.test(text)))
}
