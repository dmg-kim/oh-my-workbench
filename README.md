# oh-my-workbench

Windows용 개인 워크벤치 런처. 카테고리별로 웹 URL과 로컬 프로그램을 한 화면에 모아 **단 한 번의 클릭**으로 실행해 업무 효율을 극대화하는 것이 목표.

- 플랫폼: Windows 10 (21H2+) / 11
- 기술 스택: **Tauri 2.x** (Rust) + React 19 + TypeScript + Tailwind CSS 4 + dnd-kit + Zustand 5 (+ zundo)

## 주요 기능

- **한 페이지 계층 구성** — 섹션 → 카테고리 → 아이템(웹 URL / 로컬 앱) 그리드 렌더링
- **아이콘**
  - 로컬 앱(`.exe` / `.lnk`): Windows API(`SHGetFileInfoW` → GDI → PNG → base64)로 자동 추출
  - 웹 URL: Simple Icons(npm 번들) 브랜드 아이콘 사용, 아이템별 **자동 / 라이트 / 다크** 렌더 옵션
- **편집 모드** (Ctrl+E) — 섹션·카테고리·아이템 추가 / 수정 / 삭제, dnd-kit 드래그 앤 드롭 재배치, Undo/Redo (Ctrl+Z / Ctrl+Y)
- **전역 검색** (Ctrl+K) — 레이블 / URL / 경로 인덱싱, 섹션·카테고리 breadcrumb 표시
- **설정 내보내기 / 가져오기** — JSON 파일 수동 백업·이관 (편집 모드 전용 버튼)
- **테마 전환** — 시스템 / 다크 / 라이트 (Tailwind `@variant dark`)
- **전역 단축키로 창 토글** — 기본 `Ctrl+Alt+Space`, 편집 모드에서 변경 가능
- **일별 스냅샷** — `config.json` 로드 시점에 오늘 날짜 스냅샷 자동 저장, 최대 7일 보존
- **원자적 저장** — `atomicwrites` crate로 임시 파일 → rename

## 문서

- 제품 요구사항: [`docs/PRD.md`](./docs/PRD.md)
- 아키텍처: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- UX 설계: [`docs/UX.md`](./docs/UX.md)
- 개발 사례(회고): [`docs/RESULT.md`](./docs/RESULT.md)

## 개발 환경 요구사항

1. **Node.js** 20+ (권장 22/24)
2. **Rust stable** (MSVC 타겟) — `rustup default stable-x86_64-pc-windows-msvc`
3. **Visual Studio 2022 Build Tools** — C++ 빌드 도구(링커) 포함
4. **WebView2 런타임** — Windows 11 기본 포함, Windows 10은 대부분 자동 배포됨

## 개발

```powershell
# 최초 1회
npm install

# 개발 모드 (Vite + Tauri 동시 실행)
npm run tauri dev

# 프로덕션 빌드 (NSIS per-user 설치 파일 생성)
npm run tauri build
```

## 프로젝트 구조

```
oh-my-workbench/
├── docs/                PRD / 아키텍처 / UX / 회고 문서
├── src/                 프론트엔드 (Vite + React + TS)
│   ├── components/      UI 컴포넌트
│   ├── state/           Zustand 스토어 (config / editMode)
│   ├── hooks/           커스텀 훅 (useTheme 등)
│   ├── icons/           Simple Icons 검색 인덱스
│   └── ipc/             타입 안전 invoke 래퍼 + 공유 타입
├── src-tauri/           Rust 백엔드 + Tauri 설정
│   └── src/
│       ├── commands/    얇은 #[tauri::command] 함수
│       ├── domain/      순수 로직 (config_store, icon_extractor, launcher, snapshot 등)
│       ├── error.rs     AppError + 변환
│       ├── logging.rs   로그 초기화
│       └── paths.rs     %APPDATA% 경로 유틸
└── public/              정적 자원
```

상세 구조는 [`docs/ARCHITECTURE.md §3`](./docs/ARCHITECTURE.md)을 참조.

## 단축키 요약

| 단축키 | 동작 |
|---|---|
| `Ctrl+Alt+Space` (기본) | 메인 창 표시 / 숨김 (전역) |
| `Ctrl+K` | 검색 바 포커스 |
| `Ctrl+E` | 편집 모드 토글 |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo (편집 모드) |

## 상태

**M2 (MVP) 완료 — 개인 PC 상시 사용 가능 수준.** 구현된 기능 목록은 위 "주요 기능" 및 [`docs/RESULT.md`](./docs/RESULT.md) 참조. 기본 브라우저 지정(FR-8), 실행 이력 기반 정렬(FR-5), 복수 페이지 UI(FR-10), HTML 북마크 가져오기(v1.1)는 미구현으로 남아 있음.
