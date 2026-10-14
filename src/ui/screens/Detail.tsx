import { useEffect, useMemo, useState } from 'react';
import { ArrowCounterClockwiseIcon, CaretLeftIcon, CheckIcon, PlayIcon, PlusIcon } from '@phosphor-icons/react';
import { useMovie, useQueueIds, useSerial, useServices, useToggleQueue } from '../../app';
import { formatEpisodeCode } from '../../api';
import type { Episode, MediaItem, Movie, Serial } from '../../api';
import { useStage } from '../components/Backdrop';
import { Button, Chip } from '../components/Buttons';
import { Card, FadeImg } from '../components/Card';
import { FocusGroup } from '../components/focus';
import { LanguageTags, MetaLine } from '../components/Meta';
import { useChrome, useInitialFocus } from '../chrome';
import { formatDuration, remainingLabel } from '../format';
import { play, playFromStart, recallItem } from '../itemStore';
import { goBack } from '../router';
import { useIsPhone } from '../useIsPhone';

function useDetailChrome() {
  const { setTucked } = useChrome();
  useEffect(() => {
    setTucked(true);
    return () => setTucked(false);
  }, [setTucked]);
}

function QueueButton({ item }: { item: Movie | Serial }) {
  const { isLoggedIn } = useServices();
  const queued = useQueueIds(item.kind).data?.has(item.id) ?? false;
  const toggle = useToggleQueue();
  if (!isLoggedIn) return null;
  return (
    <Button
      focusKey="detail-queue"
      label={queued ? 'V seznamu' : 'Chci vidět'}
      icon={queued ? <CheckIcon weight="bold" /> : <PlusIcon weight="bold" />}
      onPress={() => toggle.mutate({ item, queued: !queued })}
    />
  );
}

function Credits({ item }: { item: Movie | Serial }) {
  const rows: Array<[string, string[]]> = [
    ['Režie', item.directors],
    ['Scénář', item.writers],
    ['Hrají', item.cast],
    ['Země', item.countries],
  ];
  const visible = rows.filter(([, v]) => v.length);
  if (!visible.length) return null;
  return (
    <dl className="credits">
      {visible.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v.slice(0, 6).join(', ')}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Telefon: obrázek je součástí stránky (scrolluje s ní) a vlevo nahoře je Zpět. */
function PhoneMedia({ src }: { src?: string }) {
  return (
    <>
      <button type="button" className="mback" aria-label="Zpět" onClick={goBack}>
        <CaretLeftIcon weight="bold" />
      </button>
      <div className="phero__media detail__media">
        <FadeImg src={src} />
        <div className="phero__shade" />
      </div>
    </>
  );
}

/** Telefon: epizody jako svislý seznam (náhled vlevo, název a délka vpravo). */
function EpisodeList({ episodes, onPlay }: { episodes: Episode[]; onPlay: (ep: Episode) => void }) {
  return (
    <ol className="eplist">
      {episodes.map((ep) => {
        const progress = ep.watch.finished ? 1 : ep.watch.progress;
        return (
          <li key={ep.id}>
            <button type="button" className="eplist__item" onClick={() => onPlay(ep)}>
              <span className="eplist__thumb">
                <FadeImg src={ep.thumbnail} />
                <span className="eplist__play">
                  <PlayIcon weight="fill" />
                </span>
                {progress > 0.01 && (
                  <span className="card__progress">
                    <i style={{ width: `${progress * 100}%` }} />
                  </span>
                )}
              </span>
              <span className="eplist__text">
                <b>
                  {ep.episode}. {ep.episodeTitle}
                </b>
                <span>
                  {formatDuration(ep.duration) ?? ''}
                  {ep.watch.finished ? ' · zhlédnuto' : ''}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ============================ Film ============================ */

export function MovieDetail({ id }: { id: number }) {
  const initial = recallItem('movie', id);
  const { data: movie, error } = useMovie(id, initial);
  const phone = useIsPhone();
  useStage(phone ? undefined : movie?.backdrop ?? movie?.poster, 'full');
  useDetailChrome();
  useInitialFocus(['detail-play'], [id, !!movie]);

  if (!movie) return <div className="center">{error ? <p className="error">{(error as Error).message}</p> : <div className="spinner" />}</div>;

  const resume = movie.watch.position && !movie.watch.finished && movie.watch.position > 10;
  return (
    <div className="screen no-scrollbar detail">
      {phone && <PhoneMedia src={movie.backdrop ?? movie.poster} />}
      <FocusGroup className="detail__head" focusKey="detail-head">
        <span className="eyebrow">Film</span>
        <h1 className="display">{movie.title}</h1>
        {movie.originalTitle && <span className="meta">{movie.originalTitle}</span>}
        <MetaLine item={movie} showKind={false} />
        <LanguageTags item={movie} />
        {movie.description && <p className="lede" style={{ WebkitLineClamp: 5 }}>{movie.description}</p>}
        <div className="detail__actions">
          <Button
            variant="primary"
            focusKey="detail-play"
            label={resume ? `Pokračovat · ${remainingLabel(movie) ?? ''}`.replace(/ · $/, '') : 'Přehrát'}
            icon={<PlayIcon weight="fill" />}
            progress={resume ? movie.watch.progress : undefined}
            onPress={() => play(movie)}
          />
          {resume ? <Button label="Od začátku" icon={<ArrowCounterClockwiseIcon weight="bold" />} onPress={() => playFromStart(movie)} /> : null}
          <QueueButton item={movie} />
        </div>
        <Credits item={movie} />
      </FocusGroup>
    </div>
  );
}

/* ============================ Seriál ============================ */

export function SerialDetail({ id }: { id: number }) {
  const initial = recallItem('serial', id);
  const s = useSerial(id, initial);
  const serial = s.serial;
  const [season, setSeason] = useState<number>();
  const phone = useIsPhone();
  useStage(phone ? undefined : serial?.backdrop ?? serial?.poster, 'full');
  useDetailChrome();
  useInitialFocus(['detail-play'], [id, !!s.continueEpisode]);

  const activeSeason = season ?? s.continueEpisode?.season ?? s.seasons[0]?.number;
  const episodes = useMemo(() => s.seasons.find((x) => x.number === activeSeason)?.episodes ?? [], [s.seasons, activeSeason]);

  if (!serial) return <div className="center">{s.error ? <p className="error">{(s.error as Error).message}</p> : <div className="spinner" />}</div>;

  const next = s.continueEpisode;
  const started = next && ((next.watch.position ?? 0) > 0 || next.episode > 1 || next.season > (s.seasons[0]?.number ?? 1));
  const playEpisode = (item: MediaItem) => play({ ...(item as Episode), serialTitle: serial.title, serialId: serial.id });

  return (
    <div className="screen no-scrollbar detail">
      {phone && <PhoneMedia src={serial.backdrop ?? serial.poster} />}
      <FocusGroup className="detail__head" focusKey="detail-head">
        <span className="eyebrow">Seriál</span>
        <h1 className="display">{serial.title}</h1>
        {serial.originalTitle && <span className="meta">{serial.originalTitle}</span>}
        <MetaLine item={{ ...serial, seasonCount: serial.seasonCount ?? (s.seasons.length || undefined) }} showKind />
        <LanguageTags item={serial} />
        {serial.description && <p className="lede" style={{ WebkitLineClamp: 4 }}>{serial.description}</p>}
        <div className="detail__actions">
          {next ? (
            <Button
              variant="primary"
              focusKey="detail-play"
              label={`${started ? 'Pokračovat' : 'Přehrát'} ${formatEpisodeCode(next.season, next.episode)}`}
              icon={<PlayIcon weight="fill" />}
              progress={next.watch.progress || undefined}
              onPress={() => playEpisode(next)}
            />
          ) : (
            <Button variant="primary" focusKey="detail-play" label="Načítám epizody…" onPress={() => {}} disabled={s.isLoading} />
          )}
          <QueueButton item={serial} />
        </div>
        {next && (
          <p className="note" style={{ margin: 0 }}>
            {formatEpisodeCode(next.season, next.episode)} · {next.episodeTitle}
            {next.duration ? ` · ${formatDuration(next.duration)}` : ''}
          </p>
        )}
      </FocusGroup>

      {s.seasons.length > 1 && (
        <FocusGroup className="seasons no-scrollbar" focusKey="seasons">
          {s.seasons.map((x) => (
            <Chip key={x.number} focusKey={`season-${x.number}`} label={`${x.number}. série`} selected={x.number === activeSeason} onPress={() => setSeason(x.number)} />
          ))}
        </FocusGroup>
      )}

      {phone ? (
        <EpisodeList episodes={episodes} onPlay={playEpisode} />
      ) : (
      <FocusGroup className="row" focusKey={`episodes-${activeSeason}`} onFocusIn={(el) => el.scrollIntoView({ behavior: 'smooth', block: 'end' })}>
          <div className="row__track no-scrollbar">
            {episodes.map((ep) => (
              <Card key={ep.id} item={ep} layout="wide" inSerial onPress={playEpisode} />
            ))}
          </div>
        </FocusGroup>
      )}
    </div>
  );
}
