<p align="center"><img src="public/icon.svg" width="88" alt="OpenSosacTV"></p>

# OpenSosacTV

Neoficiální klient pro [Sosáč](https://tv.sosac.tv) a [Streamuj.tv](https://www.streamuj.tv). Dvě verze se stejnými funkcemi, obě bez vlastního serveru:

- **Web:** https://oondraa.github.io/OpenSosacTV/ (telefon, tablet, prohlížeč)
- **Windows:** [stáhnout OpenSosacTV.exe](https://github.com/oondraa/OpenSosacTV/releases/latest/download/OpenSosacTV.exe), program v Rustu

## Instalace

- **Windows:** stáhni `OpenSosacTV.exe` a spusť ho, instalace není potřeba. Nové verze si stáhne sám (Profil → Aktualizace).
- **iPhone:** Safari → Sdílet → Přidat na plochu
- **Android:** Chrome → ⋮ → Nainstalovat aplikaci

## Přihlášení

Stačí účet Sosáč. Videa přehrává přehrávač Streamuj, ve kterém se stačí jednou přihlásit. Heslo se neukládá, v zařízení zůstává jen jeho otisk.

## Profily

Jeden účet může mít víc profilů bez hesel (Profil → Kdo se dívá). Každý má vlastní „Chci vidět“ a v Mém seznamu je vidět, co chtějí ostatní. Profily žijí jen v zařízení. Rozkoukané a dokoukané vede Sosáč na celý účet, ty jsou společné.

## Vývoj

### Web (`/`)

```bash
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Push do `main` se automaticky nasadí na GitHub Pages.

### Windows (`desktop/`)

Rust a [egui](https://github.com/emilk/egui), titulková lišta jako v [OZBEAT](https://github.com/oondraa/OZBEAT). Přehrávač Streamuj běží ve WebView2, které je ve Windows 10 a 11 předinstalované.

```bash
cd desktop
cargo run             # vývoj
cargo test
cargo build --release # target/release/OpenSosacTV.exe
```

Vydání: zvednout verzi v `desktop/Cargo.toml`, přidat novinky do `desktop/src/ui/changelog.rs` a pushnout tag `v<verze>`. GitHub Actions sestaví exe a zveřejní ho ve Vydáních.

## Licence

GPL-2.0. Vychází z [plugin.video.sosac.unofficial](https://github.com/kodi-czsk/plugin.video.sosac.unofficial). Projekt není spojen se Sosáčem ani se Streamuj.tv.
