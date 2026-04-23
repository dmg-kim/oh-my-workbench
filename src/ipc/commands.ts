// 타입 안전 invoke 래퍼
// 상세 설계: docs/ARCHITECTURE.md §5

import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types";

export function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export function configLoad(): Promise<Config> {
  return invoke<Config>("config_load");
}

export function configSave(config: Config): Promise<void> {
  return invoke<void>("config_save", { config });
}

export function configImport(json: string): Promise<Config> {
  return invoke<Config>("config_import", { json });
}

export type LaunchAppArgs = {
  target: string;
  arguments?: string;
  workingDirectory?: string;
  runAs?: "normal" | "admin";
};

export function launchUrl(url: string): Promise<void> {
  return invoke<void>("launch_url", { url });
}

export function launchApp(args: LaunchAppArgs): Promise<void> {
  return invoke<void>("launch_app", { args });
}

export function iconExtractApp(path: string): Promise<string> {
  return invoke<string>("icon_extract_app", { path });
}

export function hotkeyReregister(hotkey: string, prevHotkey?: string): Promise<void> {
  return invoke<void>("hotkey_reregister", { hotkey, prevHotkey });
}

// TODO(M2): icon_fetch_favicon / icon_save_uploaded
// TODO(M2): list_installed_browsers
// TODO(v1.1): bookmark_parse_html
