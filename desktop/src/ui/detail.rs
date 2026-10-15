//! Detail filmu a seriálu: fanart přes celé okno, informace vlevo,
//! u seriálu série a epizody.

use std::sync::Arc;

use eframe::egui::{self, Rect, Ui, pos2, vec2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::theme::{self, INK, INK_2, INK_3};
use super::widgets::{self, Layout};
use super::{App, ItemRef, LIST_TTL};
use crate::api::{Item, Kind, SerialDetail, episode_code};
use crate::data::Load;

enum Action {
    Back,
    Play(ItemRef),
    Queue(ItemRef, bool),
    Season(u32),
    Retry,
}

impl App {
    fn back_button(ui: &mut Ui, actions: &mut Vec<Action>) {
        if widgets::icon_button(ui, "⏴", 48.0)
            .on_hover_text("Zpět (Esc)")
            .clicked()
        {
            actions.push(Action::Back);
        }
        ui.add_space(10.0);
    }

    /// Tlačítko Chci vidět / V seznamu a pod ním, kdo z profilů titul chce.
    fn queue_controls(&mut self, item: &ItemRef) -> Option<(bool, Option<String>)> {
        if !self.is_logged_in() {
            return None;
        }
        let queued = self.is_my_queued(item);
        let on_server = self
            .queue_ids(item.kind)
            .is_some_and(|s| s.contains(&item.id));
        let note = self
            .profiles()
            .filter(|p| p.profiles.len() > 1 && on_server)
            .map(|p| {
                let owners: Vec<&str> = p
                    .owners_of(item.kind, item.id)
                    .iter()
                    .map(|o| o.name.as_str())
                    .collect();
                if owners.is_empty() {
                    "Ve společném seznamu (přidáno na webu nebo jinde)".to_owned()
                } else {
                    format!("Chce vidět: {}", owners.join(", "))
                }
            });
        Some((queued, note))
    }

    fn run(&mut self, actions: Vec<Action>, serial_id: Option<u64>, retry_key: &str) {
        for a in actions {
            match a {
                Action::Back => self.back(),
                Action::Play(item) => self.play(&item, serial_id),
                Action::Queue(item, q) => self.toggle_queue(&item, q),
                Action::Season(n) => {
                    if let Some(id) = serial_id {
                        self.season.insert(id, n);
                    }
                }
                Action::Retry => self.data.retry(retry_key),
            }
        }
    }

    pub(super) fn movie_detail(&mut self, ui: &mut Ui, screen: Rect, id: u64) {
        let key = format!("movie/{id}");
        let client = self.client.clone();
        let load: Load<ItemRef> = self.data.get(&key, LIST_TTL, move || async move {
            client.movie(id).await.map_err(|e| e.to_string())
        });
        let known = self.known.get(&(Kind::Movie, id)).cloned();
        let movie = load.ready().map(|m| Arc::clone(m.as_ref())).or(known);
        let mut actions = Vec::new();
        let Some(movie) = movie else {
            self.detail_placeholder(ui, screen, &load, &mut actions);
            self.run(actions, None, &key);
            return;
        };
        let queue = self.queue_controls(&movie);
        self.stage.show(
            ui,
            screen,
            movie.backdrop.as_deref().or(movie.poster.as_deref()),
            StageMode::Full,
        );

        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            egui::ScrollArea::vertical()
                .id_salt(("detail", key.as_str()))
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.add_space(theme::GUTTER);
                        ui.vertical(|ui| {
                            let w = (screen.width() * 0.5).clamp(420.0, 760.0);
                            ui.set_max_width(w);
                            Self::back_button(ui, &mut actions);
                            widgets::eyebrow(ui, "Film");
                            widgets::display(ui, &movie.title, 56.0, w);
                            if let Some(o) = &movie.original_title {
                                ui.label(
                                    egui::RichText::new(o)
                                        .font(theme::regular(17.0))
                                        .color(INK_2),
                                );
                            }
                            widgets::meta_line(ui, &movie, false);
                            widgets::language_line(ui, &movie);
                            if let Some(d) = &movie.description {
                                ui.add_space(4.0);
                                widgets::paragraph(ui, d, theme::regular(18.0), INK_2, w, 6);
                            }
                            ui.add_space(14.0);
                            let resume =
                                movie.watch.position.unwrap_or(0.0) > 10.0 && !movie.watch.finished;
                            ui.horizontal(|ui| {
                                let label = match (resume, super::format::remaining(&movie)) {
                                    (true, Some(r)) => format!("Pokračovat · {r}"),
                                    (true, None) => "Pokračovat".into(),
                                    _ => "Přehrát".into(),
                                };
                                let progress = resume.then_some(movie.watch.progress);
                                if widgets::button_ex(ui, &label, Some("▶"), true, progress, true)
                                    .clicked()
                                {
                                    actions.push(Action::Play(Arc::clone(&movie)));
                                }
                                queue_button(ui, &movie, queue.as_ref().map(|q| q.0), &mut actions);
                            });
                            if let Some((_, Some(note))) = &queue {
                                ui.label(
                                    egui::RichText::new(note)
                                        .font(theme::regular(15.0))
                                        .color(INK_3),
                                );
                            }
                            ui.add_space(18.0);
                            credits(ui, &movie, w);
                            ui.add_space(60.0);
                        });
                    });
                });
        });
        self.run(actions, None, &key);
    }

    pub(super) fn serial_detail(&mut self, ui: &mut Ui, screen: Rect, id: u64) {
        let key = format!("serial/{id}");
        let known = self.known.get(&(Kind::Serial, id)).cloned();
        let client = self.client.clone();
        let initial = known.clone();
        let load: Load<(ItemRef, SerialDetail)> =
            self.data.get(&key, LIST_TTL, move || async move {
                client.serial(id, initial).await.map_err(|e| e.to_string())
            });
        let serial = load.ready().map(|d| Arc::clone(&d.0)).or(known);
        let detail = load.ready().map(|d| d.1.clone());
        let mut actions = Vec::new();
        let Some(serial) = serial else {
            self.detail_placeholder(ui, screen, &load, &mut actions);
            self.run(actions, Some(id), &key);
            return;
        };
        let queue = self.queue_controls(&serial);
        self.stage.show(
            ui,
            screen,
            serial.backdrop.as_deref().or(serial.poster.as_deref()),
            StageMode::Full,
        );

        let next = detail.as_ref().and_then(SerialDetail::continue_episode);
        let first_season = detail
            .as_ref()
            .and_then(|d| d.seasons.first())
            .map_or(1, |s| s.number);
        let active_season = self
            .season
            .get(&id)
            .copied()
            .or(next.as_ref().map(|n| n.season))
            .unwrap_or(first_season);
        let episodes: Vec<ItemRef> = detail
            .as_ref()
            .and_then(|d| d.seasons.iter().find(|s| s.number == active_season))
            .map(|s| s.episodes.clone())
            .unwrap_or_default();
        let season_numbers: Vec<u32> = detail
            .as_ref()
            .map(|d| d.seasons.iter().map(|s| s.number).collect())
            .unwrap_or_default();

        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        let mut picked: Option<ItemRef> = None;
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            egui::ScrollArea::vertical()
                .id_salt(("detail", key.as_str()))
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        ui.add_space(theme::GUTTER);
                        ui.vertical(|ui| {
                            let w = (screen.width() * 0.5).clamp(420.0, 760.0);
                            ui.set_max_width(w);
                            Self::back_button(ui, &mut actions);
                            widgets::eyebrow(ui, "Seriál");
                            widgets::display(ui, &serial.title, 56.0, w);
                            if let Some(o) = &serial.original_title {
                                ui.label(
                                    egui::RichText::new(o)
                                        .font(theme::regular(17.0))
                                        .color(INK_2),
                                );
                            }
                            let mut meta = (*serial).clone();
                            if meta.season_count.is_none() && !season_numbers.is_empty() {
                                meta.season_count = Some(season_numbers.len() as u32);
                            }
                            widgets::meta_line(ui, &meta, true);
                            widgets::language_line(ui, &serial);
                            if let Some(d) = &serial.description {
                                ui.add_space(4.0);
                                widgets::paragraph(ui, d, theme::regular(18.0), INK_2, w, 5);
                            }
                            ui.add_space(14.0);
                            ui.horizontal(|ui| {
                                match &next {
                                    Some(ep) => {
                                        let started = ep.watch.position.unwrap_or(0.0) > 0.0
                                            || ep.episode > 1
                                            || ep.season > first_season;
                                        let label = format!(
                                            "{} {}",
                                            if started { "Pokračovat" } else { "Přehrát" },
                                            episode_code(ep.season, ep.episode)
                                        );
                                        let progress =
                                            (ep.watch.progress > 0.0).then_some(ep.watch.progress);
                                        if widgets::button_ex(
                                            ui,
                                            &label,
                                            Some("▶"),
                                            true,
                                            progress,
                                            true,
                                        )
                                        .clicked()
                                        {
                                            actions.push(Action::Play(Arc::clone(ep)));
                                        }
                                    }
                                    None => {
                                        let failed = matches!(load, Load::Failed(_));
                                        let label = if failed {
                                            "Epizody se nenačetly · zkusit znovu"
                                        } else {
                                            "Načítám epizody…"
                                        };
                                        if widgets::button_ex(ui, label, None, true, None, failed)
                                            .clicked()
                                        {
                                            actions.push(Action::Retry);
                                        }
                                    }
                                }
                                queue_button(
                                    ui,
                                    &serial,
                                    queue.as_ref().map(|q| q.0),
                                    &mut actions,
                                );
                            });
                            if let Some((_, Some(note))) = &queue {
                                ui.label(
                                    egui::RichText::new(note)
                                        .font(theme::regular(15.0))
                                        .color(INK_3),
                                );
                            }
                            if let Some(ep) = &next {
                                let dur = super::format::duration(ep.duration)
                                    .map(|d| format!(" · {d}"))
                                    .unwrap_or_default();
                                ui.label(
                                    egui::RichText::new(format!(
                                        "{} · {}{dur}",
                                        episode_code(ep.season, ep.episode),
                                        ep.episode_title
                                    ))
                                    .font(theme::regular(15.0))
                                    .color(INK_3),
                                );
                            }
                        });
                    });
                    ui.add_space(20.0);
                    if season_numbers.len() > 1 {
                        ui.horizontal_wrapped(|ui| {
                            ui.add_space(theme::GUTTER);
                            ui.spacing_mut().item_spacing = vec2(10.0, 10.0);
                            for n in &season_numbers {
                                if widgets::chip(ui, &format!("{n}. série"), *n == active_season)
                                    .clicked()
                                {
                                    actions.push(Action::Season(*n));
                                }
                            }
                        });
                        ui.add_space(6.0);
                    }
                    let none = |_: &Item| false;
                    let out = widgets::row(
                        ui,
                        &format!("episodes-{id}-{active_season}"),
                        "Epizody",
                        &episodes,
                        Layout::Wide,
                        detail.is_none(),
                        &none,
                        true,
                    );
                    picked = out.clicked;
                    ui.add_space(60.0);
                });
        });
        if let Some(ep) = picked {
            actions.push(Action::Play(ep));
        }
        self.run(actions, Some(id), &key);
    }

    fn detail_placeholder<T>(
        &mut self,
        ui: &mut Ui,
        screen: Rect,
        load: &Load<T>,
        actions: &mut Vec<Action>,
    ) {
        self.stage.show(ui, screen, None, StageMode::Dim);
        let content = Rect::from_min_max(
            pos2(screen.left() + theme::GUTTER, screen.top() + CONTENT_TOP),
            screen.max,
        );
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            Self::back_button(ui, actions);
            match load {
                Load::Failed(e) => {
                    ui.label(
                        egui::RichText::new(e)
                            .font(theme::regular(18.0))
                            .color(theme::ERROR),
                    );
                    if widgets::button(ui, "Zkusit znovu", None, false).clicked() {
                        actions.push(Action::Retry);
                    }
                }
                _ => {
                    ui.add(egui::Spinner::new().size(36.0));
                }
            }
        });
    }
}

fn queue_button(ui: &mut Ui, item: &ItemRef, queued: Option<bool>, actions: &mut Vec<Action>) {
    let Some(queued) = queued else {
        return;
    };
    let (label, icon) = if queued {
        ("V seznamu", "✔")
    } else {
        ("Chci vidět", "+")
    };
    if widgets::button(ui, label, Some(icon), false).clicked() {
        actions.push(Action::Queue(Arc::clone(item), !queued));
    }
}

/// Režie, scénář, herci, země.
fn credits(ui: &mut Ui, item: &Item, width: f32) {
    let rows = [
        ("Režie", &item.directors),
        ("Scénář", &item.writers),
        ("Hrají", &item.cast),
        ("Země", &item.countries),
    ];
    egui::Grid::new(("credits", item.id))
        .num_columns(2)
        .spacing(vec2(24.0, 8.0))
        .show(ui, |ui| {
            for (label, values) in rows.iter().filter(|(_, v)| !v.is_empty()) {
                ui.label(
                    egui::RichText::new(*label)
                        .font(theme::regular(15.0))
                        .color(INK_3),
                );
                let text: Vec<&str> = values.iter().take(6).map(String::as_str).collect();
                widgets::paragraph(
                    ui,
                    &text.join(", "),
                    theme::regular(15.0),
                    INK,
                    width - 120.0,
                    2,
                );
                ui.end_row();
            }
        });
}
