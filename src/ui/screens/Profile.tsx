import { useState } from 'react';
import { ArrowRightIcon, CaretRightIcon, SignOutIcon } from '@phosphor-icons/react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useProfiles, useServices } from '../../app';
import { useStage } from '../components/Backdrop';
import { Button, Chip } from '../components/Buttons';
import { FocusGroup, Pressable } from '../components/focus';
import { FocusInput } from '../components/FocusInput';
import { Logo } from '../components/Logo';
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
  const [form, setForm] = useState({ su: '', sp: '' });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useInitialFocus(['login-su']);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (busy) return;
    if (!form.su || !form.sp) {
      setError('Vyplň jméno a heslo.');
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await login({ sosacUsername: form.su, sosacPassword: form.sp });
      storage.set(ONBOARDED_KEY, true);
      navigate({ name: 'home' }, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      void setFocus('login-su');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="login bezel">
        <div className="bezel__core">
          <Logo size={40} className="login__logo" />
          <h1 className="display display--md" style={{ marginTop: '1.5rem' }}>
            Filmy a seriály ze Sosáče. Konečně v pořádném kabátě.
          </h1>
          <FocusGroup focusKey="login-form" style={{ margin: '2rem 0 0.5rem', maxWidth: '26rem' }}>
            <div className="group-title">
              Účet Sosáč <small>stejné údaje jako na webu</small>
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
                onSubmit={() => void submit()}
              />
            </div>
          </FocusGroup>
          <p className="error" role="alert">{error}</p>
          <FocusGroup className="detail__actions" focusKey="login-actions">
            <Button variant="primary" focusKey="login-submit" label={busy ? 'Ověřuji…' : 'Přihlásit'} icon={<ArrowRightIcon weight="bold" />} onPress={() => void submit()} disabled={busy} />
            <Button
              label="Bez účtu"
              onPress={() => {
                storage.set(ONBOARDED_KEY, true);
                navigate({ name: 'home' }, { replace: true });
              }}
            />
          </FocusGroup>
          <p className="note" style={{ marginTop: '1.5rem' }}>
            Filmy hraje přehrávač Streamuj, stejně jako na sosac.tv. Celé filmy pustí, když jsi v prohlížeči přihlášený na
            streamuj.tv. Heslo se neukládá, v zařízení zůstává jen jeho otisk a jde jen na Sosáč.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================ Nastavení ============================ */

function Settings() {
  const { session, logout, settings } = useServices();
  const { active } = useProfiles();
  useInitialFocus([`profile-${active.id}`]);

  return (
    <div className="center">
      <div className="settings">
        <div style={{ display: 'grid', gap: '1rem' }}>
          <span className="eyebrow">Profil</span>
          <h1 className="display display--md">{active.name}</h1>
          <div className="meta">
            <span>Účet Sosáč: {session.sosac?.username}</span>
          </div>
        </div>

        <Profiles />

        <div className="bezel">
          <FocusGroup className="bezel__core" focusKey="settings-list" style={{ padding: '0.75rem', display: 'grid', gap: '0.25rem' }}>
            <SettingRow label="Diagnostika připojení" value="Otevřít" onPress={() => window.open(`${import.meta.env.BASE_URL}diagnostics.html`, '_blank')} />
          </FocusGroup>
        </div>

        <FocusGroup className="detail__actions" focusKey="settings-actions">
          <Button label="Odhlásit" icon={<SignOutIcon weight="bold" />} onPress={logout} />
        </FocusGroup>
        <p className="note">
          API {settings.sosacDomain} · stream {settings.streamingProvider}. OpenSosacTV je neoficiální klient, nijak nespojený se Sosáčem ani Streamuj.tv.
        </p>
      </div>
    </div>
  );
}

/**
 * Profily bez hesel v rámci jednoho účtu. Každý má vlastní "Chci vidět",
 * rozkoukané a dokoukané jsou společné (Sosáč je vede jen na účet).
 */
function Profiles() {
  const { profiles, active, switchTo, add, rename, remove } = useProfiles();
  /** Otevřený formulář: nový profil, nebo přejmenování aktivního. */
  const [editing, setEditing] = useState<'add' | 'rename'>();
  const [name, setName] = useState('');

  function open(mode: 'add' | 'rename') {
    setEditing(mode);
    setName(mode === 'rename' ? active.name : '');
    setTimeout(() => void setFocus('profile-name'), 50);
  }

  function submit() {
    const n = name.trim();
    if (!n) return;
    if (editing === 'add') add(n);
    else rename(active.id, n);
    setEditing(undefined);
    setTimeout(() => void setFocus('profile-chips'), 50);
  }

  return (
    <div className="bezel">
      <FocusGroup className="bezel__core" focusKey="profiles" style={{ padding: '1.75rem', display: 'grid', gap: '1rem' }}>
        <div className="group-title" style={{ margin: 0 }}>
          Kdo se dívá <small>každý profil má vlastní Chci vidět</small>
        </div>
        <FocusGroup className="seasons no-scrollbar" focusKey="profile-chips" style={{ margin: 0, padding: 0 }}>
          {profiles.map((p) => (
            <Chip key={p.id} focusKey={`profile-${p.id}`} label={p.name} selected={p.id === active.id} onPress={() => switchTo(p.id)} />
          ))}
          <Chip focusKey="profile-add" label="+ Přidat profil" onPress={() => open('add')} />
        </FocusGroup>
        {editing ? (
          <>
            <FocusInput
              focusKey="profile-name"
              placeholder={editing === 'add' ? 'Jméno nového profilu' : 'Nové jméno'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              onSubmit={submit}
            />
            <div className="detail__actions" style={{ marginTop: 0 }}>
              <Button variant="primary" label={editing === 'add' ? 'Přidat' : 'Uložit'} icon={<ArrowRightIcon weight="bold" />} onPress={submit} disabled={!name.trim()} />
              <Button label="Zrušit" onPress={() => setEditing(undefined)} />
            </div>
          </>
        ) : (
          <div className="detail__actions" style={{ marginTop: 0 }}>
            <Button label="Přejmenovat" onPress={() => open('rename')} />
            {profiles.length > 1 && <Button label={`Smazat profil ${active.name}`} onPress={() => remove(active.id)} />}
          </div>
        )}
        <p className="note" style={{ margin: 0 }}>
          Profily nemají hesla a žijí jen v tomto zařízení. Rozkoukané a dokoukané vede Sosáč na celý účet, takže jsou
          společné. Co přidáš na webu sosac.tv, uvidí všichni jako společné.
        </p>
      </FocusGroup>
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
