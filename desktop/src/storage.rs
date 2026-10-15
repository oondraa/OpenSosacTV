//! Vše, co si aplikace pamatuje: jeden JSON v `%APPDATA%\OpenSosacTV`.
//! Obdoba localStorage ve webové verzi. Chyba čtení = prázdný stav.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::api::{Credentials, ServiceSettings};
use crate::profiles::Profiles;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Stored {
    pub session: Option<Credentials>,
    /// Profily podle účtu (malými písmeny).
    pub profiles: BTreeMap<String, Profiles>,
    /// Uživatel už prošel úvodní obrazovkou (přihlášením nebo "Bez účtu").
    pub onboarded: bool,
    /// Poslední verze, jejíž novinky viděl.
    pub seen_version: Option<String>,
    pub settings: Option<ServiceSettings>,
}

pub fn dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("OpenSosacTV")
}

fn file() -> PathBuf {
    dir().join("state.json")
}

impl Stored {
    pub fn load() -> Self {
        std::fs::read(file())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    /// Zápis přes dočasný soubor, aby pád uprostřed nesmazal stav.
    pub fn save(&self) {
        let path = file();
        let Ok(json) = serde_json::to_vec_pretty(self) else {
            return;
        };
        let _ = std::fs::create_dir_all(dir());
        let tmp = path.with_extension("json.tmp");
        if std::fs::write(&tmp, json).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }

    pub fn profiles_for(&mut self, account: &str) -> &mut Profiles {
        let key = account.to_lowercase();
        let current = self
            .profiles
            .remove(&key)
            .map_or_else(|| Profiles::new(account), |p| p.repaired(account));
        self.profiles.entry(key).or_insert(current)
    }
}
