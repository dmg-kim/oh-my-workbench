// APPDATA 경로 유틸
// 상세 설계: docs/ARCHITECTURE.md §4.1

use std::path::PathBuf;

const APP_DIR_NAME: &str = "oh-my-workbench";

pub fn app_data_dir() -> PathBuf {
    let base = std::env::var("APPDATA").unwrap_or_else(|_| String::from("."));
    PathBuf::from(base).join(APP_DIR_NAME)
}

pub fn config_path() -> PathBuf {
    app_data_dir().join("config.json")
}

pub fn snapshots_dir() -> PathBuf {
    app_data_dir().join("snapshots")
}

pub fn icons_dir() -> PathBuf {
    app_data_dir().join("icons")
}
