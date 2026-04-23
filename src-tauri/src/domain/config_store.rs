// config.json 읽기/쓰기 — PRD §7 스키마
// 상세 설계: docs/ARCHITECTURE.md §4.3, §6.1
//
// 본 모듈은 M2 수직 슬라이스 단계로, 원자적 쓰기만 적용했고 백업 회전·스냅샷·스키마
// 마이그레이션은 후속 커밋에서 추가한다.

use crate::error::{AppError, Result};
use crate::paths;
use atomicwrites::{AtomicFile, OverwriteBehavior};
use serde::{Deserialize, Serialize};
use std::io::Write;

const SCHEMA_VERSION: &str = "1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(rename = "$schema")]
    pub schema: String,
    pub settings: Settings,
    pub pages: Vec<Page>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub default_browser: String,
    pub global_hotkey: String,
    pub start_with_windows: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub sections: Vec<Section>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: String,
    pub name: String,
    pub categories: Vec<Category>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub items: Vec<Item>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col_count: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grid_x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grid_y: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Item {
    Url(UrlItem),
    App(AppItem),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlItem {
    pub id: String,
    pub label: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<IconRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_style: Option<String>, // "auto" | "light" | "dark"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browser: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub browser_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub incognito: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppItem {
    pub id: String,
    pub label: String,
    pub target: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<IconRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_as: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum IconRef {
    SimpleIcons { slug: String, color: String },
    Favicon { path: String },
    Uploaded { path: String },
    Extracted { path: String },
}

pub fn default_seed() -> Config {
    Config {
        schema: SCHEMA_VERSION.into(),
        settings: Settings {
            theme: "system".into(),
            default_browser: "system".into(),
            global_hotkey: "Ctrl+Alt+Space".into(),
            start_with_windows: false,
        },
        pages: vec![Page {
            id: "page-1".into(),
            name: "Main".into(),
            sections: vec![Section {
                id: "sec-start".into(),
                name: "시작하기".into(),
                categories: vec![
                    Category {
                        id: "cat-web".into(),
                        name: "웹".into(),
                        col_count: None,
                        grid_x: None,
                        grid_y: None,
                        items: vec![
                            Item::Url(UrlItem {
                                id: "item-github".into(),
                                label: "GitHub".into(),
                                url: "https://github.com".into(),
                                icon: Some(IconRef::SimpleIcons {
                                    slug: "github".into(),
                                    color: "brand".into(),
                                }),
                                icon_style: None,
                                browser: None,
                                browser_profile: None,
                                incognito: None,
                                tags: None,
                            }),
                            Item::Url(UrlItem {
                                id: "item-google".into(),
                                label: "Google".into(),
                                url: "https://google.com".into(),
                                icon: None,
                                icon_style: None,
                                browser: None,
                                browser_profile: None,
                                incognito: None,
                                tags: None,
                            }),
                        ],
                    },
                    Category {
                        id: "cat-local".into(),
                        name: "로컬".into(),
                        col_count: None,
                        grid_x: None,
                        grid_y: None,
                        items: vec![
                            Item::App(AppItem {
                                id: "item-notepad".into(),
                                label: "메모장".into(),
                                target: "notepad.exe".into(),
                                icon: None,
                                arguments: None,
                                working_directory: None,
                                run_as: Some("normal".into()),
                                tags: None,
                            }),
                            Item::App(AppItem {
                                id: "item-explorer".into(),
                                label: "탐색기".into(),
                                target: "explorer.exe".into(),
                                icon: None,
                                arguments: None,
                                working_directory: None,
                                run_as: Some("normal".into()),
                                tags: None,
                            }),
                        ],
                    },
                ],
            }],
        }],
    }
}

pub fn load() -> Result<Config> {
    let path = paths::config_path();
    if !path.exists() {
        let seed = default_seed();
        save(&seed)?;
        return Ok(seed);
    }
    let bytes = std::fs::read(&path)?;

    // 성공적으로 읽은 원본을 오늘 날짜 스냅샷으로 보관 (실패 무시)
    super::snapshot::take_daily(&bytes);

    // 역직렬화 실패(구 스키마 포함) 시 시드로 자동 복구
    match serde_json::from_slice::<Config>(&bytes) {
        Ok(cfg) => Ok(cfg),
        Err(_) => {
            let seed = default_seed();
            save(&seed)?;
            Ok(seed)
        }
    }
}

pub fn save(cfg: &Config) -> Result<()> {
    let dir = paths::app_data_dir();
    std::fs::create_dir_all(&dir)?;
    let path = paths::config_path();
    let serialized = serde_json::to_vec_pretty(cfg)?;
    let file = AtomicFile::new(&path, OverwriteBehavior::AllowOverwrite);
    file.write(|f| f.write_all(&serialized))
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(())
}
