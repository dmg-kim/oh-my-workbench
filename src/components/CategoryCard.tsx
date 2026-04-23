import { useDroppable } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { SortableItem } from "./SortableItem";
import { useRef, useState, useCallback } from "react";
import type { Category, Item } from "../ipc/types";

// 픽셀 단위 사각형 — 겹침 감지에 사용
export type CatRect = { pxLeft: number; pxTop: number; pxW: number; pxH: number };

type Props = {
  category: Category;
  effectiveX: number;  // 픽셀
  effectiveY: number;  // 픽셀
  isEditing: boolean;
  otherRects: CatRect[];
  onRemoveItem: (itemId: string) => void;
  onEditItem: (item: Item) => void;
  onRemove: () => void;
  onOpenAdd: () => void;
  onLaunchItem: (item: Item) => void;
  onColCountChange: (n: number) => void;
  onPositionChange: (x: number, y: number) => void;  // 픽셀
};

export const CAT_PREFIX = "catdrop-";
export const TILE_UNIT = 72;

const TILE_GAP = 8;
const SNAP_UNIT = 8;  // 드래그 배치 세밀도 (px)
const CAT_OVERHEAD = 26;
const DEFAULT_COL = 3;
const MAX_COL = 20;

export function catDropId(categoryId: string) {
  return `${CAT_PREFIX}${categoryId}`;
}

export function colToWidth(n: number): number {
  return n * TILE_UNIT - TILE_GAP + CAT_OVERHEAD;
}

function widthToCol(w: number): number {
  return Math.max(1, Math.round((w - CAT_OVERHEAD + TILE_GAP) / TILE_UNIT));
}

// 카테고리 픽셀 높이 추정 — 편집 모드의 "+" 타일은 마지막 행 빈 셀에 들어가므로
// 대부분의 경우 편집/사용 모드 높이가 동일. (아이템 수가 colCount의 배수인 경우만
// 편집 모드에서 한 행 커짐 — row-packing에는 사용 모드 기준 높이를 사용)
export function catPxHeight(itemCount: number, colCount: number): number {
  const rows = Math.max(1, Math.ceil(itemCount / colCount));
  // p-3(24) + header+mb-2(28) + rows*86 + (rows-1)*gap-2(8)
  return 24 + 28 + rows * 86 + Math.max(0, rows - 1) * 8;
}

// 두 픽셀 사각형 간 최소 gap 미만이면 충돌
function rectsConflict(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  gap = TILE_GAP
): boolean {
  return ax < bx + bw + gap
      && ax + aw + gap > bx
      && ay < by + bh + gap
      && ay + ah + gap > by;
}

// 겹치지 않는 가장 가까운 위치를 SNAP_UNIT 격자 단위로 탐색 (픽셀 반환)
function findFreePosition(
  draggedCols: number,
  draggedPxH: number,
  targetPxX: number,
  targetPxY: number,
  others: CatRect[]
): { x: number; y: number } {
  const w = colToWidth(draggedCols);

  const isFree = (px: number, py: number) => {
    if (px < 0 || py < 0) return false;
    return !others.some((r) =>
      rectsConflict(px, py, w, draggedPxH, r.pxLeft, r.pxTop, r.pxW, r.pxH)
    );
  };

  if (isFree(targetPxX, targetPxY)) return { x: targetPxX, y: targetPxY };

  // 맨해튼 거리(SNAP_UNIT 격자)로 확장하며 빈 자리 탐색 (최대 128 * 8 = 1024px 반경)
  for (let dist = 1; dist <= 128; dist++) {
    for (let dx = -dist; dx <= dist; dx++) {
      const dyAbs = dist - Math.abs(dx);
      const pyList =
        dyAbs === 0
          ? [targetPxY]
          : [targetPxY + dyAbs * SNAP_UNIT, targetPxY - dyAbs * SNAP_UNIT];
      for (const py of pyList) {
        const px = targetPxX + dx * SNAP_UNIT;
        if (isFree(px, py)) return { x: px, y: py };
      }
    }
  }

  return { x: targetPxX, y: targetPxY };
}

export function CategoryCard({
  category,
  effectiveX,
  effectiveY,
  isEditing,
  otherRects,
  onRemoveItem,
  onEditItem,
  onRemove,
  onOpenAdd,
  onLaunchItem,
  onColCountChange,
  onPositionChange,
}: Props) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: catDropId(category.id),
  });

  const cardRef = useRef<HTMLDivElement | null>(null);
  const otherRectsRef = useRef<CatRect[]>(otherRects);
  otherRectsRef.current = otherRects;

  const [previewCol, setPreviewCol] = useState<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null);

  const activeCol = previewCol ?? (category.colCount ?? DEFAULT_COL);
  const isDraggingCat = dragDelta !== null;

  // 드래그 중 비주얼 위치 (픽셀, 포인터 따라감)
  const visualLeft = effectiveX + (dragDelta?.x ?? 0);
  const visualTop = effectiveY + (dragDelta?.y ?? 0);

  // 스냅 위치: SNAP_UNIT 격자 반올림 후 겹침 회피 (픽셀)
  const myPxH = catPxHeight(category.items.length, activeCol);
  const rawSnapX = Math.max(0, Math.round(visualLeft / SNAP_UNIT) * SNAP_UNIT);
  const rawSnapY = Math.max(0, Math.round(visualTop / SNAP_UNIT) * SNAP_UNIT);
  const { x: snappedX, y: snappedY } = isDraggingCat
    ? findFreePosition(activeCol, myPxH, rawSnapX, rawSnapY, otherRects)
    : { x: rawSnapX, y: rawSnapY };

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isEditing || isResizing) return;
      e.preventDefault();
      e.stopPropagation();

      const header = e.currentTarget;
      header.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = (ev: PointerEvent) => {
        setDragDelta({ x: ev.clientX - startX, y: ev.clientY - startY });
      };

      const onUp = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        // 픽셀 위치에서 스냅 후 겹침 회피
        const rawX = Math.max(0, Math.round((effectiveX + dx) / SNAP_UNIT) * SNAP_UNIT);
        const rawY = Math.max(0, Math.round((effectiveY + dy) / SNAP_UNIT) * SNAP_UNIT);
        const pxH = catPxHeight(category.items.length, activeCol);
        const { x: newX, y: newY } = findFreePosition(
          activeCol,
          pxH,
          rawX,
          rawY,
          otherRectsRef.current
        );
        onPositionChange(newX, newY);
        setDragDelta(null);
        header.removeEventListener("pointermove", onMove);
        header.removeEventListener("pointerup", onUp);
      };

      header.addEventListener("pointermove", onMove);
      header.addEventListener("pointerup", onUp);
    },
    [isEditing, isResizing, effectiveX, effectiveY, onPositionChange, activeCol, category.items.length]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingCat) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = e.currentTarget;
      const card = cardRef.current;
      if (!card) return;

      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startWidth = card.offsetWidth;

      setIsResizing(true);

      const calc = (clientX: number) =>
        Math.min(MAX_COL, widthToCol(startWidth + (clientX - startX)));

      const onPointerMove = (ev: PointerEvent) => {
        ev.preventDefault();
        setPreviewCol(calc(ev.clientX));
      };

      const onPointerUp = (ev: PointerEvent) => {
        onColCountChange(calc(ev.clientX));
        setPreviewCol(null);
        setIsResizing(false);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
      };

      handle.addEventListener("pointermove", onPointerMove);
      handle.addEventListener("pointerup", onPointerUp);
    },
    [isDraggingCat, onColCountChange]
  );

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDropRef(el);
      cardRef.current = el;
    },
    [setDropRef]
  );

  return (
    <>
      {/* 드래그 중: 겹침 없는 스냅 위치를 점선 박스로 미리 표시 */}
      {isDraggingCat && (
        <div
          style={{
            position: "absolute",
            left: snappedX,
            top: snappedY,
            width: colToWidth(activeCol),
            height: cardRef.current?.offsetHeight ?? 80,
            pointerEvents: "none",
            zIndex: 49,
          }}
          className="rounded-lg border-2 border-dashed border-amber-400/70 bg-amber-400/5"
        />
      )}

      <div
        ref={mergedRef}
        style={{
          position: "absolute",
          left: visualLeft,
          top: visualTop,
          width: colToWidth(activeCol),
          zIndex: isDraggingCat ? 50 : "auto",
          transition: isDraggingCat ? undefined : "left 0.12s ease, top 0.12s ease",
        }}
        className={[
          "rounded-lg border bg-neutral-50 dark:bg-neutral-900/60 p-3 transition-colors",
          isDraggingCat
            ? "shadow-2xl border-amber-400/60 cursor-grabbing"
            : isEditing
            ? isOver
              ? "border-amber-400/50"
              : "border-amber-900/40"
            : "border-neutral-200 dark:border-neutral-800",
        ].join(" ")}
      >
        {/* 헤더 — 편집 모드에서 드래그 핸들 */}
        <div
          onPointerDown={handleHeaderPointerDown}
          className={[
            "flex items-center justify-between mb-2 rounded",
            isEditing ? "cursor-grab active:cursor-grabbing select-none" : "",
          ].join(" ")}
        >
          <h3 className="text-sm text-neutral-700 dark:text-neutral-300 truncate flex items-center gap-1.5">
            {isEditing && (
              <span className="text-neutral-400 dark:text-neutral-600 text-[10px] leading-none">⠿</span>
            )}
            {category.name}
          </h3>
          {isEditing && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRemove}
              title="카테고리 삭제"
              className="w-4 h-4 ml-2 shrink-0 rounded-full bg-red-900/60 border border-red-800/60 text-red-300 text-[10px] flex items-center justify-center hover:bg-red-700/60 transition-colors"
            >
              ×
            </button>
          )}
        </div>

        <SortableContext
          items={category.items.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(64px,1fr))]">
            {category.items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                isEditing={isEditing}
                onRemove={() => onRemoveItem(item.id)}
                onEdit={() => onEditItem(item)}
                onLaunch={() => onLaunchItem(item)}
              />
            ))}
            {isEditing && (
              <li>
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onOpenAdd}
                  title="아이템 추가"
                  className="w-full rounded-md border border-dashed border-neutral-300 dark:border-neutral-700 p-2 text-center select-none text-neutral-400 dark:text-neutral-500 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                >
                  <div className="w-12 h-12 mx-auto rounded mb-1.5 flex items-center justify-center text-2xl leading-none">
                    +
                  </div>
                  <div className="text-xs">추가</div>
                </button>
              </li>
            )}
          </ul>
        </SortableContext>

        {/* 폭 리사이즈 핸들 */}
        {isEditing && (
          <div
            onPointerDown={handleResizePointerDown}
            style={{ touchAction: "none" }}
            className="absolute inset-y-0 right-0 w-3 cursor-col-resize z-10 flex items-center justify-center group/resize"
            title="드래그하여 폭 조절"
          >
            <div
              className={[
                "w-0.5 h-10 rounded-full transition-colors",
                isResizing
                  ? "bg-amber-400/90"
                  : "bg-transparent group-hover/resize:bg-amber-400/60",
              ].join(" ")}
            />
          </div>
        )}
      </div>
    </>
  );
}
