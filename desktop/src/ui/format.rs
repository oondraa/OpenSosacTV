//! Texty pro UI, stejné jako `src/ui/format.ts`.

use crate::api::model::Language;
use crate::api::{Item, Kind, episode_code};

fn lang(code: &str) -> String {
    match code.to_ascii_lowercase().as_str() {
        "cz" | "cs" => "CZ".into(),
        other => other.to_uppercase(),
    }
}

/// "CZ dabing", "EN + CZ titulky"
pub fn language_label(t: &Language) -> String {
    if let Some(sub) = &t.subtitles {
        return format!("{} + {} titulky", lang(&t.audio), lang(sub));
    }
    if t.audio == "cz" || t.audio == "sk" {
        format!("{} dabing", lang(&t.audio))
    } else {
        format!("{} zvuk", lang(&t.audio))
    }
}

/// 9660 → "2 h 41 min", 1319 → "22 min"
pub fn duration(seconds: Option<u32>) -> Option<String> {
    let s = seconds.filter(|s| *s >= 60)?;
    let m = (s as f32 / 60.0).round() as u32;
    Some(if m >= 60 {
        format!("{} h {} min", m / 60, m % 60)
    } else {
        format!("{m} min")
    })
}

/// "zbývá 48 min"
pub fn remaining(item: &Item) -> Option<String> {
    let pos = item.watch.position.filter(|p| *p > 0.0)?;
    let dur = item.duration?;
    if item.watch.finished {
        return None;
    }
    duration(Some((dur as f64 - pos).max(0.0) as u32)).map(|d| format!("zbývá {d}"))
}

pub fn quality_label(q: Option<&str>) -> Option<&'static str> {
    Some(match q?.to_ascii_lowercase().as_str() {
        "uhd" => "4K",
        "fhd" => "Full HD",
        "hd" => "HD",
        "sd" => "SD",
        "kinorip" => "Kino",
        "tvrip" => "TV",
        _ => return None,
    })
}

pub fn plural<'a>(n: u32, one: &'a str, few: &'a str, many: &'a str) -> &'a str {
    match n {
        1 => one,
        2..=4 => few,
        _ => many,
    }
}

pub fn kind_label(item: &Item) -> String {
    match item.kind {
        Kind::Movie => "Film".into(),
        Kind::Serial => match item.season_count {
            Some(n) if n > 0 => format!("Seriál · {n} {}", plural(n, "série", "série", "sérií")),
            _ => "Seriál".into(),
        },
        Kind::Episode => episode_code(item.season, item.episode),
    }
}

/// Krátký řádek pod kartou v mřížce.
pub fn card_subline(item: &Item) -> String {
    let mut parts = Vec::new();
    if item.kind == Kind::Episode {
        parts.push(episode_code(item.season, item.episode));
    } else {
        if let Some(y) = item.year {
            parts.push(y.to_string());
        }
        if let Some(g) = item.genres.first() {
            parts.push(g.clone());
        }
    }
    if let Some(r) = remaining(item) {
        parts.push(r);
    }
    parts.join(" · ")
}

/// Žánry: kód API a český název. Nejčastější dopředu, jako na webu.
pub const GENRES: &[(&str, &str)] = &[
    ("action", "Akční"),
    ("comedy", "Komedie"),
    ("drama", "Drama"),
    ("thriller", "Thrillery"),
    ("sci-fi", "Sci-fi"),
    ("crime", "Krimi"),
    ("horror", "Horory"),
    ("animation", "Animované"),
    ("family", "Rodinné"),
    ("fantasy", "Fantasy"),
    ("romance", "Romantické"),
    ("documentary", "Dokumenty"),
    ("adventure", "Dobrodružné"),
    ("war", "Válečné"),
    ("history", "Historické"),
    ("biography", "Životopisné"),
    ("cartoons", "Kreslené"),
    ("disaster", "Katastrofické"),
    ("experimental", "Experimentální"),
    ("fairytales", "Pohádky"),
    ("imax", "IMAX"),
    ("krimi", "Kriminálky"),
    ("music", "Hudební"),
    ("mystery", "Mysteriózní"),
    ("psychological", "Psychologické"),
    ("publicistic", "Publicistika"),
    ("realitytv", "Reality TV"),
    ("sport", "Sportovní"),
    ("talkshow", "Talk show"),
    ("western", "Westerny"),
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations() {
        assert_eq!(duration(Some(9660)).as_deref(), Some("2 h 41 min"));
        assert_eq!(duration(Some(1319)).as_deref(), Some("22 min"));
        assert_eq!(duration(Some(30)), None);
    }
}
