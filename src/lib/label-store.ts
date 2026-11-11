import { db } from '@/lib/db'
import { detectDialect } from '@/lib/label-engine'
import { TAG_SETTING_KEY, DEFAULT_KEY, TEMPLATE_ID_RE, tagKey, MAIN_TEMPLATE_ID, parseTagConfig, b64ToLatin1, parseFirmTagSettings, type TagConfig } from '@/lib/label-tags'

/**
 * Where a firm's tag templates live: one Setting row each (no table, no migration).
 * `barcode.thermal` = template 'main' (the original single template), `barcode.thermal.t.<id>` = the
 * others, `barcode.thermal.default` = the id the operator gets without choosing. Every read here is
 * scoped by firmId, so one firm can never see or render another's template.
 */
export type StoredTemplate = { id: string; cfg: TagConfig }

export async function loadTemplates(firmId: string): Promise<{ templates: StoredTemplate[]; defaultId: string | null }> {
  const rows = await db.setting.findMany({ where: { firmId, key: { startsWith: TAG_SETTING_KEY } } })
  const templates: StoredTemplate[] = []
  let want: string | null = null
  for (const r of rows) {
    if (r.key === DEFAULT_KEY) { want = r.value.trim(); continue }
    const id = r.key === TAG_SETTING_KEY ? MAIN_TEMPLATE_ID : r.key.startsWith(`${TAG_SETTING_KEY}.t.`) ? r.key.slice(TAG_SETTING_KEY.length + 3) : ''
    if (TEMPLATE_ID_RE.test(id)) templates.push({ id, cfg: parseTagConfig(r.value) })
  }
  const label = (t: StoredTemplate) => (t.cfg.name || t.cfg.templateName || t.id).toLowerCase()
  templates.sort((a, b) => label(a).localeCompare(label(b)))
  const defaultId = templates.find((t) => t.id === want)?.id ?? templates.find((t) => t.id === MAIN_TEMPLATE_ID)?.id ?? templates[0]?.id ?? null
  return { templates, defaultId }
}

/** Firm-wide settings (auto-print, price-code cipher): one Setting row, read by firmId like everything here. */
export const FIRM_SETTINGS_KEY = `${TAG_SETTING_KEY}.firm`
export async function loadFirmSettings(firmId: string) {
  const r = await db.setting.findUnique({ where: { firmId_key: { firmId, key: FIRM_SETTINGS_KEY } } })
  return parseFirmTagSettings(r?.value)
}

export function summarise(t: StoredTemplate, defaultId: string | null) {
  const c = t.cfg
  let dialect = 'unknown'
  try { if (c.templateB64) dialect = detectDialect(b64ToLatin1(c.templateB64)) } catch { /* bad base64 reads as unknown */ }
  return {
    id: t.id, name: c.name || c.templateName || 'Untitled', brand: c.brand, model: c.model, printer: c.printer,
    size: c.size, variant: c.variant, templateName: c.templateName, hasFile: !!c.templateB64, dialect, widthMm: c.widthMm, heightMm: c.heightMm, isDefault: t.id === defaultId,
  }
}

export { tagKey }
