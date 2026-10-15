//! Novinky pro obrazovku "Co je nového", nejnovější první. Při vydání, které
//! má uživatel vidět, přidat záznam nahoru a zvednout verzi v Cargo.toml.

pub struct Release {
    pub version: &'static str,
    pub items: &'static [Note],
}

pub struct Note {
    pub title: &'static str,
    pub text: &'static str,
}

pub const CHANGELOG: &[Release] = &[Release {
    version: "0.2.0",
    items: &[
        Note {
            title: "OpenSosacTV pro Windows",
            text: "Celá aplikace jako program pro počítač: stejné řady, detail, hledání i Můj seznam, s vlastní titulkovou lištou jako OZBEAT.",
        },
        Note {
            title: "Profily bez hesel",
            text: "Jeden účet, víc lidí. Každý profil má vlastní Chci vidět a v Mém seznamu vidíš, co chtějí ostatní. Najdeš to v Profilu.",
        },
        Note {
            title: "Stačí účet Sosáč",
            text: "Filmy hraje přehrávač Streamuj jako na sosac.tv. Na streamuj.tv se v něm stačí jednou přihlásit, přihlášení si pamatuje.",
        },
    ],
}];

pub const CURRENT: &str = env!("CARGO_PKG_VERSION");

/// Ukázat novinky? Jen tomu, kdo aplikaci už dřív otevřel a tuhle verzi neviděl.
pub fn should_show(seen: Option<&str>, returning: bool) -> bool {
    returning && seen != Some(CURRENT) && CHANGELOG.first().is_some_and(|r| r.version == CURRENT)
}

/// Vydání od poslední viděné verze (aspoň to nejnovější).
pub fn unseen(seen: Option<&str>) -> &'static [Release] {
    let idx = CHANGELOG.iter().position(|r| Some(r.version) == seen);
    &CHANGELOG[..idx.unwrap_or(1).max(1).min(CHANGELOG.len())]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changelog_matches_package_version() {
        assert_eq!(
            CHANGELOG[0].version, CURRENT,
            "přidej do changelogu záznam pro novou verzi"
        );
    }

    #[test]
    fn new_users_do_not_see_news() {
        assert!(!should_show(None, false));
        assert!(should_show(None, true));
        assert!(!should_show(Some(CURRENT), true));
    }
}
