//! Co je kolem obrazovek: úvodní animace, pozadí s fanartem, plovoucí
//! navigace a obrazovka "Co je nového" po aktualizaci.

use std::time::{Duration, Instant};

use eframe::egui::{
    self, Align2, Color32, CursorIcon, Rect, Sense, Stroke, StrokeKind, Ui, pos2, vec2,
};

use super::theme::{self, INK, INK_2};
use super::widgets;
use super::{App, Route, changelog};
use crate::titlebar;

/* ---------------- Úvodní obrazovka ---------------- */

/// Stejná animace jako splash v index.html: kruh se nakreslí, Play vyskočí,
/// nápis vyjede zespodu. Zmizí, až je aplikace připravená, nejdřív po 1,5 s.
pub struct Splash {
    started: Instant,
    ready_at: Option<Instant>,
}

const SPLASH_MIN: Duration = Duration::from_millis(1500);
/// Když discovery domén trvá, nečekat na ni věčně.
const SPLASH_MAX: Duration = Duration::from_millis(4000);
const SPLASH_FADE: f32 = 0.45;

impl Splash {
    pub fn new(ready: bool) -> Self {
        let now = Instant::now();
        Self {
            started: now,
            ready_at: ready.then_some(now),
        }
    }

    pub fn discovered(&mut self) {
        self.ready_at.get_or_insert_with(Instant::now);
    }

    /// Kdy začne mizet.
    fn fade_start(&self) -> Option<Instant> {
        let earliest = self.started + SPLASH_MIN;
        match self.ready_at {
            Some(r) => Some(r.max(earliest)),
            None if self.started.elapsed() > SPLASH_MAX => Some(self.started + SPLASH_MAX),
            None => None,
        }
    }

    pub fn fading(&self) -> bool {
        self.fade_start().is_some_and(|t| Instant::now() >= t)
    }

    /// 0 = plně vidět, 1 = pryč.
    pub fn progress(&self) -> f32 {
        match self.fade_start() {
            Some(t) if Instant::now() >= t => (t.elapsed().as_secs_f32() / SPLASH_FADE).min(1.0),
            _ => 0.0,
        }
    }

    pub fn show(&self, ui: &mut Ui, screen: Rect) {
        let fade = ease(self.progress());
        let t = self.started.elapsed().as_secs_f32();
        let alpha = 1.0 - fade;
        ui.painter()
            .rect_filled(screen, 0.0, theme::BG.gamma_multiply(alpha));
        ui.scope(|ui| {
            ui.multiply_opacity(alpha);
            let scale = 1.0 + 0.06 * fade;
            let size = (screen.height().min(screen.width()) * 0.14).clamp(88.0, 150.0) * scale;
            let c = screen.center() - vec2(0.0, size * 0.45);
            // Záře za logem pulzuje od 0,9 s.
            if t > 0.9 {
                let pulse = (((t - 0.9) / 2.4) * std::f32::consts::TAU).sin() * 0.5 + 0.5;
                for i in 0..6 {
                    let r = size * (0.45 + 0.08 * i as f32) * (0.95 + 0.15 * pulse);
                    ui.painter()
                        .circle_filled(c, r, theme::ORANGE.gamma_multiply(0.035 * pulse));
                }
            }
            let draw = ease(((t - 0.12) / 1.1).clamp(0.0, 1.0));
            let pop = spring(((t - 0.65) / 0.7).clamp(0.0, 1.0));
            widgets::logo_mark(ui, c, size, draw, pop);

            let rise = ease(((t - 0.75) / 0.8).clamp(0.0, 1.0));
            let word_y = c.y + size * 0.62 + 40.0 * (1.0 - rise);
            widgets::wordmark(
                ui,
                pos2(c.x, word_y),
                (size * 0.3).clamp(26.0, 44.0),
                Align2::CENTER_TOP,
                rise,
            );

            // Ukazatel načítání.
            let bar_alpha = ((t - 1.1) / 0.4).clamp(0.0, 1.0);
            if bar_alpha > 0.0 {
                let w = (size * 1.2).clamp(120.0, 180.0);
                let track = Rect::from_center_size(pos2(c.x, word_y + 84.0), vec2(w, 2.0));
                ui.painter().rect_filled(
                    track,
                    1.0,
                    Color32::from_white_alpha((20.0 * bar_alpha) as u8),
                );
                let k = ((t - 1.1) / 1.2).fract();
                let x = track.left() + track.width() * (-0.4 + 1.4 * ease(k));
                let seg = Rect::from_min_max(
                    pos2(x.max(track.left()), track.top()),
                    pos2((x + w * 0.4).min(track.right()), track.bottom()),
                );
                if seg.width() > 0.0 {
                    widgets::horizontal_gradient(
                        ui,
                        seg,
                        theme::AMBER.gamma_multiply(bar_alpha),
                        theme::PINK.gamma_multiply(bar_alpha),
                    );
                }
            }
        });
        ui.ctx().request_repaint();
    }
}

fn ease(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    1.0 - (1.0 - t).powi(3)
}

/// Pružný dojezd jako cubic-bezier(0.34, 1.56, 0.64, 1).
fn spring(t: f32) -> f32 {
    if t <= 0.0 {
        return 0.0;
    }
    1.0 + 2.2 * (t - 1.0).powi(3) + 1.2 * (t - 1.0).powi(2)
}

/* ---------------- Pozadí ---------------- */

#[derive(Clone, Copy, PartialEq)]
pub enum StageMode {
    /// Home: fanart nahoře vpravo, plně.
    Hero,
    /// Detail: fanart přes celé okno.
    Full,
    /// Seznamy: jen tlumený nádech.
    Dim,
}

/// Fanart vybraného titulu za obsahem, s prolnutím při změně.
#[derive(Default)]
pub struct Stage {
    current: Option<String>,
    previous: Option<String>,
    changed: Option<Instant>,
}

const STAGE_FADE: f32 = 0.6;

impl Stage {
    pub fn show(&mut self, ui: &mut Ui, screen: Rect, url: Option<&str>, mode: StageMode) {
        if url.is_some() && url != self.current.as_deref() {
            self.previous = self.current.take();
            self.current = url.map(str::to_owned);
            self.changed = Some(Instant::now());
        }
        let t = self
            .changed
            .map_or(1.0, |c| (c.elapsed().as_secs_f32() / STAGE_FADE).min(1.0));
        if t < 1.0 {
            ui.ctx().request_repaint();
        }
        let opacity = match mode {
            StageMode::Hero => 1.0,
            StageMode::Full => 0.85,
            StageMode::Dim => 0.28,
        };
        let rect = match mode {
            StageMode::Hero => Rect::from_min_max(
                pos2(screen.left() + screen.width() * 0.28, screen.top()),
                pos2(screen.right(), screen.top() + screen.height() * 0.78),
            ),
            _ => screen,
        };
        if let Some(prev) = &self.previous
            && t < 1.0
        {
            widgets::cover_image(ui, prev, rect, 0, opacity * (1.0 - t));
        }
        if let Some(cur) = &self.current {
            widgets::cover_image(ui, cur, rect, 0, opacity * ease(t));
        }
        let bg = theme::BG;
        match mode {
            StageMode::Hero => {
                // Vlevo do černa kvůli textu, dole do pozadí řad.
                let fade_w = rect.width() * 0.55;
                widgets::horizontal_gradient(
                    ui,
                    Rect::from_min_size(rect.min, vec2(fade_w, rect.height())),
                    bg,
                    Color32::TRANSPARENT,
                );
                widgets::vertical_gradient(
                    ui,
                    Rect::from_min_max(
                        pos2(rect.left(), rect.bottom() - rect.height() * 0.5),
                        rect.max,
                    ),
                    Color32::TRANSPARENT,
                    bg,
                );
                widgets::vertical_gradient(
                    ui,
                    Rect::from_min_size(rect.min, vec2(rect.width(), 140.0)),
                    bg.gamma_multiply(0.7),
                    Color32::TRANSPARENT,
                );
            }
            StageMode::Full => {
                widgets::horizontal_gradient(
                    ui,
                    Rect::from_min_size(screen.min, vec2(screen.width() * 0.7, screen.height())),
                    bg.gamma_multiply(0.95),
                    Color32::TRANSPARENT,
                );
                widgets::vertical_gradient(
                    ui,
                    Rect::from_min_max(pos2(screen.left(), screen.center().y), screen.max),
                    Color32::TRANSPARENT,
                    bg,
                );
            }
            StageMode::Dim => {
                widgets::vertical_gradient(ui, screen, bg.gamma_multiply(0.4), bg);
            }
        }
    }
}

/* ---------------- Navigace ---------------- */

const TABS: &[(&str, Route)] = &[
    ("Domů", Route::Home),
    ("Filmy", Route::Movies),
    ("Seriály", Route::Serials),
    ("Můj seznam", Route::My),
];

/// Kam začíná obsah pod navigací.
pub const CONTENT_TOP: f32 = titlebar::HEIGHT + 84.0;

impl App {
    /// Plovoucí skleněný ostrov nahoře uprostřed, logo vlevo.
    pub(super) fn nav_bar(&mut self, ui: &mut Ui, screen: Rect) {
        let top = screen.top() + titlebar::HEIGHT + 14.0;
        let ctx = ui.ctx().clone();
        egui::Area::new(egui::Id::new("nav"))
            .order(egui::Order::Foreground)
            .fixed_pos(screen.min)
            .show(&ctx, |ui| {
                ui.set_clip_rect(screen);
                // Logo vlevo.
                let logo_c = pos2(screen.left() + theme::GUTTER + 18.0, top + 26.0);
                let logo_rect = Rect::from_center_size(logo_c, egui::Vec2::splat(40.0));
                widgets::logo_mark(ui, logo_c, 40.0, 1.0, 1.0);
                if screen.width() > 1180.0 {
                    widgets::wordmark(
                        ui,
                        pos2(logo_c.x + 30.0, logo_c.y),
                        21.0,
                        Align2::LEFT_CENTER,
                        1.0,
                    );
                }
                if ui
                    .interact(logo_rect, egui::Id::new("nav-logo"), Sense::click())
                    .on_hover_cursor(CursorIcon::PointingHand)
                    .clicked()
                {
                    self.tab(Route::Home);
                }

                // Rozměry položek.
                let font = theme::semibold(17.0);
                let labels: Vec<_> = TABS
                    .iter()
                    .map(|(l, _)| {
                        ui.painter()
                            .layout_no_wrap((*l).to_owned(), font.clone(), INK)
                    })
                    .collect();
                let pad = 22.0;
                let icon_w = 44.0;
                let gap = 4.0;
                let width = 8.0
                    + icon_w
                    + gap
                    + labels
                        .iter()
                        .map(|g| g.size().x + 2.0 * pad + gap)
                        .sum::<f32>()
                    + icon_w
                    + 8.0;
                let bar =
                    Rect::from_center_size(pos2(screen.center().x, top + 26.0), vec2(width, 52.0));
                let p = ui.painter();
                p.rect_filled(
                    bar.translate(vec2(0.0, 8.0)).expand(2.0),
                    30.0,
                    Color32::from_black_alpha(60),
                );
                p.rect_filled(bar, 26.0, Color32::from_rgba_unmultiplied(28, 28, 32, 222));
                p.rect_stroke(
                    bar,
                    26.0,
                    Stroke::new(1.0, theme::HAIR_STRONG),
                    StrokeKind::Inside,
                );

                let current = std::mem::discriminant(&self.route);
                let active = |r: &Route| std::mem::discriminant(r) == current;
                let mut x = bar.left() + 8.0;
                let item_rect =
                    |x: f32, w: f32| Rect::from_min_size(pos2(x, bar.top() + 6.0), vec2(w, 40.0));

                // Hledat.
                let r = item_rect(x, icon_w);
                if nav_item(ui, r, "nav-search", "🔍", active(&Route::Search), true) {
                    self.tab(Route::Search);
                    self.search.focus = true;
                }
                x += icon_w + gap;
                for ((label, route), galley) in TABS.iter().zip(labels) {
                    let w = galley.size().x + 2.0 * pad;
                    if nav_item(ui, item_rect(x, w), label, label, active(route), false) {
                        self.tab(route.clone());
                    }
                    x += w + gap;
                }
                // Profil: písmeno aktivního profilu.
                let initial = self.profile_initial();
                let r = item_rect(x, icon_w);
                let hover = ui.interact(r, egui::Id::new("nav-profile"), Sense::click());
                let on = active(&Route::Profile);
                let c = r.center();
                let p = ui.painter();
                if on || hover.hovered() {
                    p.circle_filled(
                        c,
                        20.0,
                        if hover.hovered() {
                            Color32::WHITE
                        } else {
                            Color32::from_white_alpha(40)
                        },
                    );
                }
                p.circle_filled(c, 15.0, theme::ORANGE);
                p.text(
                    c,
                    Align2::CENTER_CENTER,
                    initial,
                    theme::bold(14.0),
                    Color32::WHITE,
                );
                if hover.on_hover_cursor(CursorIcon::PointingHand).clicked() {
                    self.tab(Route::Profile);
                }
                // Nová verze ke stažení: tečka u profilu.
                if matches!(
                    super::update_status(&self.update),
                    crate::update::Status::Available(_)
                ) {
                    p.circle_filled(c + vec2(13.0, -13.0), 5.0, theme::GREEN);
                }
            });
    }

    pub(super) fn profile_initial(&mut self) -> String {
        self.profiles()
            .and_then(|p| p.active().name.trim().chars().next())
            .map_or_else(|| "?".into(), |c| c.to_uppercase().collect())
    }
}

/// Položka navigace. Vrací kliknutí.
fn nav_item(ui: &mut Ui, rect: Rect, id: &str, label: &str, active: bool, icon: bool) -> bool {
    let r = ui.interact(rect, egui::Id::new(("nav", id)), Sense::click());
    let hover = ui.ctx().animate_bool_with_time(r.id, r.hovered(), 0.12);
    let p = ui.painter();
    let (fill, ink) = if hover > 0.5 {
        (
            Color32::WHITE.gamma_multiply(hover),
            Color32::from_rgb(10, 10, 10),
        )
    } else if active {
        (Color32::from_white_alpha(36), INK)
    } else {
        (Color32::TRANSPARENT, INK_2)
    };
    p.rect_filled(rect, 20.0, fill);
    let font = if icon {
        theme::regular(17.0)
    } else {
        theme::semibold(17.0)
    };
    p.text(rect.center(), Align2::CENTER_CENTER, label, font, ink);
    r.on_hover_cursor(CursorIcon::PointingHand).clicked()
}

/* ---------------- Co je nového ---------------- */

impl App {
    pub(super) fn whats_new_screen(&mut self, ui: &mut Ui, screen: Rect) {
        let releases = changelog::unseen(self.stored.seen_version.as_deref());
        let width = 640.0f32.min(screen.width() - 2.0 * theme::GUTTER);
        let appear = ui
            .ctx()
            .animate_bool_with_time(egui::Id::new("whatsnew-in"), true, 0.6);
        let rect = Rect::from_center_size(
            screen.center() + vec2(0.0, 30.0 * (1.0 - appear)),
            vec2(width, screen.height() - 120.0),
        );
        let mut close = false;
        ui.scope_builder(egui::UiBuilder::new().max_rect(rect), |ui| {
            ui.multiply_opacity(appear);
            ui.vertical_centered(|ui| {
                widgets::bezel(ui, width, |ui| {
                    ui.vertical(|ui| {
                        let (r, _) = ui.allocate_exact_size(vec2(56.0, 56.0), Sense::hover());
                        widgets::logo_mark(ui, r.center(), 56.0, 1.0, 1.0);
                        ui.add_space(8.0);
                        widgets::eyebrow(
                            ui,
                            &format!("Aktualizace · verze {}", changelog::CURRENT),
                        );
                        widgets::display(ui, "Co je nového", 44.0, width);
                        ui.add_space(8.0);
                        for (i, item) in releases.iter().flat_map(|r| r.items.iter()).enumerate() {
                            let a = ui.ctx().animate_bool_with_time(
                                egui::Id::new(("whatsnew-item", i)),
                                appear > 0.3 + 0.1 * i as f32,
                                0.5,
                            );
                            ui.scope(|ui| {
                                ui.multiply_opacity(a);
                                let start = ui.cursor().min;
                                ui.horizontal(|ui| {
                                    ui.add_space(16.0);
                                    ui.vertical(|ui| {
                                        ui.label(
                                            egui::RichText::new(item.title)
                                                .font(theme::semibold(19.0))
                                                .color(INK),
                                        );
                                        widgets::paragraph(
                                            ui,
                                            item.text,
                                            theme::regular(16.0),
                                            INK_2,
                                            width - 140.0,
                                            6,
                                        );
                                    });
                                });
                                let end = ui.min_rect().bottom();
                                ui.painter().line_segment(
                                    [start + vec2(0.0, 2.0), pos2(start.x, end)],
                                    Stroke::new(2.0, theme::ORANGE),
                                );
                            });
                            ui.add_space(10.0);
                        }
                        ui.add_space(12.0);
                        if widgets::button(ui, "Pokračovat", Some("→"), true).clicked() {
                            close = true;
                        }
                    });
                });
            });
        });
        if close || ui.input(|i| i.key_pressed(egui::Key::Enter)) {
            self.dismiss_whats_new();
        }
    }
}
