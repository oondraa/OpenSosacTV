import type { LanguageTrack, MediaItem } from '../api';
import { formatEpisodeCode } from '../api';

const LANG_NAMES: Record<string, string> = {
  cz: 'CZ',
  cs: 'CZ',
  sk: 'SK',
  en: 'EN',
  de: 'DE',
  pl: 'PL',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  ru: 'RU',
  ja: 'JA',
  ko: 'KO',
};

const lang = (code: string) => LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();

/** "CZ dabing", "EN + CZ titulky" */
export function languageLabel(t: LanguageTrack): string {
  if (t.subtitles) return `${lang(t.audio)} + ${lang(t.subtitles)} titulky`;
  return t.audio === 'cz' || t.audio === 'sk' ? `${lang(t.audio)} dabing` : `${lang(t.audio)} zvuk`;
}

/** 9660 → "2 h 41 min", 1319 → "22 min" */
export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || seconds < 60) return undefined;
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

/** Čas pro přehrávač: 1:02:05 / 4:09 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Kolik zbývá: "zbývá 48 min" */
export function remainingLabel(item: MediaItem): string | undefined {
  const { position, duration } = item.watch;
  if (!position || !duration || item.watch.finished) return undefined;
  const left = formatDuration(duration - position);
  return left ? `zbývá ${left}` : undefined;
}

export function qualityLabel(q?: string): string | undefined {
  if (!q) return undefined;
  const map: Record<string, string> = { uhd: '4K', fhd: 'Full HD', hd: 'HD', sd: 'SD', kinorip: 'Kino', tvrip: 'TV' };
  return map[q.toLowerCase()] ?? q.toUpperCase();
}

export function kindLabel(item: MediaItem): string {
  switch (item.kind) {
    case 'movie':
      return 'Film';
    case 'serial':
      return item.seasonCount ? `Seriál · ${item.seasonCount} ${plural(item.seasonCount, 'série', 'série', 'sérií')}` : 'Seriál';
    case 'episode':
      return formatEpisodeCode(item.season, item.episode);
  }
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** Krátký meta řádek pod názvem karty. */
export function cardSubline(item: MediaItem): string {
  const parts: string[] = [];
  if (item.kind === 'episode') parts.push(formatEpisodeCode(item.season, item.episode));
  if (item.year && item.kind !== 'episode') parts.push(String(item.year));
  const genre = item.genres[0];
  if (genre && item.kind !== 'episode') parts.push(genre);
  const left = remainingLabel(item);
  if (left) parts.push(left);
  return parts.join(' · ');
}
