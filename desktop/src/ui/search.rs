//! Hledání: pole nahoře, filmy a seriály jako dvě řady.

use std::time::{Duration, Instant};

use eframe::egui::{self, Rect, Ui, pos2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::theme::{self, INK_3};
use super::widgets::{self, Layout};
use super::{App, ItemRef};
use crate::api::{Kind, ListSource};

/// Dotaz se pošle, až uživatel chvíli nepíše.
const DEBOUNCE: Duration = Duration::from_millis(350);

#[derive(Default)]
pub struct SearchState {
    pub text: String,
    /// Dotaz, který se opravdu hledá.
    query: String,
    edited: Option<Instant>,
    /// Po otevření záložky dát kurzor do pole.
    pub focus: bool,
}

impl App {
    pub(super) fn search_screen(&mut self, ui: &mut Ui, screen: Rect) {
        if let Some(t) = self.search.edited {
            if t.elapsed() >= DEBOUNCE {
                self.search.query = self.search.text.trim().to_owned();
                self.search.edited = None;
            } else {
                ui.ctx().request_repaint_after(DEBOUNCE);
            }
        }
        let q = self.search.query.clone();
        let searching = q.chars().count() >= 2;
        let (movies, serials) = if searching {
            (
                self.paged(&ListSource::Search(Kind::Movie, q.clone())),
                self.paged(&ListSource::Search(Kind::Serial, q.clone())),
            )
        } else {
            (
                super::Paged {
                    items: vec![],
                    loading: false,
                    has_more: false,
                    error: None,
                },
                super::Paged {
                    items: vec![],
                    loading: false,
                    has_more: false,
                    error: None,
                },
            )
        };
        let stage = self.hero.clone();
        self.stage.show(
            ui,
            screen,
            stage.as_ref().and_then(|h| h.backdrop.as_deref()),
            StageMode::Dim,
        );

        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        let mut hovered: Option<ItemRef> = None;
        let mut clicked: Option<ItemRef> = None;
        let focus = std::mem::take(&mut self.search.focus);
        let mut changed = false;
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            ui.horizontal(|ui| {
                ui.add_space(theme::GUTTER);
                let width = (ui.available_width() - theme::GUTTER).min(900.0);
                let (r, _) = widgets::input(
                    ui,
                    "search",
                    &mut self.search.text,
                    "🔍  Filmy, seriály…",
                    false,
                    width,
                );
                if focus {
                    r.request_focus();
                }
                changed = r.changed();
            });
            ui.add_space(18.0);
            egui::ScrollArea::vertical()
                .id_salt("search")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let note = |ui: &mut Ui, t: &str| {
                        ui.horizontal(|ui| {
                            ui.add_space(theme::GUTTER);
                            ui.label(
                                egui::RichText::new(t)
                                    .font(theme::regular(19.0))
                                    .color(INK_3),
                            );
                        });
                    };
                    if !searching {
                        note(ui, "Napiš aspoň dvě písmena.");
                        return;
                    }
                    if !movies.loading
                        && !serials.loading
                        && movies.items.is_empty()
                        && serials.items.is_empty()
                    {
                        note(ui, &format!("Pro „{q}“ nic nemáme."));
                    }
                    let none = |_: &crate::api::Item| false;
                    for (id, title, paged) in [
                        ("search-movies", "Filmy", &movies),
                        ("search-serials", "Seriály", &serials),
                    ] {
                        let out = widgets::row(
                            ui,
                            id,
                            title,
                            &paged.items,
                            Layout::Poster,
                            paged.loading,
                            &none,
                            false,
                        );
                        hovered = out.hovered.or(hovered.take());
                        clicked = out.clicked.or(clicked.take());
                    }
                });
        });
        if changed {
            self.search.edited = Some(Instant::now());
        }
        if hovered.is_some() {
            self.hero = hovered;
        }
        if let Some(item) = clicked {
            self.open(&item);
        }
    }
}
