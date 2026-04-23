// oh-my-workbench Tauri core entry
// 상세 설계: docs/ARCHITECTURE.md

mod commands;
mod domain;
mod error;
mod logging;
mod paths;

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let hotkey = domain::config_store::load()
                .map(|c| c.settings.global_hotkey)
                .unwrap_or_else(|_| "Ctrl+Alt+Space".to_string());
            if let Err(e) = app.global_shortcut().register(hotkey.as_str()) {
                log::warn!("전역 단축키 등록 실패 ({hotkey}): {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::config::config_load,
            commands::config::config_save,
            commands::config::config_import,
            commands::launcher::launch_url,
            commands::launcher::launch_app,
            commands::icon::icon_extract_app,
            commands::hotkey::hotkey_reregister,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
