import type { SelectOption } from '../components/ui';

// ─── Quality filter options ────────────────────────────────────────────────────

export const QUALITY_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  { value: '2160p', label: '2160p / 4K' },
  { value: '1080p', label: '1080p' },
  { value: '720p', label: '720p' },
];

// ─── Language filter options ───────────────────────────────────────────────────

export const LANGUAGE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  { value: 'en', label: 'English (Default)' },
  { value: 'it', label: 'Italian' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
];

// Maps language code → torrent search suffix
export const LANGUAGE_SUFFIX: Record<string, string> = {
  it: 'ita',
  es: 'spa',
  fr: 'fre',
};

// ─── Query builder ─────────────────────────────────────────────────────────────

/**
 * Builds a final torrent search query by appending quality and language suffixes.
 */
export function buildSearchQuery(base: string, quality: string, language: string): string {
  let query = base;
  if (quality) query += ` ${quality}`;
  if (language && LANGUAGE_SUFFIX[language]) {
    query += ` ${LANGUAGE_SUFFIX[language]}`;
  }
  return query;
}
