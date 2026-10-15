//! Profil: přihlášení k Sosáči, nebo nastavení s profily a aktualizacemi.

use eframe::egui::{self, Rect, Ui, pos2, vec2};

use super::chrome::{CONTENT_TOP, StageMode};
use super::theme::{self, INK, INK_2, INK_3};
use super::widgets;
use super::{App, Route, changelog};
use crate::update::{self, Status};

/// Otevřený formulář profilu: nový, nebo přejmenování aktivního.
pub struct Edit {
    adding: bool,
    name: String,
    focus: bool,
}

enum Action {
    Login,
    SkipLogin,
    Logout,
    Switch(String),
    StartEdit(bool),
    SaveEdit,
    CancelEdit,
    Remove(String),
    Install(update::Release),
    CheckUpdate,
}

impl App {
    pub(super) fn profile_screen(&mut self, ui: &mut Ui, screen: Rect) {
        self.stage.show(ui, screen, None, StageMode::Dim);
        let content =
            Rect::from_min_max(pos2(screen.left(), screen.top() + CONTENT_TOP), screen.max);
        let width = 760.0f32.min(screen.width() - 2.0 * theme::GUTTER);
        let mut actions = Vec::new();
        ui.scope_builder(egui::UiBuilder::new().max_rect(content), |ui| {
            egui::ScrollArea::vertical()
                .id_salt("profile")
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    ui.vertical_centered(|ui| {
                        ui.add_space(12.0);
                        ui.allocate_ui(vec2(width, 0.0), |ui| {
                            ui.set_width(width);
                            ui.vertical(|ui| {
                                if self.is_logged_in() {
                                    self.settings_panel(ui, width, &mut actions);
                                } else {
                                    self.login_panel(ui, width, &mut actions);
                                }
                            });
                        });
                        ui.add_space(60.0);
                    });
                });
        });
        for a in actions {
            match a {
                Action::Login => self.login(),
                Action::SkipLogin => {
                    self.stored.onboarded = true;
                    self.stored.save();
                    self.tab(Route::Home);
                }
                Action::Logout => self.logout(),
                Action::Switch(id) => {
                    if let Some(p) = self.profiles_mut() {
                        p.active_id = id;
                    }
                    self.stored.save();
                }
                Action::StartEdit(adding) => {
                    let name = if adding {
                        String::new()
                    } else {
                        self.profiles()
                            .map(|p| p.active().name.clone())
                            .unwrap_or_default()
                    };
                    self.profile_edit = Some(Edit {
                        adding,
                        name,
                        focus: true,
                    });
                }
                Action::SaveEdit => {
                    if let Some(edit) = self.profile_edit.take() {
                        let name = edit.name.trim().to_owned();
                        if name.is_empty() {
                            self.profile_edit = Some(edit);
                        } else if let Some(p) = self.profiles_mut() {
                            if edit.adding {
                                p.add(&name);
                            } else {
                                let id = p.active_id.clone();
                                p.rename(&id, &name);
                            }
                            self.stored.save();
                        }
                    }
                }
                Action::CancelEdit => self.profile_edit = None,
                Action::Remove(id) => {
                    if let Some(p) = self.profiles_mut() {
                        p.remove(&id);
                    }
                    self.stored.save();
                }
                Action::Install(release) => {
                    update::install_in_background(self.update.clone(), release, ui.ctx().clone())
                }
                Action::CheckUpdate => update::check_in_background(self.update.clone()),
            }
        }
    }

    fn login_panel(&mut self, ui: &mut Ui, width: f32, actions: &mut Vec<Action>) {
        widgets::bezel(ui, width, |ui| {
            let (r, _) = ui.allocate_exact_size(vec2(40.0, 40.0), egui::Sense::hover());
            widgets::logo_mark(ui, r.center(), 40.0, 1.0, 1.0);
            widgets::wordmark(
                ui,
                pos2(r.right() + 12.0, r.center().y),
                26.0,
                egui::Align2::LEFT_CENTER,
                1.0,
            );
            ui.add_space(18.0);
            widgets::display(
                ui,
                "Filmy a seriály ze Sosáče. Konečně v pořádném kabátě.",
                40.0,
                width - 84.0,
            );
            ui.add_space(22.0);
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("Účet Sosáč")
                        .font(theme::semibold(20.0))
                        .color(INK),
                );
                ui.label(
                    egui::RichText::new("stejné údaje jako na webu")
                        .font(theme::regular(15.0))
                        .color(INK_3),
                );
            });
            let field = 420.0f32.min(width - 84.0);
            let (user, enter_user) = widgets::input(
                ui,
                "login-user",
                &mut self.login.user,
                "Uživatelské jméno",
                false,
                field,
            );
            if !ui.ctx().memory(|m| m.focused().is_some()) && self.login.user.is_empty() {
                user.request_focus();
            }
            let (pass, enter_pass) =
                widgets::input(ui, "login-pass", &mut self.login.pass, "Heslo", true, field);
            if enter_user {
                pass.request_focus();
            }
            if enter_pass {
                actions.push(Action::Login);
            }
            if let Some(e) = &self.login.error {
                ui.label(
                    egui::RichText::new(e)
                        .font(theme::regular(16.0))
                        .color(theme::ERROR),
                );
            }
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                let busy = self.login.busy;
                if widgets::button_ex(
                    ui,
                    if busy { "Ověřuji…" } else { "Přihlásit" },
                    Some("→"),
                    true,
                    None,
                    !busy,
                )
                .clicked()
                {
                    actions.push(Action::Login);
                }
                if widgets::button(ui, "Bez účtu", None, false).clicked() {
                    actions.push(Action::SkipLogin);
                }
            });
            ui.add_space(14.0);
            widgets::paragraph(
                ui,
                "Filmy hraje přehrávač Streamuj, stejně jako na sosac.tv. Celé filmy pustí, když se v něm jednou přihlásíš na streamuj.tv. \
                 Heslo k Sosáči se neukládá, v počítači zůstává jen jeho otisk a jde jen na Sosáč.",
                theme::regular(15.0),
                INK_3,
                width - 84.0,
                5,
            );
        });
    }

    fn settings_panel(&mut self, ui: &mut Ui, width: f32, actions: &mut Vec<Action>) {
        let Some(profiles) = self.profiles() else {
            return;
        };
        let active = profiles.active().clone();
        widgets::eyebrow(ui, "Profil");
        widgets::display(ui, &active.name, 48.0, width);
        ui.label(
            egui::RichText::new(format!(
                "Účet Sosáč: {}",
                self.account().unwrap_or_default()
            ))
            .font(theme::regular(16.0))
            .color(INK_2),
        );
        ui.add_space(14.0);

        // Profily.
        widgets::bezel(ui, width, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("Kdo se dívá")
                        .font(theme::semibold(20.0))
                        .color(INK),
                );
                ui.label(
                    egui::RichText::new("každý profil má vlastní Chci vidět")
                        .font(theme::regular(15.0))
                        .color(INK_3),
                );
            });
            ui.add_space(4.0);
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing = vec2(10.0, 10.0);
                for p in &profiles.profiles {
                    if widgets::chip(ui, &p.name, p.id == active.id).clicked() {
                        actions.push(Action::Switch(p.id.clone()));
                    }
                }
                if widgets::chip(ui, "+ Přidat profil", false).clicked() {
                    actions.push(Action::StartEdit(true));
                }
            });
            ui.add_space(8.0);
            if let Some(edit) = &mut self.profile_edit {
                let hint = if edit.adding {
                    "Jméno nového profilu"
                } else {
                    "Nové jméno"
                };
                let (r, enter) = widgets::input(
                    ui,
                    "profile-name",
                    &mut edit.name,
                    hint,
                    false,
                    420.0f32.min(width - 84.0),
                );
                if std::mem::take(&mut edit.focus) {
                    r.request_focus();
                }
                if enter {
                    actions.push(Action::SaveEdit);
                }
                let can_save = !edit.name.trim().is_empty();
                let label = if edit.adding { "Přidat" } else { "Uložit" };
                ui.horizontal(|ui| {
                    if widgets::button_ex(ui, label, Some("→"), true, None, can_save).clicked() {
                        actions.push(Action::SaveEdit);
                    }
                    if widgets::button(ui, "Zrušit", None, false).clicked() {
                        actions.push(Action::CancelEdit);
                    }
                });
            } else {
                ui.horizontal(|ui| {
                    if widgets::button(ui, "Přejmenovat", None, false).clicked() {
                        actions.push(Action::StartEdit(false));
                    }
                    if profiles.profiles.len() > 1
                        && widgets::button(
                            ui,
                            &format!("Smazat profil {}", active.name),
                            None,
                            false,
                        )
                        .clicked()
                    {
                        actions.push(Action::Remove(active.id.clone()));
                    }
                });
            }
            ui.add_space(6.0);
            widgets::paragraph(
                ui,
                "Profily nemají hesla a žijí jen v tomto počítači. Rozkoukané a dokoukané vede Sosáč na celý účet, takže jsou společné. \
                 Co přidáš na webu sosac.tv, uvidí všichni jako společné.",
                theme::regular(15.0),
                INK_3,
                width - 84.0,
                5,
            );
        });
        ui.add_space(14.0);

        // Aktualizace.
        widgets::bezel(ui, width, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    egui::RichText::new("Aktualizace")
                        .font(theme::semibold(20.0))
                        .color(INK),
                );
                ui.label(
                    egui::RichText::new(format!("verze {}", changelog::CURRENT))
                        .font(theme::regular(15.0))
                        .color(INK_3),
                );
            });
            let status = super::update_status(&self.update);
            let text = match &status {
                Status::Checking => "Hledám novou verzi…".to_owned(),
                Status::UpToDate => "Máš nejnovější verzi.".to_owned(),
                Status::Available(r) => format!("Je venku verze {}.", r.version),
                Status::Installing => "Stahuju a instaluju…".to_owned(),
                Status::Restarting => "Spouštím novou verzi…".to_owned(),
                Status::Failed(e, _) => format!("Aktualizace selhala: {e}"),
            };
            let color = if matches!(status, Status::Failed(..)) {
                theme::ERROR
            } else {
                INK_2
            };
            widgets::paragraph(ui, &text, theme::regular(16.0), color, width - 84.0, 4);
            ui.add_space(4.0);
            match status {
                Status::Available(r) | Status::Failed(_, r) => {
                    if widgets::button(
                        ui,
                        &format!("Aktualizovat na {}", r.version),
                        Some("↓"),
                        true,
                    )
                    .clicked()
                    {
                        actions.push(Action::Install(r));
                    }
                }
                Status::UpToDate => {
                    if widgets::button(ui, "Zkontrolovat znovu", None, false).clicked() {
                        actions.push(Action::CheckUpdate);
                    }
                }
                _ => {}
            }
        });
        ui.add_space(14.0);
        if widgets::button(ui, "Odhlásit", Some("⎋"), false).clicked() {
            actions.push(Action::Logout);
        }
        ui.add_space(10.0);
        widgets::paragraph(
            ui,
            &format!(
                "API {} · stream {}. OpenSosacTV je neoficiální klient, nijak nespojený se Sosáčem ani Streamuj.tv.",
                self.settings.sosac_domain, self.settings.streaming_provider
            ),
            theme::regular(14.0),
            INK_3,
            width,
            3,
        );
    }
}
