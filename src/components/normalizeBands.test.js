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

test('normalizeBands accepts camelCase pLow/pHigh fields', () => {
  const raw = [
    { k: 0, pLow: 0.1, pHigh: 0.3 },
    { k: 1, pLow: 0.2, pHigh: 0.4 }
  ]
  const result = normalizeBands(raw)
  assert.deepStrictEqual(result.p_low, [0.1, 0.2])
  assert.deepStrictEqual(result.p_high, [0.3, 0.4])
})

test('normalizeBands maps hd_dn/hd_up to p_low/p_high', () => {
  const raw = [
    { k: 0, hd_dn: 0.0, hd_up: 0.1 },
    { k: 1, hd_dn: 0.05, hd_up: 0.2 }
  ]
  const result = normalizeBands(raw)
  assert.deepStrictEqual(result.p_low, [0, 0.05])
  assert.deepStrictEqual(result.p_high, [0.1, 0.2])
  assert.strictEqual(result.k.length, 2)
})

