import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { restrictToWindowEdges } from "@dnd-kit/modifiers";
import { useConfigStore } from "./state/configStore";
import { useEditModeStore } from "./state/editModeStore";
import { launchUrl, launchApp, configImport, hotkeyReregister } from "./ipc/commands";
import { AddItemDialog } from "./components/AddItemDialog";
import { CategoryCard, CAT_PREFIX, colToWidth, catPxHeight, type CatRect } from "./components/CategoryCard";
import { ItemIcon } from "./components/ItemIcon";
import { InlineNameInput } from "./components/InlineNameInput";
import { SearchResults } from "./components/SearchResults";
import { useTheme } from "./hooks/useTheme";
import type { AddItemContext } from "./components/AddItemDialog";
import type { Category, Item, Page } from "./ipc/types";

const THEME_CYCLE = ["system", "dark", "light"] as const;
type ThemeValue = typeof THEME_CYCLE[number];
const THEME_LABEL: Record<ThemeValue, string> = {
  system: "시스템",
  dark: "다크",
  light: "라이트",
};

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function findItemInPage(
  page: Page,
  itemId: string
): { sectionId: string; categoryId: string; index: number } | null {
  for (const section of page.sections) {
    for (const category of section.categories) {
      const idx = category.items.findIndex((i) => i.id === itemId);
      if (idx !== -1)
        return { sectionId: section.id, categoryId: category.id, index: idx };
    }
  }
  return null;
}

function findCategoryInPage(
  page: Page,
  categoryId: string
): { sectionId: string; itemCount: number } | null {
  for (const section of page.sections) {
    const cat = section.categories.find((c) => c.id === categoryId);
    if (cat) return { sectionId: section.id, itemCount: cat.items.length };
  }
  return null;
}

function findItemById(page: Page, itemId: string): Item | null {
  for (const section of page.sections) {
    for (const category of section.categories) {
      const item = category.items.find((i) => i.id === itemId);
      if (item) return item;
    }
  }
  return null;
}

// 카테고리 유효 위치 계산 — 픽셀 좌표 반환
// gridX/gridY가 있으면 픽셀 값 그대로, 없으면 row-packing 자동 배치 (containerWidth 기준 wrap)
function computeEffectivePositions(
  categories: Category[],
  containerWidth: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const GAP = 8;

  const explicit = new Set<string>();
  for (const cat of categories) {
    if (cat.gridX !== undefined && cat.gridY !== undefined) {
      positions.set(cat.id, { x: cat.gridX, y: cat.gridY });
      explicit.add(cat.id);
    }
  }

  // 자동 배치: row-packing — 현재 행에 안 들어가면 다음 행으로
  let rowX = 0;
  let rowY = 0;
  let rowH = 0;
  for (const cat of categories) {
    if (explicit.has(cat.id)) continue;
    const w = colToWidth(cat.colCount ?? 3);
    const h = catPxHeight(cat.items.length, cat.colCount ?? 3);

    if (rowX > 0 && rowX + w > containerWidth) {
      rowY += rowH + GAP;
      rowX = 0;
      rowH = 0;
    }

    positions.set(cat.id, { x: rowX, y: rowY });
    rowX += w + GAP;
    rowH = Math.max(rowH, h);
  }

  return positions;
}

// 섹션 컨테이너 최소 높이 계산 — 픽셀 좌표 기반
function computeSectionMinHeight(
  categories: Category[],
  positions: Map<string, { x: number; y: number }>
): number {
  let maxBottom = 80;
  for (const cat of categories) {
    const pos = positions.get(cat.id) ?? { x: 0, y: 0 };
    const pxH = catPxHeight(cat.items.length, cat.colCount ?? 3);
    maxBottom = Math.max(maxBottom, pos.y + pxH);
  }
  return maxBottom + 24;
}

// 아이템 드래그만 처리 (카테고리 위치 이동은 포인터 이벤트로 직접 처리)
const customCollision: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const itemHits = pointer.filter(({ id }) => !String(id).startsWith(CAT_PREFIX));
  return itemHits.length > 0 ? itemHits : closestCorners(args);
};

// ─── 훅 ───────────────────────────────────────────────────────────────────────

function useUndoRedo() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useConfigStore.temporal.getState().undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        useConfigStore.temporal.getState().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function useEditShortcut() {
  const toggle = useEditModeStore((s) => s.toggle);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "e") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);
}

function useSearchShortcut(inputRef: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputRef]);
}

function launchItem(item: Item) {
  if (item.type === "url") {
    void launchUrl(item.url);
  } else {
    void launchApp({
      target: item.target,
      arguments: item.arguments,
      workingDirectory: item.workingDirectory,
      runAs: item.runAs,
    });
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const config = useConfigStore((s) => s.config);
  const status = useConfigStore((s) => s.status);
  const error = useConfigStore((s) => s.error);
  const hydrate = useConfigStore((s) => s.hydrate);
  const setConfig = useConfigStore((s) => s.setConfig);
  const addSection = useConfigStore((s) => s.addSection);
  const removeSection = useConfigStore((s) => s.removeSection);
  const addCategory = useConfigStore((s) => s.addCategory);
  const removeCategory = useConfigStore((s) => s.removeCategory);
  const setCategoryColCount = useConfigStore((s) => s.setCategoryColCount);
  const setCategoryPositions = useConfigStore((s) => s.setCategoryPositions);
  const removeItem = useConfigStore((s) => s.removeItem);
  const moveItem = useConfigStore((s) => s.moveItem);
  const isEditing = useEditModeStore((s) => s.isEditing);
  const toggle = useEditModeStore((s) => s.toggle);

  const [dialogCtx, setDialogCtx] = useState<AddItemContext | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [addingCatSectionId, setAddingCatSectionId] = useState<string | null>(null);
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hotkeyDraft, setHotkeyDraft] = useState<string | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  // 섹션 컨테이너 유효 폭 (px-6 좌우 padding 48px 제외) — row-packing wrap 기준
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== "undefined" ? Math.max(0, window.innerWidth - 48) : 1200
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const theme = (config?.settings.theme ?? "system") as ThemeValue;
  useTheme(theme);

  useUndoRedo();
  useEditShortcut();
  useSearchShortcut(searchRef);

  useEffect(() => {
    if (status === "idle") void hydrate();
  }, [status, hydrate]);

  useEffect(() => {
    const onResize = () => setContainerWidth(Math.max(0, window.innerWidth - 48));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleThemeCycle = useCallback(() => {
    if (!config) return;
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setConfig({ ...config, settings: { ...config.settings, theme: next } });
  }, [config, theme, setConfig]);

  const handleHotkeyCommit = useCallback(async () => {
    if (!config || hotkeyDraft === null) return;
    const trimmed = hotkeyDraft.trim();
    if (!trimmed || trimmed === config.settings.globalHotkey) {
      setHotkeyDraft(null);
      return;
    }
    try {
      await hotkeyReregister(trimmed, config.settings.globalHotkey);
      setConfig({ ...config, settings: { ...config.settings, globalHotkey: trimmed } });
      setHotkeyDraft(null);
      setHotkeyError(null);
    } catch (err) {
      const msg = typeof err === "object" && err !== null
        ? String((err as Record<string, unknown>).details ?? JSON.stringify(err))
        : String(err);
      setHotkeyError(msg);
    }
  }, [config, hotkeyDraft, setConfig]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const page = config?.pages[0];

  const showImportError = useCallback((msg: string) => {
    setImportError(msg);
    if (importErrorTimer.current) clearTimeout(importErrorTimer.current);
    importErrorTimer.current = setTimeout(() => setImportError(null), 4000);
  }, []);

  const handleExport = useCallback(() => {
    if (!config) return;
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oh-my-workbench-config.json";
    a.click();
    URL.revokeObjectURL(url);
    setExportDone(true);
    if (exportDoneTimer.current) clearTimeout(exportDoneTimer.current);
    exportDoneTimer.current = setTimeout(() => setExportDone(false), 4000);
  }, [config]);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      try {
        const text = await file.text();
        const imported = await configImport(text);
        setConfig(imported);
        useConfigStore.temporal.getState().clear();
      } catch (err) {
        const msg =
          typeof err === "object" && err !== null
            ? String((err as Record<string, unknown>).details ?? (err as Record<string, unknown>).message ?? JSON.stringify(err))
            : String(err);
        showImportError(msg);
      }
    },
    [setConfig, showImportError]
  );

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null);
      if (!over || !page || active.id === over.id) return;

      const from = findItemInPage(page, String(active.id));
      if (!from) return;

      const overId = String(over.id);

      if (overId.startsWith(CAT_PREFIX)) {
        const targetCatId = overId.slice(CAT_PREFIX.length);
        if (targetCatId === from.categoryId) return;
        const target = findCategoryInPage(page, targetCatId);
        if (!target) return;
        moveItem(
          { pageId: page.id, ...from },
          { pageId: page.id, sectionId: target.sectionId, categoryId: targetCatId, index: target.itemCount }
        );
      } else {
        const to = findItemInPage(page, overId);
        if (!to) return;
        if (from.sectionId === to.sectionId && from.categoryId === to.categoryId && from.index === to.index) return;
        moveItem({ pageId: page.id, ...from }, { pageId: page.id, ...to });
      }
    },
    [page, moveItem]
  );

  const activeItem = activeId && page ? findItemById(page, activeId) : null;

  // 섹션별 유효 카테고리 위치 (useMemo로 불필요한 재계산 방지)
  const sectionEffectivePositions = useMemo(() => {
    if (!page) return new Map<string, Map<string, { x: number; y: number }>>();
    const result = new Map<string, Map<string, { x: number; y: number }>>();
    for (const section of page.sections) {
      result.set(section.id, computeEffectivePositions(section.categories, containerWidth));
    }
    return result;
  }, [page, containerWidth]);

  // 카테고리 위치 변경 핸들러 — 같은 섹션의 모든 카테고리 위치를 함께 저장
  const handleCategoryPositionChange = useCallback(
    (sectionId: string, categoryId: string, newX: number, newY: number) => {
      if (!page) return;
      const section = page.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const effPos = computeEffectivePositions(section.categories, containerWidth);
      const positions = section.categories.map((cat) => {
        const eff = effPos.get(cat.id) ?? { x: 0, y: 0 };
        return {
          id: cat.id,
          gridX: cat.id === categoryId ? newX : eff.x,
          gridY: cat.id === categoryId ? newY : eff.y,
        };
      });
      setCategoryPositions(page.id, sectionId, positions);
    },
    [page, setCategoryPositions, containerWidth]
  );

  // 섹션 카테고리 자동 정렬 — gridX/gridY를 제거하여 row-packing으로 복귀
  const handleAutoArrange = useCallback(
    (sectionId: string) => {
      if (!page) return;
      const section = page.sections.find((s) => s.id === sectionId);
      if (!section) return;
      const positions = section.categories.map((cat) => ({
        id: cat.id,
        gridX: undefined,
        gridY: undefined,
      }));
      setCategoryPositions(page.id, sectionId, positions);
    },
    [page, setCategoryPositions]
  );

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <header className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-4 flex items-center gap-4">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold tracking-tight">oh-my-workbench</h1>
          <p className="text-xs text-neutral-500">Windows용 개인 워크벤치 런처</p>
        </div>
        {status === "ready" && (
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
            placeholder="검색… (Ctrl+K)"
            className="flex-1 max-w-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 outline-none focus:border-neutral-500 transition-colors"
          />
        )}
        <div className="ml-auto flex items-center gap-3">
{status === "ready" && (
            <>
              <button
                onClick={handleThemeCycle}
                title="테마 전환"
                className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                {THEME_LABEL[theme]}
              </button>
              {isEditing && config && (
                <>
                  {/* 전역 단축키 편집 */}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0">단축키</span>
                  <input
                    type="text"
                    value={hotkeyDraft ?? config.settings.globalHotkey}
                    onChange={(e) => {
                      setHotkeyDraft(e.target.value);
                      setHotkeyError(null);
                    }}
                    onFocus={() => setHotkeyDraft(config.settings.globalHotkey)}
                    onBlur={() => void handleHotkeyCommit()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleHotkeyCommit();
                      if (e.key === "Escape") { setHotkeyDraft(null); setHotkeyError(null); }
                    }}
                    title={hotkeyError ?? "Enter 또는 포커스 아웃으로 저장"}
                    className={[
                      "w-36 rounded border px-2 py-1 text-xs outline-none transition-colors",
                      hotkeyError
                        ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                        : "border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 focus:border-amber-500",
                    ].join(" ")}
                  />
                </>
              )}
              {isEditing && (
                <>
                  <button
                    onClick={handleExport}
                    title="설정 내보내기"
                    className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  >
                    내보내기
                  </button>
                  <button
                    onClick={handleImportClick}
                    title="설정 가져오기"
                    className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                  >
                    가져오기
                  </button>
                  <input
                    type="file"
                    accept=".json"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </>
              )}
              <button
                onClick={toggle}
                title="편집 모드 (Ctrl+E)"
                className={[
                  "text-xs px-3 py-1.5 rounded-md border transition-colors",
                  isEditing
                    ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200",
                ].join(" ")}
              >
                {isEditing ? "완료" : "편집"}
              </button>
            </>
          )}
        </div>
      </header>

      {exportDone && (
        <div className="mx-6 mt-4 rounded-md border border-emerald-900/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between">
          <span>oh-my-workbench-config.json 을 다운로드 폴더에 저장했습니다.</span>
          <button
            type="button"
            onClick={() => setExportDone(false)}
            className="ml-4 text-emerald-400 hover:text-emerald-200 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {importError && (
        <div className="mx-6 mt-4 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200 flex items-center justify-between">
          <span>가져오기 실패: {importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="ml-4 text-red-400 hover:text-red-200 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="mx-6 mt-6 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          로드 실패: {error ?? "unknown"}
        </div>
      )}

      {status === "loading" && (
        <div className="px-6 py-12 text-sm text-neutral-500">로드 중…</div>
      )}

      {status === "ready" && config && page && searchQuery.trim() && (
        <SearchResults query={searchQuery} page={page} onLaunch={launchItem} />
      )}

      {status === "ready" && config && page && !searchQuery.trim() && (
        <DndContext
          sensors={sensors}
          collisionDetection={customCollision}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="px-6 py-5 space-y-6">
            {page.sections.map((section) => (
              <section key={section.id}>
                <h2 className="text-base font-medium tracking-tight mb-2 flex items-center gap-2 text-neutral-800 dark:text-neutral-200">
                  <span className="inline-block w-1 h-4 bg-neutral-400 dark:bg-neutral-600 rounded" />
                  <span>{section.name}</span>
                  {isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAutoArrange(section.id)}
                        title="카테고리 자동 정렬"
                        className="ml-2 text-[11px] px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                      >
                        자동 정렬
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSection(page.id, section.id)}
                        title="섹션 삭제"
                        className="ml-1 text-xs text-neutral-400 dark:text-neutral-600 hover:text-red-400 transition-colors leading-none"
                      >
                        ×
                      </button>
                    </>
                  )}
                </h2>
                {/* 절대 배치 컨테이너 — 카테고리가 자유롭게 위치함 */}
                {(() => {
                  const secPosMap = sectionEffectivePositions.get(section.id) ?? new Map<string, { x: number; y: number }>();
                  return (
                    <div
                      style={{
                        position: "relative",
                        minHeight: computeSectionMinHeight(section.categories, secPosMap),
                      }}
                    >
                      {section.categories.map((category) => {
                        const pos = secPosMap.get(category.id) ?? { x: 0, y: 0 };
                        // 자신을 제외한 다른 카테고리들의 픽셀 사각형 (겹침 방지용)
                        const otherRects: CatRect[] = section.categories
                          .filter((c) => c.id !== category.id)
                          .map((c) => {
                            const cPos = secPosMap.get(c.id) ?? { x: 0, y: 0 };
                            return {
                              pxLeft: cPos.x,
                              pxTop: cPos.y,
                              pxW: colToWidth(c.colCount ?? 3),
                              pxH: catPxHeight(c.items.length, c.colCount ?? 3),
                            };
                          });
                        return (
                          <CategoryCard
                            key={category.id}
                            category={category}
                            effectiveX={pos.x}
                            effectiveY={pos.y}
                            isEditing={isEditing}
                            otherRects={otherRects}
                            onRemoveItem={(itemId) =>
                              removeItem(page.id, section.id, category.id, itemId)
                            }
                            onEditItem={(item) =>
                              setDialogCtx({
                                pageId: page.id,
                                sectionId: section.id,
                                categoryId: category.id,
                                item,
                              })
                            }
                            onRemove={() =>
                              removeCategory(page.id, section.id, category.id)
                            }
                            onOpenAdd={() =>
                              setDialogCtx({
                                pageId: page.id,
                                sectionId: section.id,
                                categoryId: category.id,
                              })
                            }
                            onLaunchItem={launchItem}
                            onColCountChange={(n) =>
                              setCategoryColCount(page.id, section.id, category.id, n)
                            }
                            onPositionChange={(x, y) =>
                              handleCategoryPositionChange(section.id, category.id, x, y)
                            }
                          />
                        );
                      })}
                    </div>
                  );
                })()}

                {/* 카테고리 추가 버튼 — 컨테이너 하단 */}
                {isEditing && addingCatSectionId === section.id ? (
                  <div className="mt-2 rounded-lg border border-dashed border-amber-600/50 bg-neutral-900/60 p-3 flex items-center">
                    <InlineNameInput
                      placeholder="카테고리 이름 입력 후 Enter"
                      onConfirm={(name) => {
                        addCategory(page.id, section.id, name);
                        setAddingCatSectionId(null);
                      }}
                      onCancel={() => setAddingCatSectionId(null)}
                    />
                  </div>
                ) : isEditing ? (
                  <button
                    type="button"
                    onClick={() => setAddingCatSectionId(section.id)}
                    className="mt-2 w-full rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 py-2 text-xs text-neutral-400 dark:text-neutral-600 hover:border-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-400 transition-colors"
                  >
                    + 카테고리 추가
                  </button>
                ) : null}
              </section>
            ))}

            {isEditing && (
              isAddingSection ? (
                <div className="rounded-lg border border-dashed border-amber-600/50 bg-neutral-50 dark:bg-neutral-900/60 px-4 py-3">
                  <InlineNameInput
                    placeholder="섹션 이름 입력 후 Enter"
                    onConfirm={(name) => {
                      addSection(page.id, name);
                      setIsAddingSection(false);
                    }}
                    onCancel={() => setIsAddingSection(false)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingSection(true)}
                  className="w-full rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 py-3 text-xs text-neutral-400 dark:text-neutral-500 hover:border-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  + 섹션 추가
                </button>
              )
            )}
          </div>

          <DragOverlay modifiers={[restrictToWindowEdges]}>
            {activeItem && (
              <div className="rounded-md border border-neutral-300 dark:border-neutral-500 bg-white dark:bg-neutral-950 p-2 text-center shadow-2xl w-20 cursor-grabbing">
                <div className="w-12 h-12 mx-auto rounded bg-neutral-200/80 dark:bg-neutral-800/80 mb-1.5 flex items-center justify-center overflow-hidden">
                  <ItemIcon item={activeItem} />
                </div>
                <div className="text-xs truncate text-neutral-800 dark:text-neutral-200">{activeItem.label}</div>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <AddItemDialog context={dialogCtx} onClose={() => setDialogCtx(null)} />
    </main>
  );
}

export default App;
