import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBands } from '../lib/normalizeBands.js'

test('normalizeBands preserves p_low/p_high from object input', () => {
  const raw = { k: [0, 1], p_low: [0.1, 0.2], p_high: [0.3, 0.4] }
  const result = normalizeBands(raw)
  assert.deepStrictEqual(result.p_low, [0.1, 0.2])
  assert.deepStrictEqual(result.p_high, [0.3, 0.4])
})

test('normalizeBands derives p_low/p_high from p10/p90', () => {
  const raw = [
    { k: 0, p10: 0.1, p90: 0.3 },
    { k: 1, p10: 0.2, p90: 0.4 }
  ]
  const result = normalizeBands(raw)
  assert.deepStrictEqual(result.p_low, [0.1, 0.2])
  assert.deepStrictEqual(result.p_high, [0.3, 0.4])
})

