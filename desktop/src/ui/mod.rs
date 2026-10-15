//! Okno aplikace: navigace mezi obrazovkami, sdílený stav, události z pozadí.
//! Obrazovky jsou v podmodulech jako `impl App`, kreslí a ukládají akce sem.

mod browse;
mod changelog;
mod chrome;
mod detail;
mod format;
mod home;
mod mylist;
mod player;
mod profile;
mod search;
pub mod theme;
mod widgets;

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use eframe::egui;

use crate::api::{
    Credentials, Item, ItemRef, Kind, ListSource, Page, ServiceSettings, SosacClient,
};
use crate::data::{Data, Load};
use crate::profiles::{Profiles, ServerChange};
use crate::storage::Stored;
use crate::titlebar::TitleBar;
use crate::update::{self, SharedUpdate};

/// Jak dlouho jsou data z katalogu čerstvá.
const LIST_TTL: Duration = Duration::from_secs(5 * 60);
/// Osobní seznamy (fronta, rozkoukané) se obnovují častěji.
const PERSONAL_TTL: Duration = Duration::from_secs(60);
/// Stažené domény platí 6 hodin, pak se zjistí znovu.
const SETTINGS_TTL_S: u64 = 6 * 3600;

#[derive(Clone)]
pub enum Route {
    Home,
    Movies,
    Serials,
    My,
    Search,
    Profile,
    Movie(u64),
    Serial(u64),
    Play {
        item: ItemRef,
        serial_id: Option<u64>,
    },
}

impl PartialEq for Route {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Route::Play { item: a, .. }, Route::Play { item: b, .. }) => {
                a.kind == b.kind && a.id == b.id
            }
            (Route::Movie(a), Route::Movie(b)) | (Route::Serial(a), Route::Serial(b)) => a == b,
            _ => std::mem::discriminant(self) == std::mem::discriminant(other),
        }
    }
}

impl Route {
    fn is_tab(&self) -> bool {
        matches!(
            self,
            Route::Home
                | Route::Movies
                | Route::Serials
                | Route::My
                | Route::Search
                | Route::Profile
        )
    }
}

/// Výsledky úloh z pozadí, zpracují se na začátku snímku.
enum Event {
    Settings(Option<ServiceSettings>),
    LoggedIn(Result<Credentials, String>),
    QueueFailed {
        profiles: Profiles,
        kind: Kind,
        previous: Option<Arc<HashSet<u64>>>,
        message: String,
    },
    QueueSaved(Kind),
}

/// Stránkovaný seznam složený z načtených stránek.
pub struct Paged {
    pub items: Vec<ItemRef>,
    pub loading: bool,
    pub has_more: bool,
    pub error: Option<String>,
}

pub struct LoginForm {
    user: String,
    pass: String,
    error: Option<String>,
    busy: bool,
}

pub struct App {
    data: Data,
    stored: Stored,
    settings: ServiceSettings,
    client: SosacClient,
    events: Arc<Mutex<Vec<Event>>>,
    route: Route,
    history: Vec<Route>,
    /// Položky známé ze seznamů: detail je ukáže hned, než doběhne request.
    known: HashMap<(Kind, u64), ItemRef>,
    titlebar: TitleBar,
    splash: chrome::Splash,
    whats_new: bool,
    stage: chrome::Stage,
    hero: Option<ItemRef>,
    /// Kolik stránek seznamu se má načíst (podle klíče seznamu).
    pages: HashMap<String, usize>,
    browse_filter: HashMap<Kind, browse::Filter>,
    search: search::SearchState,
    login: LoginForm,
    profile_edit: Option<profile::Edit>,
    season: HashMap<u64, u32>,
    player: player::PlayerState,
    update: SharedUpdate,
    toast: Option<(String, Instant)>,
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>, update: SharedUpdate) -> Self {
        let ctx = cc.egui_ctx.clone();
        theme::install(&ctx);
        egui_extras::install_image_loaders(&ctx);

        let stored = Stored::load();
        let now = now_secs();
        let cached = stored.settings.clone();
        let fresh = cached
            .as_ref()
            .is_some_and(|s| now.saturating_sub(s.fetched_at) < SETTINGS_TTL_S);
        let settings = cached.unwrap_or_default();
        let client = SosacClient::new(&settings.sosac_domain, stored.session.clone());
        let returning = stored.onboarded || stored.session.is_some();
        let whats_new = changelog::should_show(stored.seen_version.as_deref(), returning);

        let mut app = Self {
            data: Data::new(ctx.clone()),
            stored,
            settings,
            client,
            events: Arc::default(),
            route: Route::Home,
            history: Vec::new(),
            known: HashMap::new(),
            titlebar: TitleBar::new(),
            splash: chrome::Splash::new(fresh),
            whats_new,
            stage: chrome::Stage::default(),
            hero: None,
            pages: HashMap::new(),
            browse_filter: HashMap::new(),
            search: search::SearchState::default(),
            login: LoginForm {
                user: String::new(),
                pass: String::new(),
                error: None,
                busy: false,
            },
            profile_edit: None,
            season: HashMap::new(),
            player: player::PlayerState::default(),
            update,
            toast: None,
        };
        if !returning {
            // Nový uživatel novinky nevidí, jen se verze zapamatuje.
            app.stored.seen_version = Some(changelog::CURRENT.into());
            app.stored.save();
        }
        // První spuštění bez účtu: nabídnout přihlášení (jde i přeskočit).
        if !app.stored.onboarded && app.stored.session.is_none() {
            app.route = Route::Profile;
        }
        if !fresh {
            let events = Arc::clone(&app.events);
            app.data.spawn(async move {
                let s = crate::api::sosac::discover().await;
                events.lock().unwrap().push(Event::Settings(s));
            });
        }
        app
    }

    /* ---------------- Účet a profily ---------------- */

    pub fn is_logged_in(&self) -> bool {
        self.stored.session.is_some()
    }

    fn account(&self) -> Option<String> {
        self.stored.session.as_ref().map(|s| s.username.clone())
    }

    /// Profily přihlášeného účtu (vytvoří výchozí, když chybí).
    fn profiles_mut(&mut self) -> Option<&mut Profiles> {
        let account = self.account()?;
        Some(self.stored.profiles_for(&account))
    }

    fn profiles(&mut self) -> Option<Profiles> {
        self.profiles_mut().map(|p| p.clone())
    }

    fn login(&mut self) {
        if self.login.busy {
            return;
        }
        if self.login.user.trim().is_empty() || self.login.pass.is_empty() {
            self.login.error = Some("Vyplň jméno a heslo.".into());
            return;
        }
        self.login.busy = true;
        self.login.error = None;
        let credentials = Credentials::new(&self.login.user, &self.login.pass);
        let client = SosacClient::new(&self.settings.sosac_domain, Some(credentials.clone()));
        let events = Arc::clone(&self.events);
        self.data.spawn(async move {
            let result = client
                .verify()
                .await
                .map(|()| credentials)
                .map_err(|e| e.to_string());
            events.lock().unwrap().push(Event::LoggedIn(result));
        });
    }

    fn logout(&mut self) {
        self.stored.session = None;
        self.stored.save();
        self.reset_client();
    }

    fn reset_client(&mut self) {
        self.client = SosacClient::new(&self.settings.sosac_domain, self.stored.session.clone());
        // Data se liší podle uživatele (pozice, fronta), proto vše znovu.
        self.data.clear();
        self.pages.clear();
    }

    /* ---------------- Navigace ---------------- */

    pub fn navigate(&mut self, route: Route) {
        if route == self.route {
            return;
        }
        let previous = std::mem::replace(&mut self.route, route);
        if !matches!(previous, Route::Play { .. }) || !matches!(self.route, Route::Play { .. }) {
            self.history.push(previous);
        }
        self.hero = None;
    }

    /// Záložka v navigaci: bez historie, jako na webu.
    pub fn tab(&mut self, route: Route) {
        self.history.clear();
        self.route = route;
        self.hero = None;
    }

    pub fn back(&mut self) {
        if let Some(r) = self.history.pop() {
            self.route = r;
        } else if self.route != Route::Home {
            self.route = Route::Home;
        }
    }

    fn remember(&mut self, item: &ItemRef) {
        self.known.insert((item.kind, item.id), Arc::clone(item));
        if self.known.len() > 2000 {
            self.known.clear();
        }
    }

    /// Otevře detail. Epizoda vede na svůj seriál, bez něj rovnou přehraje.
    pub fn open(&mut self, item: &ItemRef) {
        self.remember(item);
        match item.kind {
            Kind::Movie => self.navigate(Route::Movie(item.id)),
            Kind::Serial => self.navigate(Route::Serial(item.id)),
            Kind::Episode => match item.serial_id {
                Some(id) => self.navigate(Route::Serial(id)),
                None => self.play(item, None),
            },
        }
    }

    pub fn play(&mut self, item: &ItemRef, serial_id: Option<u64>) {
        self.remember(item);
        if item.kind == Kind::Serial {
            self.navigate(Route::Serial(item.id));
            return;
        }
        let serial_id = serial_id.or(item.serial_id);
        self.navigate(Route::Play {
            item: Arc::clone(item),
            serial_id,
        });
    }

    /* ---------------- Data ---------------- */

    fn ttl(source: &ListSource) -> Duration {
        if source.key().starts_with("my/") {
            PERSONAL_TTL
        } else {
            LIST_TTL
        }
    }

    /// Načtené stránky seznamu za sebou. Další stránku přidá [`App::more`].
    pub fn paged(&mut self, source: &ListSource) -> Paged {
        let key = source.key();
        let wanted = *self.pages.get(&key).unwrap_or(&1);
        let mut out = Paged {
            items: Vec::new(),
            loading: false,
            has_more: false,
            error: None,
        };
        for page in 1..=wanted {
            let client = self.client.clone();
            let src = source.clone();
            let load: Load<Page> = self.data.get(
                &format!("{key}/p{page}"),
                Self::ttl(source),
                move || async move { client.list(&src, page).await.map_err(|e| e.to_string()) },
            );
            match load {
                Load::Ready(p) => {
                    out.items.extend(p.items.iter().cloned());
                    out.has_more = p.has_more;
                }
                Load::Pending => {
                    out.loading = true;
                    break;
                }
                Load::Failed(e) => {
                    out.error = Some(e);
                    break;
                }
            }
        }
        out
    }

    pub fn more(&mut self, source: &ListSource, paged: &Paged) {
        if paged.has_more && !paged.loading && paged.error.is_none() {
            *self.pages.entry(source.key()).or_insert(1) += 1;
        }
    }

    fn queue_key(kind: Kind) -> String {
        format!("my/queue-ids/{}", kind.key())
    }

    /// ID ve frontě celého účtu, bez ohledu na profil.
    fn queue_ids(&self, kind: Kind) -> Option<Arc<HashSet<u64>>> {
        if !self.is_logged_in() {
            return None;
        }
        let client = self.client.clone();
        self.data
            .get(&Self::queue_key(kind), PERSONAL_TTL, move || async move {
                client.queue_ids(kind).await.map_err(|e| e.to_string())
            })
            .ready()
            .cloned()
    }

    /// Patří položka do "Chci vidět" aktivního profilu (jeho nebo společná)?
    pub fn is_my_queued(&mut self, item: &Item) -> bool {
        let Some(ids) = self.queue_ids(item.kind) else {
            return false;
        };
        ids.contains(&item.id)
            && self
                .profiles()
                .is_some_and(|p| p.is_queued_for(&p.active_id, item.kind, item.id))
    }

    /// Množina "mých" ID pro odznaky na kartách.
    pub fn my_queue_set(&mut self, kind: Kind) -> HashSet<u64> {
        let (Some(ids), Some(p)) = (self.queue_ids(kind), self.profiles()) else {
            return HashSet::new();
        };
        ids.iter()
            .copied()
            .filter(|id| p.is_queued_for(&p.active_id, kind, *id))
            .collect()
    }

    /// Přepne "Chci vidět" aktivnímu profilu. Na server se zapisuje, jen když
    /// položka do fronty přibude nebo ji už nikdo nechce.
    pub fn toggle_queue(&mut self, item: &ItemRef, queued: bool) {
        let kind = item.kind;
        let previous = self.queue_ids(kind);
        let on_server = previous.as_ref().is_some_and(|s| s.contains(&item.id));
        let Some(before) = self.profiles() else {
            return;
        };
        let change = self.profiles_mut().map_or(ServerChange::None, |p| {
            p.toggle(kind, item.id, queued, on_server)
        });
        self.stored.save();
        if change == ServerChange::None {
            return;
        }
        let mut next: HashSet<u64> = previous.as_deref().cloned().unwrap_or_default();
        if change == ServerChange::Add {
            next.insert(item.id);
        } else {
            next.remove(&item.id);
        }
        self.data.set(&Self::queue_key(kind), next);
        let client = self.client.clone();
        let events = Arc::clone(&self.events);
        let id = item.id;
        self.data.spawn(async move {
            let result = client
                .set_queued(kind, id, change == ServerChange::Add)
                .await;
            events.lock().unwrap().push(match result {
                Ok(()) => Event::QueueSaved(kind),
                Err(e) => Event::QueueFailed {
                    profiles: before,
                    kind,
                    previous,
                    message: e.to_string(),
                },
            });
        });
    }

    fn handle_events(&mut self) {
        let events: Vec<Event> = std::mem::take(&mut *self.events.lock().unwrap());
        for event in events {
            match event {
                Event::Settings(s) => {
                    if let Some(s) = s {
                        let changed = s.sosac_domain != self.settings.sosac_domain;
                        self.settings = s.clone();
                        self.stored.settings = Some(s);
                        self.stored.save();
                        if changed {
                            self.reset_client();
                        }
                    }
                    self.splash.discovered();
                }
                Event::LoggedIn(result) => {
                    self.login.busy = false;
                    match result {
                        Ok(credentials) => {
                            self.stored.session = Some(credentials);
                            self.stored.onboarded = true;
                            self.login.pass.clear();
                            let _ = self.profiles_mut();
                            self.stored.save();
                            self.reset_client();
                            self.tab(Route::Home);
                        }
                        Err(e) => self.login.error = Some(e),
                    }
                }
                Event::QueueFailed {
                    profiles,
                    kind,
                    previous,
                    message,
                } => {
                    if let Some(p) = self.profiles_mut() {
                        *p = profiles;
                    }
                    self.stored.save();
                    match previous {
                        Some(prev) => self.data.set(&Self::queue_key(kind), (*prev).clone()),
                        None => self.data.invalidate(&Self::queue_key(kind)),
                    }
                    self.toast = Some((
                        format!("Seznam se nepodařilo uložit: {message}"),
                        Instant::now(),
                    ));
                }
                Event::QueueSaved(kind) => {
                    self.data.invalidate(&format!("my/{}/queue", kind.key()));
                }
            }
        }
    }

    fn handle_keys(&mut self, ctx: &egui::Context) {
        let typing = ctx.egui_wants_keyboard_input();
        let (esc, backspace, mouse_back, f11, ctrl_f, fullscreen) = ctx.input(|i| {
            (
                i.key_pressed(egui::Key::Escape),
                i.key_pressed(egui::Key::Backspace),
                i.pointer.button_pressed(egui::PointerButton::Extra1),
                i.key_pressed(egui::Key::F11),
                i.modifiers.command && i.key_pressed(egui::Key::F),
                i.viewport().fullscreen.unwrap_or(false),
            )
        });
        if f11 {
            ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!fullscreen));
        }
        if esc && fullscreen {
            ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
        } else if (esc && !typing) || (backspace && !typing) || mouse_back {
            if self.whats_new {
                self.dismiss_whats_new();
            } else if !self.route.is_tab() || !self.history.is_empty() {
                self.back();
            } else if self.route != Route::Home {
                self.tab(Route::Home);
            }
        }
        if ctrl_f && !matches!(self.route, Route::Play { .. }) {
            self.tab(Route::Search);
            self.search.focus = true;
        }
    }

    fn dismiss_whats_new(&mut self) {
        self.whats_new = false;
        self.stored.seen_version = Some(changelog::CURRENT.into());
        self.stored.save();
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut egui::Ui, frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.handle_events();
        self.handle_keys(&ctx);

        let screen = ui.max_rect();
        ui.painter().rect_filled(screen, 0.0, theme::BG);

        let splash = self.splash.progress();
        if splash < 1.0 {
            // Obsah se kreslí až pod mizející úvodní obrazovkou.
            if self.splash.fading() {
                self.content(ui, frame);
            }
            self.splash.show(ui, screen);
        } else if self.whats_new {
            self.player.close();
            self.stage.show(ui, screen, None, chrome::StageMode::Dim);
            self.whats_new_screen(ui, screen);
        } else {
            self.content(ui, frame);
        }
        self.show_toast(ui, screen);
        self.titlebar.show(&ctx, true);
    }

    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        let c = theme::BG;
        [
            c.r() as f32 / 255.0,
            c.g() as f32 / 255.0,
            c.b() as f32 / 255.0,
            1.0,
        ]
    }
}

impl App {
    fn content(&mut self, ui: &mut egui::Ui, frame: &eframe::Frame) {
        let screen = ui.max_rect();
        if let Route::Play { item, serial_id } = self.route.clone() {
            self.player_screen(ui, frame, screen, &item, serial_id);
            return;
        }
        self.player.close();
        match self.route.clone() {
            Route::Home => self.home(ui, screen),
            Route::Movies => self.browse(ui, screen, Kind::Movie),
            Route::Serials => self.browse(ui, screen, Kind::Serial),
            Route::My => self.my_list(ui, screen),
            Route::Search => self.search_screen(ui, screen),
            Route::Profile => self.profile_screen(ui, screen),
            Route::Movie(id) => self.movie_detail(ui, screen, id),
            Route::Serial(id) => self.serial_detail(ui, screen, id),
            Route::Play { .. } => {}
        }
        self.nav_bar(ui, screen);
    }

    fn show_toast(&mut self, ui: &mut egui::Ui, screen: egui::Rect) {
        const VISIBLE: f32 = 4.0;
        let Some((text, at)) = &self.toast else {
            return;
        };
        let t = at.elapsed().as_secs_f32();
        if t > VISIBLE {
            self.toast = None;
            return;
        }
        let alpha = (t / 0.2).min(1.0).min((VISIBLE - t) / 0.4);
        let g = ui
            .painter()
            .layout_no_wrap(text.clone(), theme::semibold(15.0), theme::INK);
        let rect = egui::Rect::from_center_size(
            egui::pos2(screen.center().x, screen.bottom() - 48.0),
            g.size() + egui::vec2(36.0, 22.0),
        );
        ui.painter().rect_filled(
            rect,
            20.0,
            egui::Color32::from_rgba_unmultiplied(40, 40, 46, (240.0 * alpha) as u8),
        );
        ui.painter().galley(
            rect.min + egui::vec2(18.0, 11.0),
            g,
            theme::INK.gamma_multiply(alpha),
        );
        ui.ctx().request_repaint();
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Stav aktualizace pro obrazovku Profil a navigaci.
pub fn update_status(update: &SharedUpdate) -> update::Status {
    update.lock().unwrap().clone()
}
