import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ItemIcon } from "./ItemIcon";
import type { Item } from "../ipc/types";

type Props = {
  item: Item;
  isEditing: boolean;
  onRemove: () => void;
  onLaunch: () => void;
  onEdit: () => void;
};

export function SortableItem({ item, isEditing, onRemove, onLaunch, onEdit }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, data: { type: "item" }, disabled: !isEditing });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style} className="group relative">
      <button
        type="button"
        onClick={() => { if (isEditing) onEdit(); else onLaunch(); }}
        title={isEditing ? "클릭하여 수정" : item.type === "url" ? item.url : item.target}
        {...(isEditing ? { ...attributes, ...listeners } : {})}
        className={[
          "w-full rounded-md border bg-white dark:bg-neutral-950 p-2 text-center transition-colors select-none",
          isDragging
            ? "border-neutral-300 dark:border-neutral-700 opacity-30"
            : isEditing
            ? "border-neutral-300 dark:border-neutral-800 cursor-grab active:cursor-grabbing hover:border-amber-400/60"
            : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-900 active:bg-neutral-100 dark:active:bg-neutral-800",
        ].join(" ")}
      >
        <div className="w-12 h-12 mx-auto rounded bg-neutral-200/80 dark:bg-neutral-800/80 mb-1.5 flex items-center justify-center overflow-hidden">
          <ItemIcon item={item} />
        </div>
        <div className="text-xs truncate text-neutral-800 dark:text-neutral-200">{item.label}</div>
      </button>

      {isEditing && !isDragging && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          title="삭제"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-900 border border-red-700 text-red-200 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
        >
          ×
        </button>
      )}
    </li>
  );
}
