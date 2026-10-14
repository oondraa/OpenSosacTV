/**
 * Surové typy odpovědí Sosáč katalogu (kodi-api.sosac.to).
 *
 * API používá jednopísmenné klíče. Význam je odvozený z Kodi pluginu
 * a z reálných odpovědí (ověřeno 14. 10. 2026).
 */

/** Název: `{cs: ["Avatar"]}` u filmů, `{cs: "Trýzeň"}` u seriálů/epizod. Klíče jsou kódy zemí/jazyků (cs, en, us, sk, pl…). */
export type RawNames = Record<string, string | string[]>;

export interface RawItemBase {
  /** ID položky (film, seriál nebo epizoda). */
  _id: number;
  /** Kvalita: hd, sd, fhd, uhd, kinorip, tvrip. */
  q?: string;
  /** Plakát (http URL). */
  i?: string | string[];
  /** Fanart / pozadí (http URL). */
  b?: string | string[];
  n?: RawNames;
  /** Audio stopy / titulky: "cz", "sk", "en", "en+cztit"… */
  d?: string[];
  /** Rok jako string. */
  y?: string;
  /** Hodnocení CSFD v %. */
  c?: number;
  /** Počet hodnocení CSFD. */
  cp?: number;
  /** Hodnocení IMDb ×10. */
  m?: number;
  /** Počet hodnocení IMDb. */
  mp?: number;
  /** Přístupnost (věk). 99 = neznámá. */
  a?: number;
  /** Země (lokalizované názvy). */
  o?: string[];
  /** Země (ISO kódy). */
  oi?: string[];
  /** Režiséři (u filmů a seriálů). U epizod je `s` číslo série! */
  s?: string[] | number;
  /** Herci. */
  f?: string[];
  /** Scénáristé. */
  h?: string[];
  /** Žánry (lokalizované). */
  g?: string[];
  /** Popis. */
  p?: string;
  /** Link ID pro Streamuj. */
  l?: string;
  /** Délka v sekundách. */
  dl?: number;
  /** Audio formát: stereo, 5.1… */
  e?: string;
  /** Datum přidání / premiéry "d.m.yyyy". */
  r?: string;
  /** Zhlédnuto sekund (jen s přihlášením), jinak null. */
  w?: number | null;
  /** Rozpočet / tržby (u filmů), nepoužíváme. */
  t?: number;
  k?: number;
}

export interface RawMovie extends RawItemBase {
  s?: string[];
}

export interface RawSerial extends RawItemBase {
  s?: string[];
  /** Počet sérií. */
  z?: number;
  /** Počet epizod. */
  v?: number;
}

/**
 * Epizoda. V seznamech (`episodes/lists/*`, `episodes/<id>`) je `n` název
 * seriálu a `ne` název epizody. V detailu seriálu (`serials/<id>`) chybí `ne`
 * a `n` je název epizody.
 */
export interface RawEpisode extends RawItemBase {
  /** Název epizody (jen v seznamech). */
  ne?: RawNames;
  /** Náhled epizody. */
  ie?: string;
  /** ID seriálu (jen v seznamech). */
  id?: number;
  /** Číslo série. */
  s?: number;
  /** Číslo epizody. */
  ep?: number;
}

/** `serials/<id>` vrací `{ "<série>": { "<epizoda>": RawEpisode } }`. */
export type RawSerialDetail = Record<string, Record<string, RawEpisode>>;

export interface RawSettings {
  current_topic?: string;
  domain?: string;
  domain_label?: string;
  news?: string;
  streaming_provider?: string;
  streaming_provider_label?: string;
}

export interface RawApiError {
  code: number;
  message: string;
}

/* ---------- Streamuj.tv json_api_player.php ---------- */

export interface RawStreamujBase {
  version: string;
  action: string;
  timestamp: number;
  result: number;
  errormessage?: string | null | 0;
}

export interface RawStreamujCheckUser extends RawStreamujBase {
  UID: number | string;
  /** Konec VIP: unix čas, nebo text s datem. 0 = žádné. */
  expiration: number | string;
  cookie: number | string;
}

/** Hodnota je buď URL kroku 2, nebo u klíče `subtitles` mapa název → URL. */
export type RawStreamujLanguage = Record<string, string | Record<string, string>>;

export interface RawStreamujLinks extends RawStreamujBase {
  /** `URL.CZ.HD` → URL, `URL.CZ.subtitles` → {název: URL}. */
  URL?: Record<string, RawStreamujLanguage>;
}
