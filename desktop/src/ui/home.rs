//! Domů: nahoře billboard s titulem pod myší, pod ním řady.

use eframe::egui::{self, Rect, Ui, pos2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::theme::{self, INK_2};
use super::widgets::{self, Layout};
use super::{App, ItemRef};
use crate::api::{Kind, ListSource};

pub struct RowDef {
    pub id: &'static str,
    pub title: String,
    pub source: ListSource,
    pub layout: Layout,
    /// Výběr karty rovnou přehraje (pokračovat, nové epizody), jinak detail.
    pub play: bool,
    pub personal: bool,
}

fn row(
    id: &'static str,
    title: &str,
    kind: Kind,
    list: &'static str,
    layout: Layout,
    play: bool,
) -> RowDef {
    RowDef {
        id,
        title: title.into(),
        source: ListSource::List(kind, list),
        layout,
        play,
        personal: matches!(list, "queue" | "unfinished" | "finished"),
    }
}

impl App {
    fn home_rows(&self) -> Vec<RowDef> {
        let mut rows = vec![
            row(
                "continue-movies",
                "Pokračovat ve sledování",
                Kind::Movie,
                "unfinished",
                Layout::Wide,
                true,
            ),
            row(
                "continue-serials",
                "Rozkoukané seriály",
                Kind::Serial,
                "unfinished",
                Layout::Wide,
                false,
            ),
            row(
                "new-episodes",
                "Nové epizody",
                Kind::Episode,
                "last-added",
                Layout::Wide,
                true,
            ),
            row(
                "queue-movies",
                "Chci vidět",
                Kind::Movie,
                "queue",
                Layout::Poster,
                false,
            ),
            row(
                "news-dubbing",
                "Novinky s dabingem",
                Kind::Movie,
                "news-with-dubbing",
                Layout::Poster,
                false,
            ),
            row(
                "popular-movies",
                "Populární filmy",
                Kind::Movie,
                "popular",
                Layout::Poster,
                false,
            ),
            row(
                "popular-serials",
                "Populární seriály",
                Kind::Serial,
                "popular",
                Layout::Poster,
                false,
            ),
            row(
                "top-movies",
                "Nejlépe hodnocené",
                Kind::Movie,
                "top-rated",
                Layout::Poster,
                false,
            ),
            row(
                "last-added",
                "Naposledy přidané",
                Kind::Movie,
                "last-added",
                Layout::Poster,
                false,
            ),
        ];
        if let Some(topic) = &self.settings.current_topic {
            rows.insert(
                4,
                row(
                    "current-topic",
                    topic,
                    Kind::Movie,
                    "current-topic",
                    Layout::Poster,
                    false,
                ),
            );
        }
        rows.retain(|r| !r.personal || self.is_logged_in());
        rows
    }

    pub(super) fn home(&mut self, ui: &mut Ui, screen: Rect) {
        let rows = self.home_rows();
        let hero_h = (screen.height() * 0.5).clamp(380.0, 540.0);

        // Data řad dopředu, aby billboard měl co ukázat hned.
        let mut loaded = Vec::new();
        for def in &rows {
            let mut paged = self.paged(&def.source);
            if def.id == "queue-movies" {
                // Fronta je jedna na účet, aktivní profil vidí jen svoje a společné.
                if let Some(p) = self.profiles() {
                    paged
                        .items
                        .retain(|i| p.is_queued_for(&p.active_id, i.kind, i.id));
                }
            }
            loaded.push(paged);
        }
        if self.hero.is_none() {
            self.hero = loaded.iter().find_map(|p| p.items.first().cloned());
        }
        let hero = self.hero.clone();
        self.stage.show(
            ui,
            screen,
            hero.as_ref().and_then(|h| h.stage_image()),
            StageMode::Hero,
        );

        // Billboard.
        let hero_rect = Rect::from_min_max(
            pos2(screen.left() + theme::GUTTER, screen.top() + CONTENT_TOP),
            pos2(screen.right() - theme::GUTTER, screen.top() + hero_h),
        );
        if let Some(item) = &hero {
            ui.scope_builder(egui::UiBuilder::new().max_rect(hero_rect), |ui| {
                // Dlouhý popis nesmí přetéct do řad.
                ui.set_clip_rect(hero_rect.expand2(egui::vec2(theme::GUTTER, 0.0)));
                let w = (hero_rect.width() * 0.5).max(420.0);
                ui.set_max_width(w);
                ui.add_space(12.0);
                if item.kind == Kind::Episode {
                    widgets::eyebrow(
                        ui,
                        &format!(
                            "{} · {}",
                            crate::api::episode_code(item.season, item.episode),
                            item.episode_title
                        ),
                    );
                }
                widgets::display(ui, item.display_title(), 52.0, w);
                widgets::meta_line(ui, item, item.kind != Kind::Episode);
                widgets::language_line(ui, item);
                if let Some(d) = &item.description {
                    widgets::paragraph(
                        ui,
                        d,
                        theme::regular(17.0),
                        INK_2,
                        w,
                        if screen.height() > 900.0 { 3 } else { 2 },
                    );
                }
            });
        }

        // Řady pod billboardem.
        let rows_rect = Rect::from_min_max(pos2(screen.left(), screen.top() + hero_h), screen.max);
        let mut hovered: Option<ItemRef> = None;
        let mut clicked: Option<(ItemRef, bool)> = None;
        let mut more = Vec::new();
        let queued_movies = self.my_queue_set(Kind::Movie);
        let queued_serials = self.my_queue_set(Kind::Serial);
        ui.scope_builder(egui::UiBuilder::new().max_rect(rows_rect), |ui| {
            egui::ScrollArea::vertical()
                .id_salt("home-rows")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    for (def, paged) in rows.iter().zip(&loaded) {
                        let queued = |i: &crate::api::Item| match i.kind {
                            Kind::Movie => queued_movies.contains(&i.id),
                            Kind::Serial => queued_serials.contains(&i.id),
                            Kind::Episode => false,
                        };
                        let out = widgets::row(
                            ui,
                            def.id,
                            &def.title,
                            &paged.items,
                            def.layout,
                            paged.loading,
                            &queued,
                            false,
                        );
                        if out.hovered.is_some() {
                            hovered = out.hovered;
                        }
                        if let Some(c) = out.clicked {
                            clicked = Some((c, def.play));
                        }
                        if out.load_more {
                            more.push(def.source.clone());
                        }
                    }
                    ui.add_space(60.0);
                });
        });
        for (source, paged) in more.iter().filter_map(|s| {
            rows.iter()
                .position(|r| &r.source == s)
                .map(|i| (s, &loaded[i]))
        }) {
            self.more(source, paged);
        }
        if let Some(h) = hovered {
            self.hero = Some(h);
        }
        if let Some((item, play)) = clicked {
            if play {
                self.play(&item, None)
            } else {
                self.open(&item)
            }
        }
    }
}
