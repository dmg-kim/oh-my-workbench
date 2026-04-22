# oh-my-workbench

Windows용 개인 워크벤치 런처. 카테고리별로 웹 URL과 로컬 프로그램을 한 화면에 모아 **단 한 번의 클릭**으로 실행해 업무 효율을 극대화하는 것이 목표.

- 플랫폼: Windows 10 (21H2+) / 11
- 기술 스택: **Tauri 2.x** (Rust) + React 19 + TypeScript + Tailwind CSS 4 + dnd-kit + Zustand

## 문서

- 제품 요구사항: [`docs/PRD.md`](./docs/PRD.md)
- 아키텍처: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

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
├── docs/                PRD / 아키텍처 / 기타 설계 문서
├── src/                 프론트엔드 (Vite + React + TS)
├── src-tauri/           Rust 백엔드 + Tauri 설정
└── public/              정적 자원
```

상세 구조는 [`docs/ARCHITECTURE.md §3`](./docs/ARCHITECTURE.md)을 참조.

## 상태

현재는 **설계 완료 + 스캐폴드** 단계. 실제 기능(섹션/카테고리/아이템, 편집 모드, 드래그 앤 드롭, 아이콘 추출·검색, 런처 실행 등)은 M2(MVP) 마일스톤에서 구현됩니다.
