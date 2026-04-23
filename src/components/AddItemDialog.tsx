import { useState, useEffect, useRef, useMemo } from "react";
import { useConfigStore } from "../state/configStore";
import { searchSimpleIcons } from "../icons/search";
import type { Item, ItemIcon } from "../ipc/types";

export type AddItemContext = {
  pageId: string;
  sectionId: string;
  categoryId: string;
  item?: Item; // 있으면 수정 모드
};

type Props = {
  context: AddItemContext | null;
  onClose: () => void;
};

type ItemType = "url" | "app";

const FIELD = "w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:border-neutral-500 focus:outline-none";

export function AddItemDialog({ context, onClose }: Props) {
  const addItem = useConfigStore((s) => s.addItem);
  const updateItem = useConfigStore((s) => s.updateItem);

  const [type, setType] = useState<ItemType>("url");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");
  const [iconStyle, setIconStyle] = useState<"auto" | "light" | "dark">("auto");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [siSearch, setSiSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [target, setTarget] = useState("");
  const [args, setArgs] = useState("");
  const [runAsAdmin, setRunAsAdmin] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  const searchResults = useMemo(() => searchSimpleIcons(siSearch), [siSearch]);

  useEffect(() => {
    if (!context) return;
    const { item } = context;
    if (item) {
      setType(item.type);
      setLabel(item.label);
      if (item.type === "url") {
        setUrl(item.url);
        setIconStyle(item.iconStyle ?? "auto");
        setSelectedSlug(item.icon?.kind === "simpleIcons" ? item.icon.slug : "");
        setTarget("");
        setArgs("");
        setRunAsAdmin(false);
      } else {
        setUrl("https://");
        setIconStyle("auto");
        setSelectedSlug("");
        setTarget(item.target);
        setArgs(item.arguments ?? "");
        setRunAsAdmin(item.runAs === "admin");
      }
    } else {
      setType("url");
      setLabel("");
      setUrl("https://");
      setIconStyle("auto");
      setSelectedSlug("");
      setTarget("");
      setArgs("");
      setRunAsAdmin(false);
    }
    setSiSearch("");
    setShowDropdown(false);
    setErr(null);
  }, [context]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDropdown) { setShowDropdown(false); return; }
        onClose();
      }
    };
    if (context) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [context, onClose, showDropdown]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  if (!context) return null;

  const switchType = (t: ItemType) => {
    setType(t);
    setErr(null);
  };

  const handleSelectSlug = (slug: string) => {
    setSelectedSlug(slug);
    setSiSearch("");
    setShowDropdown(false);
  };

  const handleClearSlug = () => {
    setSelectedSlug("");
    setSiSearch("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimLabel = label.trim();
    if (!trimLabel) { setErr("이름을 입력해주세요"); return; }

    let item: Item;

    if (type === "url") {
      const trimUrl = url.trim();
      if (!trimUrl.startsWith("http://") && !trimUrl.startsWith("https://")) {
        setErr("http:// 또는 https://로 시작하는 URL을 입력해주세요");
        return;
      }
      const icon: ItemIcon | undefined = selectedSlug
        ? { kind: "simpleIcons", slug: selectedSlug, color: "brand" }
        : undefined;
      item = {
        id: crypto.randomUUID(),
        type: "url",
        label: trimLabel,
        url: trimUrl,
        icon,
        iconStyle: iconStyle === "auto" ? undefined : iconStyle,
      };
    } else {
      const trimTarget = target.trim();
      if (!trimTarget) { setErr("실행 파일 경로를 입력해주세요"); return; }
      item = {
        id: crypto.randomUUID(),
        type: "app",
        label: trimLabel,
        target: trimTarget,
        arguments: args.trim() || undefined,
        runAs: runAsAdmin ? "admin" : "normal",
      };
    }

    if (context.item) {
      updateItem(context.pageId, context.sectionId, context.categoryId, { ...item, id: context.item.id });
    } else {
      addItem(context.pageId, context.sectionId, context.categoryId, item);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-5 text-neutral-900 dark:text-neutral-100">
          {context.item ? "아이템 수정" : "아이템 추가"}
        </h2>

        <div className="flex gap-2 mb-4">
          {(["url", "app"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              className={[
                "flex-1 py-1.5 rounded-md text-sm border transition-colors",
                type === t
                  ? "border-neutral-500 dark:border-neutral-400 bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
              ].join(" ")}
            >
              {t === "url" ? "웹 URL" : "로컬 앱"}
            </button>
          ))}
        </div>

        <label className="block mb-3">
          <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">이름 *</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={type === "url" ? "GitHub" : "메모장"}
            className={FIELD}
            autoFocus
          />
        </label>

        {type === "url" ? (
          <>
            <label className="block mb-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">URL *</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className={FIELD}
              />
            </label>

            {/* 아이콘 검색 */}
            <div className="mb-3" ref={searchContainerRef}>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">
                아이콘
                {selectedSlug && (
                  <span className="ml-2 text-neutral-400 dark:text-neutral-500">
                    — {selectedSlug}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={siSearch}
                    onChange={(e) => { setSiSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => { if (siSearch) setShowDropdown(true); }}
                    placeholder={selectedSlug ? `"${selectedSlug}" 선택됨 — 다시 검색하려면 입력` : "검색해서 아이콘 선택 (URL에서 자동 감지)"}
                    className={FIELD}
                  />
                  {selectedSlug && (
                    <button
                      type="button"
                      onClick={handleClearSlug}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs px-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {selectedSlug && (
                  <img
                    src={`https://cdn.simpleicons.org/${encodeURIComponent(selectedSlug)}`}
                    alt={selectedSlug}
                    className="w-8 h-8 object-contain shrink-0 dark:brightness-0 dark:invert"
                  />
                )}
              </div>

              {/* 검색 결과 드롭다운 */}
              {showDropdown && searchResults.length > 0 && (
                <div className="relative">
                  <div className="absolute z-20 top-1 w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl max-h-52 overflow-y-auto p-2">
                    <div className="grid grid-cols-5 gap-1">
                      {searchResults.map((icon) => (
                        <button
                          key={icon.slug}
                          type="button"
                          title={icon.title}
                          onMouseDown={(e) => { e.preventDefault(); handleSelectSlug(icon.slug); }}
                          className={[
                            "flex flex-col items-center gap-1 p-2 rounded-md transition-colors",
                            selectedSlug === icon.slug
                              ? "bg-neutral-200 dark:bg-neutral-600"
                              : "hover:bg-neutral-100 dark:hover:bg-neutral-700",
                          ].join(" ")}
                        >
                          <img
                            src={`https://cdn.simpleicons.org/${encodeURIComponent(icon.slug)}`}
                            alt={icon.title}
                            className="w-6 h-6 object-contain dark:brightness-0 dark:invert"
                          />
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate w-full text-center leading-tight">
                            {icon.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mb-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">아이콘 스타일</span>
              <div className="flex gap-2">
                {(["auto", "light", "dark"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setIconStyle(s)}
                    className={[
                      "flex-1 py-1.5 rounded-md text-xs border transition-colors",
                      iconStyle === s
                        ? "border-neutral-500 dark:border-neutral-400 bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
                        : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300",
                    ].join(" ")}
                  >
                    {s === "auto" ? "자동" : s === "light" ? "라이트" : "다크"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-600 mt-1">
                {iconStyle === "auto" && "앱 테마에 따라 자동 전환"}
                {iconStyle === "light" && "항상 브랜드 컬러 (라이트 배경용)"}
                {iconStyle === "dark" && "항상 흰색 (다크 배경용)"}
              </p>
            </div>
          </>
        ) : (
          <>
            <label className="block mb-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">실행 파일 경로 *</span>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="C:\Windows\notepad.exe"
                className={`${FIELD} font-mono`}
              />
            </label>
            <label className="block mb-3">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 mb-1 block">실행 인자 (선택)</span>
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="--flag value"
                className={`${FIELD} font-mono`}
              />
            </label>
            <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={runAsAdmin}
                onChange={(e) => setRunAsAdmin(e.target.checked)}
                className="accent-amber-400"
              />
              <span className="text-sm text-neutral-700 dark:text-neutral-300">관리자 권한으로 실행</span>
            </label>
          </>
        )}

        {err && (
          <p className="text-xs text-red-500 dark:text-red-400 mb-3">{err}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm rounded-md bg-neutral-900 dark:bg-neutral-100 text-neutral-100 dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-white transition-colors font-medium"
          >
            {context.item ? "저장" : "추가"}
          </button>
        </div>
      </form>
    </div>
  );
}
