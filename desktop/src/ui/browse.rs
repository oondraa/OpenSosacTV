//! Filmy / Seriály: chipy nahoře, mřížka plakátů pod nimi.

use eframe::egui::{self, Rect, Ui, pos2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::format::GENRES;
use super::theme::{self, INK_3};
use super::widgets::{self, CardOptions, Layout};
use super::{App, ItemRef};
use crate::api::{Kind, ListSource};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Filter {
    Preset(&'static str),
    Genre(&'static str),
}

const PRESETS: &[(&str, &str)] = &[
    ("popular", "Populární"),
    ("top-rated", "Nejlépe hodnocené"),
    ("last-added", "Nově přidané"),
];

impl Filter {
    fn source(self, kind: Kind) -> ListSource {
        match self {
            Filter::Preset(p) => ListSource::List(kind, p),
            Filter::Genre(g) => ListSource::Genre(kind, g),
        }
    }
}

impl App {
    pub(super) fn browse(&mut self, ui: &mut Ui, screen: Rect, kind: Kind) {
        let filter = *self
            .browse_filter
            .get(&kind)
            .unwrap_or(&Filter::Preset("popular"));
        let source = filter.source(kind);
        let paged = self.paged(&source);
        let queued = self.my_queue_set(kind);
        let stage = self.hero.clone();
        self.stage.show(
            ui,
            screen,
            stage.as_ref().and_then(|h| h.backdrop.as_deref()),
            StageMode::Dim,
        );

        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        let mut picked_filter = None;
        let mut hovered: Option<ItemRef> = None;
        let mut clicked: Option<ItemRef> = None;
        let mut near_end = false;
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            let out = egui::ScrollArea::vertical()
                .id_salt(("browse", kind.key()))
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    let width = ui.available_width() - 2.0 * theme::GUTTER;
                    ui.horizontal(|ui| {
                        ui.add_space(theme::GUTTER);
                        ui.vertical(|ui| {
                            ui.add_space(8.0);
                            widgets::display(
                                ui,
                                if kind == Kind::Movie {
                                    "Filmy"
                                } else {
                                    "Seriály"
                                },
                                44.0,
                                width,
                            );
                            ui.add_space(6.0);
                            ui.set_max_width(width);
                            ui.horizontal_wrapped(|ui| {
                                ui.spacing_mut().item_spacing = egui::vec2(10.0, 10.0);
                                for (id, label) in PRESETS {
                                    if widgets::chip(ui, label, filter == Filter::Preset(id))
                                        .clicked()
                                    {
                                        picked_filter = Some(Filter::Preset(id));
                                    }
                                }
                                for (id, label) in GENRES {
                                    if widgets::chip(ui, label, filter == Filter::Genre(id))
                                        .clicked()
                                    {
                                        picked_filter = Some(Filter::Genre(id));
                                    }
                                }
                            });
                            ui.add_space(22.0);

                            // Mřížka.
                            let card = Layout::Poster.size();
                            let gap = 22.0;
                            let cols = (((width + gap) / (card.x + gap)).floor() as usize).max(1);
                            if paged.loading && paged.items.is_empty() {
                                for _ in 0..2 {
                                    ui.horizontal(|ui| {
                                        ui.spacing_mut().item_spacing.x = gap;
                                        for _ in 0..cols {
                                            widgets::card_skeleton(ui, Layout::Poster);
                                        }
                                    });
                                }
                            }
                            for chunk in paged.items.chunks(cols) {
                                ui.horizontal(|ui| {
                                    ui.spacing_mut().item_spacing.x = gap;
                                    for item in chunk {
                                        let opts = CardOptions {
                                            queued: queued.contains(&item.id),
                                            below: true,
                                            in_serial: false,
                                        };
                                        let r = widgets::card(ui, item, Layout::Poster, &opts);
                                        if r.hovered() {
                                            hovered = Some(item.clone());
                                        }
                                        if r.clicked() {
                                            clicked = Some(item.clone());
                                        }
                                    }
                                });
                                ui.add_space(14.0);
                            }
                            if let Some(e) = &paged.error {
                                ui.label(egui::RichText::new(e).color(theme::ERROR));
                            } else if !paged.loading && paged.items.is_empty() {
                                ui.label(
                                    egui::RichText::new("Nic tu není.")
                                        .font(theme::regular(18.0))
                                        .color(INK_3),
                                );
                            }
                            if paged.loading && !paged.items.is_empty() {
                                ui.add(egui::Spinner::new().size(28.0));
                            }
                            ui.add_space(60.0);
                        });
                    });
                });
            let max = (out.content_size.y - out.inner_rect.height()).max(0.0);
            near_end = max - out.state.offset.y < out.inner_rect.height();
        });
        if near_end {
            self.more(&source, &paged);
        }
        if let Some(f) = picked_filter {
            self.browse_filter.insert(kind, f);
        }
        if hovered.is_some() {
            self.hero = hovered;
        }
        if let Some(item) = clicked {
            self.open(&item);
        }
    }
}
