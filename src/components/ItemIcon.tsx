import { useState, useEffect } from "react";
import { iconExtractApp } from "../ipc/commands";
import type { Item, ItemIcon } from "../ipc/types";

// ─── App icon ────────────────────────────────────────────────────────────────

const appIconCache = new Map<string, string>();

function useAppIcon(target: string): string | null {
  const [uri, setUri] = useState<string | null>(
    () => appIconCache.get(target) ?? null
  );

  useEffect(() => {
    if (appIconCache.has(target)) return;

    let cancelled = false;
    iconExtractApp(target)
      .then((dataUri) => {
        appIconCache.set(target, dataUri);
        if (!cancelled) setUri(dataUri);
      })
      .catch(() => {
        appIconCache.set(target, "");
      });

    return () => { cancelled = true; };
  }, [target]);

  return uri || null;
}

function AppIcon({ target }: { target: string }) {
  const uri = useAppIcon(target);
  if (uri) {
    return (
      <img
        src={uri}
        alt=""
        draggable={false}
        className="w-full h-full object-contain p-0.5"
      />
    );
  }
  return <span className="text-neutral-600 text-xs">APP</span>;
}

// ─── URL icon (Simple Icons CDN) ─────────────────────────────────────────────

function urlToSlug(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split(".");
    // 'mail.google.com' → 'google', 'github.com' → 'github'
    return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  } catch {
    return "";
  }
}

const siFailedSlugs = new Set<string>();

type IconStyle = "auto" | "light" | "dark";

const ICON_FILTER: Record<IconStyle, string> = {
  auto:  "dark:brightness-0 dark:invert",
  light: "",
  dark:  "brightness-0 invert",
};

function UrlIcon({
  url,
  icon,
  iconStyle = "auto",
}: {
  url: string;
  icon?: ItemIcon;
  iconStyle?: IconStyle;
}) {
  const slug =
    icon?.kind === "simpleIcons" ? icon.slug : urlToSlug(url);

  const [failed, setFailed] = useState(() => !slug || siFailedSlugs.has(slug));

  useEffect(() => {
    setFailed(!slug || siFailedSlugs.has(slug));
  }, [slug]);

  if (failed) {
    const letter = slug ? slug[0].toUpperCase() : "?";
    return (
      <span className="text-neutral-400 text-sm font-semibold select-none">
        {letter}
      </span>
    );
  }

  return (
    <img
      src={`https://cdn.simpleicons.org/${encodeURIComponent(slug)}`}
      alt=""
      draggable={false}
      className={`w-full h-full object-contain p-1.5 ${ICON_FILTER[iconStyle]}`}
      onError={() => {
        siFailedSlugs.add(slug);
        setFailed(true);
      }}
    />
  );
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function ItemIcon({ item }: { item: Item }) {
  if (item.type === "app") return <AppIcon target={item.target} />;
  return <UrlIcon url={item.url} icon={item.icon} iconStyle={item.iconStyle} />;
}
