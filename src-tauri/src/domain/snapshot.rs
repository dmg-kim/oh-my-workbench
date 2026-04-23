// 일별 설정 스냅샷 — PRD FR-3
// %APPDATA%\oh-my-workbench\snapshots\YYYY-MM-DD.json, 최대 7일 보관

use crate::paths;
use chrono::Local;
use std::path::Path;

const KEEP_DAYS: usize = 7;

/// config.json 원본 바이트를 받아 오늘 날짜 스냅샷을 생성한다.
/// 이미 오늘 스냅샷이 있으면 아무것도 하지 않는다.
/// 실패는 조용히 무시한다 (백업 실패가 앱 시작을 막으면 안 됨).
pub fn take_daily(raw: &[u8]) {
    let dir = paths::snapshots_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }

    let today = Local::now().format("%Y-%m-%d").to_string();
    let dest = dir.join(format!("{today}.json"));

    if dest.exists() {
        return;
    }

    if std::fs::write(&dest, raw).is_err() {
        return;
    }

    prune(&dir);
}

fn prune(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    let mut files: Vec<std::path::PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();

    // YYYY-MM-DD 파일명은 사전 순 = 날짜 순
    files.sort();

    if files.len() > KEEP_DAYS {
        for path in files.iter().take(files.len() - KEEP_DAYS) {
            let _ = std::fs::remove_file(path);
        }
    }
}
