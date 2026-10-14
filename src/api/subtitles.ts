import { request } from './http';

/**
 * Dekóduje titulky. České SRT bývají ve windows-1250, ne v UTF-8.
 * Nejdřív zkusíme striktní UTF-8, při chybě windows-1250.
 */
export function decodeSubtitles(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1250').decode(buf);
  }
}

/** SRT → WebVTT. <track> v prohlížeči umí jen VTT. */
export function srtToVtt(srt: string): string {
  const text = srt.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (text.startsWith('WEBVTT')) return text + '\n';

  const body = text
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n');
      // Číslo titulku na prvním řádku je ve VTT volitelné, zahodíme ho.
      if (lines[0] && /^\d+$/.test(lines[0].trim())) lines.shift();
      if (lines[0]) {
        lines[0] = lines[0].replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      return lines.join('\n');
    })
    .filter((b) => b.includes('-->'))
    .join('\n\n');

  return `WEBVTT\n\n${body}\n`;
}

/**
 * Stáhne titulky a vrátí blob: URL s VTT pro <track src>.
 * Volající má URL po použití uvolnit přes URL.revokeObjectURL.
 */
export async function loadSubtitlesAsVttUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await request(url, { signal });
  const vtt = srtToVtt(decodeSubtitles(await res.arrayBuffer()));
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
}
