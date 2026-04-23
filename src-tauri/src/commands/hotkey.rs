// 전역 단축키 재등록 command — ARCHITECTURE §5.4

use crate::error::{AppError, Result};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 전역 단축키를 교체한다.
/// prev_hotkey 가 Some 이면 먼저 해제하고, hotkey 를 새로 등록한다.
#[tauri::command]
pub fn hotkey_reregister(
    app: tauri::AppHandle,
    hotkey: String,
    prev_hotkey: Option<String>,
) -> Result<()> {
    if let Some(prev) = prev_hotkey {
        let _ = app.global_shortcut().unregister(prev.as_str());
    }
    app.global_shortcut()
        .register(hotkey.as_str())
        .map_err(|e| AppError::Plugin(e.to_string()))
}
