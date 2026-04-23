import { useRef, useEffect } from "react";

type Props = {
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
};

export function InlineNameInput({ placeholder, onConfirm, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = e.currentTarget.value.trim();
      if (value) {
        confirmedRef.current = true;
        onConfirm(value);
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder={placeholder}
      onKeyDown={handleKeyDown}
      onBlur={() => { if (!confirmedRef.current) onCancel(); }}
      className="w-full rounded border border-amber-600/50 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 px-2 py-1.5 text-sm placeholder-neutral-400 dark:placeholder-neutral-600 outline-none focus:border-amber-500"
    />
  );
}
