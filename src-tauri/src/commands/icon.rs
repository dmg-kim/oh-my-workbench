// Icon 관련 Tauri commands — ARCHITECTURE §5.2

use crate::domain::icon_extractor;
use crate::error::Result;
use base64::Engine as _;

/// 실행 파일 경로에서 아이콘을 추출해 `data:image/png;base64,...` 형식으로 반환한다.
/// 결과는 %APPDATA%\oh-my-workbench\icons\ 에 PNG로 캐시된다.
#[tauri::command]
pub fn icon_extract_app(path: String) -> Result<String> {
    let png = icon_extractor::extract_app_icon(&path)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(format!("data:image/png;base64,{encoded}"))
}
