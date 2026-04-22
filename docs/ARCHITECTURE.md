# oh-my-workbench — 아키텍처 설계서

> 문서 버전: 0.1
> 작성일: 2026-04-21
> 대상: v1.0 구현 진입용 기술 명세
> 참조: [docs/PRD.md](./PRD.md) v0.3 — 모든 결정(D-1 ~ D-8)을 전제로 함

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

## 3. 디렉터리 구조

```
oh-my-workbench/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md         ← 본 문서
│   ├── UX.md                   (예정)
│   └── BACKLOG.md              (예정)
├── src/                         ← 프론트엔드 (Vite + React + TS)
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/              (Page, Section, CategoryCard)
│   │   ├── tile/                (ItemTile, TileGrid)
│   │   ├── edit/                (EditModeToggle, ItemEditor, IconPicker)
│   │   └── common/              (ConfirmDialog, Toast)
│   ├── state/
│   │   ├── configStore.ts       (Zustand + temporal)
│   │   ├── editModeStore.ts
│   │   └── selectors.ts
│   ├── ipc/
│   │   ├── commands.ts          (typed invoke wrappers)
│   │   └── types.ts             (Rust ↔ TS 공유 타입)
│   ├── icons/
│   │   ├── simpleIconsIndex.ts  (번들된 인덱스)
│   │   └── search.ts            (영문 키워드 매칭)
│   ├── styles/                  (Tailwind config, 전역 CSS)
│   └── utils/
├── src-tauri/                   ← Rust 백엔드
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                   (앱 아이콘)
│   └── src/
│       ├── main.rs              (엔트리, 플러그인 등록)
│       ├── lib.rs               (모듈 트리)
│       ├── commands/            (얇은 command 함수)
│       │   ├── mod.rs
│       │   ├── config.rs
│       │   ├── icon.rs
│       │   ├── launcher.rs
│       │   └── hotkey.rs
│       ├── domain/              (순수 로직, 테스트 가능)
│       │   ├── mod.rs
│       │   ├── config_store.rs
│       │   ├── icon_extractor.rs
│       │   ├── launcher.rs
│       │   ├── bookmark_import.rs  (v1.1)
│       │   └── scheme_whitelist.rs
│       ├── error.rs             (AppError + 변환)
│       ├── logging.rs           (tracing 초기화, redact)
│       └── paths.rs             (APPDATA 경로 유틸)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── .gitignore
└── README.md                    (예정)
```

---

## 4. 데이터 모델 및 저장

### 4.1 파일 레이아웃 (`%APPDATA%\oh-my-workbench\`)
```
%APPDATA%\oh-my-workbench\
├── config.json              ← 메인 설정 (PRD §7 스키마)
├── config.json.bak.1 ~ .5   ← N세대 백업
├── snapshots\
│   └── YYYY-MM-DD.json      ← 편집 모드 진입 시점 데일리 스냅샷
├── icons\                   ← 캐시된 아이콘(PNG/SVG)
│   ├── extracted\           ← exe/lnk에서 추출한 것
│   ├── favicon\             ← 웹사이트 favicon
│   └── uploaded\            ← 사용자 업로드
└── logs\
    ├── app.log
    ├── app.log.1 ~ .4       ← 로테이션
```

### 4.2 config.json 스키마
PRD §7 참조. 스키마 버전은 `$schema` 필드(문자열 숫자)로 관리. `config_store` 모듈이 읽기 시점에 마이그레이션 체인을 통과시킨다.

### 4.3 원자적 쓰기 흐름
```
save_config(next):
  1. 직렬화 → bytes
  2. 임시 파일 config.json.tmp 에 쓰기 + fsync
  3. 기존 config.json → config.json.bak.1 로 회전 (N세대 shift)
  4. config.json.tmp → config.json 으로 rename
  5. 실패 시 .tmp 제거, 오류 전파
```
- 구현: `atomicwrites` crate의 `AtomicFile` + 별도 백업 회전 루틴.
- 잠금: 앱 단일 인스턴스 정책이므로 파일 락 불필요(단일 인스턴스 체크는 `tauri-plugin-single-instance`).

### 4.4 Undo / 스냅샷
- **Undo**: 세션 메모리 내 스택. Zustand `temporal` 미들웨어가 각 action의 이전 상태 N개(기본 50)를 보관.
- **스냅샷**: 편집 모드 최초 진입 시 `snapshots/YYYY-MM-DD.json`이 없을 때만 1회 기록. 세션 외 롤백 지점.

---

## 5. Tauri Commands (인터페이스 정의)

프론트엔드가 호출할 수 있는 모든 Rust 함수의 목록. 입력/출력은 `serde` 직렬화 타입. 인자 검증은 command 레이어에서 수행.

### 5.1 Config
| Command | 입력 | 출력 | 설명 |
|---|---|---|---|
| `config_load` | — | `Config` | 기동 시 1회. 없으면 기본 seed 반환. |
| `config_save` | `Config` | `()` | 원자적 쓰기 + 백업 회전. |
| `config_snapshot` | — | `()` | 오늘 날짜의 스냅샷이 없으면 현재 config를 스냅샷으로 저장. |
| `config_export` | `path: string` | `()` | FR-6. JSON으로 내보내기. |
| `config_import` | `path: string` | `Config` | FR-6. 스키마 검증 후 반환(적용은 프론트가 결정). |

### 5.2 Icon
| Command | 입력 | 출력 | 설명 |
|---|---|---|---|
| `icon_extract_app` | `target: string` (path 또는 AUMID) | `{ path: string }` | exe/lnk/UWP 아이콘을 추출하고 `icons/extracted/{hash}.png` 경로를 반환. 이미 캐시되어 있으면 재사용. |
| `icon_fetch_favicon` | `url: string` | `{ path: string } \| null` | favicon 조회 + 저장. 실패 시 null. |
| `icon_save_uploaded` | `bytes: number[], ext: string` | `{ path: string }` | 사용자 업로드 파일을 캐시에 저장. |

*Simple Icons는 번들되어 **프론트엔드에서** 직접 처리 — IPC 불필요.*

### 5.3 Launcher
| Command | 입력 | 출력 | 설명 |
|---|---|---|---|
| `launch_url` | `{ url, browser?, profile?, incognito? }` | `()` | 스킴 화이트리스트 검사 후 실행. `browser="default"`면 `ShellExecuteW`. |
| `launch_app` | `{ target, args?, cwd?, runAs: "normal" \| "admin" }` | `()` | `admin`인 경우 `ShellExecuteW` verb `"runas"`. |
| `list_installed_browsers` | — | `Browser[]` | 레지스트리에서 Chrome/Edge/Firefox 경로 조회 (FR-8 지원). |

### 5.4 Hotkey / Tray
| Command | 입력 | 출력 | 설명 |
|---|---|---|---|
| `hotkey_register` | `accelerator: string` | `()` | 전역 핫키 등록. 충돌 시 에러. |
| `hotkey_unregister` | — | `()` | 해제. |
| `window_toggle` | — | `()` | 메인 창 show/hide (핫키 핸들러 내부에서도 호출). |

### 5.5 Bookmark Import (v1.1)
| Command | 입력 | 출력 | 설명 |
|---|---|---|---|
| `bookmark_parse_html` | `path: string` | `ImportedTree` | Netscape HTML 파싱 → 섹션/카테고리/아이템 후보 트리 반환(적용은 프론트가 확정). |

### 5.6 에러 형식
모든 command는 실패 시 다음 형태로 반환:
```jsonc
{
  "code": "IconExtractFailed" | "FileNotFound" | "SchemeBlocked" | "SchemaMigrationFailed" | "...",
  "message": "휴먼 리더블 메시지",
  "details"?: { ... }        // 선택적, 디버깅용
}
```
프론트엔드는 `code`로 분기, `message`는 토스트에 표시.

---

## 6. Rust 모듈 상세

### 6.1 `domain::config_store`
- `load() -> Result<Config>` / `save(&Config) -> Result<()>` / `snapshot(&Config) -> Result<()>`
- 내부 유틸: `rotate_backups(n: usize)`, `migrate(raw: Value) -> Config`
- 단위 테스트는 임시 디렉터리(`tempfile::TempDir`)로 격리.

### 6.2 `domain::icon_extractor`
- `extract_app_icon(target: &str) -> Result<PathBuf>`
  - 입력이 AUMID(예: `Microsoft.WindowsTerminal_8wekyb3d8bbwe!App`)면 WinRT `PackageManager`로 해석, 아니면 파일 경로로 간주.
  - `.exe`/`.lnk`: `IShellItemImageFactory::GetImage` (HiDPI 대응 64~256px 권장)
  - 결과는 PNG로 변환해 캐시.
- `fetch_favicon(url: &str) -> Result<Option<PathBuf>>` — HTTP GET으로 `/favicon.ico` 및 HTML 파싱.
- 캐시 키: 대상 정규화 경로의 SHA-256 앞 16자.

### 6.3 `domain::launcher`
- `launch_url(req: LaunchUrlReq) -> Result<()>`
  - 스킴 화이트리스트: `http` / `https` / `file` / `ms-*` 이외 거부.
  - `browser="default"` → `ShellExecuteW("open", url, ...)`
  - 프로파일 지정 시 `CreateProcessW` 또는 `Command::new`로 실행 파일 + 인자.
- `launch_app(req: LaunchAppReq) -> Result<()>`
  - 환경 변수 전개(`%USERPROFILE%` 등) 지원.
  - `runAs="admin"` → `ShellExecuteW` verb `"runas"`.
  - stdout/stderr 상속하지 않고 백그라운드 실행(`CREATE_NO_WINDOW` 플래그 고려).

### 6.4 `domain::scheme_whitelist`
- 순수 함수 — `is_allowed(url: &str) -> Result<()>`. 테스트 용이.

### 6.5 `domain::bookmark_import` (v1.1)
- `parse_netscape_html(html: &str) -> ImportedTree`
- DOM 파싱은 `scraper` 또는 `html5ever`. 폴더 → 섹션/카테고리, `<A HREF>` → 아이템.

### 6.6 `error`
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

### 6.7 `logging`
- `tracing` + `tracing-appender`(rolling file, `%APPDATA%\oh-my-workbench\logs\`)
- **Redact 유틸**: `redact_url(url)` → query string 제거, `redact_args(args)` → 전체 `***` 치환.
- 모든 launcher command는 진입 시 redacted 값으로 info 로그.

---

## 7. 프론트엔드 상세

### 7.1 상태 관리
- **`configStore`** (Zustand + temporal)
  - `config: Config`
  - `actions`: `addItem`, `updateItem`, `removeItem`, `moveItem`, `addCategory`, ... 모든 mutator는 store 내부에서 `config_save` invoke 트리거(throttle 200ms — 드래그 중 연속 이동 대응).
  - `temporal`이 past/future 스택 관리 → Ctrl+Z/Y가 `undo()/redo()` 호출 후 save trigger.
- **`editModeStore`**
  - `isEditing: boolean`
  - `setEditing(true)` 시 최초 진입이면 `config_snapshot` invoke.

### 7.2 IPC 래퍼 (`src/ipc/commands.ts`)
모든 invoke를 타입 안전 래퍼로 감싼다. 예:
```ts
export async function launchUrl(req: LaunchUrlReq): Promise<void> {
  return invoke<void>("launch_url", { req });
}
```
- 에러는 `AppError`로 `throw`; 호출부에서 `try/catch` + 토스트.

### 7.3 Simple Icons 검색
- 번들: `simple-icons`의 `_data/simple-icons.json`을 빌드 타임에 `src/icons/simpleIconsIndex.ts`로 변환(필요한 필드만 추출: `title`, `slug`, `hex`).
- 검색: 영문 소문자 정규화 + 부분 일치, 결과 상위 20개.
- 렌더: `simple-icons/icons/{slug}.svg`를 동적 import 또는 단일 스프라이트로 번들.

### 7.4 드래그 앤 드롭 (dnd-kit)
- `DndContext`를 App 최상단에 두고 `SortableContext`를 섹션/카테고리/아이템 각 레벨에 중첩.
- 중첩 컨테이너 간 이동은 `onDragEnd` 핸들러에서 소속 컨테이너 식별 → `configStore.moveItem(src, dst)` 호출.
- 드롭 타깃 하이라이트는 `useDroppable`의 `isOver` + Tailwind 클래스.

### 7.5 레이아웃
- 상단 바: 제목 / 검색(Ctrl+F) / 편집 모드 토글 / 설정
- 본문: 세로 스크롤 Page → 섹션(세로) → 카테고리(grid, auto-fit minmax(220px)) → 아이템 타일(grid, auto-fit minmax(64~96px))
- 타일 크기는 설정에서 S/M/L 전환.

### 7.6 접근성
- 포커스 이동: Tab(영역 간) / 화살표(타일 그리드 내)
- 단축키: `Ctrl+F` 검색, `Ctrl+E` 편집 모드, `F2` 이름 편집, `Delete` 삭제(편집 모드), `Esc` 편집 모드 종료
- dnd-kit은 키보드 DnD 내장 — 사용 설정.

---

## 8. 보안 모델

### 8.1 Tauri capabilities
- `src-tauri/capabilities/main.json`에서 허용 API 최소화.
- 허용: `core:window:*`(제한적), `global-shortcut:*`, `fs`는 앱 데이터 디렉터리 한정, `shell:execute`는 **공백 리스트**(직접 커맨드는 우리 command 경유).
- 렌더러에서 `fetch()`의 대상은 CSP로 제한: `https://*` 허용(favicon 용도), 그 외 차단.

### 8.2 CSP (`tauri.conf.json`)
```
default-src 'self' ipc: http://ipc.localhost;
img-src 'self' data: https:;
script-src 'self';
style-src 'self' 'unsafe-inline';
connect-src 'self' ipc: http://ipc.localhost https:;
```

### 8.3 URL 스킴 화이트리스트
`http`, `https`, `file`, `ms-*` 기본 허용. 그 외는 설정에서 사용자가 명시적으로 허용한 prefix만.

### 8.4 프로세스 실행 검증
- `target`은 기존 파일 경로로 `canonicalize` 시도 — 실패 시 AUMID로 간주.
- `args`는 그대로 전달하되 로그에는 redact.
- `runAs="admin"`은 항상 UAC 프롬프트 — 조용한 승격 경로 없음.

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

## 12. 테스트 전략

- **Rust 단위 테스트**: `domain::*`의 순수 로직(스키마 마이그레이션, 스킴 화이트리스트, HTML 파서).
- **Rust 통합 테스트**: `tempfile`로 격리된 APPDATA에서 `config_store` 읽기/쓰기/백업 회전 검증.
- **프론트 단위 테스트**: Vitest. store mutator, 아이콘 검색 매칭.
- **E2E**: 초기에는 수기 체크리스트. v1.0 후반에 `WebdriverIO + tauri-driver` 도입 검토.

---

## 13. 알려진 위험 및 대응

| 위험 | 대응 |
|---|---|
| UWP 아이콘/런칭의 엣지 케이스 | v1.0은 exe/lnk 우선, UWP는 best-effort. 실패 시 기본 아이콘 + 사용자 업로드 폴백 |
| HiDPI에서 추출된 아이콘 해상도 | `IShellItemImageFactory` 256px 요청, 부족하면 favicon 또는 업로드로 대체 |
| 사내 AV의 NSIS 설치 파일 오탐 | 초기 배포 전 동작 확인. 지속 이슈 시 portable 모드 v1.x 도입 |
| Tauri 2.x의 breaking change | `Cargo.lock` / `package-lock.json` 고정, 업그레이드는 마이너 버전 단위 신중히 |

---

## 14. 다음 산출물과 진입 기준

- `docs/UX.md` — 와이어프레임, 편집 모드 인터랙션 세부, 아이콘 선택 UI 플로우
- `docs/BACKLOG.md` — FR별 작업 분할, 수용 조건(AC)
- **구현 진입 기준(M2 MVP 시작)**: 본 문서 + UX.md의 와이어프레임이 합의되면 FR-1~3, FR-6 구현을 즉시 시작 가능.
