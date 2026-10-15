/**
 * Novinky pro obrazovku "Co je nového", nejnovější první. Při každém vydání,
 * které má uživatel vidět, přidat záznam nahoru (a zvednout verzi v package.json).
 */
export interface Release {
  version: string;
  /** ISO datum vydání. */
  date: string;
  items: Array<{ title: string; text: string }>;
}

export const CHANGELOG: Release[] = [
  {
    version: '0.2.0',
    date: '2026-10-15',
    items: [
      {
        title: 'Profily bez hesel',
        text: 'Jeden účet, víc lidí. Každý profil má vlastní Chci vidět a v Mém seznamu vidíš, co chtějí ostatní. Najdeš to v Profilu.',
      },
      {
        title: 'Stačí účet Sosáč',
        text: 'Přihlášení ke Streamuj zmizelo. Filmy hraje přehrávač Streamuj jako na sosac.tv, celé je pustí, když jsi na streamuj.tv přihlášený v prohlížeči.',
      },
    ],
  },
];

export const CURRENT_VERSION = CHANGELOG[0]!.version;
