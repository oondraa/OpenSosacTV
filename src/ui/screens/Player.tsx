import { CaretLeftIcon, SkipForwardIcon } from '@phosphor-icons/react';
import { useEpisode, useMovie, useRemoteKeys, useSerial, useServices } from '../../app';
import { findNextEpisode, formatEpisodeCode } from '../../api';
import type { PlayableItem } from '../../api';
import { Button } from '../components/Buttons';
import { FocusGroup } from '../components/focus';
import { play, recallItem } from '../itemStore';
import { goBack } from '../router';
import { useInitialFocus } from '../chrome';

interface Props {
  kind: 'movie' | 'episode';
  id: number;
  serialId?: number;
}

/**
 * Oficiální vložený přehrávač Streamuj, stejně jako web sosac.tv. Ten si vezme
 * přihlášení na streamuj.tv, které má prohlížeč uložené, takže stačí účet Sosáč.
 */
export function Player(props: Props) {
  return <EmbedPlayer {...props} />;
}

function usePlayerItem({ kind, id, serialId }: Props) {
  const movie = useMovie(kind === 'movie' ? id : undefined, kind === 'movie' ? recallItem('movie', id) : undefined);
  const episode = useEpisode(kind === 'episode' ? id : undefined, kind === 'episode' ? recallItem('episode', id) : undefined);
  const item: PlayableItem | undefined = kind === 'movie' ? movie.data : episode.data;
  const sid = serialId ?? (item?.kind === 'episode' ? item.serialId : undefined);
  const serial = useSerial(sid, sid ? recallItem('serial', sid) : undefined);
  const title = item?.kind === 'episode' ? item.serialTitle ?? serial.serial?.title ?? item.title : item?.title;
  const subtitle = item?.kind === 'episode' ? `${formatEpisodeCode(item.season, item.episode)} · ${item.episodeTitle}` : item?.year ? String(item.year) : undefined;
  return { item, serial, title, subtitle, error: (kind === 'movie' ? movie.error : episode.error) as Error | null };
}

function EmbedPlayer(props: Props) {
  const { settings } = useServices();
  const { item, serial, title, subtitle, error } = usePlayerItem(props);
  const next = item?.kind === 'episode' && serial.detail ? findNextEpisode(serial.detail, item) : undefined;

  useInitialFocus(['embed-back'], [item?.id]);
  useRemoteKeys((key) => {
    if (key === 'back') {
      goBack();
      return true;
    }
  });

  const src = item?.streamId
    ? `https://${settings.streamingProvider}/video/${encodeURIComponent(item.streamId)}?remote=1&affid=0&width=${window.innerWidth}&height=${Math.max(320, window.innerHeight - 96)}`
    : undefined;

  return (
    <div className="player player--embed">
      <FocusGroup className="embed__bar" focusKey="embed-bar">
        <Button focusKey="embed-back" ariaLabel="Zpět" icon={<CaretLeftIcon weight="bold" />} onPress={goBack} />
        <div className="player__title">
          <b>{title}</b>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <span className="player__spacer" />
        <span className="note embed__hint">Přehrávač Streamuj · celé filmy, když jsi v prohlížeči přihlášený na streamuj.tv</span>
        {next && (
          <Button
            label="Další díl"
            icon={<SkipForwardIcon weight="fill" />}
            onPress={() => play({ ...next, serialId: next.serialId ?? serial.serial?.id, serialTitle: next.serialTitle ?? serial.serial?.title }, { replace: true })}
          />
        )}
      </FocusGroup>
      {src ? (
        <iframe
          key={src}
          className="embed__frame"
          src={src}
          title={title ?? 'Přehrávač'}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="player__center">{error ? <p className="lede">{error.message}</p> : item ? <p className="lede">Titul nemá přiřazený stream.</p> : <div className="spinner" />}</div>
      )}
    </div>
  );
}
