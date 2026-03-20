import { describe, expect, it } from 'vitest'
import { normalizeCreativeTaskError, toCreativeTaskErrorResponseFields } from '../creative-task-error'

describe('creative-task-error', () => {
  it('classifies keyword clustering upstream 400 correctly', () => {
    const error = normalizeCreativeTaskError(
      '关键词AI语义分类失败（分批处理）: Gemini API调用失败: Request failed with status code 400',
      '任务失败'
    )

    expect(error.code).toBe('CREATIVE_KEYWORD_CLUSTERING_UPSTREAM_400')
    expect(error.category).toBe('upstream')
    expect(error.retryable).toBe(true)
    expect(error.userMessage).toContain('400')
  })

  it('keeps structured fields from API payload', () => {
    const error = normalizeCreativeTaskError(
      {
        errorCode: 'GOOGLE_ADS_CONFIG_INCOMPLETE',
        errorCategory: 'config',
        errorUserMessage: 'Google Ads API 配置不完整',
        errorRetryable: false,
        structuredError: {
          message: 'Developer Token missing',
          details: {
            missingFields: ['Developer Token'],
          },
        },
      },
      '任务失败'
    )

    expect(error.code).toBe('GOOGLE_ADS_CONFIG_INCOMPLETE')
    expect(error.category).toBe('config')
    expect(error.message).toBe('Developer Token missing')
    expect(error.userMessage).toBe('Google Ads API 配置不完整')
    expect(error.retryable).toBe(false)
    expect((error.details as any)?.missingFields).toEqual(['Developer Token'])
  })

  it('maps legacy keyword pool build message to upstream code', () => {
    const error = normalizeCreativeTaskError({ error: '关键词池创建失败' }, '任务失败')

    expect(error.code).toBe('CREATIVE_KEYWORD_POOL_BUILD_FAILED')
    expect(error.category).toBe('upstream')
    expect(error.retryable).toBe(true)
  })

  it('exports response fields for API compatibility', () => {
    const normalized = normalizeCreativeTaskError(
      { code: 'AUTH_REQUIRED', category: 'auth', message: 'Unauthorized', userMessage: '登录已过期', retryable: false },
      '任务失败'
    )
    const responseFields = toCreativeTaskErrorResponseFields(normalized)

    expect(responseFields).toMatchObject({
      errorCode: 'AUTH_REQUIRED',
      errorCategory: 'auth',
      errorUserMessage: '登录已过期',
      errorRetryable: false,
    })
    expect((responseFields as any).structuredError.code).toBe('AUTH_REQUIRED')
  })
})
