# oh-my-workbench — 아키텍처 설계서

> 문서 버전: 0.2
> 작성일: 2026-04-21 (최종 수정: 2026-04-22)
> 대상: M2(MVP) 구현 완료 시점의 실제 구조 스냅샷 + 남은 과제
> 참조: [docs/PRD.md](./PRD.md) v0.4 — 모든 결정(D-1 ~ D-8)을 전제로 함
>
> **표기 규약** — 구현 상태는 각 섹션에 ✅(구현) / ⚠(부분) / ❌(미구현) / ⏳(v1.1 이상) 으로 명시한다.

---

## 1. 목표와 원칙

### 1.1 설계 목표
1. **런처로서 가벼울 것** — 콜드 스타트 <1s, RAM <100MB (아이템 300개 기준)
2. **Windows 네이티브 통합의 완성도** — 아이콘 추출·UWP 런칭·UAC·전역 핫키가 1급 시민
3. **UI 반복 속도 유지** — 편집 모드·드래그 앤 드롭·테마는 웹 스택 생산성 활용
4. **확장 유연성** — 데이터 스키마는 `pages[]`/플러그인 지점을 미리 남겨 v1.x 확장이 마이그레이션 없이 가능

### 1.2 설계 원칙
- **보안 경계 명확**: 렌더러는 임의의 파일·프로세스에 직접 접근하지 않는다. 모든 네이티브 동작은 Tauri `#[command]` 경유.
- **얇은 command 래퍼**: Rust 측 command 함수는 얇게 유지하고, 실제 로직은 별도 모듈에 둔다(테스트 가능성 확보).
- **에러는 값으로**: Rust는 `Result<T, AppError>`, 프론트엔드는 판별 가능한 에러 객체를 받는다. `panic!` 금지.
- **파일 쓰기는 항상 원자적**: 직접 `fs::write` 금지, 저장 헬퍼 경유.
- **로그에 기밀 노출 금지**: URL query string, 프로세스 인자는 redact 후 기록.

---

## 2. 전체 구조

### 2.1 고수준 다이어그램

```
+--------------------------------------------------------------+
|  WebView2 (Edge Chromium) — 렌더러 프로세스                  |
|                                                              |
|  +-------------------- Frontend (React) -----------------+  |
|  |  UI 컴포넌트 (Grid, Tile, EditPanel, IconPicker, ...)  |  |
|  |              ↕ 상태 (Zustand + temporal undo)           |  |
|  |              ↕ Tauri invoke (typed wrappers)            |  |
|  +---------------------------------------------------------+  |
+--------------------------------+-----------------------------+
                                 |
                         JSON-RPC via IPC
                                 |
+--------------------------------v-----------------------------+
|  Tauri Core (Rust) — 메인 프로세스                            |
|                                                              |
|  Commands layer  ── thin #[tauri::command] 함수들             |
|       ↓                                                       |
|  Domain modules                                               |
|   ├── config_store   (읽기·쓰기·백업·스냅샷)                    |
|   ├── icon_extractor (exe/lnk/UWP 아이콘, favicon)             |
|   ├── launcher       (URL·프로그램 실행, 브라우저 프로파일)     |
|   ├── bookmark_import(v1.1 — HTML 파서)                        |
|   └── hotkey         (전역 단축키)                              |
|       ↓                                                       |
|  Integrations                                                 |
|   ├── windows crate  (Win32 / WinRT API)                       |
|   ├── tracing        (로깅)                                    |
|   └── tauri plugins  (global-shortcut, updater, fs, dialog...) |
+--------------------------------------------------------------+
```

### 2.2 프로세스 모델
- **메인 프로세스(Rust)**: 모든 파일 I/O, 프로세스 실행, Win32 호출 담당. 단일 프로세스.
- **렌더러(WebView2)**: UI/상태만 담당. `nodeIntegration` 개념 없음 — JS가 OS API에 직접 접근하는 경로 자체가 존재하지 않음.
- **IPC**: Tauri의 `invoke` → `#[tauri::command]` 매핑. 입력/출력은 `serde_json` 직렬화.

---

## 3. 디렉터리 구조 (M2 시점 실제 트리)

```
oh-my-workbench/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md         ← 본 문서
│   ├── UX.md
│   └── RESULT.md                (개발 사례 회고)
├── src/                         ← 프론트엔드 (Vite + React 19 + TS 5.8)
│   ├── main.tsx
│   ├── App.tsx                  (최상위 레이아웃, DnD 루트, 단축키 훅)
│   ├── index.css                (Tailwind CSS 4 엔트리)
│   ├── components/
│   │   ├── AddItemDialog.tsx    (URL / 앱 아이템 추가·수정 다이얼로그)
│   │   ├── CategoryCard.tsx     (카테고리 타일 + 아이템 그리드 + droppable)
│   │   ├── ItemIcon.tsx         (Simple Icons / favicon / extracted 렌더)
│   │   ├── InlineNameInput.tsx  (섹션·카테고리 인라인 입력)
│   │   ├── SearchResults.tsx    (전역 검색 결과 리스트)
│   │   └── SortableItem.tsx     (dnd-kit sortable 아이템 타일)
│   ├── state/
│   │   ├── configStore.ts       (Zustand 5 + zundo temporal, 자동 저장 throttle)
│   │   ├── editModeStore.ts
│   │   └── selectors.ts
│   ├── hooks/
│   │   └── useTheme.ts          (system/dark/light + matchMedia 반영)
│   ├── ipc/
│   │   ├── commands.ts          (typed invoke 래퍼)
│   │   └── types.ts             (Rust ↔ TS 공유 타입)
│   ├── icons/
│   │   ├── simpleIconsIndex.ts  (빌드 타임 생성된 번들 인덱스)
│   │   └── search.ts            (영문 키워드 매칭)
│   └── assets/
├── src-tauri/                   ← Rust 백엔드
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                   (앱 아이콘)
│   └── src/
│       ├── main.rs              (바이너리 엔트리 — lib::run() 호출)
│       ├── lib.rs               (Tauri Builder, 플러그인·단축키 등록, invoke_handler 구성)
│       ├── commands/            (얇은 command 함수)
│       │   ├── mod.rs           (`app_version` 포함)
│       │   ├── config.rs        (config_load / config_save / config_import)
│       │   ├── icon.rs          (icon_extract_app)
│       │   ├── launcher.rs      (launch_url / launch_app)
│       │   └── hotkey.rs        (hotkey_reregister)
│       ├── domain/              (순수 로직)
│       │   ├── mod.rs
│       │   ├── config_store.rs  (Config 타입, load/save, default_seed)
│       │   ├── snapshot.rs      (일별 스냅샷 + 7일 프루닝)
│       │   ├── icon_extractor.rs(SHGetFileInfoW → GDI → PNG → base64)
│       │   ├── launcher.rs      (ShellExecuteW 직접 호출, runas verb)
│       │   ├── scheme_whitelist.rs
│       │   └── bookmark_import.rs  (v1.1 — 스텁)
│       ├── error.rs             (AppError + From 변환)
│       ├── logging.rs           (log crate 초기화)
│       └── paths.rs             (%APPDATA% 경로 유틸)
├── public/                      (정적 자원)
├── package.json
├── tsconfig.json
├── vite.config.ts               (@tailwindcss/vite 플러그인 — tailwind.config.ts 없음, v4 CSS-first 설정)
├── index.html
├── .gitignore
└── README.md
```

v4로 넘어온 Tailwind는 JS config 파일을 요구하지 않으므로 별도 `tailwind.config.ts`는 두지 않는다.

---

## 4. 데이터 모델 및 저장

### 4.1 파일 레이아웃 (`%APPDATA%\oh-my-workbench\`)

**현재 구현 (M2):**
```
%APPDATA%\oh-my-workbench\
├── config.json              ← 메인 설정 (PRD §7 스키마, 원자적 쓰기)
└── snapshots\
    └── YYYY-MM-DD.json      ← 앱 구동 시 config.json 로드 시점의 1일 1회 스냅샷 (최대 7일 보존)
```

**설계상 예정 (M3 이상):**
```
├── config.json.bak.1 ~ .5   ← N세대 백업 (❌ 미구현)
├── icons\                   ← 캐시된 아이콘 (❌ 미구현 — 현재는 base64 인라인)
│   ├── extracted\
│   ├── favicon\
│   └── uploaded\
└── logs\                    ← 파일 로테이션 로깅 (❌ 미구현 — log crate 초기화만 존재)
    ├── app.log
    └── app.log.1 ~ .4
```

즉, v1.0 MVP의 디스크 상태는 `config.json` + `snapshots/` 두 경로만 존재한다. 아이콘은 `IconRef` 스키마에서 `extracted` / `favicon` / `uploaded` 케이스를 유지하되, 로컬 앱 추출은 base64 PNG를 문자열로 돌려받아 렌더러가 그대로 표시하는 방식으로 단순화됐다 (`icon_extract_app`).

### 4.2 config.json 스키마
PRD §7 참조. 스키마 버전은 `$schema` 필드(문자열 숫자)로 관리. `config_store` 모듈이 읽기 시점에 마이그레이션 체인을 통과시킨다.

### 4.3 원자적 쓰기 흐름

**현재 구현 (✅):**
```
save_config(next):
  1. 직렬화 → bytes (serde_json::to_vec_pretty)
  2. AtomicFile::write(path, OverwriteBehavior::AllowOverwrite)
     = 임시 파일 생성 → 내용 쓰기 → rename(tmp → path)
  3. 실패는 AppError::Io로 감싸 반환
```
- 구현: `atomicwrites` 0.4 crate의 `AtomicFile`.
- 단일 인스턴스 체크(`tauri-plugin-single-instance`)는 현재 미도입 — 일상 사용 중 문제 보이면 도입.

**N세대 백업 회전 (❌ 미구현, M3 예정):**
```
  2.5. 기존 config.json → config.json.bak.1 로 회전 (N세대 shift, 기본 N=5)
```
이 단계는 `atomicwrites`가 rename을 수행하기 직전에 수행되어야 하므로, 현재의 `AtomicFile::write` 직접 호출을 풀어 수동 흐름으로 재작성이 필요하다.

### 4.4 Undo / 스냅샷
- **Undo ✅**: Zustand 5 + `zundo` 미들웨어(`temporal`). `configStore`의 `config` 슬라이스 이전 상태를 스택에 보관, `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`로 호출. 설정 가져오기(`configImport`) 시 스택을 clear해 혼선 방지.
- **스냅샷 ✅**: `config_load` 진입 시 config.json 원본 바이트가 성공적으로 읽혔을 때 `snapshot::take_daily(&bytes)` 호출. 오늘 날짜 파일이 없으면 1회 저장, 최대 7일 보존 후 `prune()` — *PRD 초안의 "편집 모드 진입 시점" → 구현 단계에서 로드 시점으로 단순화.*

---

## 5. Tauri Commands (실제 인터페이스)

프론트엔드가 호출할 수 있는 Rust 함수 목록. 입력/출력은 `serde` 직렬화 타입. 인자 검증은 command 레이어에서 수행.

### 5.1 등록된 command (v1.0 / M2 기준)

`lib.rs`의 `invoke_handler`에 실제 등록되어 있는 command는 다음 8개:

| Command | 입력 | 출력 | 구현 | 설명 |
|---|---|---|---|---|
| `app_version` | — | `string` | ✅ | `CARGO_PKG_VERSION` 반환 |
| `config_load` | — | `Config` | ✅ | 없으면 `default_seed` 저장 후 반환. 읽기 성공 시 원본 바이트로 데일리 스냅샷 자동 기록. 역직렬화 실패 시 seed로 복구 |
| `config_save` | `{ config: Config }` | `()` | ✅ | `AtomicFile` 경유 원자적 쓰기 |
| `config_import` | `{ json: string }` | `Config` | ✅ | JSON 파싱 + 스키마 검증 후 반환(저장은 프론트가 결정, 대개 즉시 `config_save`) |
| `launch_url` | `{ url: string }` | `()` | ✅ | 스킴 화이트리스트 검사 후 `ShellExecuteW` 기본 핸들러로 실행 |
| `launch_app` | `{ args: LaunchAppArgs }` | `()` | ✅ | `{ target, arguments?, workingDirectory?, runAs?: "normal" \| "admin" }`. admin은 `ShellExecuteW` verb `"runas"` |
| `icon_extract_app` | `{ path: string }` | `string` (base64 PNG) | ✅ | `.exe` / `.lnk` 아이콘 추출 → PNG 인코딩 → base64 문자열. 캐시는 현재 없음 |
| `hotkey_reregister` | `{ hotkey: string, prevHotkey?: string }` | `()` | ✅ | 기존 단축키 해제 후 새 단축키 등록. 충돌 시 에러 |

### 5.2 설계되었으나 현 시점 미구현 / 이월

| Command | 우선순위 | 메모 |
|---|---|---|
| `icon_fetch_favicon` | M3 | FR-2 폴백 — 현재 URL 아이템은 Simple Icons 번들 + 사용자 선택으로 커버 |
| `icon_save_uploaded` | M3 | 업로드 탭 추가 시 |
| `list_installed_browsers` | M3 | FR-8(기본 브라우저 지정) 구현 선행 |
| `config_snapshot` | — | 별도 command 없음. `config_load` 내부에서 자동 수행 (§4.4) |
| `config_export` | — | 별도 command 없음. 프론트가 `config`를 JSON 직렬화 후 `<a download>`로 저장 |
| `window_toggle` | — | command 없음. 전역 단축키 핸들러(`lib.rs` `toggle_main_window`)가 직접 윈도우를 show/hide |
| `bookmark_parse_html` | v1.1 | `domain::bookmark_import` 스텁 모듈만 존재 |

### 5.3 에러 형식
Rust `AppError`는 `#[serde(tag = "code", content = "details")]`로 직렬화되어 프론트에 다음 형태로 전달:
```jsonc
{
  "code": "FileNotFound" | "IconExtractFailed" | "SchemeBlocked" | "Io" | "Invalid" | "Serde" | "HotkeyRegisterFailed" | "...",
  "details": "휴먼 리더블 메시지 또는 부가 정보"
}
```
프론트엔드는 `code`로 분기, `details`는 토스트 메시지로 사용.

---

## 6. Rust 모듈 상세

### 6.1 `domain::config_store`
- `load() -> Result<Config>` / `save(&Config) -> Result<()>` / `snapshot(&Config) -> Result<()>`
- 내부 유틸: `rotate_backups(n: usize)`, `migrate(raw: Value) -> Config`
- 단위 테스트는 임시 디렉터리(`tempfile::TempDir`)로 격리.

### 6.2 `domain::icon_extractor`
- `extract_app_icon(target: &str) -> Result<String>` ✅
  - 현재 구현: `.exe` / `.lnk` 경로를 받아 `SHGetFileInfoW`로 HICON 획득 → GDI로 비트맵 추출 → `png` crate로 인코딩 → `base64::engine::general_purpose::STANDARD`로 문자열 반환
  - AUMID(UWP) 처리, HiDPI(`IShellItemImageFactory`) 해상도 업그레이드는 ⏳ 이월
  - 캐시: **없음** — 매 호출마다 재추출. 프론트는 `ItemIcon` 컴포넌트에서 React state로 결과를 보관
- `fetch_favicon(url: &str) -> Result<Option<PathBuf>>` ❌ 미구현
- 캐시 키 설계(SHA-256 앞 16자)는 디스크 캐시 도입 시 사용

### 6.3 `domain::launcher`
- `launch_url(url: &str) -> Result<()>` ✅
  - `scheme_whitelist::is_allowed` 통과 후 `ShellExecuteW("open", url, ...)` 직접 호출.
  - FR-8 미구현: `browser` / `browserProfile` / `incognito` 인자는 현재 미사용. 항상 Windows 기본 브라우저로 실행됨.
- `launch_app(args: LaunchAppArgs) -> Result<()>` ✅
  - `arguments` / `workingDirectory` / `runAs` 지원.
  - `runAs="admin"` → `ShellExecuteW` verb `"runas"` (UAC 프롬프트).
  - 환경 변수 전개(`%USERPROFILE%` 등)는 Windows가 `ShellExecuteW`에서 처리하므로 별도 로직 불필요.

### 6.4 `domain::scheme_whitelist` ✅
- `is_allowed(url: &str) -> Result<()>` — `http` / `https` / `file` / `ms-*` 허용, 그 외는 `AppError::SchemeBlocked` 반환.

### 6.5 `domain::snapshot` ✅
- `take_daily(raw: &[u8])` — `config_load`에서 호출. 오늘 날짜 `.json`이 없으면 원본 바이트 그대로 `snapshots/YYYY-MM-DD.json`에 저장.
- `prune()` — 파일명 사전 순 정렬 후 최신 7개만 유지, 나머지 삭제. 실패는 조용히 무시(백업 실패가 앱 동작을 막아서는 안 됨).

### 6.6 `domain::bookmark_import` (v1.1) ⏳
- 현재는 플레이스홀더 모듈. 구현 시 Netscape HTML 파싱 → `ImportedTree` 반환 (파서 후보: `scraper` 또는 `html5ever`).

### 6.7 `error`
```rust
#[derive(thiserror::Error, Debug, serde::Serialize)]
#[serde(tag = "code", content = "details")]
pub enum AppError {
    #[error("파일을 찾을 수 없습니다: {0}")]
    FileNotFound(String),
    #[error("아이콘 추출 실패: {0}")]
    IconExtractFailed(String),
    #[error("스킴 차단: {0}")]
    SchemeBlocked(String),
    #[error("스키마 마이그레이션 실패: {0}")]
    SchemaMigrationFailed(String),
    #[error("IO 오류: {0}")]
    Io(String),
    // ...
}
```
- `From<std::io::Error>` 등 변환 구현.
- `Result<T> = Result<T, AppError>` 공용 alias.

### 6.8 `logging`
- 현재 구현 (M2, ⚠ 축약): `log` 0.4 crate의 기본 매크로(`log::warn!`, `log::info!`)만 사용. 전역 단축키 등록 실패 등 일부 경로에서 `warn!` 호출.
- 설계상 목표 (M3): `tracing` + `tracing-appender`(rolling file, `%APPDATA%\oh-my-workbench\logs\`)로 교체.
- **Redact 유틸** (M3): `redact_url(url)` → query string 제거, `redact_args(args)` → 전체 `***` 치환. launcher command 진입 시 redacted 값으로 info 로그.

---

## 7. 프론트엔드 상세

### 7.1 상태 관리
- **`configStore`** (Zustand 5 + `zundo` temporal) ✅
  - `config: Config | null`, `status: "idle" | "loading" | "ready" | "error"`, `error: string | null`
  - `actions`: `hydrate`(최초 `config_load`), `setConfig`, `addSection`, `removeSection`, `addCategory`, `removeCategory`, `addItem`, `updateItem`, `removeItem`, `moveItem`
  - 모든 mutator는 내부에서 `config_save` invoke를 트리거(throttle로 드래그 중 연속 이동 대응).
  - `temporal`이 past/future 스택 관리 → `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`가 `undo()` / `redo()` 호출 후 저장 트리거.
  - `configImport` 성공 시 `temporal.clear()` 호출 — 새 config 기준으로 새로 Undo 스택 시작.
- **`editModeStore`** ✅
  - `isEditing: boolean`, `toggle()`
  - 별도 `config_snapshot` invoke는 없음 — 스냅샷은 백엔드 `config_load` 경로에서 자동 수행(§4.4).

### 7.2 IPC 래퍼 (`src/ipc/commands.ts`)
모든 invoke를 타입 안전 래퍼로 감싼다. 실제 export 중:
```ts
appVersion(): Promise<string>
configLoad(): Promise<Config>
configSave(config: Config): Promise<void>
configImport(json: string): Promise<Config>
launchUrl(url: string): Promise<void>
launchApp(args: LaunchAppArgs): Promise<void>
iconExtractApp(path: string): Promise<string>        // base64 PNG
hotkeyReregister(hotkey: string, prevHotkey?: string): Promise<void>
```
- 에러는 `AppError` 객체로 `throw` (`{ code, details }`). 호출부에서 `try/catch` + 토스트 노출.
- TODO 주석으로 남겨둔 이월 command: `icon_fetch_favicon`, `icon_save_uploaded`, `list_installed_browsers`, `bookmark_parse_html`.

### 7.3 Simple Icons 검색 ✅
- 번들: `simple-icons` npm 패키지를 빌드 타임에 `src/icons/simpleIconsIndex.ts`로 인덱싱(필요한 필드만 추출: `title`, `slug`, `hex`).
- 검색: `src/icons/search.ts`에서 영문 소문자 정규화 + 부분 일치.
- 렌더: `ItemIcon` 컴포넌트가 `cdn.simpleicons.org/{slug}/{hex}` URL을 `<img>`로 로드. 아이템별 `iconStyle` 설정(`auto` | `light` | `dark`)에 따라 CSS 필터로 색 반전.

### 7.4 드래그 앤 드롭 (dnd-kit) ✅
- `DndContext`를 `App`에 두고, 아이템 수준 `SortableContext`를 각 카테고리가 보유.
- `customCollision`: `pointerWithin` 우선 + 아이템 컨테이너(접두사 `cat:`)보다 아이템 자체를 우선 hit — 타일 사이 정확한 삽입 지점 식별.
- `onDragEnd`는 소속 섹션/카테고리 식별 후 `configStore.moveItem(src, dst)` 호출. 카테고리 빈 영역으로 드롭하면 해당 카테고리 끝에 append.
- `DragOverlay` + `restrictToWindowEdges` 모디파이어로 드래그 고스트 표시.

### 7.5 레이아웃
- 상단 바: 제목 / 검색(`Ctrl+K`) / 테마 사이클 / (편집 모드 시) 전역 단축키 편집 · 내보내기 · 가져오기 / 편집 토글
- 본문: 세로 스크롤 Page → 섹션(세로) → 카테고리(grid, `auto-fit minmax(220px, 1fr)`) → 아이템 타일(그리드, CategoryCard 내부)
- 타일 크기 S/M/L 전환은 ❌ 미구현 — 현재는 단일 사이즈.

### 7.6 접근성 / 단축키
- **구현된 전역 단축키 훅** (`src/App.tsx`):
  - `Ctrl+K` — 검색 바 포커스 + 선택
  - `Ctrl+E` — 편집 모드 토글
  - `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` — Undo / Redo
- 검색 입력 내에서 `Esc` — 검색어 초기화.
- Tab 이동, 화살표 이동, `F2` 이름 편집, `Delete` 삭제 등은 ⏳ 미구현.
- dnd-kit 키보드 센서도 현재 미설정 (PointerSensor만 등록) — 향후 `KeyboardSensor` 추가 필요.

---

## 8. 보안 모델

### 8.1 Tauri capabilities
- `src-tauri/capabilities/` 파일에서 허용 API 최소화.
- 플러그인 등록: `tauri-plugin-opener`, `tauri-plugin-global-shortcut`. FS / Dialog 플러그인은 현재 사용하지 않음 — 설정 내보내기는 브라우저 `<a download>`, 가져오기는 `<input type="file">` + `file.text()`.
- `ShellExecuteW`는 렌더러가 아닌 Rust command 경유로만 호출됨. 렌더러에서 `fetch()` 대상은 Simple Icons CDN(`https://cdn.simpleicons.org`) 정도.

### 8.2 CSP (`tauri.conf.json`)
**현재 설정 (M2):** `csp: null` — 기본 제약 해제 상태. Simple Icons CDN(`https://`)에서 아이콘을 로드하기 위한 일시 조치.

**M3 재설정 목표:**
```
default-src 'self' ipc: http://ipc.localhost;
img-src 'self' data: https://cdn.simpleicons.org;
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self' ipc: http://ipc.localhost;
```
`img-src`를 Simple Icons CDN 도메인으로 좁히고 `connect-src`에서 `https:` 전역 허용을 제거해야 한다.

### 8.3 URL 스킴 화이트리스트
`http`, `https`, `file`, `ms-*` 기본 허용. 그 외는 설정에서 사용자가 명시적으로 허용한 prefix만.

### 8.4 프로세스 실행 검증
- 현재는 `target`을 `ShellExecuteW`에 그대로 전달(Windows가 경로/파일 타입을 해석).
- `arguments`는 그대로 전달. **로그 redact는 아직 미구현 (§6.8 참조)**.
- `runAs="admin"`은 항상 UAC 프롬프트 — 조용한 승격 경로 없음.
- AUMID 기반 UWP 런칭은 ⏳ 미구현.

---

## 9. 에러 처리 전략

| 계층 | 전략 |
|---|---|
| Rust domain | `Result<T, AppError>`. `panic!` 금지. |
| Rust command | domain의 Result를 그대로 반환. 추가로 입력 검증 실패 시 `AppError::Invalid(...)`. |
| IPC | Tauri가 `AppError`를 `{ code, message, details }`로 직렬화 (via `#[serde(tag = "code")]`). |
| 프론트엔드 ipc 래퍼 | `throw` — 호출부의 try/catch로. |
| UI | 토스트 또는 모달. 치명적 에러는 "로그 열기" 버튼 제공. |

---

## 10. 성능 예산

| 구간 | 예산 | 달성 전략 |
|---|---|---|
| 콜드 스타트 | <1s | 초기 렌더에서 필요한 최소 데이터만 로드, 아이콘은 lazy |
| `config_load` | <50ms | 단일 JSON read, 스키마 검증 zero-copy(serde) |
| 아이템 클릭 → 실행 요청 IPC | <50ms | command 핸들러는 blocking 최소화, 실제 spawn만 |
| 드래그 프리뷰 | 60fps | React 재렌더 최소화, transform 기반 animation |
| 편집 중 자동 저장 throttle | 200ms | 드래그 중 과도한 저장 방지 |
| 아이콘 추출(cold) | <500ms | 캐시 미스일 때만; 캐시 히트는 <5ms |

---

## 11. 빌드 / 배포 파이프라인

### 11.1 개발
- `npm run tauri dev` — Vite dev server + Rust 메인 프로세스 핫 리로드.

### 11.2 프로덕션 빌드
- `npm run tauri build` → `src-tauri/target/release/bundle/nsis/` 에 `.exe` 설치 파일 생성.
- 번들 옵션(`tauri.conf.json`):
  - `nsis.installMode: "perUser"`
  - `nsis.allowToChangeInstallationDirectory: true`
  - 서명 관련 설정은 v1.0에서 비워둠(D-6).

### 11.3 자동 업데이트
- `tauri-plugin-updater`: 코드 서명 확보 전까지 **비활성**. 설정은 스텁으로 남겨둠.

---

## 12. 테스트 전략 (M2 현재 / 계획)

- **현재 (M2)**: 자동화된 테스트 스위트 없음 — 수동 실행 + 실제 사용으로 검증.
- **M3 계획**
  - **Rust 단위 테스트**: `domain::*`의 순수 로직(`scheme_whitelist::is_allowed`, 스키마 마이그레이션, HTML 파서).
  - **Rust 통합 테스트**: `tempfile`로 격리된 APPDATA에서 `config_store` 읽기/쓰기/백업 회전 검증, `snapshot::take_daily` 파일 생성·프루닝 검증.
  - **프론트 단위 테스트**: Vitest. `configStore` mutator, Simple Icons 검색 매칭, `customCollision` 엣지 케이스.
  - **E2E**: `WebdriverIO + tauri-driver` 도입 검토.

---

## 13. 알려진 위험 및 대응

| 위험 | 대응 |
|---|---|
| UWP 아이콘/런칭의 엣지 케이스 | v1.0은 exe/lnk 우선, UWP는 best-effort. 실패 시 기본 아이콘 + 사용자 업로드 폴백 |
| HiDPI에서 추출된 아이콘 해상도 | `IShellItemImageFactory` 256px 요청, 부족하면 favicon 또는 업로드로 대체 |
| 사내 AV의 NSIS 설치 파일 오탐 | 초기 배포 전 동작 확인. 지속 이슈 시 portable 모드 v1.x 도입 |
| Tauri 2.x의 breaking change | `Cargo.lock` / `package-lock.json` 고정, 업그레이드는 마이너 버전 단위 신중히 |

---

## 14. 후속 과제 (M3 이상)

- **N세대 백업 회전** (§4.3) — `AtomicFile::write` 경유를 풀고 수동 rename 흐름으로 전환
- **아이콘 디스크 캐싱** (§4.1) — `icons/{extracted,favicon,uploaded}/` 구조화, base64 인라인 → 경로 참조
- **`icon_fetch_favicon`, `icon_save_uploaded`** (§5.2) — 아이콘 선택 UI의 favicon 탭 / 업로드 탭 활성화
- **`list_installed_browsers` + FR-8** — 레지스트리 기반 브라우저 감지, 프로파일·시크릿 옵션 반영
- **`tracing` 기반 로깅 + redact 유틸** (§6.8) — 현재 `log` crate 초기화에 rolling file / `redact_url` / `redact_args` 추가
- **CSP 재설정** (§8.2) — 현재 `null`인 CSP를 Simple Icons CDN 한정으로 좁힘
- **`tauri-plugin-updater` 활성화** — 코드 서명 확보 후
- **자동화 테스트 도입** (§12)
- **v1.1**: `domain::bookmark_import` 완성, 복수 페이지 UI (`pages[]` 의 다중 원소 렌더)

관련 산출물: `docs/UX.md`(와이어프레임·인터랙션), `docs/RESULT.md`(개발 사례 회고).
