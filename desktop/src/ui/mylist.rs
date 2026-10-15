//! Můj seznam z účtu na Sosáči. Rozkoukané a dokoukané jsou společné celému
//! účtu, "Chci vidět" se dělí podle profilů (viz profiles.rs).

use eframe::egui::{self, Rect, Ui, pos2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::theme::{self, INK_2, INK_3};
use super::widgets::{self, Layout};
use super::{App, ItemRef, Route};
use crate::api::{Item, Kind, ListSource};

struct MyRow {
    id: String,
    title: String,
    items: Vec<ItemRef>,
    layout: Layout,
    play: bool,
    loading: bool,
    /// Seznamy, ze kterých řada je (pro načtení dalších stránek).
    sources: Vec<ListSource>,
}

impl App {
    pub(super) fn my_list(&mut self, ui: &mut Ui, screen: Rect) {
        let stage = self.hero.clone();
        self.stage.show(
            ui,
            screen,
            stage.as_ref().and_then(|h| h.backdrop.as_deref()),
            StageMode::Dim,
        );
        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        if !self.is_logged_in() {
            let mut login = false;
            ui.scope_builder(egui::UiBuilder::new().max_rect(content.shrink2(egui::vec2(theme::GUTTER, 0.0))), |ui| {
                ui.add_space(screen.height() * 0.15);
                widgets::eyebrow(ui, "Můj seznam");
                widgets::display(ui, "Přihlas se a uvidíš, kde jsi skončil.", 44.0, 640.0);
                widgets::paragraph(ui, "Rozkoukané filmy, frontu i dokoukané tituly bere aplikace z tvého účtu na Sosáči.", theme::regular(18.0), INK_2, 640.0, 3);
                ui.add_space(16.0);
                login = widgets::button(ui, "Přihlásit se", Some("→"), true).clicked();
            });
            if login {
                self.tab(Route::Profile);
            }
            return;
        }

        let s = |k, l| ListSource::List(k, l);
        let continue_movies = self.paged(&s(Kind::Movie, "unfinished"));
        let continue_serials = self.paged(&s(Kind::Serial, "unfinished"));
        let queue_movies = self.paged(&s(Kind::Movie, "queue"));
        let queue_serials = self.paged(&s(Kind::Serial, "queue"));
        let finished = self.paged(&s(Kind::Movie, "finished"));
        let profiles = self.profiles().expect("přihlášený účet má profily");
        let active = profiles.active().clone();
        let multi = profiles.profiles.len() > 1;
        let mine = |items: &[ItemRef]| {
            items
                .iter()
                .filter(|i| profiles.is_queued_for(&active.id, i.kind, i.id))
                .cloned()
                .collect::<Vec<_>>()
        };
        let queued: Vec<ItemRef> = queue_movies
            .items
            .iter()
            .chain(&queue_serials.items)
            .cloned()
            .collect();
        let queue_loading = queue_movies.loading || queue_serials.loading;
        let both = vec![s(Kind::Movie, "queue"), s(Kind::Serial, "queue")];

        let mut rows = vec![
            MyRow {
                id: "my-continue".into(),
                title: "Pokračovat ve sledování".into(),
                items: continue_movies.items.clone(),
                layout: Layout::Wide,
                play: true,
                loading: continue_movies.loading,
                sources: vec![s(Kind::Movie, "unfinished")],
            },
            MyRow {
                id: "my-serials".into(),
                title: "Rozkoukané seriály".into(),
                items: continue_serials.items.clone(),
                layout: Layout::Wide,
                play: false,
                loading: continue_serials.loading,
                sources: vec![s(Kind::Serial, "unfinished")],
            },
            MyRow {
                id: "my-queue-movies".into(),
                title: if multi {
                    format!("{} chce vidět · filmy", active.name)
                } else {
                    "Chci vidět · filmy".into()
                },
                items: mine(&queue_movies.items),
                layout: Layout::Poster,
                play: false,
                loading: queue_movies.loading,
                sources: vec![s(Kind::Movie, "queue")],
            },
            MyRow {
                id: "my-queue-serials".into(),
                title: if multi {
                    format!("{} chce vidět · seriály", active.name)
                } else {
                    "Chci vidět · seriály".into()
                },
                items: mine(&queue_serials.items),
                layout: Layout::Poster,
                play: false,
                loading: queue_serials.loading,
                sources: vec![s(Kind::Serial, "queue")],
            },
        ];
        // Přehled, co mají v seznamu ostatní profily.
        for p in profiles.profiles.iter().filter(|p| p.id != active.id) {
            rows.push(MyRow {
                id: format!("my-queue-{}", p.id),
                title: format!("{} chce vidět", p.name),
                items: queued
                    .iter()
                    .filter(|i| {
                        profiles
                            .owners_of(i.kind, i.id)
                            .iter()
                            .any(|o| o.id == p.id)
                    })
                    .cloned()
                    .collect(),
                layout: Layout::Poster,
                play: false,
                loading: queue_loading,
                sources: both.clone(),
            });
        }
        if multi {
            rows.push(MyRow {
                id: "my-queue-shared".into(),
                title: "Společné · přidané na webu nebo jinde".into(),
                items: queued
                    .iter()
                    .filter(|i| profiles.owners_of(i.kind, i.id).is_empty())
                    .cloned()
                    .collect(),
                layout: Layout::Poster,
                play: false,
                loading: queue_loading,
                sources: both.clone(),
            });
        }
        rows.push(MyRow {
            id: "my-finished".into(),
            title: "Dokoukané".into(),
            items: finished.items.clone(),
            layout: Layout::Poster,
            play: false,
            loading: finished.loading,
            sources: vec![s(Kind::Movie, "finished")],
        });

        let queued_movies = self.my_queue_set(Kind::Movie);
        let queued_serials = self.my_queue_set(Kind::Serial);
        let empty = rows.iter().all(|r| !r.loading && r.items.is_empty());
        let mut hovered = None;
        let mut clicked: Option<(ItemRef, bool)> = None;
        let mut more: Vec<ListSource> = Vec::new();
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            egui::ScrollArea::vertical()
                .id_salt("my")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let queued = |i: &Item| match i.kind {
                        Kind::Movie => queued_movies.contains(&i.id),
                        Kind::Serial => queued_serials.contains(&i.id),
                        Kind::Episode => false,
                    };
                    for r in &rows {
                        let out = widgets::row(
                            ui, &r.id, &r.title, &r.items, r.layout, r.loading, &queued, false,
                        );
                        hovered = out.hovered.or(hovered.take());
                        if let Some(c) = out.clicked {
                            clicked = Some((c, r.play));
                        }
                        if out.load_more {
                            more.extend(r.sources.iter().cloned());
                        }
                    }
                    if empty {
                        ui.horizontal(|ui| {
                            ui.add_space(theme::GUTTER);
                            ui.label(
                                egui::RichText::new(
                                    "Zatím tu nic není. Pusť si něco a objeví se to tady.",
                                )
                                .font(theme::regular(19.0))
                                .color(INK_3),
                            );
                        });
                    }
                    ui.add_space(60.0);
                });
        });
        let all = [
            (s(Kind::Movie, "unfinished"), continue_movies),
            (s(Kind::Serial, "unfinished"), continue_serials),
            (s(Kind::Movie, "queue"), queue_movies),
            (s(Kind::Serial, "queue"), queue_serials),
            (s(Kind::Movie, "finished"), finished),
        ];
        for (source, paged) in &all {
            if more.contains(source) {
                self.more(source, paged);
            }
        }
        if hovered.is_some() {
            self.hero = hovered;
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
