//! Surové odpovědi Sosáče (jednopísmenné klíče) → [`Item`]. Stejná pravidla jako
//! `src/api/normalize.ts`. API míchá typy (číslo jako text, pole i jeden řetězec,
//! `{}` místo `[]`), proto se čte přes `serde_json::Value`.

use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::Value;

use super::model::{Item, ItemRef, Kind, Language, Season, SerialDetail, Watch, episode_code};

/// Pořadí, ve kterém hledáme název k zobrazení.
const TITLE_PREFERENCE: &[&str] = &["cs", "sk", "en", "us", "uk"];
const ORIGINAL_PREFERENCE: &[&str] = &["en", "us", "uk"];
/// Plugin považuje > 80 % za dokoukané.
const FINISHED_RATIO: f32 = 0.8;

pub fn names(raw: Option<&Value>) -> BTreeMap<String, Vec<String>> {
    let mut out = BTreeMap::new();
    let Some(Value::Object(map)) = raw else {
        return out;
    };
    for (key, value) in map {
        let list = str_list(Some(value));
        if !list.is_empty() {
            out.insert(key.clone(), list);
        }
    }
    out
}

pub fn pick_name(names: &BTreeMap<String, Vec<String>>, preference: &[&str]) -> Option<String> {
    preference
        .iter()
        .find_map(|k| names.get(*k).and_then(|v| v.first()))
        .or_else(|| names.values().next().and_then(|v| v.first()))
        .cloned()
}

/// Obrázky chodí přes http. Výchozí placeholdery ("defaultnis.jpg") nechceme.
pub fn secure_url(raw: Option<&Value>) -> Option<String> {
    let v = match raw? {
        Value::String(s) => s.as_str(),
        Value::Array(a) => a.first()?.as_str()?,
        _ => return None,
    };
    if v.is_empty() {
        return None;
    }
    let file = v
        .rsplit('/')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if file.starts_with("defaultni") && (file.ends_with(".jpg") || file.ends_with(".png")) {
        return None;
    }
    Some(match v.strip_prefix("http://") {
        Some(rest) => format!("https://{rest}"),
        None => v.to_owned(),
    })
}

/// "en+cztit" → zvuk "en", titulky "cz".
pub fn parse_language(raw: &str) -> Language {
    let (audio, extra) = raw
        .split_once('+')
        .map_or((raw, None), |(a, e)| (a, Some(e)));
    let subtitles = extra
        .and_then(|e| e.strip_suffix("tit"))
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    Language {
        audio: audio.to_owned(),
        subtitles,
        raw: raw.to_owned(),
    }
}

fn num(v: Option<&Value>) -> Option<f64> {
    match v? {
        Value::Number(n) => n.as_f64(),
        Value::String(s) if !s.trim().is_empty() => s.trim().parse().ok(),
        _ => None,
    }
    .filter(|n: &f64| n.is_finite())
}

fn uint(v: Option<&Value>) -> Option<u32> {
    num(v).filter(|n| *n >= 0.0).map(|n| n as u32)
}

fn str_list(v: Option<&Value>) -> Vec<String> {
    match v {
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .collect(),
        Some(Value::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}

fn text(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

pub fn watch_state(position: Option<f64>, duration: Option<u32>) -> Watch {
    let progress = match (position, duration) {
        (Some(p), Some(d)) if d > 0 => (p / d as f64).min(1.0) as f32,
        _ => 0.0,
    };
    Watch {
        position,
        progress,
        finished: progress > FINISHED_RATIO,
    }
}

/// Společná pole. `names` jsou názvy, podle kterých se vybere titulek.
fn base(raw: &Value, names: BTreeMap<String, Vec<String>>) -> Item {
    let id = num(raw.get("_id")).unwrap_or(0.0) as u64;
    let title = pick_name(&names, TITLE_PREFERENCE).unwrap_or_else(|| format!("#{id}"));
    let original = pick_name(&names, ORIGINAL_PREFERENCE).filter(|o| *o != title);
    let duration = uint(raw.get("dl"));
    Item {
        id,
        original_title: original,
        title,
        year: num(raw.get("y")).map(|y| y as i32),
        description: text(raw.get("p")),
        poster: secure_url(raw.get("i")),
        backdrop: secure_url(raw.get("b")),
        quality: text(raw.get("q")),
        languages: str_list(raw.get("d"))
            .iter()
            .map(|l| parse_language(l))
            .collect(),
        genres: str_list(raw.get("g")),
        countries: str_list(raw.get("o")),
        csfd: uint(raw.get("c")).filter(|c| *c > 0),
        imdb: num(raw.get("m"))
            .filter(|m| *m > 0.0)
            .map(|m| (m / 10.0) as f32),
        age_rating: uint(raw.get("a")).filter(|a| *a != 99 && *a != 0),
        duration,
        watch: watch_state(num(raw.get("w")), duration),
        ..Default::default()
    }
}

pub fn movie(raw: &Value) -> Item {
    Item {
        kind: Kind::Movie,
        stream_id: text(raw.get("l")),
        directors: str_list(raw.get("s")),
        writers: str_list(raw.get("h")),
        cast: str_list(raw.get("f")),
        ..base(raw, names(raw.get("n")))
    }
}

pub fn serial(raw: &Value) -> Item {
    Item {
        kind: Kind::Serial,
        season_count: uint(raw.get("z")),
        directors: str_list(raw.get("s")),
        writers: str_list(raw.get("h")),
        cast: str_list(raw.get("f")),
        ..base(raw, names(raw.get("n")))
    }
}

/// Epizoda. V seznamech je `n` název seriálu a `ne` název epizody, v detailu
/// seriálu `ne` chybí a `n` je název epizody.
pub fn episode(raw: &Value, serial_id: Option<u64>, serial_title: Option<&str>) -> Item {
    let separate = raw.get("ne").is_some();
    let serial_names = if separate {
        names(raw.get("n"))
    } else {
        BTreeMap::new()
    };
    let episode_names = names(if separate {
        raw.get("ne")
    } else {
        raw.get("n")
    });
    let serial_title =
        pick_name(&serial_names, TITLE_PREFERENCE).or_else(|| serial_title.map(str::to_owned));
    let season = uint(raw.get("s")).unwrap_or(0);
    let number = uint(raw.get("ep")).unwrap_or(0);
    let episode_title =
        pick_name(&episode_names, TITLE_PREFERENCE).unwrap_or_else(|| format!("Epizoda {number}"));
    let b = base(
        raw,
        if separate {
            serial_names
        } else {
            episode_names.clone()
        },
    );
    let thumbnail =
        secure_url(raw.get("ie")).or_else(|| if separate { None } else { b.poster.clone() });
    Item {
        kind: Kind::Episode,
        title: match &serial_title {
            Some(s) => format!("{s} {}", episode_code(season, number)),
            None => episode_title.clone(),
        },
        stream_id: text(raw.get("l")),
        season,
        episode: number,
        episode_title,
        serial_title,
        serial_id: num(raw.get("id")).map(|n| n as u64).or(serial_id),
        thumbnail,
        ..b
    }
}

/// `serials/<id>` vrací `{ "<série>": { "<epizoda>": epizoda } }`.
pub fn serial_detail(serial_id: u64, raw: &Value, serial_title: Option<&str>) -> SerialDetail {
    let mut seasons: Vec<Season> = raw
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(season_key, eps)| {
            let number: u32 = season_key.parse().ok()?;
            let mut episodes: Vec<ItemRef> = eps
                .as_object()
                .into_iter()
                .flatten()
                .map(|(ep_key, ep)| {
                    let mut ep = ep.clone();
                    if let Value::Object(map) = &mut ep {
                        map.entry("s").or_insert_with(|| number.into());
                        if let Ok(n) = ep_key.parse::<u32>() {
                            map.entry("ep").or_insert_with(|| n.into());
                        }
                    }
                    Arc::new(episode(&ep, Some(serial_id), serial_title))
                })
                .collect();
            episodes.sort_by_key(|e| e.episode);
            Some(Season { number, episodes })
        })
        .collect();
    seasons.sort_by_key(|s| s.number);
    SerialDetail { seasons }
}

/// Prázdný výsledek někdy přijde jako `{}` místo `[]`.
pub fn list(raw: &Value) -> Vec<&Value> {
    match raw {
        Value::Array(a) => a.iter().collect(),
        Value::Object(o) => o.values().collect(),
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn movie_from_real_sample() {
        let raw = json!({
            "_id": 156, "q": "hd", "i": "http://kodi-api.sosac.to/obrazky/300/156.jpg",
            "n": {"cs": ["Avatar"]}, "d": ["cz", "en+cztit"], "y": "2009", "c": 82, "m": 78,
            "a": 12, "s": ["James Cameron"], "g": ["Akční"], "l": "abc", "dl": 9660, "w": 4830
        });
        let m = movie(&raw);
        assert_eq!(m.title, "Avatar");
        assert_eq!(m.year, Some(2009));
        assert_eq!(
            m.poster.as_deref(),
            Some("https://kodi-api.sosac.to/obrazky/300/156.jpg")
        );
        assert_eq!(m.imdb, Some(7.8));
        assert_eq!(m.languages[1].subtitles.as_deref(), Some("cz"));
        assert!((m.watch.progress - 0.5).abs() < 0.01);
        assert_eq!(m.directors, ["James Cameron"]);
    }

    #[test]
    fn placeholder_images_are_dropped() {
        assert_eq!(
            secure_url(Some(&json!("http://x/obrazky/defaultnis.jpg"))),
            None
        );
    }

    #[test]
    fn episode_in_list_and_in_serial() {
        let listed = episode(
            &json!({"_id": 1, "n": {"cs": "Trýzeň"}, "ne": {"cs": "Pilot"}, "s": 1, "ep": 2, "id": 9}),
            None,
            None,
        );
        assert_eq!(listed.title, "Trýzeň S01E02");
        assert_eq!(listed.serial_id, Some(9));
        let detail = serial_detail(
            9,
            &json!({"1": {"1": {"_id": 5, "n": {"cs": "Pilot"}}}, "2": {}}),
            Some("Trýzeň"),
        );
        assert_eq!(detail.seasons.len(), 2);
        let ep = &detail.seasons[0].episodes[0];
        assert_eq!((ep.season, ep.episode, ep.serial_id), (1, 1, Some(9)));
        assert_eq!(ep.episode_title, "Pilot");
    }
}
