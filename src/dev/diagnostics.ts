/**
 * Diagnostika s reálným účtem. Ověřuje věci, které bez přihlášení nejdou:
 * VIP, plný stream, titulky, zápis pozice z prohlížeče, fronta.
 * Výstup je JSON bez hesel a hashů, určený k odeslání vývojáři.
 */
import { ApiError, SosacClient, StreamujClient, discoverSettings } from '../api';
import type { WriteMode } from '../api';
import { sosacPasswordHash, streamujPasswordHash } from '../api/hash';
import { decodeSubtitles } from '../api/subtitles';

type Status = 'ok' | 'fail' | 'warn' | 'run';

const stepsEl = document.getElementById('steps')!;
const reportEl = document.getElementById('report') as HTMLTextAreaElement;
const video = document.getElementById('video') as HTMLVideoElement;
const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  userAgent: navigator.userAgent,
  origin: location.origin,
};

function step(title: string) {
  const el = document.createElement('div');
  el.className = 'step run';
  el.textContent = `… ${title}`;
  stepsEl.appendChild(el);
  return (status: Status, detail = '') => {
    el.className = `step ${status}`;
    const icon = { ok: '✔', fail: '✘', warn: '!', run: '…' }[status];
    el.textContent = `${icon} ${title}${detail ? `\n   ${detail}` : ''}`;
  };
}

function render() {
  reportEl.value = JSON.stringify(report, null, 2);
}

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return `${e.kind}${e.status ? ` ${e.status}` : ''}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}

/** Finální URL obsahuje token vázaný na IP. Do reportu jen host a přípona. */
function describeVideoUrl(url: string) {
  try {
    const u = new URL(url);
    return { protocol: u.protocol, host: u.host, extension: u.pathname.split('.').pop(), pathSegments: u.pathname.split('/').length - 1 };
  } catch {
    return { invalid: url.slice(0, 40) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(form: HTMLFormElement) {
  stepsEl.innerHTML = '';
  const f = new FormData(form);
  const su = String(f.get('su')).trim();
  const tu = String(f.get('tu')).trim();
  const movieId = Number(f.get('movie')) || 156;
  const testWrites = f.get('writes') === 'on';

  /* 1. Discovery */
  let s = step('Discovery domén (/settings)');
  const settings = await discoverSettings({ force: true });
  report.settings = { sosacDomain: settings.sosacDomain, streamingProvider: settings.streamingProvider, currentTopic: settings.currentTopic };
  s(settings.fetchedAt ? 'ok' : 'warn', `${settings.sosacDomain} / ${settings.streamingProvider}`);

  const sosac = new SosacClient({ domain: settings.sosacDomain, credentials: { username: su, passwordHash: sosacPasswordHash(su, String(f.get('sp'))) } });
  const streamujCreds = { username: tu, passwordHash: streamujPasswordHash(String(f.get('tp'))) };

  /* 2. Login Sosáč */
  s = step('Přihlášení Sosáč (osobní seznam "queue")');
  try {
    await sosac.verifyCredentials();
    report.sosacLogin = 'ok';
    s('ok');
  } catch (e) {
    report.sosacLogin = errMsg(e);
    s('fail', errMsg(e));
    render();
    return;
  }

  /* 3. Streamuj účet */
  s = step('Účet Streamuj (check-user)');
  const streamuj = new StreamujClient({ provider: settings.streamingProvider, credentials: streamujCreds, location: 1 });
  try {
    const acc = await streamuj.checkUser();
    report.streamujAccount = { valid: acc.valid, vipUntil: acc.vipUntil?.toISOString() ?? null, message: acc.message ?? null };
    s(acc.valid ? (acc.vipUntil && acc.vipUntil > new Date() ? 'ok' : 'warn') : 'fail', acc.valid ? `VIP do: ${acc.vipUntil?.toLocaleString('cs') ?? 'bez VIP'}` : acc.message ?? 'neplatný účet');
  } catch (e) {
    report.streamujAccount = errMsg(e);
    s('fail', errMsg(e));
  }

  /* 4. Testovací film + odkazy */
  s = step(`Detail filmu ${movieId} a odkazy na stream (location 1)`);
  let movie;
  try {
    movie = await sosac.movie(movieId);
    const opts = await streamuj.getStreamOptions(movie.streamId!);
    report.streamOptions = {
      title: movie.title,
      variants: opts.variants.map((v) => `${v.language}/${v.quality}`),
      subtitles: opts.subtitles.map((t) => `${t.language}/${t.label}`),
      warning: opts.warning ?? null,
      resolveUrlHasPass: opts.variants.some((v) => /pass=/.test(v.resolveUrl)),
    };
    s(opts.warning ? 'warn' : 'ok', `${opts.variants.map((v) => `${v.language}/${v.quality}`).join(', ')}${opts.warning ? `\n   Streamuj: ${opts.warning}` : ''}`);

    /* 5. Finální URL */
    s = step('Rozbalení finální URL videa');
    const best = opts.variants.find((v) => v.quality === 'HD') ?? opts.variants[0]!;
    const url = await streamuj.resolveVideoUrl(best);
    report.finalUrl = describeVideoUrl(url);
    s(url.startsWith('https://') ? 'ok' : 'warn', JSON.stringify(report.finalUrl));

    /* 6. Přehrání v <video> */
    s = step('Přehrání v <video> (max 20 s)');
    report.videoPlayback = await testVideo(url);
    const vp = report.videoPlayback as { result: string };
    s(vp.result === 'playing' ? 'ok' : 'fail', JSON.stringify(report.videoPlayback));
  } catch (e) {
    report.stream = errMsg(e);
    s('fail', errMsg(e));
  }

  /* 7. Location 2 */
  s = step('Server location 2');
  try {
    const st2 = new StreamujClient({ provider: settings.streamingProvider, credentials: streamujCreds, location: 2 });
    const o2 = await st2.getStreamOptions(movie!.streamId!);
    const url2 = await st2.resolveVideoUrl(o2.variants[0]!);
    report.location2 = describeVideoUrl(url2);
    s('ok', JSON.stringify(report.location2));
  } catch (e) {
    report.location2 = errMsg(e);
    s('warn', errMsg(e));
  }

  /* 8. Titulky */
  s = step('Titulky (první epizoda z "news-with-subtitles")');
  try {
    const eps = await sosac.episodeList('news-with-subtitles', 1);
    let found = false;
    for (const ep of eps.items.slice(0, 8)) {
      if (!ep.streamId) continue;
      const o = await streamuj.getStreamOptions(ep.streamId);
      const sub = o.subtitles[0];
      if (!sub) continue;
      const res = await fetch(sub.url, { referrerPolicy: 'no-referrer' });
      const buf = await res.arrayBuffer();
      let utf8 = true;
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(buf);
      } catch {
        utf8 = false;
      }
      const text = decodeSubtitles(buf);
      report.subtitles = {
        cors: res.headers.get('access-control-allow-origin'),
        contentType: res.headers.get('content-type'),
        format: text.trimStart().startsWith('WEBVTT') ? 'vtt' : /-->/.test(text) ? (/\d,\d{3}\s*-->/.test(text) ? 'srt' : 'other-cues') : 'unknown',
        utf8,
        bytes: buf.byteLength,
        labels: o.subtitles.map((t) => `${t.language}/${t.label}`),
      };
      s('ok', JSON.stringify(report.subtitles));
      found = true;
      break;
    }
    if (!found) {
      report.subtitles = 'žádné titulky v prvních 8 epizodách';
      s('warn', String(report.subtitles));
    }
  } catch (e) {
    report.subtitles = errMsg(e);
    s('fail', `${errMsg(e)} (pravděpodobně CORS na titulcích)`);
  }

  /* 9. Zápis pozice */
  if (testWrites && movie) {
    s = step('Zápis pozice přehrávání: 3 způsoby bez CORS preflightu');
    const original = (await sosac.movie(movieId)).watch.position;
    const modes: WriteMode[] = ['json-as-text', 'form', 'query'];
    const results: Record<string, string> = {};
    let working: WriteMode | undefined;
    for (const [i, mode] of modes.entries()) {
      const marker = 1000 + (i + 1) * 7;
      try {
        await sosac.saveWatchingTime('movie', movieId, marker, mode);
        await sleep(800);
        const after = (await sosac.movie(movieId)).watch.position;
        results[mode] = after === marker ? 'works' : `sent-but-not-stored (w=${after})`;
        if (after === marker && !working) working = mode;
      } catch (e) {
        results[mode] = `error: ${errMsg(e)}`;
      }
    }
    // Vrátit původní stav.
    let restored = 'not-needed';
    if (working) {
      try {
        await sosac.saveWatchingTime('movie', movieId, original ?? 0, working);
        restored = `ok (w=${original ?? 0})`;
      } catch (e) {
        restored = errMsg(e);
      }
    }
    report.writeWatchingTime = { originalPosition: original, results, working: working ?? null, restored };
    s(working ? 'ok' : 'fail', `${JSON.stringify(results)}\n   funkční: ${working ?? 'žádný → bude potřeba malý Cloudflare Worker'}`);

    /* 10. Fronta */
    s = step('Fronta: přidat a odebrat');
    try {
      const before = await sosac.queueIds('movie');
      if (before.has(movieId)) {
        report.queue = 'film už ve frontě, test přeskočen';
        s('warn', String(report.queue));
      } else {
        await sosac.setQueued('movie', movieId, true);
        await sleep(800);
        const added = (await sosac.queueIds('movie')).has(movieId);
        await sosac.setQueued('movie', movieId, false);
        await sleep(800);
        const removed = !(await sosac.queueIds('movie')).has(movieId);
        report.queue = { added, removed };
        s(added && removed ? 'ok' : 'fail', JSON.stringify(report.queue));
      }
    } catch (e) {
      report.queue = errMsg(e);
      s('fail', errMsg(e));
    }
  }

  render();
}

function testVideo(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    video.hidden = false;
    video.muted = true;
    const started = performance.now();
    const done = (result: string) => {
      cleanup();
      resolve({
        result,
        msToStart: Math.round(performance.now() - started),
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration || 0),
        errorCode: video.error?.code ?? null,
      });
      video.pause();
    };
    const onPlaying = () => done('playing');
    const onError = () => done('error');
    const timer = setTimeout(() => done('timeout'), 20_000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    video.src = url;
    void video.play().catch(() => {
      /* error event to zachytí */
    });
  });
}

document.getElementById('form')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const btn = (e.currentTarget as HTMLFormElement).querySelector('button')!;
  btn.disabled = true;
  run(e.currentTarget as HTMLFormElement)
    .catch((err) => {
      report.fatal = errMsg(err);
      step('Neočekávaná chyba')('fail', errMsg(err));
    })
    .finally(() => {
      btn.disabled = false;
      render();
    });
});
