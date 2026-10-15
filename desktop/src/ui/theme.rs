//! Barvy a písma. Stejné hodnoty jako `:root` v `src/ui/styles/app.css`.

use std::sync::Arc;

use eframe::egui::{self, Color32, FontData, FontDefinitions, FontFamily, FontId};

pub const BG: Color32 = Color32::from_rgb(5, 5, 5);
pub const INK: Color32 = Color32::from_rgb(0xf5, 0xf5, 0xf7);
/// rgba(235, 235, 245, 0.64)
pub const INK_2: Color32 = Color32::from_rgba_premultiplied(150, 150, 157, 163);
/// rgba(235, 235, 245, 0.38)
pub const INK_3: Color32 = Color32::from_rgba_premultiplied(89, 89, 93, 97);
pub const HAIR: Color32 = Color32::from_rgba_premultiplied(20, 20, 20, 20);
pub const HAIR_STRONG: Color32 = Color32::from_rgba_premultiplied(41, 41, 41, 41);
pub const PANEL: Color32 = Color32::from_rgb(22, 22, 27);
pub const ORANGE: Color32 = Color32::from_rgb(0xff, 0x5a, 0x36);
pub const AMBER: Color32 = Color32::from_rgb(0xff, 0xb3, 0x47);
pub const PINK: Color32 = Color32::from_rgb(0xe0, 0x24, 0x5e);
pub const GREEN: Color32 = Color32::from_rgb(48, 209, 88);
pub const ERROR: Color32 = Color32::from_rgb(255, 105, 97);

/// Okraj obsahu vlevo a vpravo.
pub const GUTTER: f32 = 56.0;
pub const RADIUS: u8 = 14;

pub const BOLD: &str = "bold";
pub const SEMIBOLD: &str = "semibold";
pub const REGULAR: &str = "regular";

const BOLD_FONTS: &[&str] = &["C:\\Windows\\Fonts\\segoeuib.ttf"];
const SEMIBOLD_FONTS: &[&str] = &[
    "C:\\Windows\\Fonts\\seguisb.ttf",
    "C:\\Windows\\Fonts\\segoeuib.ttf",
];
const REGULAR_FONTS: &[&str] = &["C:\\Windows\\Fonts\\segoeui.ttf"];

pub fn bold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(BOLD.into()))
}

pub fn semibold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(SEMIBOLD.into()))
}

pub fn regular(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(REGULAR.into()))
}

/// Segoe UI jako v OZBEATu; vestavěné písmo egui zůstává záložní (symboly).
pub fn install(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let fallback = fonts
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();
    for (name, candidates) in [
        (BOLD, BOLD_FONTS),
        (SEMIBOLD, SEMIBOLD_FONTS),
        (REGULAR, REGULAR_FONTS),
    ] {
        let mut family = Vec::new();
        if let Some(bytes) = candidates.iter().find_map(|p| std::fs::read(p).ok()) {
            fonts
                .font_data
                .insert(name.into(), Arc::new(FontData::from_owned(bytes)));
            family.push(name.to_owned());
        }
        family.extend(fallback.iter().cloned());
        fonts.families.insert(FontFamily::Name(name.into()), family);
    }
    // Běžný text (TextEdit) taky v Segoe UI.
    if fonts.font_data.contains_key(REGULAR) {
        fonts
            .families
            .entry(FontFamily::Proportional)
            .or_default()
            .insert(0, REGULAR.into());
    }
    ctx.set_fonts(fonts);

    ctx.set_theme(egui::Theme::Dark);
    ctx.all_styles_mut(|style| {
        style.visuals = egui::Visuals::dark();
        style.visuals.panel_fill = BG;
        style.visuals.window_fill = PANEL;
        style.visuals.extreme_bg_color = Color32::from_rgba_premultiplied(18, 18, 18, 18);
        style.visuals.override_text_color = Some(INK);
        style.visuals.selection.bg_fill = ORANGE.gamma_multiply(0.6);
        style.visuals.text_cursor.stroke.color = INK;
        style.spacing.item_spacing = egui::vec2(12.0, 12.0);
        style.spacing.scroll.bar_width = 6.0;
        style.spacing.scroll.floating = true;
        style
            .text_styles
            .insert(egui::TextStyle::Body, regular(17.0));
        style
            .text_styles
            .insert(egui::TextStyle::Button, semibold(16.0));
    });
}
