//! Přehrávač: oficiální vložený přehrávač Streamuj (jako web sosac.tv) ve
//! WebView2 pod lištou s názvem. WebView je samostatné okno nad plochou egui,
//! takže se přes něj nedá kreslit; lišta je proto nad ním, ne přes něj.
//! Přihlášení na streamuj.tv si WebView pamatuje ve vlastní složce.

use std::sync::{Arc, Mutex};

use eframe::egui::{self, Align2, Rect, Ui, pos2, vec2};
use wry::dpi::{PhysicalPosition, PhysicalSize};

use super::theme::{self, INK, INK_3};
use super::widgets;
use super::{App, ItemRef, LIST_TTL};
use crate::api::{Kind, SerialDetail, episode_code};
use crate::data::Load;
use crate::titlebar;

const BAR_HEIGHT: f32 = 76.0;

/// Klávesy z WebView: když má fokus video, egui je nevidí.
const KEY_SCRIPT: &str = r#"
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.fullscreenElement) window.ipc.postMessage('back');
  if (e.key === 'F11') { e.preventDefault(); window.ipc.postMessage('fullscreen'); }
}, true);
window.addEventListener('mouseup', (e) => { if (e.button === 3) window.ipc.postMessage('back'); }, true);
"#;

#[derive(Default)]
pub struct PlayerState {
    view: Option<View>,
    error: Option<String>,
    messages: Arc<Mutex<Vec<String>>>,
    context: Option<wry::WebContext>,
}

struct View {
    webview: wry::WebView,
    url: String,
    /// Uživatel odešel z videa (přihlášení na Streamuj): nabídnout návrat.
    away: bool,
}

/// Patří adresa Streamuj? Jen tam smí WebView navigovat.
fn is_streamuj(url: &str, provider: &str) -> bool {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .is_some_and(|h| h == provider || h == "streamuj.tv" || h.ends_with(".streamuj.tv"))
}

impl PlayerState {
    /// Zavře WebView (odchod z přehrávače).
    pub fn close(&mut self) {
        self.view = None;
        self.error = None;
    }

    fn open(&mut self, frame: &eframe::Frame, url: &str, bounds: wry::Rect, ctx: &egui::Context) {
        if let Some(view) = &self.view {
            if view.url != url {
                let _ = view.webview.load_url(url);
                let view = self.view.as_mut().unwrap();
                view.url = url.to_owned();
                view.away = false;
            }
            let _ = self.view.as_ref().unwrap().webview.set_bounds(bounds);
            return;
        }
        if self.error.is_some() {
            return;
        }
        let context = self.context.get_or_insert_with(|| {
            wry::WebContext::new(Some(crate::storage::dir().join("webview")))
        });
        let messages = Arc::clone(&self.messages);
        let popups = Arc::clone(&self.messages);
        let repaint = ctx.clone();
        let repaint_popup = ctx.clone();
        let provider = url::Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_owned))
            .unwrap_or_default();
        let result = wry::WebViewBuilder::new_with_web_context(context)
            .with_url(url)
            .with_bounds(bounds)
            .with_background_color((5, 5, 5, 255))
            .with_initialization_script(KEY_SCRIPT)
            .with_ipc_handler(move |req| {
                messages.lock().unwrap().push(req.body().clone());
                repaint.request_repaint();
            })
            // Nová okna: přihlášení na Streamuj otevřít tady, reklamy zahodit.
            .with_new_window_req_handler({
                let provider = provider.clone();
                move |to, _| {
                    if is_streamuj(&to, &provider) {
                        popups.lock().unwrap().push(format!("open:{to}"));
                        repaint_popup.request_repaint();
                    }
                    wry::NewWindowResponse::Deny
                }
            })
            // Hlavní stránka zůstává na Streamuj (přihlášení, přehrávač).
            .with_navigation_handler(move |to| {
                to.starts_with("about:") || is_streamuj(&to, &provider)
            })
            .build_as_child(frame);
        match result {
            Ok(webview) => {
                let _ = webview.focus();
                self.view = Some(View {
                    webview,
                    url: url.to_owned(),
                    away: false,
                });
            }
            Err(e) => {
                self.error = Some(format!(
                    "Přehrávač nejde spustit ({e}). Je nainstalovaný Microsoft Edge WebView2?"
                ))
            }
        }
    }

    /// Otevře stránku Streamuj (přihlášení) místo videa.
    fn visit(&mut self, url: &str) {
        if let Some(view) = &mut self.view {
            let _ = view.webview.load_url(url);
            view.away = true;
        }
    }

    /// Zpátky na video po přihlášení.
    fn return_to_video(&mut self) {
        if let Some(view) = &mut self.view {
            let _ = view.webview.load_url(&view.url);
            view.away = false;
        }
    }

    fn is_away(&self) -> bool {
        self.view.as_ref().is_some_and(|v| v.away)
    }

    fn take_messages(&self) -> Vec<String> {
        std::mem::take(&mut *self.messages.lock().unwrap())
    }
}

impl App {
    pub(super) fn player_screen(
        &mut self,
        ui: &mut Ui,
        frame: &eframe::Frame,
        screen: Rect,
        item: &ItemRef,
        serial_id: Option<u64>,
    ) {
        let ctx = ui.ctx().clone();
        for m in self.player.take_messages() {
            match m.as_str() {
                "back" => {
                    self.back();
                    return;
                }
                "fullscreen" => {
                    let fs = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!fs));
                }
                other => {
                    if let Some(url) = other.strip_prefix("open:") {
                        self.player.visit(url);
                    }
                }
            }
        }

        // Čerstvá data (stream ID u epizody z detailu seriálu může chybět).
        let client = self.client.clone();
        let (kind, id) = (item.kind, item.id);
        let key = format!(
            "{}/{id}",
            if kind == Kind::Movie {
                "movie"
            } else {
                "episode"
            }
        );
        let fresh: Load<ItemRef> = self.data.get(&key, LIST_TTL, move || async move {
            if kind == Kind::Movie {
                client.movie(id).await
            } else {
                client.episode(id).await
            }
            .map_err(|e| e.to_string())
        });
        let item = fresh
            .ready()
            .filter(|f| f.stream_id.is_some())
            .map(|f| Arc::clone(f.as_ref()))
            .unwrap_or_else(|| Arc::clone(item));
        let serial_id = serial_id.or(item.serial_id);
        let detail: Option<Arc<(ItemRef, SerialDetail)>> = serial_id.and_then(|sid| {
            let client = self.client.clone();
            let known = self.known.get(&(Kind::Serial, sid)).cloned();
            self.data
                .get(&format!("serial/{sid}"), LIST_TTL, move || async move {
                    client.serial(sid, known).await.map_err(|e| e.to_string())
                })
                .ready()
                .cloned()
        });
        let next = (item.kind == Kind::Episode)
            .then(|| {
                detail
                    .as_ref()
                    .and_then(|d| d.1.next_after(item.season, item.episode))
            })
            .flatten();
        let serial_title = item
            .serial_title
            .clone()
            .or_else(|| detail.as_ref().map(|d| d.0.title.clone()));

        let fullscreen = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
        let top = if fullscreen {
            screen.top()
        } else {
            screen.top() + titlebar::HEIGHT + BAR_HEIGHT
        };
        let video = Rect::from_min_max(pos2(screen.left(), top), screen.max);

        let mut go_back = false;
        let away = self.player.is_away();
        let mut back_to_video = false;
        let mut play_next = None;
        if !fullscreen {
            let bar = Rect::from_min_size(
                pos2(screen.left(), screen.top() + titlebar::HEIGHT),
                vec2(screen.width(), BAR_HEIGHT),
            );
            ui.scope_builder(egui::UiBuilder::new().max_rect(bar.shrink2(vec2(24.0, 14.0))), |ui| {
                ui.horizontal_centered(|ui| {
                    go_back = widgets::icon_button(ui, "⏴", 48.0).on_hover_text("Zpět (Esc)").clicked();
                    ui.add_space(6.0);
                    ui.vertical(|ui| {
                        let title = if item.kind == Kind::Episode { serial_title.clone().unwrap_or_else(|| item.title.clone()) } else { item.title.clone() };
                        ui.label(egui::RichText::new(title).font(theme::bold(20.0)).color(INK));
                        let sub = if item.kind == Kind::Episode {
                            format!("{} · {}", episode_code(item.season, item.episode), item.episode_title)
                        } else {
                            item.year.map(|y| y.to_string()).unwrap_or_default()
                        };
                        ui.label(egui::RichText::new(sub).font(theme::regular(15.0)).color(INK_3));
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if away && widgets::button(ui, "Zpět k videu", Some("▶"), true).clicked() {
                            back_to_video = true;
                        }
                        if let Some(n) = &next
                            && widgets::button(ui, "Další díl", Some("⏭"), false).clicked()
                        {
                            play_next = Some(Arc::clone(n));
                        }
                        ui.label(egui::RichText::new("Celé filmy po přihlášení na Streamuj v přehrávači · F11 celá obrazovka").font(theme::regular(14.0)).color(INK_3));
                    });
                });
            });
        }

        match &item.stream_id {
            Some(stream) => {
                let ppp = ctx.pixels_per_point();
                let w = video.width().max(320.0);
                let h = video.height().max(240.0);
                let url = format!(
                    "https://{}/video/{}?remote=1&affid=0&width={}&height={}",
                    self.settings.streaming_provider,
                    urlencode(stream),
                    w.round(),
                    h.round()
                );
                let bounds = wry::Rect {
                    position: PhysicalPosition::new(
                        (video.left() * ppp).round() as i32,
                        (video.top() * ppp).round() as i32,
                    )
                    .into(),
                    size: PhysicalSize::new(
                        (video.width() * ppp).round() as u32,
                        (video.height() * ppp).round() as u32,
                    )
                    .into(),
                };
                self.player.open(frame, &url, bounds, &ctx);
                if let Some(e) = &self.player.error {
                    ui.painter().text(
                        video.center(),
                        Align2::CENTER_CENTER,
                        e,
                        theme::regular(18.0),
                        theme::ERROR,
                    );
                }
            }
            None => {
                self.player.close();
                let text = match &fresh {
                    Load::Pending => "Načítám…".to_owned(),
                    Load::Failed(e) => e.clone(),
                    Load::Ready(_) => "Titul nemá přiřazený stream.".to_owned(),
                };
                ui.painter().text(
                    video.center(),
                    Align2::CENTER_CENTER,
                    text,
                    theme::regular(19.0),
                    INK_3,
                );
            }
        }

        if back_to_video {
            self.player.return_to_video();
        }
        if go_back {
            self.back();
        } else if let Some(n) = play_next {
            let mut n = (*n).clone();
            n.serial_id = n.serial_id.or(serial_id);
            n.serial_title = n.serial_title.or(serial_title);
            self.play(&Arc::new(n), serial_id);
        }
    }
}

fn urlencode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
