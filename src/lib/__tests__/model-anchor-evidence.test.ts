import { describe, expect, it } from 'vitest'

import { hasModelAnchorEvidenceFromOffer } from '../model-anchor-evidence'

describe('hasModelAnchorEvidenceFromOffer', () => {
  it('detects model anchors from store_product_links when other offer fields are empty', () => {
    const hasEvidence = hasModelAnchorEvidenceFromOffer({
      product_name: '',
      extracted_keywords: '',
      extracted_headlines: '',
      extracted_descriptions: '',
      offer_name: '',
      category: '',
      brand_description: '',
      unique_selling_points: '',
      product_highlights: '',
      scraped_data: null,
      store_product_links: JSON.stringify([
        {
          title: 'BrandX robot vacuum',
          url: 'https://example.com/products/brandx-x200-pro-robot-vacuum?ref=ads',
        },
      ]),
    })

    expect(hasEvidence).toBe(true)
  })

  it('returns false when store_product_links do not carry model-like signals', () => {
    const hasEvidence = hasModelAnchorEvidenceFromOffer({
      product_name: '',
      extracted_keywords: '',
      extracted_headlines: '',
      extracted_descriptions: '',
      offer_name: '',
      category: '',
      brand_description: '',
      unique_selling_points: '',
      product_highlights: '',
      scraped_data: null,
      store_product_links: JSON.stringify([
        {
          title: 'BrandX Official Store',
          url: 'https://example.com/store/brandx-official-shop',
        },
      ]),
    })

    expect(hasEvidence).toBe(false)
  })
})
