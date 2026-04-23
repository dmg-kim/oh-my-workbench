// launch_url / launch_app — ShellExecuteW 직접 FFI (shell32.dll)
// 상세 설계: docs/ARCHITECTURE.md §5.3

use crate::domain::scheme_whitelist;
use crate::error::{AppError, Result};

#[tauri::command]
pub fn launch_url(url: String) -> Result<()> {
    scheme_whitelist::is_allowed(&url)?;
    shell_execute("open", &url, None, None, false)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAppArgs {
    pub target: String,
    pub arguments: Option<String>,
    pub working_directory: Option<String>,
    pub run_as: Option<String>,
}

#[tauri::command]
pub fn launch_app(args: LaunchAppArgs) -> Result<()> {
    let as_admin = args.run_as.as_deref() == Some("admin");
    shell_execute(
        if as_admin { "runas" } else { "open" },
        &args.target,
        args.arguments.as_deref(),
        args.working_directory.as_deref(),
        as_admin,
    )
}

// ─── Windows 구현 ─────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod win_ffi {
    #[link(name = "shell32")]
    extern "system" {
        // 반환값: > 32 성공 / ≤ 32 오류 코드 (HINSTANCE를 정수로 취급)
        pub fn ShellExecuteW(
            hwnd: isize,
            lp_operation: *const u16,
            lp_file: *const u16,
            lp_parameters: *const u16,
            lp_directory: *const u16,
            n_show_cmd: i32,
        ) -> isize;
    }
}

#[cfg(target_os = "windows")]
fn to_wide_nul(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn shell_execute(
    verb: &str,
    file: &str,
    params: Option<&str>,
    directory: Option<&str>,
    _as_admin: bool,
) -> Result<()> {
    use std::ptr;

    let verb_w = to_wide_nul(verb);
    let file_w = to_wide_nul(file);
    let params_w: Option<Vec<u16>> = params.map(to_wide_nul);
    let dir_w: Option<Vec<u16>> = directory.map(to_wide_nul);

    const SW_SHOWNORMAL: i32 = 1;

    let rc = unsafe {
        win_ffi::ShellExecuteW(
            0,
            verb_w.as_ptr(),
            file_w.as_ptr(),
            params_w.as_ref().map_or(ptr::null(), |v| v.as_ptr()),
            dir_w.as_ref().map_or(ptr::null(), |v| v.as_ptr()),
            SW_SHOWNORMAL,
        )
    };

    if rc > 32 {
        Ok(())
    } else {
        Err(AppError::Io(format!(
            "ShellExecuteW 실패: '{file}' (code={rc})"
        )))
    }
}

#[cfg(not(target_os = "windows"))]
fn shell_execute(
    _verb: &str,
    _file: &str,
    _params: Option<&str>,
    _directory: Option<&str>,
    _as_admin: bool,
) -> Result<()> {
    Err(AppError::Io("Windows 전용 기능".into()))
}
