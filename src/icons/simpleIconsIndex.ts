import rawIcons from "simple-icons/icons.json";

export type SimpleIconMeta = {
  title: string;
  slug: string;
  hex: string;
};

type RawEntry = { title: string; slug: string; hex: string };

export const simpleIconsIndex: SimpleIconMeta[] = (rawIcons as unknown as RawEntry[]).map(
  ({ title, slug, hex }) => ({ title, slug, hex })
);
