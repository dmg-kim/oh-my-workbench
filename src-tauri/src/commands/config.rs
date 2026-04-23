// Config 관련 commands — ARCHITECTURE §5.1

use crate::domain::config_store::{self, Config};
use crate::error::AppError;

#[tauri::command]
pub fn config_load() -> Result<Config, AppError> {
    config_store::load()
}

#[tauri::command]
pub fn config_save(config: Config) -> Result<(), AppError> {
    config_store::save(&config)
}

/// JSON 문자열을 Config로 파싱·검증 후 저장한다. 스키마 불일치 시 Serde 에러 반환.
#[tauri::command]
pub fn config_import(json: String) -> Result<Config, AppError> {
    let cfg: Config = serde_json::from_str(&json)
        .map_err(|e| AppError::Serde(format!("올바른 설정 파일이 아닙니다: {e}")))?;
    config_store::save(&cfg)?;
    Ok(cfg)
}
