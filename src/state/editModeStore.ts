// 편집 모드 토글 스토어
// 상세 설계: docs/UX.md §3, PRD D-3

import { create } from "zustand";

type EditModeState = {
  isEditing: boolean;
  setEditing: (v: boolean) => void;
  toggle: () => void;
};

export const useEditModeStore = create<EditModeState>((set) => ({
  isEditing: false,
  setEditing: (v) => set({ isEditing: v }),
  toggle: () => set((s) => ({ isEditing: !s.isEditing })),
}));

// TODO(M2): 편집 모드 최초 진입 시 config_snapshot invoke (데일리 스냅샷)
