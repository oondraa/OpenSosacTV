import type { MediaItem } from '../api';
import { navigate } from './router';

/**
 * Položky, které už UI zná ze seznamu. Detail a přehrávač je ukážou hned,
 * než doběhne request. Při přímém odkazu (refresh) tu nic není a data se
 * stáhnou normálně.
 */
const items = new Map<string, MediaItem>();

const key = (kind: MediaItem['kind'], id: number) => `${kind}:${id}`;

export function rememberItem(item: MediaItem): void {
  items.set(key(item.kind, item.id), item);
  if (items.size > 500) items.delete(items.keys().next().value!);
}

export function recallItem<K extends MediaItem['kind']>(kind: K, id: number): Extract<MediaItem, { kind: K }> | undefined {
  return items.get(key(kind, id)) as Extract<MediaItem, { kind: K }> | undefined;
}

export function openDetail(item: MediaItem): void {
  rememberItem(item);
  if (item.kind === 'episode') {
    if (item.serialId) navigate({ name: 'serial', id: item.serialId });
    else play(item);
    return;
  }
  navigate({ name: item.kind, id: item.id });
}

export function play(item: MediaItem, opts: { fromStart?: boolean; replace?: boolean } = {}): void {
  rememberItem(item);
  if (item.kind === 'serial') {
    navigate({ name: 'serial', id: item.id });
    return;
  }
  restartKey = opts.fromStart ? key(item.kind, item.id) : undefined;
  navigate(
    { name: 'play', kind: item.kind, id: item.id, serialId: item.kind === 'episode' ? item.serialId : undefined },
    { replace: opts.replace },
  );
}

/** "Od začátku": přehrávač ignoruje uloženou pozici. Platí do dalšího spuštění. */
let restartKey: string | undefined;

export function playFromStart(item: MediaItem): void {
  play(item, { fromStart: true });
}

export function isRestart(kind: MediaItem['kind'], id: number): boolean {
  return restartKey === key(kind, id);
}
