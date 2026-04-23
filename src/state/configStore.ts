// 설정 상태 스토어 — Zustand + zundo temporal (Undo/Redo)
// 상세 설계: docs/ARCHITECTURE.md §7.1, PRD D-3

import { create } from "zustand";
import { temporal } from "zundo";
import type { Config, Item, Category, Section, Page } from "../ipc/types";
import { configLoad, configSave } from "../ipc/commands";

export type ItemPath = {
  pageId: string;
  sectionId: string;
  categoryId: string;
  index: number;
};

type ConfigState = {
  config: Config | null;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  // Lifecycle
  hydrate: () => Promise<void>;
  setConfig: (next: Config) => void;
  // Section mutators
  addSection: (pageId: string, name: string) => void;
  removeSection: (pageId: string, sectionId: string) => void;
  // Category mutators
  addCategory: (pageId: string, sectionId: string, name: string) => void;
  removeCategory: (
    pageId: string,
    sectionId: string,
    categoryId: string
  ) => void;
  setCategoryColCount: (
    pageId: string,
    sectionId: string,
    categoryId: string,
    colCount: number
  ) => void;
  setCategoryPositions: (
    pageId: string,
    sectionId: string,
    positions: { id: string; gridX?: number; gridY?: number }[]
  ) => void;
  // Item mutators
  addItem: (
    pageId: string,
    sectionId: string,
    categoryId: string,
    item: Item
  ) => void;
  updateItem: (
    pageId: string,
    sectionId: string,
    categoryId: string,
    item: Item
  ) => void;
  removeItem: (
    pageId: string,
    sectionId: string,
    categoryId: string,
    itemId: string
  ) => void;
  moveItem: (from: ItemPath, to: ItemPath) => void;
};

// 200 ms debounce — 연속 편집 시 마지막 변경만 저장
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(config: Config) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void configSave(config);
  }, 200);
}

function mapPages(
  pages: Page[],
  pageId: string,
  fn: (p: Page) => Page
): Page[] {
  return pages.map((p) => (p.id === pageId ? fn(p) : p));
}

function mapSections(
  page: Page,
  sectionId: string,
  fn: (s: Section) => Section
): Page {
  return {
    ...page,
    sections: page.sections.map((s) => (s.id === sectionId ? fn(s) : s)),
  };
}

function mapCategories(
  section: Section,
  categoryId: string,
  fn: (c: Category) => Category
): Section {
  return {
    ...section,
    categories: section.categories.map((c) =>
      c.id === categoryId ? fn(c) : c
    ),
  };
}

export const useConfigStore = create<ConfigState>()(
  temporal(
    (set, get) => ({
      config: null,
      status: "idle",

      hydrate: async () => {
        set({ status: "loading" });
        try {
          const cfg = await configLoad();
          set({ config: cfg, status: "ready", error: undefined });
          // 초기 로드 이전으로 undo 되지 않도록 히스토리 초기화
          useConfigStore.temporal.getState().clear();
        } catch (e) {
          // Tauri IPC 에러는 { code, details } 객체로 온다
          let message: string;
          if (e instanceof Error) {
            message = e.message;
          } else if (typeof e === "object" && e !== null) {
            const obj = e as Record<string, unknown>;
            message = String(obj.details ?? obj.message ?? JSON.stringify(e));
          } else {
            message = String(e);
          }
          set({ status: "error", error: message });
        }
      },

      setConfig: (next) => {
        set({ config: next });
        scheduleSave(next);
      },

      addSection: (pageId, name) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) => ({
            ...p,
            sections: [
              ...p.sections,
              { id: crypto.randomUUID(), name, categories: [] },
            ],
          })),
        };
        set({ config: next });
        scheduleSave(next);
      },

      removeSection: (pageId, sectionId) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) => ({
            ...p,
            sections: p.sections.filter((s) => s.id !== sectionId),
          })),
        };
        set({ config: next });
        scheduleSave(next);
      },

      addCategory: (pageId, sectionId, name) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) => ({
              ...s,
              categories: [
                ...s.categories,
                { id: crypto.randomUUID(), name, items: [] },
              ],
            }))
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      removeCategory: (pageId, sectionId, categoryId) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) => ({
              ...s,
              categories: s.categories.filter((c) => c.id !== categoryId),
            }))
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      setCategoryPositions: (pageId, sectionId, positions) => {
        const { config } = get();
        if (!config) return;
        const posMap = new Map(positions.map((p) => [p.id, p]));
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) => ({
              ...s,
              categories: s.categories.map((c) => {
                const newPos = posMap.get(c.id);
                if (!newPos) return c;
                // gridX/gridY가 undefined면 필드 자체를 제거 (자동 배치로 복귀)
                const { gridX: _gx, gridY: _gy, ...rest } = c;
                if (newPos.gridX === undefined || newPos.gridY === undefined) {
                  return rest as Category;
                }
                return { ...rest, gridX: newPos.gridX, gridY: newPos.gridY };
              }),
            }))
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      setCategoryColCount: (pageId, sectionId, categoryId, colCount) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) =>
              mapCategories(s, categoryId, (c) => ({
                ...c,
                colCount: colCount <= 3 ? undefined : colCount,
              }))
            )
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      addItem: (pageId, sectionId, categoryId, item) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) =>
              mapCategories(s, categoryId, (c) => ({
                ...c,
                items: [...c.items, item],
              }))
            )
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      updateItem: (pageId, sectionId, categoryId, item) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) =>
              mapCategories(s, categoryId, (c) => ({
                ...c,
                items: c.items.map((i) => (i.id === item.id ? item : i)),
              }))
            )
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      removeItem: (pageId, sectionId, categoryId, itemId) => {
        const { config } = get();
        if (!config) return;
        const next: Config = {
          ...config,
          pages: mapPages(config.pages, pageId, (p) =>
            mapSections(p, sectionId, (s) =>
              mapCategories(s, categoryId, (c) => ({
                ...c,
                items: c.items.filter((i) => i.id !== itemId),
              }))
            )
          ),
        };
        set({ config: next });
        scheduleSave(next);
      },

      moveItem: (from, to) => {
        const { config } = get();
        if (!config) return;

        const srcPage = config.pages.find((p) => p.id === from.pageId);
        const srcSection = srcPage?.sections.find(
          (s) => s.id === from.sectionId
        );
        const srcCategory = srcSection?.categories.find(
          (c) => c.id === from.categoryId
        );
        if (!srcCategory || from.index >= srcCategory.items.length) return;
        const item = srcCategory.items[from.index];

        const isSameCat =
          from.pageId === to.pageId &&
          from.sectionId === to.sectionId &&
          from.categoryId === to.categoryId;

        let next: Config;

        if (isSameCat) {
          next = {
            ...config,
            pages: mapPages(config.pages, from.pageId, (p) =>
              mapSections(p, from.sectionId, (s) =>
                mapCategories(s, from.categoryId, (c) => {
                  const items = [...c.items];
                  const [moved] = items.splice(from.index, 1);
                  items.splice(to.index, 0, moved);
                  return { ...c, items };
                })
              )
            ),
          };
        } else {
          // 소스에서 제거
          next = {
            ...config,
            pages: mapPages(config.pages, from.pageId, (p) =>
              mapSections(p, from.sectionId, (s) =>
                mapCategories(s, from.categoryId, (c) => ({
                  ...c,
                  items: c.items.filter((_, i) => i !== from.index),
                }))
              )
            ),
          };
          // 대상에 삽입
          next = {
            ...next,
            pages: mapPages(next.pages, to.pageId, (p) =>
              mapSections(p, to.sectionId, (s) =>
                mapCategories(s, to.categoryId, (c) => {
                  const items = [...c.items];
                  items.splice(Math.min(to.index, items.length), 0, item);
                  return { ...c, items };
                })
              )
            ),
          };
        }

        set({ config: next });
        scheduleSave(next);
      },
    }),
    // config 필드만 undo/redo 히스토리에 포함 (status/error 제외)
    { partialize: (s) => ({ config: s.config }) }
  )
);
