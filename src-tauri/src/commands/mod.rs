// Tauri command 레이어 — 얇은 래퍼만 두고 실제 로직은 domain::* 에 위임
// 상세 설계: docs/ARCHITECTURE.md §5, §6

pub mod config;
pub mod hotkey;
pub mod icon;
pub mod launcher;

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
