// URL 스킴 화이트리스트 — 순수 함수
// 상세 설계: docs/ARCHITECTURE.md §6.4, §8.3, PRD NFR 6.3

use crate::error::{AppError, Result};

const DEFAULT_ALLOWED_PREFIXES: &[&str] = &["http:", "https:", "file:", "ms-"];

pub fn is_allowed(url: &str) -> Result<()> {
    if DEFAULT_ALLOWED_PREFIXES
        .iter()
        .any(|prefix| url.starts_with(prefix))
    {
        Ok(())
    } else {
        Err(AppError::SchemeBlocked(url.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_http_and_https() {
        assert!(is_allowed("http://example.com").is_ok());
        assert!(is_allowed("https://example.com").is_ok());
    }

    #[test]
    fn rejects_unknown_scheme() {
        assert!(is_allowed("javascript:alert(1)").is_err());
    }
}
