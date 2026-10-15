//! Klient katalogu Sosáč (kodi-api.sosac.to). Stejné endpointy jako
//! `src/api/sosac.ts`. Na desktopu není CORS, takže zápisy jdou rovnou jako POST.

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::model::{ItemRef, Kind, Page, SerialDetail};
use super::normalize;

/// Sůl pro hash hesla do katalogového API (z Kodi pluginu).
const AUTH_SALT: &str = "EWs5yVD4QF2sshGm22EWVa";
pub const DEFAULT_SOSAC_DOMAIN: &str = "kodi-api.sosac.to";
pub const DEFAULT_STREAMING_PROVIDER: &str = "www.streamuj.tv";
const SETTINGS_URL: &str = "https://kodi-api.sosac.to/settings";
/// Verze klienta, kterou posílá Kodi plugin.
const CLIENT_VERSION: &str = "19";
pub const PAGE_SIZE: usize = 40;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Credentials {
    pub username: String,
    /// md5(md5("user:heslo") + sůl). Čisté heslo se nikde neukládá.
    pub password_hash: String,
}

impl Credentials {
    pub fn new(username: &str, password: &str) -> Self {
        let username = username.trim();
        let inner = md5_hex(&format!("{username}:{password}"));
        Self {
            username: username.to_owned(),
            password_hash: md5_hex(&format!("{inner}{AUTH_SALT}")),
        }
    }
}

fn md5_hex(s: &str) -> String {
    Md5::digest(s.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceSettings {
    pub sosac_domain: String,
    pub streaming_provider: String,
    /// Aktuální téma, česky (např. "Vánoční filmy").
    pub current_topic: Option<String>,
    /// Unix čas stažení.
    pub fetched_at: u64,
}

impl Default for ServiceSettings {
    fn default() -> Self {
        Self {
            sosac_domain: DEFAULT_SOSAC_DOMAIN.into(),
            streaming_provider: DEFAULT_STREAMING_PROVIDER.into(),
            current_topic: None,
            fetched_at: 0,
        }
    }
}

/// Doména musí být holý hostname, chrání před podvrženým settings.
fn is_hostname(v: &str) -> bool {
    let ok_chars = v
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    let tld = v.rsplit('.').next().unwrap_or_default();
    ok_chars && v.contains('.') && tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic())
}

pub fn parse_settings(raw: &Value, now: u64) -> ServiceSettings {
    let host = |k: &str, d: &str| {
        raw.get(k)
            .and_then(Value::as_str)
            .filter(|v| is_hostname(v))
            .unwrap_or(d)
            .to_owned()
    };
    ServiceSettings {
        sosac_domain: host("domain", DEFAULT_SOSAC_DOMAIN),
        streaming_provider: host("streaming_provider", DEFAULT_STREAMING_PROVIDER),
        current_topic: raw
            .get("current_topic")
            .and_then(Value::as_str)
            .and_then(|t| t.rsplit('|').next())
            .filter(|t| !t.is_empty())
            .map(str::to_owned),
        fetched_at: now,
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ApiError {
    Unauthorized,
    Network(String),
    Http(u16),
    Parse(String),
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::Unauthorized => write!(f, "Špatné jméno nebo heslo k Sosáči"),
            ApiError::Network(e) => write!(f, "Síťová chyba: {e}"),
            ApiError::Http(s) => write!(f, "Sosáč odpověděl HTTP {s}"),
            ApiError::Parse(e) => write!(f, "Sosáč poslal nečitelná data: {e}"),
        }
    }
}

pub type Result<T> = std::result::Result<T, ApiError>;

/// Seznamy podle žánru a předvolby v záložkách Filmy a Seriály.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ListSource {
    /// `movies/lists/<typ>` nebo `serials/lists/<typ>` nebo `episodes/lists/<typ>`.
    List(Kind, &'static str),
    Genre(Kind, &'static str),
    Search(Kind, String),
}

impl ListSource {
    /// Klíč do cache. Osobní seznamy začínají `my/`, aby šly invalidovat.
    pub fn key(&self) -> String {
        match self {
            ListSource::List(k, t) if matches!(*t, "queue" | "unfinished" | "finished") => {
                format!("my/{}/{t}", k.key())
            }
            ListSource::List(k, t) => format!("list/{}/{t}", k.key()),
            ListSource::Genre(k, g) => format!("genre/{}/{g}", k.key()),
            ListSource::Search(k, q) => format!("search/{}/{q}", k.key()),
        }
    }
}

#[derive(Clone)]
pub struct SosacClient {
    http: reqwest::Client,
    domain: String,
    credentials: Option<Credentials>,
}

impl SosacClient {
    pub fn new(domain: &str, credentials: Option<Credentials>) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(concat!("OpenSosacTV/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(20))
            .build()
            .expect("reqwest klient");
        Self {
            http,
            domain: domain.to_owned(),
            credentials,
        }
    }

    pub fn is_authenticated(&self) -> bool {
        self.credentials.is_some()
    }

    fn url(&self, path: &str, params: &[(&str, String)]) -> String {
        let mut url = url::Url::parse(&format!("https://{}/", self.domain))
            .expect("doména")
            .join(path)
            .expect("cesta");
        {
            let mut q = url.query_pairs_mut();
            for (k, v) in params {
                q.append_pair(k, v);
            }
            if let Some(c) = &self.credentials {
                q.append_pair("username", &c.username);
                q.append_pair("password", &c.password_hash);
            }
        }
        url.into()
    }

    async fn send(&self, req: reqwest::RequestBuilder) -> Result<String> {
        let res = req
            .send()
            .await
            .map_err(|e| ApiError::Network(without_url(e)))?;
        match res.status().as_u16() {
            401 => return Err(ApiError::Unauthorized),
            s if !(200..300).contains(&s) => return Err(ApiError::Http(s)),
            _ => {}
        }
        res.text()
            .await
            .map_err(|e| ApiError::Network(without_url(e)))
    }

    async fn json(&self, path: &str, params: &[(&str, String)]) -> Result<Value> {
        let body = self.send(self.http.get(self.url(path, params))).await?;
        serde_json::from_str(&body).map_err(|e| ApiError::Parse(e.to_string()))
    }

    async fn page(
        &self,
        path: &str,
        mut params: Vec<(&str, String)>,
        page: usize,
        kind: Kind,
    ) -> Result<Page> {
        params.push(("pocet", PAGE_SIZE.to_string()));
        params.push(("stranka", page.to_string()));
        let raw = self.json(path, &params).await?;
        let list = normalize::list(&raw);
        let has_more = list.len() >= PAGE_SIZE;
        let items = list
            .into_iter()
            .map(|r| {
                Arc::new(match kind {
                    Kind::Movie => normalize::movie(r),
                    Kind::Serial => normalize::serial(r),
                    Kind::Episode => normalize::episode(r, None, None),
                })
            })
            .collect();
        Ok(Page { items, has_more })
    }

    pub async fn list(&self, source: &ListSource, page: usize) -> Result<Page> {
        let media = |k: Kind| match k {
            Kind::Movie => "movies",
            Kind::Serial => "serials",
            Kind::Episode => "episodes",
        };
        match source {
            ListSource::List(kind, t) => {
                if matches!(*t, "queue" | "unfinished" | "finished") && !self.is_authenticated() {
                    return Err(ApiError::Unauthorized);
                }
                self.page(&format!("{}/lists/{t}", media(*kind)), vec![], page, *kind)
                    .await
            }
            ListSource::Genre(kind, g) => {
                self.page(
                    &format!("{}/lists/by-genre", media(*kind)),
                    vec![("g", (*g).to_owned())],
                    page,
                    *kind,
                )
                .await
            }
            ListSource::Search(kind, q) => {
                self.page(
                    &format!("{}/simple-search", media(*kind)),
                    vec![("q", q.clone())],
                    page,
                    *kind,
                )
                .await
            }
        }
    }

    pub async fn movie(&self, id: u64) -> Result<ItemRef> {
        Ok(Arc::new(normalize::movie(
            &self.json(&format!("movies/{id}"), &[]).await?,
        )))
    }

    pub async fn episode(&self, id: u64) -> Result<ItemRef> {
        Ok(Arc::new(normalize::episode(
            &self.json(&format!("episodes/{id}"), &[]).await?,
            None,
            None,
        )))
    }

    /// Série a epizody. `serials/<id>` nevrací metadata seriálu, ta se vezmou
    /// z první epizody (`episodes/<id>` nese názvy, popis, plakát seriálu).
    pub async fn serial(&self, id: u64, known: Option<ItemRef>) -> Result<(ItemRef, SerialDetail)> {
        let raw = self.json(&format!("serials/{id}"), &[]).await?;
        if let Some(serial) = known {
            let detail = normalize::serial_detail(id, &raw, Some(&serial.title));
            return Ok((serial, detail));
        }
        let first = raw
            .as_object()
            .and_then(|s| s.values().next())
            .and_then(|eps| eps.as_object()?.values().next())
            .and_then(|ep| ep.get("_id"))
            .and_then(Value::as_u64)
            .ok_or(ApiError::Http(404))?;
        let mut ep = self.json(&format!("episodes/{first}"), &[]).await?;
        if let Value::Object(map) = &mut ep {
            for k in ["ne", "ie", "s", "ep", "id", "l", "w", "dl"] {
                map.remove(k);
            }
            map.insert("_id".into(), id.into());
        }
        let serial = Arc::new(normalize::serial(&ep));
        let detail = normalize::serial_detail(id, &raw, Some(&serial.title));
        Ok((serial, detail))
    }

    /// Přidá do / odebere z fronty "Chci vidět".
    pub async fn set_queued(&self, kind: Kind, id: u64, queued: bool) -> Result<()> {
        let media = if kind == Kind::Serial {
            "serials"
        } else {
            "movies"
        };
        let action = if queued { "into-queue" } else { "off-queue" };
        let url = self.url(
            &format!("{media}/{id}/{action}"),
            &[("d", CLIENT_VERSION.into())],
        );
        self.send(self.http.post(url)).await.map(drop)
    }

    /// ID ve frontě (první stránka), pro odznak "ve frontě" na kartách.
    pub async fn queue_ids(&self, kind: Kind) -> Result<HashSet<u64>> {
        let page = self.list(&ListSource::List(kind, "queue"), 1).await?;
        Ok(page.items.iter().map(|i| i.id).collect())
    }

    /// Ověří přihlášení: osobní seznam bez platného účtu vrací 401.
    pub async fn verify(&self) -> Result<()> {
        self.json(
            "movies/lists/queue",
            &[("pocet", "1".into()), ("stranka", "1".into())],
        )
        .await
        .map(drop)
    }
}

/// Zjistí aktuální domény. Při chybě vrátí výchozí.
pub async fn discover() -> Option<ServiceSettings> {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()?;
    let body = http
        .get(SETTINGS_URL)
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;
    let raw: Value = serde_json::from_str(&body).ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    Some(parse_settings(&raw, now))
}

/// Chyby reqwestu obsahují URL i s heslem, ta do UI nepatří.
fn without_url(e: reqwest::Error) -> String {
    e.without_url().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_hash_matches_web_version() {
        // Stejné hodnoty jako v tests/api.test.ts webové verze.
        assert_eq!(
            Credentials::new("tester", "heslo123").password_hash,
            "6b9435b238d9c842a213505ca56157c4"
        );
        assert_eq!(
            Credentials::new("Žluťoučký", "kůň").password_hash,
            "a258600e6cac9951c5e72b4dae77442b"
        );
    }

    #[test]
    fn settings_reject_spoofed_domain() {
        let s = parse_settings(
            &serde_json::json!({"domain": "evil.com/x?", "streaming_provider": "www.streamuj.tv", "current_topic": "Christmas movies|Vánoční filmy"}),
            1,
        );
        assert_eq!(s.sosac_domain, DEFAULT_SOSAC_DOMAIN);
        assert_eq!(s.streaming_provider, "www.streamuj.tv");
        assert_eq!(s.current_topic.as_deref(), Some("Vánoční filmy"));
    }
}
