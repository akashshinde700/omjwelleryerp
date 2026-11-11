'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Hook to detect hardware barcode scanner input.
 * Barcode scanners act as keyboards — they type characters very fast (~10-50ms apart)
 * and end with Enter. Human typing is much slower (>100ms between keys).
 *
 * Usage:
 *   const { scanValue, isScanning } = useBarcodeScanner((code) => {
 *     console.log('Scanned:', code)
 *   })
 *
 * @param onScan Callback fired when a complete barcode is scanned
 * @param options Config: minChars (default 4), maxInterval (default 50ms)
 */
export function useBarcodeScanner(onScan: (code: string) => void, options?: { minChars?: number; maxInterval?: number; enabled?: boolean }) {
  const { minChars = 4, maxInterval = 50, enabled = true } = options || {}
  const bufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)
  const [isScanning, setIsScanning] = useState(false)
  const callbackRef = useRef(onScan)
  useEffect(() => { callbackRef.current = onScan }, [onScan])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return
    // Skip if user is typing in an input/textarea (let normal input work)
    const target = e.target as HTMLElement
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      // But still catch Enter in barcode-dedicated inputs
      if (!target.hasAttribute('data-barcode-input')) return
    }

    const now = Date.now()
    const interval = now - lastKeyTimeRef.current
    lastKeyTimeRef.current = now

    // If too much time passed, reset buffer (user started new scan or normal typing)
    if (interval > maxInterval && bufferRef.current.length > 0) {
      bufferRef.current = ''
      setIsScanning(false)
    }

    // Enter = end of barcode
    if (e.key === 'Enter') {
      if (bufferRef.current.length >= minChars) {
        const code = bufferRef.current
        bufferRef.current = ''
        setIsScanning(false)
        callbackRef.current(code)
        e.preventDefault()
      }
      return
    }

    // Only accept printable characters
    if (e.key.length === 1) {
      if (bufferRef.current.length === 0) setIsScanning(true)
      bufferRef.current += e.key
    }
  }, [enabled, maxInterval, minChars])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return { isScanning }
}

/**
 * Barcode prefix routing — matches oMunim's convention:
 *   S  = Loan Serial (e.g. SA01, SAB110)
 *   T  = Transfer Loan Serial
 *   P  = Fine Jewellery (PG1, PS1)
 *   A  = Imitation Jewellery (AX1, AR1)
 *   C  = Customer ID (C101, C2)
 *   M  = Email ID (Minfo@...)
 *   L  = Loyalty Card (L0001)
 *   B  = Sterling Jewellery (BX1, BR1)
 *   H  = HallMark UID (HUID-123)
 *   Q  = Quotation Serial (Q1)
 */
export type BarcodeRoute = {
  type: 'loan' | 'stock' | 'customer' | 'invoice' | 'unknown'
  searchValue: string
  category?: string
}

export function routeBarcode(code: string): BarcodeRoute {
  const upper = code.trim().toUpperCase()
  if (!upper) return { type: 'unknown', searchValue: code }

  const firstChar = upper[0]
  switch (firstChar) {
    case 'S':
      // S prefix = loan (SA01, SAB110)
      return { type: 'loan', searchValue: upper.slice(1) || code }
    case 'T':
      // T prefix = transfer loan
      return { type: 'loan', searchValue: upper.slice(1) || code }
    case 'P':
      // P prefix = fine jewellery
      return { type: 'stock', searchValue: code, category: 'fine' }
    case 'A':
      // A prefix = imitation jewellery
      return { type: 'stock', searchValue: code, category: 'imitation' }
    case 'B':
      // B prefix = sterling silver
      return { type: 'stock', searchValue: code, category: 'sterling' }
    case 'C':
      // C prefix = customer
      return { type: 'customer', searchValue: code }
    case 'H':
      // H prefix = HallMark UID
      return { type: 'stock', searchValue: code }
    case 'M':
      // M prefix = email
      return { type: 'customer', searchValue: code.slice(1) || code }
    case 'L':
      // L prefix = loyalty card
      return { type: 'customer', searchValue: code }
    case 'Q':
      // Q prefix = quotation
      return { type: 'invoice', searchValue: code }
    default:
      // No prefix — search everything
      return { type: 'unknown', searchValue: code }
  }
}

/**
 * Code 128 subset B — the real encoding, not a picture of one.
 *
 * What was here before produced bars from `charCodeAt` bit patterns. It LOOKED like a barcode and
 * no scanner on earth could read it, which is fatal for the one job a girvi packet tag has: find
 * the right packet in the safe. Subset B covers ASCII 32–127, which is every character loanNo /
 * itemCode / barcode can hold. Anything outside that range is dropped rather than encoded wrong.
 *
 * 107 patterns, index = code value. Each digit is a module count, alternating bar, space, bar…
 * starting with a bar. Index 106 is the 7-element stop pattern.
 */
const C128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const C128_START_B = 104
const C128_STOP = 106
/** Scanners need clear space either side. 10 modules is the Code 128 minimum. */
const QUIET_MODULES = 10

/** Code-128B code values for a string, or [] if nothing encodable remains. */
function c128Values(value: string): number[] {
  const out: number[] = []
  for (const ch of value) {
    const c = ch.charCodeAt(0)
    if (c >= 32 && c <= 127) out.push(c - 32)
  }
  return out
}

/**
 * A scannable Code 128-B barcode as a standalone SVG string.
 * @param value    text to encode (ASCII 32–127; other characters are dropped)
 * @param height   bar height in px/user units — 12mm or more for a reliable read on paper
 * @param barWidth width of ONE module. At 96dpi, 2 ≈ 0.53mm, which most laser printers hold.
 * @param showText render the human-readable line under the bars (off for tiny tags)
 */
export function generateBarcodeSvg(value: string, height = 50, barWidth = 2, showText = true): string {
  const data = c128Values(value)
  if (!data.length) return ''
  // Checksum: start value + sum(position × value), positions 1-based, modulo 103.
  let sum = C128_START_B
  data.forEach((v, i) => { sum += v * (i + 1) })
  const codes = [C128_START_B, ...data, sum % 103, C128_STOP]

  let x = QUIET_MODULES * barWidth
  let rects = ''
  for (const code of codes) {
    const pattern = C128_PATTERNS[code]
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]) * barWidth
      if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`
      x += w
    }
  }
  const width = x + QUIET_MODULES * barWidth
  const textH = showText ? Math.max(9, Math.round(barWidth * 5.5)) : 0
  const total = height + (showText ? textH + 3 : 0)
  const text = showText
    ? `<text x="${width / 2}" y="${total - 1}" font-family="monospace" font-size="${textH}" letter-spacing="${barWidth * 0.4}" text-anchor="middle" fill="#000">${value.replace(/[<&]/g, '')}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" shape-rendering="crispEdges" role="img" aria-label="Barcode ${value}">${rects}${text}</svg>`
}

/** The same barcode as a data URI, for `<img src>` — the form print layouts use. */
export function barcodeDataUri(value: string, height = 50, barWidth = 2, showText = true): string {
  const svg = generateBarcodeSvg(value, height, barWidth, showText)
  if (!svg) return ''
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
