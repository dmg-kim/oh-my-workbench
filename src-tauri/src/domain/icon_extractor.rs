// 로컬 앱 아이콘 추출 (.exe / .lnk) — SHGetFileInfoW + GDI raw FFI
// 상세 설계: docs/ARCHITECTURE.md §6.2
//
// 아이콘 크기: LARGEICON (32×32). 추출 결과는 %APPDATA%\oh-my-workbench\icons\ 에 PNG로 캐시.
// 캐시 키: 경로에 대한 FNV-1a 64비트 해시.

use crate::error::{AppError, Result};
use crate::paths;

/// 실행 파일/링크 경로로부터 아이콘을 추출해 PNG 바이트를 반환한다.
/// 이미 캐시된 경우 디스크에서 읽어 반환한다.
pub fn extract_app_icon(exe_path: &str) -> Result<Vec<u8>> {
    let cache_key = fnv1a_hex(exe_path);
    let out_path = paths::icons_dir().join(format!("{cache_key}.png"));

    if out_path.exists() {
        return std::fs::read(&out_path).map_err(AppError::from);
    }

    let png = platform_extract(exe_path)?;
    std::fs::create_dir_all(paths::icons_dir())?;
    std::fs::write(&out_path, &png)?;
    Ok(png)
}

fn fnv1a_hex(s: &str) -> String {
    let mut h: u64 = 14695981039346656037;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    format!("{h:016x}")
}

// ─── Windows 구현 ─────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn platform_extract(exe_path: &str) -> Result<Vec<u8>> {
    let hicon = get_hicon(exe_path)?;
    let result = hicon_to_png(hicon, 32);
    unsafe { win_ffi::DestroyIcon(hicon) };
    result
}

#[cfg(not(target_os = "windows"))]
fn platform_extract(_exe_path: &str) -> Result<Vec<u8>> {
    Err(AppError::NotImplemented("아이콘 추출은 Windows 전용입니다".into()))
}

// ─── Win32 FFI ────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod win_ffi {
    #[repr(C)]
    pub struct SHFILEINFOW {
        pub h_icon: isize,
        pub i_icon: i32,
        pub dw_attributes: u32,
        pub sz_display_name: [u16; 260],
        pub sz_type_name: [u16; 80],
    }

    #[repr(C)]
    pub struct BITMAPINFOHEADER {
        pub bi_size: u32,
        pub bi_width: i32,
        pub bi_height: i32,
        pub bi_planes: u16,
        pub bi_bit_count: u16,
        pub bi_compression: u32,
        pub bi_size_image: u32,
        pub bi_x_pels_per_meter: i32,
        pub bi_y_pels_per_meter: i32,
        pub bi_clr_used: u32,
        pub bi_clr_important: u32,
    }

    #[repr(C)]
    pub struct RGBQUAD {
        pub rgb_blue: u8,
        pub rgb_green: u8,
        pub rgb_red: u8,
        pub rgb_reserved: u8,
    }

    #[repr(C)]
    pub struct BITMAPINFO {
        pub bmi_header: BITMAPINFOHEADER,
        pub bmi_colors: [RGBQUAD; 1],
    }

    #[link(name = "shell32")]
    extern "system" {
        pub fn SHGetFileInfoW(
            psz_path: *const u16,
            dw_file_attributes: u32,
            psfi: *mut SHFILEINFOW,
            cb_file_info: u32,
            u_flags: u32,
        ) -> usize;
    }

    #[link(name = "gdi32")]
    extern "system" {
        pub fn CreateCompatibleDC(hdc: isize) -> isize;
        pub fn CreateDIBSection(
            hdc: isize,
            pbmi: *const BITMAPINFO,
            i_usage: u32,
            ppv_bits: *mut *mut core::ffi::c_void,
            h_section: isize,
            offset: u32,
        ) -> isize;
        pub fn SelectObject(hdc: isize, h: isize) -> isize;
        pub fn DeleteObject(ho: isize) -> i32;
        pub fn DeleteDC(hdc: isize) -> i32;
    }

    #[link(name = "user32")]
    extern "system" {
        pub fn DrawIconEx(
            hdc: isize,
            x_left: i32,
            y_top: i32,
            h_icon: isize,
            cx_width: i32,
            cy_height: i32,
            istep_if_ani_cur: u32,
            hbr_flicker_free_draw: isize,
            di_flags: u32,
        ) -> i32;
        pub fn DestroyIcon(h_icon: isize) -> i32;
    }
}

#[cfg(target_os = "windows")]
fn to_wide_nul(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "windows")]
fn get_hicon(path: &str) -> Result<isize> {
    use win_ffi::*;
    const SHGFI_ICON: u32 = 0x0000_0100;
    const SHGFI_LARGEICON: u32 = 0x0000_0000;

    let path_w = to_wide_nul(path);
    // SAFETY: SHFILEINFOW는 POD 타입이며 모든 비트 패턴이 유효하다.
    let mut sfi: SHFILEINFOW = unsafe { std::mem::zeroed() };

    let rc = unsafe {
        SHGetFileInfoW(
            path_w.as_ptr(),
            0,
            &mut sfi,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };

    if rc == 0 || sfi.h_icon == 0 {
        Err(AppError::Io(format!("SHGetFileInfoW 실패: {path}")))
    } else {
        Ok(sfi.h_icon)
    }
}

#[cfg(target_os = "windows")]
fn hicon_to_png(hicon: isize, size: i32) -> Result<Vec<u8>> {
    use std::ptr;
    use win_ffi::*;

    let bmi = BITMAPINFO {
        bmi_header: BITMAPINFOHEADER {
            bi_size: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            bi_width: size,
            bi_height: -size, // 음수 = 상→하 방향
            bi_planes: 1,
            bi_bit_count: 32,
            bi_compression: 0, // BI_RGB
            bi_size_image: 0,
            bi_x_pels_per_meter: 0,
            bi_y_pels_per_meter: 0,
            bi_clr_used: 0,
            bi_clr_important: 0,
        },
        bmi_colors: [RGBQUAD { rgb_blue: 0, rgb_green: 0, rgb_red: 0, rgb_reserved: 0 }],
    };

    unsafe {
        let hdc = CreateCompatibleDC(0);
        if hdc == 0 {
            return Err(AppError::Io("CreateCompatibleDC 실패".into()));
        }

        let mut bits_ptr: *mut core::ffi::c_void = ptr::null_mut();
        let hbmp = CreateDIBSection(hdc, &bmi, 0, &mut bits_ptr, 0, 0);

        if hbmp == 0 {
            DeleteDC(hdc);
            return Err(AppError::Io("CreateDIBSection 실패".into()));
        }

        let old_bmp = SelectObject(hdc, hbmp);
        let ok = DrawIconEx(hdc, 0, 0, hicon, size, size, 0, 0, 3 /* DI_NORMAL */);

        let result = if ok != 0 {
            let byte_len = (size * size * 4) as usize;
            let bgra = std::slice::from_raw_parts(bits_ptr as *const u8, byte_len);
            // BGRA → RGBA 변환
            let rgba: Vec<u8> = bgra
                .chunks_exact(4)
                .flat_map(|p| [p[2], p[1], p[0], p[3]])
                .collect();
            encode_rgba_png(&rgba, size as u32)
        } else {
            Err(AppError::Io("DrawIconEx 실패".into()))
        };

        SelectObject(hdc, old_bmp);
        DeleteObject(hbmp);
        DeleteDC(hdc);
        result
    }
}

fn encode_rgba_png(rgba: &[u8], size: u32) -> Result<Vec<u8>> {
    use png::{BitDepth, ColorType, Encoder};

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut encoder = Encoder::new(&mut buf, size, size);
        encoder.set_color(ColorType::Rgba);
        encoder.set_depth(BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|e| AppError::Io(format!("PNG 헤더 오류: {e}")))?;
        writer
            .write_image_data(rgba)
            .map_err(|e| AppError::Io(format!("PNG 데이터 오류: {e}")))?;
    }
    Ok(buf)
}
