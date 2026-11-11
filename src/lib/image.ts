/**
 * ── CLIENT-SIDE IMAGE DOWNSCALE ─────────────────────────────────────────────────────────────────
 *
 * One canvas-downscale-to-data-URL helper for every "shrink a photo to fit a MySQL TEXT column"
 * picker in the app: the firm logo, the invoice banners, and the gold-loan pledge-photo field.
 * Each caller only differs in the bounding box, the char budget, whether PNG gets first refusal
 * (line art wants it, a photo never fits under one anyway), and the JPEG quality ladder.
 *
 * `downscaleImage()` uses `createImageBitmap` and `<canvas>` — both native, browser-only. Nothing
 * in this file may be called from a server route, but the regex/constants below ARE meant to be
 * imported from one (so the client form and the API enforce the identical rule). To keep that safe,
 * every DOM-touching line lives inside `downscaleImage()`'s body: importing this module server-side
 * only pulls in unused function text, never executes `document`/`createImageBitmap` at module load.
 */

import { z } from 'zod'

/** The client-side mirror of the regex enforced server-side in src/app/api/firms/route.ts (LOGO_RE)
 *  and the equivalent in src/app/api/loans/route.ts for the pledge photo. Keep in sync by hand —
 *  it's a one-line regex, not worth a shared-package detour. */
export const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/

export function isImageDataUrl(value: string, maxChars: number): boolean {
  return value === '' || (IMAGE_DATA_URL_RE.test(value) && value.length <= maxChars)
}

/**
 * Gold-loan pledge photo (the ornament, photographed at intake). Sized between the logo (a mark,
 * 512px is plenty) and the invoice banner (a wide strip): a pledge photo is evidence, so it gets a
 * bigger box and a bigger MySQL TEXT budget than either. The enforcing copy is src/app/api/loans/route.ts —
 * this is the form's copy, so the picker fails fast instead of round-tripping to the server first.
 */
export const PLEDGE_PHOTO_BOX = 1024
/**
 * 60,000 and not 150,000, and the ceiling is the COLUMN, not taste: LoanItem.photoUrl is
 * `@db.Text` → MySQL TEXT = 65,535 BYTES, base64 is ASCII so one char is one byte, and the server
 * runs STRICT_TRANS_TABLES. A longer string is not truncated, it is an INSERT error
 * ("Data too long for column 'photoUrl'") that fails the whole loan — the counter would lose the
 * pledge, not just the picture. 60,000 chars ≈ 45KB of image, the same head-room the firm logo
 * leaves. The quality ladder in downscaleImage() absorbs the difference; nothing else changes.
 *
 * To carry a ~110KB photo the column has to become MEDIUMTEXT first (be-platform-data, one ALTER —
 * the Prisma client type stays `String`). Raise this constant in that same change and both the
 * picker and the API follow it.
 */
export const PLEDGE_PHOTO_MAX_CHARS = 60_000

/**
 * Reusable zod rules for a URL column that a route must not take on trust. Server-side callers only
 * (the zod import is the only cost to the picker bundle). omitted -> undefined (PUT leaves the column
 * alone); '' or null -> null (clear it). Length is checked before the regex/URL parse so an oversized
 * body is rejected on a `.length` read.
 *
 * FOLLOW-UP: src/app/api/loans/route.ts still holds its own copy of the photo rule (photoUrlSchema).
 * Re-point it at imageDataUrlSchema() so the two cannot drift.
 */
const blankToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim()

/** Data-URL image only (png/jpeg/webp, base64), capped at the TEXT column. Same rule as loans/firms. */
export function imageDataUrlSchema(what = 'Photo', maxChars = PLEDGE_PHOTO_MAX_CHARS) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform(blankToNull)
    .refine((v) => v == null || (v.length <= maxChars && IMAGE_DATA_URL_RE.test(v)), {
      message: `${what} must be an image picked in the form - PNG, JPEG or WebP, under ${Math.round((maxChars * 3) / 4 / 1024)}KB. A web link or a file path is not accepted.`,
    })
}

export const DOC_LINK_MAX_CHARS = 500

/** An off-site document link: https only (http would carry a KYC scan unencrypted), capped. */
export function httpsLinkSchema(what = 'Document link', maxChars = DOC_LINK_MAX_CHARS) {
  return z
    .union([z.string(), z.null()])
    .optional()
    .transform(blankToNull)
    .refine((v) => v == null || v.length <= maxChars, { message: `${what} must be at most ${maxChars} characters.` })
    .refine(
      (v) => {
        if (v == null || v.length > maxChars) return true // length already reported above
        try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !!u.hostname } catch { return false }
      },
      { message: `${what} must start with https:// - http:// is not accepted because a KYC document must not travel unencrypted. Paste the secure (https) share link.` },
    )
}

export type ImageBox = number | { w: number; h: number }

export interface DownscaleImageOpts {
  /** Longest-edge cap, square (`512`) or rectangular (`{ w: 1280, h: 500 }`). */
  box: ImageBox
  /** Data-URL length ceiling — leaves headroom under the target's MySQL TEXT column. */
  maxChars: number
  /** Try a lossless PNG before the JPEG ladder. Wanted for line art (a logo); skipped for photos
   *  (a banner/photo never fits under `maxChars` as PNG, so trying it only wastes a canvas read). */
  preferPng?: boolean
  /** JPEG qualities to try, highest first, until one fits `maxChars`. */
  quality: number[]
  /** Thrown when the file is not a raster image (or is SVG — see below). Caller-specific wording,
   *  preserved from before this was shared. */
  invalidTypeMessage: string
  /** Thrown when even the lowest quality step still will not fit `maxChars`. */
  tooLargeMessage: string
}

export interface DownscaleImageResult {
  dataUrl: string
  /** width / height of the fitted image — the banner picker uses this to warn about print height. */
  aspect: number
}

/**
 * Fit an uploaded image into `opts.box` and under `opts.maxChars`. Canvas + native encoders, no
 * image library for what the browser already does. Quality steps down until it fits; if even the
 * last step does not, it throws rather than handing the caller a data URL the server will reject.
 *
 * SVG is rejected alongside every non-image type, always — it is a scripting surface on a document
 * (a bill, a pledge record) that ends up in front of a customer or an inspector. This used to be
 * only the logo's rule; the banner picker didn't apply it. Now both do — that gap was a real bug.
 */
export async function downscaleImage(file: File, opts: DownscaleImageOpts): Promise<DownscaleImageResult> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    throw new Error(opts.invalidTypeMessage)
  }
  const bitmap = await createImageBitmap(file)
  const box = typeof opts.box === 'number' ? { w: opts.box, h: opts.box } : opts.box
  const scale = Math.min(1, box.w / bitmap.width, box.h / bitmap.height)
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot resize images')
  // White behind it: a transparent PNG flattened onto black would print as a black slab.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const aspect = w / h

  if (opts.preferPng) {
    const png = canvas.toDataURL('image/png')
    if (png.length <= opts.maxChars) return { dataUrl: png, aspect }
  }
  for (const q of opts.quality) {
    const jpeg = canvas.toDataURL('image/jpeg', q)
    if (jpeg.length <= opts.maxChars) return { dataUrl: jpeg, aspect }
  }
  throw new Error(opts.tooLargeMessage)
}
