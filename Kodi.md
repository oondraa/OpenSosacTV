# Vlastní Kodi jen se Sosáčem

Plán, jestli jde vzít LibreELEC (Linux, který nabootuje rovnou do Kodi) a osekat ho tak, aby po zapnutí byl vidět jen OpenSosacTV.

## Krátká odpověď

**Ano, jde to.** LibreELEC je open source (GPL) a jeho build systém je na to stavěný: vlastní „distribuce“ s jiným jménem, logem, výchozím nastavením a předinstalovanými doplňky. Osekat Kodi tak, že uživatel uvidí jen Sosáč, se dá i bez zásahu do kódu Kodi: stačí vlastní skin a doplněk.

**Háček je přehrávání.** Kodi nemá prohlížeč, takže v něm nepojede vložený přehrávač Streamuj, který teď používá web i desktop. Kodi musí video přehrát samo, a k tomu potřebuje **účet Streamuj** (API `json_api_player`, stejně jako původní Kodi plugin). Bez VIP pustí Streamuj jen ukázku. Účet Streamuj, který jsme z webu vyhodili, by se tu musel vrátit.

## Varianty

| | Co to je | Práce | Výsledek |
|---|---|---|---|
| **A. Doplněk + skin na běžném LibreELEC** | Nainstaluju LibreELEC, k němu svůj doplněk a skin, nastavím autostart | týdny | Funguje, ale uživatel instaluje sám a v nastavení najde zbytek Kodi |
| **B. Vlastní distribuce (fork LibreELEC)** | Vlastní obraz `.img`: po zápisu na kartu nebo disk naběhne rovnou OpenSosacTV | A + 1–2 týdny | Hotové zařízení, žádné kroky navíc |
| **C. Kiosk bez Kodi** | Minimální Linux, který spustí prohlížeč na celou obrazovku s webem OpenSosacTV | dny až týdny | Znovu použije hotovou aplikaci i vložený přehrávač, bez účtu Streamuj |

**Doporučení:** začít variantou A, protože doplněk a skin jsou potřeba i pro B. Na B přejít, až A funguje. Variantu C zvážit, pokud je účet Streamuj problém: je to nejkratší cesta k „krabičce jen se Sosáčem“, jen to není Kodi.

## Varianta A: doplněk a skin

### 1. Doplněk `plugin.video.opensosactv` (Python)
- Základ je [plugin.video.sosac.unofficial](https://github.com/kodi-czsk/plugin.video.sosac.unofficial) (GPL-2.0). API už známe z `src/api/`, endpointy a hash hesla jsou stejné.
- Stejné funkce jako web:
  - řady na Domů,
  - filmy a seriály podle žánrů,
  - hledání,
  - detail se sériemi a epizodami,
  - Chci vidět, rozkoukané a dokoukané.
- Přehrávání přes Streamuj API:
  - přihlášení `check-user`,
  - výběr kvality a jazyka,
  - titulky.
  - Vrátit logiku z `src/api/streamuj.ts` a `playback.ts` (smazané v commitu „Profily bez hesel…“, jsou v historii gitu).
- Ukládání pozice na Sosáč (`watching-time`), aby fungovalo „Pokračovat“ mezi Kodi, webem a desktopem.
- **Profily:** Kodi má vlastní profily (každý se svými daty doplňků, jdou bez hesla). Buď použít je, nebo převzít logiku štítků z `desktop/src/profiles.rs`. Štítky jsou jen lokální, stejně jako na webu.

### 2. Skin `skin.opensosactv`
- Fork Estuary (výchozí skin Kodi), protože je udržovaný a umí ovladač i myš.
- Domů: místo menu Filmy / Hudba / TV jen řady z doplňku. Kodi umí „widgety“, což jsou seznamy z `plugin://` adres.
- Barvy, písmo a logo podle OpenSosacTV (tmavé pozadí, oranžový přechod).
- Schovat Nastavení, Doplňky a Soubory, nebo je dát za dlouhý stisk.

### 3. Nastavení „kiosku“
- `guisettings.xml`: výchozí skin, jazyk čeština, vypnuté zbytečné služby.
- Skrýt nebo odinstalovat ostatní doplňky, zakázat repozitáře.
- Autostart doplňku po startu.
- CEC (ovládání ovladačem televize přes HDMI) funguje v LibreELEC sám.

## Varianta B: vlastní distribuce

LibreELEC se staví ze zdrojů ([LibreELEC.tv](https://github.com/LibreELEC/LibreELEC.tv)) na Linuxu, typicky třeba:

```bash
PROJECT=Generic ARCH=x86_64 make image                  # mini PC
PROJECT=RPi DEVICE=RPi5 ARCH=aarch64 make image         # Raspberry Pi 5
```

Co se ve forku mění:
1. **Vlastní distribuce** ve složce `distributions/` (jméno, verze, úvodní obrázek při startu). LibreELEC chce, aby forky nenesly jeho jméno a logo, takže přejmenování je nutné.
2. **Balíčky** pro doplněk a skin: zabalit je do obrazu jako systémové doplňky, aby nešly odinstalovat.
3. **Výchozí nastavení Kodi** v obrazu (skin, jazyk, autostart).
4. **Vyhodit, co není potřeba:** doplňky na hudbu, PVR a TV, hry, vzdálené přístupy (Samba, SSH vypnuté). Menší obraz, rychlejší start, méně věcí k údržbě.
5. **Aktualizace:** LibreELEC se umí aktualizovat sám. Pro vlastní distribuci je potřeba vlastní zdroj aktualizací, třeba GitHub Releases jako u desktopu. Jak přesně se v aktuální verzi build systému nastavuje, je potřeba ověřit.

Nároky na stavbu: Linux (Ubuntu nebo Debian, jde i ve WSL2), desítky GB místa, první build trvá hodiny, další jsou rychlejší díky cache. Hodí se to dát do GitHub Actions (self-hosted runner nebo hodně trpělivosti).

## Hardware

| Zařízení | Pro | Proti |
|---|---|---|
| Raspberry Pi 5 / 4 | levné, malé, nejlepší podpora LibreELEC, CEC | Pi 5 nemá hardwarové dekódování H.264 (dekóduje procesor, 1080p zvládne) |
| Mini PC (Intel N100 apod.) | výkon, HEVC/AV1, 4K | dražší, větší |
| Android TV box | bez stavby obrazu, Kodi z obchodu | není to LibreELEC, varianta A jen jako doplněk |

## Rizika

- **Účet Streamuj je nutný** (viz nahoře). Bez něj Kodi pustí jen ukázky.
- **Změny API Sosáče a Streamuj:** všechno stojí na neoficiálním API, co rozbije web, rozbije i Kodi.
- **Udržovat fork LibreELEC** znamená přebírat jejich nové verze (bezpečnost, nové Kodi). Varianta A tuhle práci nemá.
- **Licence:** LibreELEC i Kodi jsou GPL. Při šíření obrazu musí být dostupné zdrojáky včetně úprav.
- **Obsah Sosáče:** šířit hotové zařízení s přednastaveným přístupem k Sosáči je jiná liga než soukromý projekt. Držel bych to pro sebe a rodinu.

## Postup

1. **Prototyp doplňku** na běžném LibreELEC nebo Kodi ve Windows: přihlášení, Domů, detail, přehrání přes účet Streamuj. *(Ověří největší riziko, tedy přehrávání.)*
2. Profily, Chci vidět a ukládání pozice.
3. Skin s Domů jen ze Sosáče, nastavení kiosku → **varianta A hotová.**
4. Fork LibreELEC, vlastní distribuce, doplněk a skin v obrazu, osekání → **varianta B.**
5. Build v CI a vlastní aktualizace.

Kdyby krok 1 narazil na problém s účtem Streamuj, přepnout na **variantu C**: kiosk s prohlížečem a hotovým webem OpenSosacTV.
