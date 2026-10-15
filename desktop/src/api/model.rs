//! Normalizovaný model pro UI, stejný jako `src/api/models.ts` ve webové verzi.
//! Film, seriál i epizoda jsou jedna struktura, pole navíc mají jen některé druhy.

use std::sync::Arc;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub enum Kind {
    #[default]
    Movie,
    Serial,
    Episode,
}

impl Kind {
    /// Klíč do fronty a profilů (`movie:123`).
    pub fn key(self) -> &'static str {
        match self {
            Kind::Movie => "movie",
            Kind::Serial => "serial",
            Kind::Episode => "episode",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Language {
    /// Kód jazyka zvuku, např. "cz", "en".
    pub audio: String,
    /// Kód jazyka titulků ("en+cztit" → "cz").
    pub subtitles: Option<String>,
    pub raw: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Watch {
    /// Zhlédnuté sekundy, None = nikdy nespuštěno nebo nepřihlášen.
    pub position: Option<f64>,
    /// 0–1.
    pub progress: f32,
    /// Plugin považuje > 80 % za dokoukané.
    pub finished: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Item {
    pub id: u64,
    pub kind: Kind,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub description: Option<String>,
    pub poster: Option<String>,
    pub backdrop: Option<String>,
    pub quality: Option<String>,
    pub languages: Vec<Language>,
    pub genres: Vec<String>,
    pub countries: Vec<String>,
    /// ČSFD v procentech.
    pub csfd: Option<u32>,
    /// IMDb 0–10.
    pub imdb: Option<f32>,
    pub age_rating: Option<u32>,
    /// Délka v sekundách.
    pub duration: Option<u32>,
    pub watch: Watch,
    /// Link ID pro Streamuj (filmy a epizody).
    pub stream_id: Option<String>,
    pub directors: Vec<String>,
    pub writers: Vec<String>,
    pub cast: Vec<String>,
    pub season_count: Option<u32>,
    // Jen epizody:
    pub season: u32,
    pub episode: u32,
    pub episode_title: String,
    pub serial_title: Option<String>,
    pub serial_id: Option<u64>,
    pub thumbnail: Option<String>,
}

pub type ItemRef = Arc<Item>;

impl Item {
    /// Obrázek pro širokou kartu: náhled epizody, jinak fanart, jinak plakát.
    pub fn wide_image(&self) -> Option<&str> {
        let ep = if self.kind == Kind::Episode {
            self.thumbnail.as_deref()
        } else {
            None
        };
        ep.or(self.backdrop.as_deref()).or(self.poster.as_deref())
    }

    /// Pozadí za obsahem: fanart, u epizody náhled, jinak plakát.
    pub fn stage_image(&self) -> Option<&str> {
        self.backdrop
            .as_deref()
            .or(self.thumbnail.as_deref())
            .or(self.poster.as_deref())
    }

    /// Název k zobrazení u epizody v seznamech: název seriálu, jinak epizody.
    pub fn display_title(&self) -> &str {
        if self.kind == Kind::Episode {
            self.serial_title.as_deref().unwrap_or(&self.title)
        } else {
            &self.title
        }
    }
}

#[derive(Debug, Clone)]
pub struct Season {
    pub number: u32,
    pub episodes: Vec<ItemRef>,
}

#[derive(Debug, Clone)]
pub struct SerialDetail {
    pub seasons: Vec<Season>,
}

impl SerialDetail {
    fn all(&self) -> impl Iterator<Item = &ItemRef> {
        self.seasons.iter().flat_map(|s| s.episodes.iter())
    }

    /// Další epizoda v pořadí, přes hranici série.
    pub fn next_after(&self, season: u32, episode: u32) -> Option<ItemRef> {
        let all: Vec<_> = self.all().collect();
        let idx = all
            .iter()
            .position(|e| e.season == season && e.episode == episode)?;
        all.get(idx + 1).map(|e| Arc::clone(e))
    }

    /// První rozkoukaná (nebo první nezhlédnutá) epizoda, pro tlačítko Pokračovat.
    pub fn continue_episode(&self) -> Option<ItemRef> {
        let all: Vec<_> = self.all().collect();
        if let Some(e) = all
            .iter()
            .find(|e| e.watch.position.unwrap_or(0.0) > 0.0 && !e.watch.finished)
        {
            return Some(Arc::clone(e));
        }
        let next = all
            .iter()
            .rposition(|e| e.watch.finished)
            .map_or(0, |i| i + 1);
        all.get(next).or(all.first()).map(|e| Arc::clone(e))
    }
}

#[derive(Debug, Clone)]
pub struct Page {
    pub items: Vec<ItemRef>,
    /// API nevrací celkový počet. Plná stránka = asi je další.
    pub has_more: bool,
}

pub fn episode_code(season: u32, episode: u32) -> String {
    format!("S{season:02}E{episode:02}")
}
