import { useEffect, useMemo, useState } from 'react';
import { getCurrentFocusKey, init as initSpatialNavigation, setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useRemoteKeys, useServices } from '../app';
import { storage } from '../lib/storage';
import { StageProvider } from './components/Backdrop';
import { NavBar } from './components/NavBar';
import { TabBar } from './components/TabBar';
import { useIsPhone } from './useIsPhone';
import { ChromeContext } from './chrome';
import { initInputModeTracking } from './input';
import { hideSplash } from './splash';
import { goBack, navigate, useRoute } from './router';
import { Browse } from './screens/Browse';
import { MovieDetail, SerialDetail } from './screens/Detail';
import { Home } from './screens/Home';
import { MyList } from './screens/MyList';
import { Player } from './screens/Player';
import { ONBOARDED_KEY, Profile } from './screens/Profile';
import { Search } from './screens/Search';

initInputModeTracking();

initSpatialNavigation({
  // DOM fokus kvůli klávesnici na TV u textových polí; scroll řídíme sami.
  shouldFocusDOMNode: true,
  domNodeFocusOptions: { preventScroll: true },
  // Držení šipky na ovladači: plynulý pohyb, ne 30 skoků za sekundu.
  throttle: 110,
  throttleKeypresses: true,
});

export function App() {
  return (
    <StageProvider>
      <Shell />
      <div className="grain" aria-hidden />
    </StageProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { ready, isLoggedIn } = useServices();
  const [tucked, setTucked] = useState(false);
  const phone = useIsPhone();
  const chrome = useMemo(() => ({ setTucked }), []);

  // První spuštění bez účtu: nabídnout přihlášení (jde i přeskočit).
  useEffect(() => {
    if (ready && !isLoggedIn && !storage.get(ONBOARDED_KEY) && route.name === 'home') {
      navigate({ name: 'profile' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Globální Zpět: z obsahu nejdřív na lištu, z lišty o obrazovku zpět.
  useRemoteKeys((key, e) => {
    if (key !== 'back' || e.defaultPrevented) return;
    const inNav = getCurrentFocusKey()?.startsWith('nav');
    const tabRoot = ['home', 'movies', 'serials', 'my', 'search', 'profile'].includes(route.name);
    if (tabRoot && !inNav) {
      setTucked(false);
      void setFocus('nav');
      return true;
    }
    if (route.name !== 'home') {
      goBack();
      return true;
    }
  }, route.name !== 'play');

  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  if (!ready) return null;

  const isPlayer = route.name === 'play';
  return (
    <ChromeContext.Provider value={chrome}>
      {!isPlayer && !phone && <NavBar route={route} tucked={tucked} />}
      {!isPlayer && phone && <TabBar route={route} />}
      <main key={route.name === 'play' ? 'play' : `${route.name}-${'id' in route ? route.id : ''}`}>
        {route.name === 'home' && <Home />}
        {route.name === 'movies' && <Browse kind="movie" />}
        {route.name === 'serials' && <Browse kind="serial" />}
        {route.name === 'my' && <MyList />}
        {route.name === 'search' && <Search />}
        {route.name === 'profile' && <Profile />}
        {route.name === 'movie' && <MovieDetail id={route.id} />}
        {route.name === 'serial' && <SerialDetail id={route.id} />}
        {route.name === 'play' && <Player kind={route.kind} id={route.id} serialId={route.serialId} />}
      </main>
    </ChromeContext.Provider>
  );
}
