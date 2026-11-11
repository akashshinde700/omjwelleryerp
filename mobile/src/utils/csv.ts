// CSV export utility for React Native (Expo)
// Generates a CSV string from headers + rows, then writes it to the app's
// document directory and opens the OS share sheet so the user can save /
// email / print it.
//
// `expo-file-system` and `expo-sharing` ship with the Expo SDK. To keep the
// module resilient in environments where those packages are not installed
// (e.g. unit tests, bare RN setups), the native imports are done lazily
// inside try/catch and a Web Blob fallback is used as a last resort.

import { Platform } from 'react-native'

/**
 * Escape a single CSV cell per RFC 4180.
 *  - wrap in double quotes
 *  - escape embedded double quotes by doubling them
 *  - preserve newlines inside cells (they are inside the quotes)
 */
function escapeCell(value: unknown): string {
  const str = String(value ?? '')
  return `"${str.replace(/"/g, '""')}"`
}

/**
 * Build a CSV string from `headers` and `rows`.
 * Each row should be an array with the same length as `headers`.
 */
export function buildCSV(headers: string[], rows: unknown[][]): string {
  const head = headers.map(escapeCell).join(',')
  const body = rows.map((r) => r.map(escapeCell).join(','))
  return [head, ...body].join('\n')
}

/**
 * Web fallback — trigger a CSV download via Blob + <a> click.
 */
function downloadWebBlob(csv: string, filename: string) {
  if (typeof document === 'undefined') return
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[^a-z0-9_-]/gi, '_') + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Export an array of headers + rows to a CSV file and trigger the native
 * share sheet (or web download as fallback).
 *
 * @param filename  Desired file name without extension (e.g. "customers")
 * @param headers   Column headers (human readable)
 * @param rows      Row data; each row is an array of cell values
 *
 * Returns the URI of the file that was written (or '' on web).
 */
export async function exportToCSV(
  filename: string,
  headers: string[],
  rows: unknown[][],
): Promise<string> {
  const csv = buildCSV(headers, rows)

  // Native path — needs expo-file-system + expo-sharing
  if (Platform.OS !== 'web') {
    try {
      const FileSystem = await import('expo-file-system')
      const Sharing = await import('expo-sharing')
      const csvWithBom = '\uFEFF' + csv
      const safeName = filename.replace(/[^a-z0-9_-]/gi, '_')
      const fileUri =
        FileSystem.documentDirectory + safeName + '_' + Date.now() + '.csv'

      await FileSystem.writeAsStringAsync(fileUri, csvWithBom, {
        encoding: 'utf8',
      })

      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: `Export ${filename}`,
          UTI: 'public.comma-separated-values-text',
        })
      }
      return fileUri
    } catch (e) {
      // fall through to web fallback
      console.warn('[csv] native export failed, using web fallback', e)
    }
  }

  // Web fallback (or native failure)
  downloadWebBlob(csv, filename)
  return ''
}

/**
 * Convenience helper: export an array of plain objects by deriving headers
 * from the first row's keys.
 */
export async function exportObjectsToCSV(
  filename: string,
  objects: Record<string, any>[],
  pick?: string[],
): Promise<string> {
  if (!objects.length) {
    return exportToCSV(filename, ['(no rows)'], [[]])
  }
  const headers = pick ?? Object.keys(objects[0])
  const rows = objects.map((o) => headers.map((h) => o[h]))
  return exportToCSV(filename, headers, rows)
}
