import { describe, it, expect } from 'vitest'
import { normaliseMobile, isAnonymousName } from '@/lib/party'

describe('normaliseMobile: one man, however it was typed', () => {
  it.each([
    '7775951999', '07775951999', '+917775951999', '917775951999', '91 7775951999', '+91-77759-51999',
    ' 77759 51999 ', '(0)7775951999', '+91 (777) 595 1999',
  ])('%s -> 7775951999', (raw) => expect(normaliseMobile(raw)).toBe('7775951999'))

  it.each([
    ['nine digits (his INV-1035)', '775951999'], ['empty', ''], ['spaces', '   '], ['letters', 'abcdefghij'],
    ['landline-ish 5xxxxxxxxx', '5775951999'], ['13 digits', '9177759519990'], ['11 digits not leading 0', '17775951999'],
    ['12 digits not 91', '447775951999'], ['null', null], ['undefined', undefined],
  ])('%s is not a mobile', (_l, raw) => expect(normaliseMobile(raw as string | null)).toBeNull())
})

describe('isAnonymousName: the line between a person and a counter sale', () => {
  it.each(['Cash', 'cash', ' CASH  SALE ', 'Walk-in', 'walk in', 'Walkin', 'Counter', 'Counter Sale', 'Customer', '', ' ', 'A', '-', '.', 'N/A'])(
    '%j is anonymous', (n) => expect(isAnonymousName(n)).toBe(true))
  it.each(['Jaydeep Dilip Khamkar', 'jaydeep khamkar', 'Ramesh', 'Al', 'Cash Gupta', 'M/S Om Traders'])(
    '%j is a party', (n) => expect(isAnonymousName(n)).toBe(false))
  it('null / undefined are anonymous', () => { expect(isAnonymousName(null)).toBe(true); expect(isAnonymousName(undefined)).toBe(true) })
})
