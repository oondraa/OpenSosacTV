import { useState } from 'react';
import { ArrowRightIcon, CaretRightIcon, SignOutIcon } from '@phosphor-icons/react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useServices } from '../../app';
import { LoginError, STREAM_QUALITIES } from '../../api';
import type { StreamQuality, WriteMode } from '../../api';
import { useStage } from '../components/Backdrop';
import { Button } from '../components/Buttons';
import { FocusGroup, Pressable } from '../components/focus';
import { FocusInput } from '../components/FocusInput';
import { useInitialFocus } from '../chrome';
import { storage } from '../../lib/storage';
import { navigate } from '../router';

export const ONBOARDED_KEY = 'onboarded';

export function Profile() {
  const { isLoggedIn } = useServices();
  useStage(undefined, 'dim');
  return isLoggedIn ? <Settings /> : <Login />;
}

/* ============================ Login ============================ */

function Login() {
  const { login } = useServices();
  const [form, setForm] = useState({ su: '', sp: '', tu: '', tp: '' });
  // Většina lidí má na Sosáči i Streamuj stejné údaje, takže stačí jedna dvojice.
  const [separate, setSeparate] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string }>();
  const [busy, setBusy] = useState(false);
  useInitialFocus(['login-su']);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (busy) return;
    const tu = separate ? form.tu : form.su;
    const tp = separate ? form.tp : form.sp;
    if (!form.su || !form.sp || !tu || !tp) {
      setError({ message: 'Vyplň jméno a heslo.' });
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await login({ sosacUsername: form.su, sosacPassword: form.sp, streamujUsername: tu, streamujPassword: tp });
      storage.set(ONBOARDED_KEY, true);
      navigate({ name: 'home' }, { replace: true });
    } catch (e) {
      const field = e instanceof LoginError ? e.field : undefined;
      let message = (e as Error).message;
      // Sosáč prošel, Streamuj ne: nejspíš jiné údaje na Streamuj.
      if (field === 'streamuj' && !separate) {
        setSeparate(true);
        message = `${message} Na Streamuj máš asi jiné údaje, doplň je níž.`;
      }
      setError({ field, message });
      void setFocus(field === 'streamuj' ? 'login-tu' : 'login-su');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="login bezel">
        <div className="bezel__core">
          <span className="eyebrow">Přihlášení</span>
          <h1 className="display display--md" style={{ marginTop: '1.25rem' }}>
            Filmy a seriály ze Sosáče. Konečně v pořádném kabátě.
          </h1>
          <FocusGroup className={separate ? 'login__grid' : ''} focusKey="login-form" style={separate ? undefined : { margin: '2rem 0 0.5rem', maxWidth: '26rem' }}>
            <div>
              <div className="group-title">
                {separate ? 'Sosáč' : 'Účet Sosáč'} <small>{separate ? 'katalog, fronta, rozkoukané' : 'stejné údaje jako na webu'}</small>
              </div>
              <div className="field" style={{ gap: '0.75rem' }}>
                <FocusInput focusKey="login-su" placeholder="Uživatelské jméno" value={form.su} onChange={set('su')} autoComplete="username" />
                <FocusInput
                  focusKey="login-sp"
                  placeholder="Heslo"
                  type="password"
                  value={form.sp}
                  onChange={set('sp')}
                  autoComplete="current-password"
                  onSubmit={() => (separate ? void setFocus('login-tu') : void submit())}
                />
              </div>
            </div>
            {separate && (
              <div>
                <div className="group-title">
                  Streamuj.tv <small>přehrávání, VIP</small>
                </div>
                <div className="field" style={{ gap: '0.75rem' }}>
                  <FocusInput focusKey="login-tu" placeholder="Uživatelské jméno" value={form.tu} onChange={set('tu')} autoComplete="off" />
                  <FocusInput focusKey="login-tp" placeholder="Heslo" type="password" value={form.tp} onChange={set('tp')} autoComplete="off" onSubmit={() => void submit()} />
                </div>
              </div>
            )}
          </FocusGroup>
          <p className="error" role="alert">{error?.message}</p>
          <FocusGroup className="detail__actions" focusKey="login-actions">
            <Button variant="primary" focusKey="login-submit" label={busy ? 'Ověřuji…' : 'Přihlásit'} icon={<ArrowRightIcon weight="bold" />} onPress={() => void submit()} disabled={busy} />
            <Button
              label={separate ? 'Stejné údaje pro oba' : 'Jiný účet na Streamuj'}
              onPress={() => {
                setSeparate((v) => !v);
                setError(undefined);
              }}
            />
            <Button
              label="Bez účtu"
              onPress={() => {
                storage.set(ONBOARDED_KEY, true);
                navigate({ name: 'home' }, { replace: true });
              }}
            />
          </FocusGroup>
          <p className="note" style={{ marginTop: '1.5rem' }}>
            Video hostuje Streamuj.tv, proto se ověřuje i tam. Hesla se neukládají, v zařízení zůstávají jen jejich otisky a jdou
            jen na Sosáč a Streamuj.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================ Nastavení ============================ */

const LANGUAGE_PRESETS: Array<{ label: string; value: string[] }> = [
  { label: 'Čeština, pak slovenština', value: ['CZ', 'SK', 'EN'] },
  { label: 'Slovenština, pak čeština', value: ['SK', 'CZ', 'EN'] },
  { label: 'Původní znění (EN)', value: ['EN', 'CZ', 'SK'] },
];

const QUALITY_LABEL: Record<StreamQuality, string> = { UHD: '4K', FHD: 'Full HD', HD: 'HD', SD: 'SD (úspora dat)' };
const WRITE_MODES: WriteMode[] = ['json-as-text', 'form', 'query'];

function cycle<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

function Settings() {
  const { session, preferences, updatePreferences, logout, settings } = useServices();
  useInitialFocus(['set-quality']);

  const langIdx = Math.max(0, LANGUAGE_PRESETS.findIndex((p) => p.value.join() === preferences.stream.languages.join()));
  const vip = session.streamujAccount?.vipUntil ? new Date(session.streamujAccount.vipUntil) : undefined;
  const vipActive = vip && vip > new Date();

  return (
    <div className="center">
      <div className="settings">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <span className="eyebrow">Profil</span>
          <h1 className="display display--md">{session.sosac?.username}</h1>
          <div className="meta">
            <span className="tag" style={vipActive ? { background: 'rgba(48,209,88,0.18)' } : undefined}>
              {vipActive ? `VIP do ${vip!.toLocaleDateString('cs')}` : 'Bez VIP, přehraje se jen ukázka'}
            </span>
            <span>Streamuj: {session.streamuj?.username}</span>
          </div>
        </div>

        <div className="bezel">
          <FocusGroup className="bezel__core" focusKey="settings-list" style={{ padding: '0.75rem', display: 'grid', gap: '0.25rem' }}>
            <SettingRow
              focusKey="set-quality"
              label="Kvalita"
              value={QUALITY_LABEL[preferences.stream.quality]}
              onPress={() => updatePreferences({ stream: { ...preferences.stream, quality: cycle(STREAM_QUALITIES, preferences.stream.quality) } })}
            />
            <SettingRow
              label="Jazyk"
              value={LANGUAGE_PRESETS[langIdx]!.label}
              onPress={() => updatePreferences({ stream: { ...preferences.stream, languages: LANGUAGE_PRESETS[(langIdx + 1) % LANGUAGE_PRESETS.length]!.value } })}
            />
            <SettingRow
              label="Titulky u cizího zvuku"
              value={preferences.autoSubtitles ? 'Zapnout automaticky' : 'Vypnuté'}
              onPress={() => updatePreferences({ autoSubtitles: !preferences.autoSubtitles })}
            />
            <SettingRow label="Server Streamuj" value={`Lokace ${preferences.location}`} onPress={() => updatePreferences({ location: preferences.location === 1 ? 2 : 1 })} />
            <SettingRow label="Ukládání pozice" value={preferences.writeMode} onPress={() => updatePreferences({ writeMode: cycle(WRITE_MODES, preferences.writeMode) })} />
            <SettingRow label="Diagnostika připojení" value="Otevřít" onPress={() => window.open(`${import.meta.env.BASE_URL}diagnostics.html`, '_blank')} />
          </FocusGroup>
        </div>

        <FocusGroup className="detail__actions" focusKey="settings-actions">
          <Button label="Odhlásit" icon={<SignOutIcon weight="bold" />} onPress={logout} />
        </FocusGroup>
        <p className="note">
          API {settings.sosacDomain} · stream {settings.streamingProvider}. Neoficiální klient, nijak nespojený se Sosáčem ani Streamuj.tv.
        </p>
      </div>
    </div>
  );
}

function SettingRow({ label, value, onPress, focusKey }: { label: string; value: string; onPress: () => void; focusKey?: string }) {
  return (
    <Pressable className="setting" focusKey={focusKey} onPress={onPress}>
      <span>{label}</span>
      <span>
        {value}
        <CaretRightIcon weight="bold" />
      </span>
    </Pressable>
  );
}
