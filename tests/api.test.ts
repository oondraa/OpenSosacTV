import { describe, expect, it } from 'vitest';
import { sosacPasswordHash, streamujPasswordHash } from '../src/api/hash';
import {
  normalizeEpisode,
  normalizeMovie,
  normalizeSerial,
  normalizeSerialDetail,
  parseCzDate,
  parseLanguage,
  secureUrl,
} from '../src/api/normalize';
import { parseStreamOptions, pickVariant } from '../src/api/streamuj';
import type { StreamVariant } from '../src/api/streamuj';
import { srtToVtt, decodeSubtitles } from '../src/api/subtitles';
import { parseSettings } from '../src/api/discovery';
import { normalizePosition } from '../src/api/progress';
import { findContinueEpisode, findNextEpisode, resumePosition } from '../src/api/playback';
import { redact } from '../src/api/http';
import type { RawEpisode, RawMovie, RawSerial } from '../src/api/raw';

// Vzorky zkrácené z reálných odpovědí kodi-api.sosac.to (14. 10. 2026).
const RAW_MOVIE: RawMovie = {
  _id: 156,
  q: 'hd',
  i: 'http://kodi-api.sosac.to/obrazky/300/156.jpg',
  b: 'http://kodi-api.sosac.to/obrazky/960/156.jpg',
  n: { cs: ['Avatar'] },
  d: ['cz'],
  y: '2009',
  c: 82,
  cp: 93063,
  m: 78,
  mp: 1163865,
  a: 12,
  o: ['USA', 'Velká Británie'],
  s: ['James Cameron'],
  f: ['CCH Pounder'],
  h: ['James Cameron'],
  g: ['Akční', 'Sci-Fi'],
  p: 'Avatar před námi…',
  l: '07bf02dd9ab195082377',
  dl: 9660,
  e: 'stereo',
  r: '30.3.2012',
  w: null,
};

const RAW_SERIAL: RawSerial = {
  _id: 124,
  q: 'hd',
  i: 'http://kodi-api.sosac.to/obrazky/300s/124.jpg',
  n: { cs: ['Hra o trůny'], us: ['Game of Thrones', 'GoT'] },
  d: ['cz', 'en+cztit'],
  y: '2011',
  m: 92,
  a: 18,
  z: 8,
  v: 74,
};

const RAW_LIST_EPISODE: RawEpisode = {
  _id: 159572,
  q: 'sd',
  i: 'http://kodi-api.sosac.to/obrazky/300s/88.jpg',
  ie: 'http://kodi-api.sosac.to/obrazky/700s/159572.jpg',
  n: { cs: 'Griffinovi', us: 'Family Guy' },
  ne: { cs: 'Happy Hell o ween', en: 'Happy Hell o ween' },
  l: '6ce3s28731a45d620161',
  dl: 1319,
  id: 88,
  s: 24,
  ep: 16,
  r: '4.10.2026',
  w: 1200,
  a: 99,
};

describe('hash', () => {
  // Očekávané hodnoty spočítané Pythonem stejně jako sosac_api.py.
  it('katalogový hash odpovídá Kodi pluginu', () => {
    expect(sosacPasswordHash('tester', 'heslo123')).toBe('6b9435b238d9c842a213505ca56157c4');
  });
  it('kóduje diakritiku jako UTF-8', () => {
    expect(sosacPasswordHash('Žluťoučký', 'kůň')).toBe('a258600e6cac9951c5e72b4dae77442b');
  });
  it('Streamuj hash je md5 hesla', () => {
    expect(streamujPasswordHash('heslo123')).toBe('6a284155906c26cbca20c53376bc63ac');
  });
});

describe('normalize', () => {
  it('film', () => {
    const m = normalizeMovie(RAW_MOVIE);
    expect(m.title).toBe('Avatar');
    expect(m.poster).toBe('https://kodi-api.sosac.to/obrazky/300/156.jpg');
    expect(m.year).toBe(2009);
    expect(m.ratings).toEqual({ csfd: 82, csfdVotes: 93063, imdb: 7.8, imdbVotes: 1163865 });
    expect(m.date).toBe('2012-03-30');
    expect(m.streamId).toBe('07bf02dd9ab195082377');
    expect(m.watch).toEqual({ position: null, duration: 9660, progress: 0, finished: false });
    expect(m.directors).toEqual(['James Cameron']);
  });

  it('seriál: originální název z "us", jazyky s titulky', () => {
    const s = normalizeSerial(RAW_SERIAL);
    expect(s.title).toBe('Hra o trůny');
    expect(s.originalTitle).toBe('Game of Thrones');
    expect(s.languages).toEqual([
      { audio: 'cz', raw: 'cz', subtitles: undefined },
      { audio: 'en', raw: 'en+cztit', subtitles: 'cz' },
    ]);
    expect(s.seasonCount).toBe(8);
    expect(s.ageRating).toBe(18);
  });

  it('epizoda ze seznamu: n = seriál, ne = epizoda', () => {
    const e = normalizeEpisode(RAW_LIST_EPISODE);
    expect(e.serialTitle).toBe('Griffinovi');
    expect(e.episodeTitle).toBe('Happy Hell o ween');
    expect(e.title).toBe('Griffinovi S24E16');
    expect(e.serialId).toBe(88);
    expect(e.thumbnail).toBe('https://kodi-api.sosac.to/obrazky/700s/159572.jpg');
    expect(e.ageRating).toBeUndefined();
    expect(e.watch.progress).toBeCloseTo(1200 / 1319);
    expect(e.watch.finished).toBe(true);
  });

  it('detail seriálu: n = epizoda, série a epizody z klíčů, řazení', () => {
    const d = normalizeSerialDetail(
      6608,
      {
        '2': { '1': { _id: 20, n: { cs: 'S2E1' }, l: 'b' } },
        '1': {
          '2': { _id: 12, n: { cs: 'Druhá' }, l: 'a2', i: 'http://kodi-api.sosac.to/obrazky/defaultniep.jpg' },
          '1': { _id: 11, n: { cs: 'Odcinek 1' }, l: 'a1', i: 'http://kodi-api.sosac.to/obrazky/700s/11.jpg', w: 50, dl: 100 },
        },
      },
      'Trýzeň',
    );
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2]);
    const [e1, e2] = d.seasons[0]!.episodes;
    expect(e1!.episodeTitle).toBe('Odcinek 1');
    expect(e1!.serialTitle).toBe('Trýzeň');
    expect(e1!.serialId).toBe(6608);
    expect(e1!.season).toBe(1);
    expect(e1!.episode).toBe(1);
    expect(e1!.thumbnail).toBe('https://kodi-api.sosac.to/obrazky/700s/11.jpg');
    expect(e2!.thumbnail).toBeUndefined(); // placeholder se zahodí
  });

  it('pomocné funkce', () => {
    expect(parseCzDate('2.10.2026')).toBe('2026-10-02');
    expect(parseCzDate('nesmysl')).toBeUndefined();
    expect(parseLanguage('en+cztit')).toEqual({ audio: 'en', subtitles: 'cz', raw: 'en+cztit' });
    expect(secureUrl(['http://x.cz/a.jpg'])).toBe('https://x.cz/a.jpg');
    expect(secureUrl('http://kodi-api.sosac.to/obrazky/defaultnis.jpg')).toBeUndefined();
  });
});

describe('streamuj', () => {
  it('parsuje odpověď get-video-links včetně titulků a hlášky', () => {
    const o = parseStreamOptions({
      version: '1.0',
      action: 'get-video-links',
      timestamp: 1,
      result: 1,
      URL: {
        CZ: { SD: 'https://www.streamuj.tv/video/x?streamuj=original', HD: 'https://www.streamuj.tv/video/x?streamuj=hd' },
        EN: { FHD: 'https://e/fhd', subtitles: { 'CZ titulky': 'https://e/sub.srt' } },
      },
      errormessage: 'Přehraje se pouze část videa.',
    });
    expect(o.variants.map((v) => `${v.language}/${v.quality}/${v.height}`)).toEqual(['CZ/SD/480', 'CZ/HD/720', 'EN/FHD/1080']);
    expect(o.subtitles).toEqual([{ language: 'EN', label: 'CZ titulky', url: 'https://e/sub.srt' }]);
    expect(o.warning).toBe('Přehraje se pouze část videa.');
  });

  const v = (language: string, quality: string): StreamVariant => ({ language, quality, resolveUrl: `${language}-${quality}` });

  it('pickVariant: jazyk má přednost před kvalitou', () => {
    const variants = [v('EN', 'FHD'), v('CZ', 'SD'), v('CZ', 'HD')];
    expect(pickVariant(variants, { languages: ['CZ', 'EN'], quality: 'FHD' })?.resolveUrl).toBe('CZ-HD');
  });
  it('pickVariant: přesná kvalita, jinak nejbližší horší, pak lepší', () => {
    const variants = [v('CZ', 'SD'), v('CZ', 'HD'), v('CZ', 'UHD')];
    expect(pickVariant(variants, { languages: ['CZ'], quality: 'HD' })?.quality).toBe('HD');
    expect(pickVariant(variants, { languages: ['CZ'], quality: 'FHD' })?.quality).toBe('HD');
    expect(pickVariant([v('CZ', 'UHD')], { languages: ['CZ'], quality: 'SD' })?.quality).toBe('UHD');
  });
  it('pickVariant: fallback na jakýkoli jazyk', () => {
    expect(pickVariant([v('PL', 'HD')], { languages: ['CZ'], quality: 'HD' })?.language).toBe('PL');
    expect(pickVariant([], { languages: ['CZ'], quality: 'HD' })).toBeUndefined();
  });
});

describe('titulky', () => {
  it('SRT → VTT', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,500\r\nAhoj\r\n\r\n2\r\n00:01:00,100 --> 00:01:02,000\r\nSvěte\r\ndruhý řádek\r\n';
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nAhoj\n\n00:01:00.100 --> 00:01:02.000\nSvěte\ndruhý řádek\n');
  });
  it('VTT nechá být', () => {
    expect(srtToVtt('WEBVTT\n\n00:00.000 --> 00:01.000\nx')).toBe('WEBVTT\n\n00:00.000 --> 00:01.000\nx\n');
  });
  it('windows-1250 fallback', () => {
    // "Žluťoučký" ve windows-1250
    const bytes = new Uint8Array([0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd]);
    expect(decodeSubtitles(bytes.buffer)).toBe('Žluťoučký');
  });
});

describe('ostatní', () => {
  it('parseSettings odmítne podvrženou doménu', () => {
    const s = parseSettings({ domain: 'evil.com/x?', streaming_provider: 'www.streamuj.tv', current_topic: 'Christmas movies|Vánoční filmy' });
    expect(s.sosacDomain).toBe('kodi-api.sosac.to');
    expect(s.currentTopic).toEqual({ en: 'Christmas movies', cs: 'Vánoční filmy' });
  });
  it('normalizePosition: posledních 60 s = dokoukáno', () => {
    expect(normalizePosition(100.7, 1000)).toBe(100);
    expect(normalizePosition(950, 1000)).toBe(1000);
  });
  it('resumePosition', () => {
    const m = normalizeMovie({ ...RAW_MOVIE, w: 3000 });
    expect(resumePosition(m)).toBe(3000);
    expect(resumePosition(normalizeMovie({ ...RAW_MOVIE, w: 5 }))).toBe(0);
    expect(resumePosition(normalizeMovie({ ...RAW_MOVIE, w: 9640 }))).toBe(0);
  });
  it('další a pokračovací epizoda přes hranici série', () => {
    const d = normalizeSerialDetail(1, {
      '1': { '1': { _id: 1, w: 100, dl: 100 }, '2': { _id: 2, w: 10, dl: 100 } },
      '2': { '1': { _id: 3 } },
    });
    expect(findNextEpisode(d, { season: 1, episode: 2 })?.id).toBe(3);
    expect(findNextEpisode(d, { season: 2, episode: 1 })).toBeUndefined();
    expect(findContinueEpisode(d)?.id).toBe(2);
  });
  it('redact skryje přihlašovací údaje', () => {
    expect(redact('https://x/a?username=bob&password=abc&q=1')).toBe('https://x/a?username=***&password=***&q=1');
  });
});
