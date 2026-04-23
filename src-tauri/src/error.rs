// AppError — IPC 경계에서 serde로 직렬화되는 공용 에러 타입
// 상세 설계: docs/ARCHITECTURE.md §6.6

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "details")]
pub enum AppError {
    Io(String),
    Serde(String),
    SchemeBlocked(String),
    Plugin(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Io(m) => write!(f, "IO 오류: {m}"),
            AppError::Serde(m) => write!(f, "직렬화/역직렬화 오류: {m}"),
            AppError::SchemeBlocked(m) => write!(f, "스킴 차단: {m}"),
            AppError::Plugin(m) => write!(f, "플러그인 오류: {m}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Serde(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
