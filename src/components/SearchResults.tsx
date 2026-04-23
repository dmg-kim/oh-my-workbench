import { ItemIcon } from "./ItemIcon";
import type { Item, Page } from "../ipc/types";

type Hit = {
  item: Item;
  sectionName: string;
  categoryName: string;
};

function collectHits(page: Page, query: string): Hit[] {
  const q = query.toLowerCase();
  const hits: Hit[] = [];
  for (const section of page.sections) {
    for (const category of section.categories) {
      for (const item of category.items) {
        const labelMatch = item.label.toLowerCase().includes(q);
        const urlMatch = item.type === "url" && item.url.toLowerCase().includes(q);
        const targetMatch = item.type === "app" && item.target.toLowerCase().includes(q);
        if (labelMatch || urlMatch || targetMatch) {
          hits.push({ item, sectionName: section.name, categoryName: category.name });
        }
      }
    }
  }
  return hits;
}

type Props = {
  query: string;
  page: Page;
  onLaunch: (item: Item) => void;
};

export function SearchResults({ query, page, onLaunch }: Props) {
  const hits = collectHits(page, query.trim());

  if (hits.length === 0) {
    return (
      <div className="px-6 py-12 text-sm text-neutral-500 text-center">
        "<span className="text-neutral-700 dark:text-neutral-300">{query}</span>" 에 해당하는 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <p className="text-xs text-neutral-500 mb-4">{hits.length}개 결과</p>
      <ul className="space-y-1">
        {hits.map(({ item, sectionName, categoryName }) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onLaunch(item)}
              className="w-full flex items-center gap-3 rounded-md border border-transparent px-3 py-2 hover:border-neutral-200 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors text-left"
            >
              <div className="w-8 h-8 shrink-0 rounded bg-neutral-200/80 dark:bg-neutral-800/80 flex items-center justify-center overflow-hidden">
                <ItemIcon item={item} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-neutral-900 dark:text-neutral-100 truncate">{item.label}</div>
                <div className="text-xs text-neutral-500 truncate">
                  {sectionName} / {categoryName}
                </div>
              </div>
              <div className="text-xs text-neutral-400 dark:text-neutral-600 shrink-0 truncate max-w-48">
                {item.type === "url" ? item.url : item.target}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
