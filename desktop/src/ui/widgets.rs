//! Sdílené prvky: obrázky, karty, řady, tlačítka, chipy, pole, meta řádek.
//! Vzhled podle komponent webové verze (Card.tsx, Row.tsx, Buttons.tsx, Meta.tsx).

use std::time::Duration;

use eframe::egui::{
    self, Align2, Color32, CornerRadius, CursorIcon, Id, Pos2, Rect, Response, Sense, Shape,
    Stroke, StrokeKind, TextureOptions, Ui, Vec2,
    epaint::RectShape,
    load::{SizeHint, TexturePoll},
    pos2, vec2,
};

use super::format;
use super::theme::{self, INK, INK_2, INK_3};
use crate::api::{Item, ItemRef, Kind, episode_code};

/// Jak dlouho se obrázek po načtení prolíná.
const IMAGE_FADE: f32 = 0.35;

/// Obrázek ořízne na `rect` (jako CSS `object-fit: cover`) a po načtení ho
/// prolne. Vrací, jestli už je vidět.
pub fn cover_image(
    ui: &Ui,
    url: &str,
    rect: Rect,
    radius: impl Into<CornerRadius>,
    opacity: f32,
) -> bool {
    let ctx = ui.ctx();
    let Ok(TexturePoll::Ready { texture }) =
        ctx.try_load_texture(url, TextureOptions::LINEAR, SizeHint::default())
    else {
        return false;
    };
    let fade_id = Id::new(("img-fade", url));
    let fade = ctx.animate_bool_with_time(fade_id, true, IMAGE_FADE);
    let size = texture.size;
    if size.x <= 0.0 || size.y <= 0.0 {
        return false;
    }
    let (want, have) = (rect.width() / rect.height(), size.x / size.y);
    let uv = if have > want {
        let w = want / have;
        Rect::from_min_max(pos2((1.0 - w) / 2.0, 0.0), pos2((1.0 + w) / 2.0, 1.0))
    } else {
        let h = have / want;
        // Plakáty a fanarty mívají to důležité nahoře, ořez bere spíš spodek.
        Rect::from_min_max(pos2(0.0, (1.0 - h) * 0.3), pos2(1.0, (1.0 - h) * 0.3 + h))
    };
    let tint = Color32::WHITE.gamma_multiply(fade * opacity);
    ui.painter()
        .add(RectShape::filled(rect, radius, tint).with_texture(texture.id, uv));
    true
}

/// Svislý přechod (shade) přes obrázek: nahoře `top`, dole `bottom`.
pub fn vertical_gradient(ui: &Ui, rect: Rect, top: Color32, bottom: Color32) {
    let mut mesh = egui::Mesh::default();
    mesh.colored_vertex(rect.left_top(), top);
    mesh.colored_vertex(rect.right_top(), top);
    mesh.colored_vertex(rect.right_bottom(), bottom);
    mesh.colored_vertex(rect.left_bottom(), bottom);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    ui.painter().add(Shape::mesh(mesh));
}

pub fn horizontal_gradient(ui: &Ui, rect: Rect, left: Color32, right: Color32) {
    let mut mesh = egui::Mesh::default();
    mesh.colored_vertex(rect.left_top(), left);
    mesh.colored_vertex(rect.right_top(), right);
    mesh.colored_vertex(rect.right_bottom(), right);
    mesh.colored_vertex(rect.left_bottom(), left);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    ui.painter().add(Shape::mesh(mesh));
}

/// Jednořádkový text, zkrácený na šířku třemi tečkami.
pub fn text_line(
    ui: &Ui,
    pos: Pos2,
    text: &str,
    font: egui::FontId,
    color: Color32,
    max_width: f32,
    align: Align2,
) -> Rect {
    let mut job = egui::text::LayoutJob::simple_singleline(text.to_owned(), font, color);
    job.wrap.max_width = max_width;
    job.wrap.max_rows = 1;
    job.wrap.break_anywhere = true;
    let galley = ui.painter().layout_job(job);
    let rect = align.anchor_size(pos, galley.size());
    ui.painter().galley(rect.min, galley, color);
    rect
}

/// Odstavec zalomený na šířku, nejvýš `rows` řádků.
pub fn paragraph(
    ui: &mut Ui,
    text: &str,
    font: egui::FontId,
    color: Color32,
    width: f32,
    rows: usize,
) -> Response {
    let mut job = egui::text::LayoutJob::simple(text.to_owned(), font, color, width);
    job.wrap.max_rows = rows;
    let galley = ui.painter().layout_job(job);
    let (rect, response) = ui.allocate_exact_size(galley.size(), Sense::hover());
    ui.painter().galley(rect.min, galley, color);
    response
}

/* ---------------- Tlačítka ---------------- */

/// Pilulka jako `.btn` na webu. `primary` = bílá, jinak sklo.
pub fn button(ui: &mut Ui, label: &str, icon: Option<&str>, primary: bool) -> Response {
    button_ex(ui, label, icon, primary, None, true)
}

/// `progress` (0–1) je tenký průběh ve spodku tlačítka (Pokračovat).
pub fn button_ex(
    ui: &mut Ui,
    label: &str,
    icon: Option<&str>,
    primary: bool,
    progress: Option<f32>,
    enabled: bool,
) -> Response {
    let font = theme::semibold(17.0);
    let galley = ui.painter().layout_no_wrap(label.to_owned(), font, INK);
    let orb = if icon.is_some() { 34.0 } else { 0.0 };
    let height = 50.0;
    let width = galley.size().x + 44.0 + if orb > 0.0 { orb + 6.0 } else { 0.0 };
    let (rect, response) = ui.allocate_exact_size(
        vec2(width, height),
        if enabled {
            Sense::click()
        } else {
            Sense::hover()
        },
    );
    let hover = ui.ctx().animate_bool_with_time(
        response.id.with("hover"),
        enabled && response.hovered(),
        0.15,
    );
    let rect = rect.expand(hover * 1.5);
    let (fill, text) = if primary {
        (
            Color32::WHITE.gamma_multiply(0.92 + 0.08 * hover),
            Color32::from_rgb(10, 10, 10),
        )
    } else {
        (Color32::from_white_alpha((22.0 + 24.0 * hover) as u8), INK)
    };
    let painter = ui.painter();
    let alpha = if enabled { 1.0 } else { 0.5 };
    painter.rect_filled(rect, height / 2.0, fill.gamma_multiply(alpha));
    if !primary {
        painter.rect_stroke(
            rect,
            height / 2.0,
            Stroke::new(1.0, theme::HAIR_STRONG),
            StrokeKind::Inside,
        );
    }
    painter.text(
        pos2(rect.left() + 22.0, rect.center().y),
        Align2::LEFT_CENTER,
        label,
        theme::semibold(17.0),
        text.gamma_multiply(alpha),
    );
    if let Some(icon) = icon {
        let c = pos2(rect.right() - 8.0 - orb / 2.0, rect.center().y);
        let orb_fill = if primary {
            Color32::from_black_alpha(20)
        } else {
            Color32::from_white_alpha(18)
        };
        painter.circle_filled(c, orb / 2.0, orb_fill);
        painter.text(
            c,
            Align2::CENTER_CENTER,
            icon,
            theme::bold(15.0),
            text.gamma_multiply(alpha),
        );
    }
    if let Some(p) = progress.filter(|p| *p > 0.0) {
        let track = Rect::from_min_size(
            pos2(rect.left() + 22.0, rect.bottom() - 9.0),
            vec2(rect.width() - 44.0 - orb, 3.0),
        );
        painter.rect_filled(track, 2.0, Color32::from_black_alpha(40));
        painter.rect_filled(
            Rect::from_min_size(track.min, vec2(track.width() * p.min(1.0), 3.0)),
            2.0,
            theme::ORANGE,
        );
    }
    if enabled {
        response.on_hover_cursor(CursorIcon::PointingHand)
    } else {
        response
    }
}

/// Kulaté ikonové tlačítko (Zpět, šipky řad).
pub fn icon_button(ui: &mut Ui, icon: &str, size: f32) -> Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(size), Sense::click());
    paint_icon_button(ui, rect, icon, response.hovered());
    response.on_hover_cursor(CursorIcon::PointingHand)
}

pub fn paint_icon_button(ui: &Ui, rect: Rect, icon: &str, hovered: bool) {
    let p = ui.painter();
    let fill = if hovered {
        Color32::WHITE
    } else {
        Color32::from_rgba_unmultiplied(30, 30, 34, 230)
    };
    let ink = if hovered {
        Color32::from_rgb(10, 10, 10)
    } else {
        INK
    };
    p.circle_filled(rect.center(), rect.width() / 2.0, fill);
    p.circle_stroke(
        rect.center(),
        rect.width() / 2.0,
        Stroke::new(1.0, theme::HAIR_STRONG),
    );
    p.text(
        rect.center(),
        Align2::CENTER_CENTER,
        icon,
        theme::bold(rect.width() * 0.4),
        ink,
    );
}

/// Chip jako `.chip` (filtry, série, profily).
pub fn chip(ui: &mut Ui, label: &str, selected: bool) -> Response {
    let galley = ui
        .painter()
        .layout_no_wrap(label.to_owned(), theme::semibold(15.0), INK);
    let size = vec2(galley.size().x + 36.0, 40.0);
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    let hover =
        ui.ctx()
            .animate_bool_with_time(response.id.with("hover"), response.hovered(), 0.12);
    let p = ui.painter();
    let (fill, ink) = if selected {
        (Color32::from_white_alpha(41), INK)
    } else {
        (
            Color32::from_white_alpha((10.0 + 18.0 * hover) as u8),
            if hover > 0.5 { INK } else { INK_2 },
        )
    };
    p.rect_filled(rect, 20.0, fill);
    if selected {
        p.rect_stroke(
            rect,
            20.0,
            Stroke::new(1.0, theme::HAIR_STRONG),
            StrokeKind::Inside,
        );
    }
    p.text(
        rect.center(),
        Align2::CENTER_CENTER,
        label,
        theme::semibold(15.0),
        ink,
    );
    response.on_hover_cursor(CursorIcon::PointingHand)
}

/// Textové pole jako `.input`. Vrací odpověď a jestli padl Enter.
pub fn input(
    ui: &mut Ui,
    id: &str,
    value: &mut String,
    hint: &str,
    password: bool,
    width: f32,
) -> (Response, bool) {
    let frame = egui::Frame::new()
        .fill(Color32::from_white_alpha(14))
        .stroke(Stroke::new(1.0, theme::HAIR_STRONG))
        .corner_radius(16)
        .inner_margin(egui::Margin::symmetric(18, 15));
    let response = egui::TextEdit::singleline(value)
        .id_salt(id)
        .hint_text(egui::RichText::new(hint).color(INK_3))
        .password(password)
        .font(theme::regular(18.0))
        .text_color(INK)
        .frame(frame)
        .desired_width(width - 38.0)
        .show(ui)
        .response
        .response;
    let enter = response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
    (response, enter)
}

/* ---------------- Karty ---------------- */

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Layout {
    /// Plakát 2:3.
    Poster,
    /// Široká karta 16:9 (pokračovat, epizody).
    Wide,
}

impl Layout {
    pub fn size(self) -> Vec2 {
        match self {
            Layout::Poster => vec2(176.0, 264.0),
            Layout::Wide => vec2(336.0, 189.0),
        }
    }
}

pub struct CardOptions {
    pub queued: bool,
    /// Popisek pod kartou (mřížka ve Filmech a Seriálech).
    pub below: bool,
    /// Na stránce seriálu: místo názvu seriálu název epizody.
    pub in_serial: bool,
}

/// Karta titulu. Při najetí se zvětší a dostane bílý rámeček.
pub fn card(ui: &mut Ui, item: &Item, layout: Layout, opts: &CardOptions) -> Response {
    let size = layout.size();
    let below = if opts.below { 52.0 } else { 0.0 };
    let (outer, response) = ui.allocate_exact_size(size + vec2(0.0, below), Sense::click());
    let frame_rect = Rect::from_min_size(outer.min, size);
    let lift = ui
        .ctx()
        .animate_bool_with_time(response.id.with("lift"), response.hovered(), 0.18);
    let rect = frame_rect.expand(lift * 6.0);
    let radius = theme::RADIUS;
    let p = ui.painter();

    // Stín a podklad.
    if lift > 0.0 {
        p.rect_filled(
            rect.translate(vec2(0.0, 10.0)).expand(4.0),
            radius + 4,
            Color32::from_black_alpha((90.0 * lift) as u8),
        );
    }
    p.rect_filled(rect, radius, Color32::from_rgb(24, 24, 28));
    let img = match layout {
        Layout::Wide => item.wide_image(),
        Layout::Poster => item.poster.as_deref(),
    };
    let shown = img.is_some_and(|u| cover_image(ui, u, rect, radius, 1.0));
    if !shown {
        let name = if item.kind == Kind::Episode {
            item.serial_title.as_deref().unwrap_or(&item.title)
        } else {
            &item.title
        };
        let mut job = egui::text::LayoutJob::simple(
            name.to_owned(),
            theme::semibold(16.0),
            INK_2,
            rect.width() - 32.0,
        );
        job.halign = egui::Align::Center;
        job.wrap.max_rows = 3;
        let g = p.layout_job(job);
        p.galley(
            pos2(rect.center().x, rect.center().y - g.size().y / 2.0),
            g,
            INK_2,
        );
    }

    if layout == Layout::Wide {
        vertical_gradient(
            ui,
            Rect::from_min_max(pos2(rect.left(), rect.center().y - 20.0), rect.max),
            Color32::TRANSPARENT,
            Color32::from_black_alpha(215),
        );
        let (kicker, name) = if item.kind != Kind::Episode {
            (
                item.year.map(|y| y.to_string()).unwrap_or_default(),
                item.title.clone(),
            )
        } else if opts.in_serial {
            let dur = item
                .duration
                .map(|d| format!(" · {} min", (d as f32 / 60.0).round()))
                .unwrap_or_default();
            (
                format!("Epizoda {}{dur}", item.episode),
                item.episode_title.clone(),
            )
        } else {
            (
                format!(
                    "{} · {}",
                    episode_code(item.season, item.episode),
                    item.episode_title
                ),
                item.serial_title
                    .clone()
                    .unwrap_or_else(|| item.episode_title.clone()),
            )
        };
        let w = rect.width() - 36.0;
        let name_rect = text_line(
            ui,
            pos2(rect.left() + 18.0, rect.bottom() - 18.0),
            &name,
            theme::bold(19.0),
            INK,
            w,
            Align2::LEFT_BOTTOM,
        );
        text_line(
            ui,
            pos2(rect.left() + 18.0, name_rect.top() - 2.0),
            &kicker,
            theme::semibold(13.0),
            INK_2,
            w,
            Align2::LEFT_BOTTOM,
        );
    }

    let p = ui.painter();
    if layout == Layout::Poster
        && let Some(q) =
            format::quality_label(item.quality.as_deref()).filter(|q| *q == "4K" || *q == "Full HD")
    {
        let g = p.layout_no_wrap(q.to_owned(), theme::bold(12.0), INK);
        let badge = Rect::from_min_size(
            rect.left_top() + vec2(10.0, 10.0),
            g.size() + vec2(14.0, 8.0),
        );
        p.rect_filled(badge, 7.0, Color32::from_black_alpha(160));
        p.galley(badge.min + vec2(7.0, 4.0), g, INK);
    }
    if opts.queued {
        let c = pos2(rect.right() - 22.0, rect.top() + 22.0);
        p.circle_filled(c, 13.0, Color32::WHITE);
        p.text(
            c,
            Align2::CENTER_CENTER,
            "✔",
            theme::bold(13.0),
            Color32::from_rgb(10, 10, 10),
        );
    }
    let progress = if item.watch.finished {
        0.0
    } else {
        item.watch.progress
    };
    if progress > 0.01 {
        let track = Rect::from_min_size(
            pos2(rect.left() + 14.0, rect.bottom() - 10.0),
            vec2(rect.width() - 28.0, 4.0),
        );
        p.rect_filled(track, 2.0, Color32::from_white_alpha(50));
        p.rect_filled(
            Rect::from_min_size(track.min, vec2(track.width() * progress.max(0.04), 4.0)),
            2.0,
            theme::ORANGE,
        );
    }
    if lift > 0.0 {
        p.rect_stroke(
            rect,
            radius,
            Stroke::new(2.0 * lift, Color32::WHITE.gamma_multiply(lift)),
            StrokeKind::Outside,
        );
    }
    if opts.below {
        let y = frame_rect.bottom() + 12.0;
        let w = size.x;
        text_line(
            ui,
            pos2(outer.left(), y),
            &item.title,
            theme::semibold(15.0),
            INK,
            w,
            Align2::LEFT_TOP,
        );
        text_line(
            ui,
            pos2(outer.left(), y + 22.0),
            &format::card_subline(item),
            theme::regular(13.0),
            INK_3,
            w,
            Align2::LEFT_TOP,
        );
    }
    response.on_hover_cursor(CursorIcon::PointingHand)
}

pub fn card_skeleton(ui: &mut Ui, layout: Layout) {
    let (rect, _) = ui.allocate_exact_size(layout.size(), Sense::hover());
    let t = ui.input(|i| i.time) as f32;
    let a = 14.0 + 8.0 * (t * 2.5).sin().abs();
    ui.painter()
        .rect_filled(rect, theme::RADIUS, Color32::from_white_alpha(a as u8));
    ui.ctx().request_repaint_after(Duration::from_millis(33));
}

/* ---------------- Řady ---------------- */

#[derive(Default)]
pub struct RowOutput {
    pub clicked: Option<ItemRef>,
    pub hovered: Option<ItemRef>,
    /// Konec řady je blízko: načíst další stránku.
    pub load_more: bool,
}

/// Vodorovná řada karet s nadpisem. Kolečko myši se Shiftem nebo šipky po
/// stranách ji posouvají (šipky se ukážou při najetí, jako na webu).
pub fn row(
    ui: &mut Ui,
    id: &str,
    title: &str,
    items: &[ItemRef],
    layout: Layout,
    loading: bool,
    queued: &dyn Fn(&Item) -> bool,
    in_serial: bool,
) -> RowOutput {
    let mut out = RowOutput::default();
    if !loading && items.is_empty() {
        return out;
    }
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        ui.add_space(theme::GUTTER);
        ui.label(
            egui::RichText::new(title)
                .font(theme::bold(22.0))
                .color(INK),
        );
    });
    ui.add_space(2.0);
    let scroll_id = Id::new(("row", id));
    let pending: Option<f32> = ui.ctx().data_mut(|d| d.remove_temp(scroll_id.with("jump")));
    let mut area = egui::ScrollArea::horizontal()
        .id_salt(scroll_id)
        .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::AlwaysHidden)
        .auto_shrink([false, true]);
    if let Some(offset) = pending {
        area = area.horizontal_scroll_offset(offset);
    }
    let output = area.show(ui, |ui| {
        ui.horizontal(|ui| {
            ui.add_space(theme::GUTTER);
            // Místo na zvětšení karty při najetí.
            ui.spacing_mut().item_spacing.x = 18.0;
            ui.add_space(0.0);
            ui.vertical(|ui| {
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if loading && items.is_empty() {
                        for _ in 0..if layout == Layout::Wide { 5 } else { 9 } {
                            card_skeleton(ui, layout);
                        }
                    }
                    for item in items {
                        let opts = CardOptions {
                            queued: queued(item),
                            below: false,
                            in_serial,
                        };
                        let r = card(ui, item, layout, &opts);
                        if r.hovered() {
                            out.hovered = Some(item.clone());
                        }
                        if r.clicked() {
                            out.clicked = Some(item.clone());
                        }
                    }
                    ui.add_space(theme::GUTTER);
                });
                ui.add_space(14.0);
            });
        });
    });
    let viewport = output.inner_rect;
    let offset = output.state.offset.x;
    let max = (output.content_size.x - viewport.width()).max(0.0);
    out.load_more = max - offset < viewport.width() * 0.8;

    // Šipky po stranách při najetí myší.
    let hovered = ui.rect_contains_pointer(viewport);
    let step = (viewport.width() - 2.0 * theme::GUTTER).max(200.0) * 0.85;
    for (left, icon) in [(true, "⏴"), (false, "⏵")] {
        let visible = if left {
            offset > 1.0
        } else {
            offset < max - 1.0
        };
        let a = ui
            .ctx()
            .animate_bool_with_time(scroll_id.with(left), hovered && visible, 0.15);
        if a <= 0.0 {
            continue;
        }
        let x = if left {
            viewport.left() + 30.0
        } else {
            viewport.right() - 30.0
        };
        let rect = Rect::from_center_size(pos2(x, viewport.center().y - 6.0), Vec2::splat(48.0));
        let r = ui.interact(rect, scroll_id.with(("arrow", left)), Sense::click());
        ui.scope(|ui| {
            ui.multiply_opacity(a);
            paint_icon_button(ui, rect, icon, r.hovered());
        });
        if r.clicked() {
            let target = if left {
                (offset - step).max(0.0)
            } else {
                (offset + step).min(max)
            };
            ui.ctx()
                .data_mut(|d| d.insert_temp(scroll_id.with("jump"), target));
            ui.ctx().request_repaint();
        }
    }
    out
}

/* ---------------- Meta ---------------- */

/// Rok · délka · přístupnost · kvalita · ČSFD · IMDb.
pub fn meta_line(ui: &mut Ui, item: &Item, show_kind: bool) {
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 10.0;
        let mut parts: Vec<String> = Vec::new();
        if show_kind {
            parts.push(format::kind_label(item));
        }
        if let Some(y) = item.year {
            parts.push(y.to_string());
        }
        if item.kind != Kind::Serial
            && let Some(d) = format::duration(item.duration)
        {
            parts.push(d);
        }
        let text = parts.join("  ·  ");
        if !text.is_empty() {
            ui.label(
                egui::RichText::new(text)
                    .font(theme::semibold(16.0))
                    .color(INK_2),
            );
        }
        if let Some(a) = item.age_rating {
            tag(ui, &format!("{a}+"), true);
        }
        if let Some(q) = format::quality_label(item.quality.as_deref()) {
            tag(ui, q, false);
        }
        if let Some(c) = item.csfd {
            score(ui, &format!("{c} %"), "ČSFD");
        }
        if let Some(i) = item.imdb {
            score(ui, &format!("{i:.1}"), "IMDb");
        }
    });
}

/// Jazyky (CZ dabing, EN + CZ titulky) a první tři žánry.
pub fn language_line(ui: &mut Ui, item: &Item) {
    if item.languages.is_empty() && item.genres.is_empty() {
        return;
    }
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        for l in &item.languages {
            tag(ui, &format::language_label(l), true);
        }
        if !item.genres.is_empty() {
            ui.add_space(4.0);
            let g: Vec<&str> = item.genres.iter().take(3).map(String::as_str).collect();
            ui.label(
                egui::RichText::new(g.join(", "))
                    .font(theme::regular(15.0))
                    .color(INK_2),
            );
        }
    });
}

pub fn tag(ui: &mut Ui, text: &str, outline: bool) {
    let g = ui
        .painter()
        .layout_no_wrap(text.to_owned(), theme::bold(12.5), INK);
    let (rect, _) = ui.allocate_exact_size(g.size() + vec2(16.0, 10.0), Sense::hover());
    let p = ui.painter();
    if outline {
        p.rect_stroke(
            rect,
            7.0,
            Stroke::new(1.0, Color32::from_white_alpha(60)),
            StrokeKind::Inside,
        );
    } else {
        p.rect_filled(rect, 7.0, Color32::from_white_alpha(36));
    }
    p.galley(rect.min + vec2(8.0, 5.0), g, INK);
}

fn score(ui: &mut Ui, value: &str, source: &str) {
    ui.label(
        egui::RichText::new(value)
            .font(theme::bold(16.0))
            .color(INK),
    );
    ui.add_space(-6.0);
    ui.label(
        egui::RichText::new(source)
            .font(theme::semibold(11.0))
            .color(INK_3),
    );
}

/// Nadpis malými písmeny s prostrkáním (`.eyebrow`).
pub fn eyebrow(ui: &mut Ui, text: &str) {
    ui.label(
        egui::RichText::new(text.to_uppercase())
            .font(theme::bold(13.0))
            .color(theme::AMBER)
            .extra_letter_spacing(2.0),
    );
}

pub fn display(ui: &mut Ui, text: &str, size: f32, width: f32) {
    let mut job = egui::text::LayoutJob::simple(text.to_owned(), theme::bold(size), INK, width);
    job.wrap.max_rows = 3;
    let g = ui.painter().layout_job(job);
    let (rect, _) = ui.allocate_exact_size(g.size(), Sense::hover());
    ui.painter().galley(rect.min, g, INK);
}

/// Panel s dvojitým rámem (`.bezel`).
pub fn bezel<R>(ui: &mut Ui, width: f32, content: impl FnOnce(&mut Ui) -> R) -> R {
    egui::Frame::new()
        .fill(Color32::from_white_alpha(10))
        .stroke(Stroke::new(1.0, theme::HAIR))
        .corner_radius(30)
        .inner_margin(6)
        .show(ui, |ui| {
            egui::Frame::new()
                .fill(Color32::from_rgba_unmultiplied(22, 22, 27, 240))
                .corner_radius(24)
                .inner_margin(36)
                .show(ui, |ui| {
                    ui.set_width(width - 84.0);
                    content(ui)
                })
                .inner
        })
        .inner
}

/// Logo: otevřený kruh s Play uprostřed (stejná geometrie jako icon.svg).
/// `draw` 0–1 kreslí kruh, `pop` 0–1 vyskočí trojúhelník (úvodní animace).
pub fn logo_mark(ui: &Ui, center: Pos2, size: f32, draw: f32, pop: f32) {
    let s = size / 64.0;
    let p = ui.painter();
    let r = 22.0 * s;
    // Kruh s mezerou (dasharray 117 21) natočený o -50°, barvy přechodu.
    let start = (-50.0f32).to_radians();
    let total = std::f32::consts::TAU * 117.0 / 138.0 * draw.clamp(0.0, 1.0);
    let steps = 64;
    let colors = [theme::AMBER, theme::ORANGE, theme::PINK];
    for i in 0..steps {
        let t0 = i as f32 / steps as f32;
        let t1 = (i + 1) as f32 / steps as f32;
        let (a0, a1) = (start + total * t0, start + total * t1);
        let pt = |a: f32| center + vec2(a.cos(), a.sin()) * r;
        let k = t0 * 2.0;
        let color = if k < 1.0 {
            lerp(colors[0], colors[1], k)
        } else {
            lerp(colors[1], colors[2], k - 1.0)
        };
        p.line_segment([pt(a0), pt(a1)], Stroke::new(7.0 * s, color));
    }
    if draw > 0.0 {
        let cap =
            |a: f32, c: Color32| p.circle_filled(center + vec2(a.cos(), a.sin()) * r, 3.5 * s, c);
        cap(start, colors[0]);
        cap(
            start + total,
            if draw >= 1.0 {
                colors[2]
            } else {
                lerp(colors[0], colors[2], draw)
            },
        );
    }
    let pop = pop.clamp(0.0, 1.2);
    if pop > 0.0 {
        let c = center + vec2(2.0 * s, 0.0);
        let k = s * pop;
        let pts = vec![
            c + vec2(-6.5, -9.25) * k,
            c + vec2(7.25, 0.0) * k,
            c + vec2(-6.5, 9.25) * k,
        ];
        p.add(Shape::convex_polygon(
            pts,
            Color32::WHITE,
            Stroke::new(2.0 * k, Color32::WHITE),
        ));
    }
}

fn lerp(a: Color32, b: Color32, t: f32) -> Color32 {
    let t = t.clamp(0.0, 1.0);
    let m = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t) as u8;
    Color32::from_rgb(m(a.r(), b.r()), m(a.g(), b.g()), m(a.b(), b.b()))
}

/// "OpenSosacTV" s Open tenčím a TV v barvě loga.
pub fn wordmark(ui: &Ui, pos: Pos2, size: f32, align: Align2, alpha: f32) -> Rect {
    let mut job = egui::text::LayoutJob::default();
    let fmt = |font: egui::FontId, color: Color32| egui::TextFormat {
        font_id: font,
        color: color.gamma_multiply(alpha),
        ..Default::default()
    };
    job.append("Open", 0.0, fmt(theme::regular(size), INK_2));
    job.append("Sosac", 0.0, fmt(theme::bold(size), INK));
    job.append("TV", 0.0, fmt(theme::bold(size), theme::ORANGE));
    let g = ui.painter().layout_job(job);
    let rect = align.anchor_size(pos, g.size());
    ui.painter().galley(rect.min, g, INK);
    rect
}
