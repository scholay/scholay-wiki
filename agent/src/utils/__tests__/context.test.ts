import { describe, expect, test } from 'bun:test'
import { calculateCurrentContextTokenTotal } from '../context.js'

describe('calculateCurrentContextTokenTotal', () => {
  test('includes assistant output tokens in the current context total', () => {
    expect(calculateCurrentContextTokenTotal(26_000, {
      input_tokens: 24_000,
      cache_creation_input_tokens: 1_000,
      cache_read_input_tokens: 1_000,
      output_tokens: 3_000,
    })).toBe(29_000)
  })

  test('keeps the local estimate as a lower bound when provider usage is smaller', () => {
    expect(calculateCurrentContextTokenTotal(29_000, {
      input_tokens: 24_000,
      cache_creation_input_tokens: 1_000,
      cache_read_input_tokens: 1_000,
      output_tokens: 0,
    })).toBe(29_000)
  })
})
