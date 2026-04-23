// Rust <-> TS 공유 타입
// 상세 설계: docs/PRD.md §7, docs/ARCHITECTURE.md §4

export type ItemIcon =
  | { kind: "simpleIcons"; slug: string; color: "brand" | "monochrome" }
  | { kind: "favicon"; path: string }
  | { kind: "uploaded"; path: string }
  | { kind: "extracted"; path: string };

export type UrlItem = {
  id: string;
  type: "url";
  label: string;
  url: string;
  icon?: ItemIcon;
  iconStyle?: "auto" | "light" | "dark"; // simple icons 표시 방식
  browser?: "default" | "edge" | "chrome" | "firefox";
  browserProfile?: string;
  incognito?: boolean;
  tags?: string[];
};

export type AppItem = {
  id: string;
  type: "app";
  label: string;
  target: string;
  icon?: ItemIcon;
  arguments?: string;
  workingDirectory?: string;
  runAs?: "normal" | "admin";
  tags?: string[];
};

export type Item = UrlItem | AppItem;

export type Category = {
  id: string;
  name: string;
  items: Item[];
  colCount?: number; // 아이콘 열 수 (기본 3)
  gridX?: number;   // 섹션 내 가로 위치 (TILE_UNIT 단위)
  gridY?: number;   // 섹션 내 세로 위치 (TILE_UNIT 단위)
};

export type Section = {
  id: string;
  name: string;
  categories: Category[];
};

export type Page = {
  id: string;
  name: string;
  sections: Section[];
};

export type Settings = {
  theme: "system" | "dark" | "light";
  defaultBrowser: "system" | "edge" | "chrome" | "firefox";
  globalHotkey: string;
  startWithWindows: boolean;
};

export type Config = {
  $schema: string;
  settings: Settings;
  pages: Page[];
};

export type AppError = {
  code: string;
  message: string;
  details?: unknown;
};
