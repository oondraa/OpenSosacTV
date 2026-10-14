import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import './ui/styles/app.css';
import { ServicesProvider } from './app';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesProvider>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
