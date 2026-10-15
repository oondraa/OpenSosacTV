//! OpenSosacTV pro Windows: stejná aplikace jako webová verze, napsaná v Rustu
//! (egui), s vlastní titulkovou lištou jako OZBEAT.

// Bez konzolového okna za aplikací.
#![cfg_attr(windows, windows_subsystem = "windows")]

mod api;
mod data;
mod frameless;
mod profiles;
mod storage;
mod titlebar;
mod ui;
mod update;

use std::process::ExitCode;
use std::sync::Arc;

use eframe::egui;

fn main() -> ExitCode {
    update::remove_previous();
    let update = update::SharedUpdate::default();
    update::check_in_background(Arc::clone(&update));

    let mut viewport = egui::ViewportBuilder::default()
        .with_title("OpenSosacTV")
        .with_inner_size([1280.0, 760.0])
        .with_min_inner_size([960.0, 600.0])
        // Titulková lišta je vlastní (titlebar.rs).
        .with_decorations(false);
    if let Some(icon) = window_icon() {
        viewport = viewport.with_icon(Arc::new(icon));
    }
    let options = eframe::NativeOptions {
        viewport,
        ..Default::default()
    };
    let result = eframe::run_native(
        "OpenSosacTV",
        options,
        Box::new(move |cc| {
            frameless::install(cc);
            Ok(Box::new(ui::App::new(cc, update)))
        }),
    );
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("chyba okna: {e}");
            ExitCode::FAILURE
        }
    }
}

/// Ikona v titulku a na hlavním panelu.
fn window_icon() -> Option<egui::IconData> {
    let image = image::load_from_memory(include_bytes!("../assets/icon.png"))
        .ok()?
        .to_rgba8();
    Some(egui::IconData {
        width: image.width(),
        height: image.height(),
        rgba: image.into_raw(),
    })
}
