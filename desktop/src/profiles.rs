//! Profily v rámci jednoho účtu Sosáč, bez hesel. Stejná pravidla jako
//! `src/lib/profiles.ts`: fronta "Chci vidět" je na serveru jedna na účet,
//! každá položka si nese štítky profilů, které ji přidaly. Štítky žijí jen
//! v tomto počítači. Položka bez štítku (přidaná na webu) je společná.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::api::Kind;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Profile {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Profiles {
    pub profiles: Vec<Profile>,
    pub active_id: String,
    /// `movie:123` → id profilů, které položku chtějí vidět.
    #[serde(default)]
    pub owners: BTreeMap<String, Vec<String>>,
}

/// Co udělat se serverovou frontou po změně štítku.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ServerChange {
    Add,
    Remove,
    None,
}

pub fn queue_key(kind: Kind, id: u64) -> String {
    format!("{}:{id}", kind.key())
}

pub fn new_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    format!("{:x}", nanos as u64 ^ (std::process::id() as u64) << 32)
}

impl Profiles {
    pub fn new(account: &str) -> Self {
        let id = new_id();
        Self {
            profiles: vec![Profile {
                id: id.clone(),
                name: account.to_owned(),
            }],
            active_id: id,
            owners: BTreeMap::new(),
        }
    }

    /// Opraví stav načtený ze souboru (smazaný aktivní profil, prázdný seznam).
    pub fn repaired(mut self, account: &str) -> Self {
        if self.profiles.is_empty() {
            return Self::new(account);
        }
        if !self.profiles.iter().any(|p| p.id == self.active_id) {
            self.active_id = self.profiles[0].id.clone();
        }
        self
    }

    pub fn active(&self) -> &Profile {
        self.profiles
            .iter()
            .find(|p| p.id == self.active_id)
            .unwrap_or(&self.profiles[0])
    }

    /// Profily, které položku chtějí vidět. Prázdné = společná položka.
    pub fn owners_of(&self, kind: Kind, id: u64) -> Vec<&Profile> {
        let ids = self.owners.get(&queue_key(kind, id));
        self.profiles
            .iter()
            .filter(|p| ids.is_some_and(|ids| ids.contains(&p.id)))
            .collect()
    }

    /// Patří položka ze serverové fronty profilu? Společné patří všem.
    pub fn is_queued_for(&self, profile_id: &str, kind: Kind, id: u64) -> bool {
        let owners = self.owners_of(kind, id);
        owners.is_empty() || owners.iter().any(|p| p.id == profile_id)
    }

    /// Přidá nebo odebere štítek aktivního profilu. Na server se přidává, když
    /// tam položka není, a maže, když ji už nikdo nechce.
    pub fn toggle(&mut self, kind: Kind, id: u64, queued: bool, on_server: bool) -> ServerChange {
        let key = queue_key(kind, id);
        // Štítky položky, která ze serveru mezitím zmizela, už neplatí.
        let mut current: Vec<String> = if on_server {
            self.owners
                .get(&key)
                .into_iter()
                .flatten()
                .filter(|p| self.profiles.iter().any(|x| &x.id == *p))
                .cloned()
                .collect()
        } else {
            Vec::new()
        };
        if queued {
            if !current.contains(&self.active_id) {
                current.push(self.active_id.clone());
            }
        } else {
            current.retain(|p| *p != self.active_id);
        }
        let nobody = current.is_empty();
        if nobody {
            self.owners.remove(&key);
        } else {
            self.owners.insert(key, current);
        }
        match (queued, on_server) {
            (true, false) => ServerChange::Add,
            (false, true) if nobody => ServerChange::Remove,
            _ => ServerChange::None,
        }
    }

    pub fn add(&mut self, name: &str) {
        let id = new_id();
        self.profiles.push(Profile {
            id: id.clone(),
            name: name.trim().to_owned(),
        });
        self.active_id = id;
    }

    pub fn rename(&mut self, id: &str, name: &str) {
        if let Some(p) = self.profiles.iter_mut().find(|p| p.id == id) {
            p.name = name.trim().to_owned();
        }
    }

    /// Smaže profil. Co chtěl jen on, zůstane ve frontě jako společné.
    pub fn remove(&mut self, id: &str) {
        if self.profiles.len() <= 1 {
            return;
        }
        self.profiles.retain(|p| p.id != id);
        for ids in self.owners.values_mut() {
            ids.retain(|p| p != id);
        }
        self.owners.retain(|_, ids| !ids.is_empty());
        if self.active_id == id {
            self.active_id = self.profiles[0].id.clone();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn two() -> Profiles {
        Profiles {
            profiles: vec![
                Profile {
                    id: "a".into(),
                    name: "Ondra".into(),
                },
                Profile {
                    id: "b".into(),
                    name: "Pavla".into(),
                },
            ],
            active_id: "a".into(),
            owners: BTreeMap::new(),
        }
    }

    #[test]
    fn untagged_item_is_shared() {
        let p = two();
        assert!(p.is_queued_for("a", Kind::Movie, 1));
        assert!(p.is_queued_for("b", Kind::Movie, 1));
    }

    #[test]
    fn adding_new_item_writes_to_server_and_tags_profile() {
        let mut p = two();
        assert_eq!(p.toggle(Kind::Movie, 1, true, false), ServerChange::Add);
        assert_eq!(p.owners_of(Kind::Movie, 1)[0].name, "Ondra");
        assert!(!p.is_queued_for("b", Kind::Movie, 1));
    }

    #[test]
    fn second_profile_only_adds_tag() {
        let mut p = two();
        p.toggle(Kind::Movie, 1, true, false);
        p.active_id = "b".into();
        assert_eq!(p.toggle(Kind::Movie, 1, true, true), ServerChange::None);
        assert_eq!(p.owners_of(Kind::Movie, 1).len(), 2);
    }

    #[test]
    fn removed_from_server_only_when_nobody_wants_it() {
        let mut p = two();
        p.owners
            .insert("movie:1".into(), vec!["a".into(), "b".into()]);
        assert_eq!(p.toggle(Kind::Movie, 1, false, true), ServerChange::None);
        p.active_id = "b".into();
        assert_eq!(p.toggle(Kind::Movie, 1, false, true), ServerChange::Remove);
        assert!(!p.owners.contains_key("movie:1"));
        // Společná položka se odebráním smaže ze serveru.
        assert_eq!(p.toggle(Kind::Serial, 5, false, true), ServerChange::Remove);
    }

    #[test]
    fn deleted_profile_leaves_items_shared() {
        let mut p = two();
        p.owners.insert("movie:1".into(), vec!["b".into()]);
        p.owners
            .insert("movie:2".into(), vec!["a".into(), "b".into()]);
        p.remove("b");
        assert_eq!(p.profiles.len(), 1);
        assert_eq!(
            p.owners,
            BTreeMap::from([("movie:2".to_owned(), vec!["a".to_owned()])])
        );
        p.remove("a");
        assert_eq!(p.profiles.len(), 1);
    }
}
