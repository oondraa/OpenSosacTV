export type ApiErrorKind = 'network' | 'timeout' | 'unauthorized' | 'http' | 'parse';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Tělo posílané jako "simple request" (bez CORS preflightu). */
  body?: string | URLSearchParams;
  contentType?: 'text/plain' | 'application/x-www-form-urlencoded';
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Tenký wrapper nad fetch.
 *
 * Záměrně neposílá vlastní hlavičky: všechno musí zůstat "simple request".
 * Sosáč API na preflight OPTIONS vrací 404, takže `Content-Type: application/json`
 * nebo vlastní hlavička by v prohlížeči selhala.
 */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, contentType, timeoutMs = 20_000, signal } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onOuterAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  const headers: Record<string, string> = {};
  if (body !== undefined && contentType) headers['Content-Type'] = contentType;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      body,
      headers,
      signal: controller.signal,
      // Zápisy (pozice přehrávání) musí doběhnout i při zavření stránky.
      keepalive: method === 'POST',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new ApiError('timeout', `Vypršel čas požadavku (${timeoutMs} ms)`);
    }
    if (signal?.aborted) throw err;
    throw new ApiError('network', `Síťová chyba: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (res.status === 401) {
    throw new ApiError('unauthorized', 'Neplatné přihlašovací údaje k Sosáči', 401);
  }
  if (!res.ok) {
    throw new ApiError('http', `HTTP ${res.status} pro ${redact(url)}`, res.status);
  }
  return res;
}

export async function requestJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  const res = await request(url, opts);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError('parse', `Neplatný JSON z ${redact(url)}: ${text.slice(0, 120)}`);
  }
}

export async function requestText(url: string, opts?: RequestOptions): Promise<string> {
  const res = await request(url, opts);
  return (await res.text()).trim();
}

/** Skryje hesla a hashe v URL, aby nepadaly do logů a chybových hlášek. */
export function redact(url: string): string {
  return url.replace(/(password|pass|login|username)=[^&]*/gi, '$1=***');
}

export function buildUrl(base: string, path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}
