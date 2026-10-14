<p align="center"><img src="public/icon.svg" width="96" alt="OpenSosacTV"></p>

# OpenSosacTV

**Aplikace:** https://oondraa.github.io/OpenSosacTV/ (na telefonu: Sdílet → Přidat na plochu)

PWA klient pro [Sosáč](https://tv.sosac.tv) a [Streamuj.tv](https://www.streamuj.tv) ve stylu Apple TV.
Nehostuje žádný obsah ani backend: běží celý v prohlížeči a volá stejné API jako
[Kodi plugin](https://github.com/kodi-czsk/plugin.video.sosac.unofficial). Potřebuješ vlastní účet
na Sosáči a Streamuj (VIP pro celé filmy).

## Proč bez backendu

Streamuj váže odkaz na video na IP adresu, která si ho vyžádala. Kdyby odkazy získával server, video by
na tvém zařízení nešlo přehrát. Obě API posílají `Access-Control-Allow-Origin: *`, takže celý řetězec
(katalog → odkaz → MP4) běží v prohlížeči na tvé IP. GitHub Pages doručí jen statické soubory.

## Struktura

```
src/
  api/                 čistý TypeScript bez Reactu, použitelný i jinde
    config.ts          konstanty, seznamy, sůl hesla
    http.ts            fetch wrapper (jen "simple requests", Sosáč neumí CORS preflight)
    discovery.ts       aktuální domény přes /settings
    raw.ts             surové typy API (jednopísmenné klíče)
    models.ts          normalizovaný model pro UI
    normalize.ts       raw → model
    sosac.ts           katalog: seznamy, hledání, detaily, fronta, ukládání pozice
    streamuj.ts        účet, odkazy na stream, výběr jazyka a kvality
    playback.ts        položka → URL videa + titulky + resume, další epizoda
    progress.ts        průběžné ukládání pozice přehrávání
    subtitles.ts       SRT → WebVTT, windows-1250
    session.ts         přihlášení, uložené účty (jen hashe) a preference
  app/                 React vrstva pro UI
    ServicesProvider   discovery, session, klienti, React Query
    hooks/catalog.ts   useHomeRowDefs, useHomeRow, useMovie, useSerial, useSearch, useToggleQueue…
    hooks/player.ts    usePlaybackSource, useVideoPlayer (napojení <video>)
    hooks/remote.ts    useRemoteKeys: šipky, OK, Zpět, media klávesy (Tizen, webOS, Android TV)
  ui/                  UI ve stylu Apple TV × Netflix
    styles/app.css     vizuální systém (barvy, typografie, fokus, sklo, pohyb)
    components/        Pressable/FocusGroup (ovladač + myš), karty, řady, pozadí, lišta
    screens/           Home, Filmy/Seriály, Můj seznam, Hledání, Detail, Přehrávač, Profil
    router.ts          hash router (funguje na GitHub Pages i TV)
  dev/
    diagnostics.ts     test s reálným účtem (diagnostics.html)
tests/                 vitest
```

## Vývoj

```bash
npm install
npm run dev          # http://localhost:5173, diagnostika na /diagnostics.html
npm test
npm run build
```

## Použití v UI

```tsx
const rows = useHomeRowDefs();                 // řady na home podle přihlášení
const row = useHomeRow(rows[0]);               // flattenPages(row.data), row.fetchNextPage()
const serial = useSerial(id, serialZeSeznamu); // serial.seasons, serial.continueEpisode
const source = usePlaybackSource(item);        // stream připravený k přehrání
const player = useVideoPlayer(videoRef, source.data, { serialDetail, onPlayNext });
// player.state, player.controls, player.variants, player.subtitleUrl, player.warning, player.showNextEpisode
```

## Ověřený stav (14. 10. 2026)

- Katalog i Streamuj API fungují z prohlížeče přes CORS, i z GitHub Pages.
- Finální stream je HTTPS progresivní MP4 s range requesty. Stačí nativní `<video>`, seek i přepnutí
  kvality se zachováním pozice fungují.
- S reálným účtem (diagnostics.html): přihlášení k Sosáči, ukládání pozice (`text/plain` JSON tělo),
  fronta a titulky (SRT v UTF-8) fungují. Form a query varianta zápisu vrací 422.
- Bez účtu Streamuj nebo bez VIP se přehraje jen ukázka (~25 MB), UI na to upozorní.

## Přihlášení

Sosáč (katalog, fronta, rozkoukané) a Streamuj.tv (hosting videí, VIP) jsou dvě služby. Aplikace zkusí
stejné jméno a heslo na obou. Když Streamuj neprojde, jde pokračovat jen se Sosáčem a Streamuj připojit
později v profilu.

## Licence

GPL-2.0. Endpointy, hashování hesla a logika výběru streamu vychází z
[plugin.video.sosac.unofficial](https://github.com/kodi-czsk/plugin.video.sosac.unofficial) (L. Zoubek, GPL-2.0).
Projekt není nijak spojen se Sosáčem ani se Streamuj.tv.
