import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STOCK_TEXT_COLUMNS, stockColumnMax, VARCHAR_MAX, TEXT_MAX } from '@/lib/stock-columns'

// Guard: the caps used by /api/stock must equal the column widths in prisma/schema.prisma.
const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8').replaceAll(String.fromCharCode(13), '')

function modelLines(name: string) {
  const lines = schema.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`model ${name} {`))
  if (start < 0) throw new Error(`model ${name} not found`)
  const end = lines.findIndex((l, i) => i > start && l.startsWith('}'))
  return lines.slice(start + 1, end)
}
// A scalar String field (optional or not): "  name   String?   @db.Text // ..."
const STRING_FIELD = /^ {2}(\w+)\s+String\??(\s|$)/

describe('stock column caps match prisma/schema.prisma', () => {
  const stockStrings = new Map<string, boolean>() // field -> isText
  for (const line of modelLines('StockItem')) {
    const m = STRING_FIELD.exec(line)
    if (m) stockStrings.set(m[1], line.includes('@db.Text'))
  }
  it('finds the StockItem string columns', () => {
    expect(stockStrings.size).toBeGreaterThan(60)
  })
  it('every @db.Text String column is listed, and nothing else is', () => {
    const text = [...stockStrings].filter(([, t]) => t).map(([f]) => f).sort()
    expect([...STOCK_TEXT_COLUMNS].sort()).toEqual(text)
  })
  it('caps are 191 for VARCHAR and 65535 for Text', () => {
    for (const [f, isText] of stockStrings) expect(stockColumnMax(f), f).toBe(isText ? TEXT_MAX : VARCHAR_MAX)
  })
  it('Stone string columns are all VARCHAR(191)', () => {
    let n = 0
    for (const line of modelLines('Stone')) {
      if (STRING_FIELD.test(line)) {
        n++
        expect(line).not.toMatch(/@db\.(Text|VarChar)/)
      }
    }
    expect(n).toBeGreaterThan(8)
  })
})
