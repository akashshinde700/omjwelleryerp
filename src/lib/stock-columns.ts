// Column widths for StockItem / Stone string fields, mirroring prisma/schema.prisma: a plain
// `String` is VARCHAR(191), `@db.Text` is 65,535 bytes. The /api/stock boundary caps each field at
// its column so an over-long value is a field-named 400, never a MySQL "value too long" 500.
// Only the @db.Text columns are listed — every other string field is VARCHAR(191).
// tests/unit/stock-column-caps.test.ts re-reads the schema and fails if this drifts.
export const VARCHAR_MAX = 191
export const TEXT_MAX = 65535
export const STOCK_TEXT_COLUMNS: readonly string[] = [
  'packetDesc1', 'packetDesc2', 'packetDesc3', 'packetDesc4', 'packetDesc5', 'diamondCertUrl',
  'photoUrl', 'photoUrl2', 'photoUrl3', 'photoUrl4',
]
export const stockColumnMax = (field: string) => (STOCK_TEXT_COLUMNS.includes(field) ? TEXT_MAX : VARCHAR_MAX)

/**
 * Read a request body that must be a JSON object. `null`, arrays, numbers, strings and malformed
 * JSON all yield `null` so the handler can answer 400 BAD_BODY instead of dereferencing `null.firmId`
 * (a 500). Plain-object test: typeof 'object', non-null, not an array.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  let body: unknown
  try { body = await req.json() } catch { return null }
  return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
}
export const BAD_BODY = { error: 'Request body must be a JSON object', code: 'BAD_BODY' } as const
