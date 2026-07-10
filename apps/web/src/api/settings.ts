// apps/web/src/api/settings.ts

export type ThemePreference = "dark" | "light" | "system";
export type FontSizePreference = "small" | "medium" | "large" | "extra-large";
export type UiDensityPreference = "compact" | "comfortable";
export type SidebarContentPreference =
  | "tasks"
  | "documents"
  | "calendar"
  | "mail";

export type StartupPagePreference =
  | "dashboard"
  | "tasks"
  | "documents"
  | "calendar"
  | "mail"
  | "settings";

export interface AppSettings {
  schemaVersion: 1;

  appearance: {
    theme: ThemePreference;
    fontSize: FontSizePreference;
    density: UiDensityPreference;
    animationsEnabled: boolean;
  };

  sidebar: {
    rightSidebarVisible: boolean;
    rightSidebarDefault: SidebarContentPreference;
    rememberOpenState: boolean;
  };

  workspace: {
    startupPage: StartupPagePreference;
  };

  developer: {
    developerToolsVisible: boolean;
  };
}

export type AppSettingsPatch = {
  appearance?: Partial<AppSettings["appearance"]>;
  sidebar?: Partial<AppSettings["sidebar"]>;
  workspace?: Partial<AppSettings["workspace"]>;
  developer?: Partial<AppSettings["developer"]>;
};

const SETTINGS_STORAGE_KEY = "pioneer.settings.v1";
const LEGACY_SIDEBAR_MODE_KEY = "pioneer-sidebar-mode";

export const SETTINGS_CHANGED_EVENT = "pioneer:settings-changed";

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,

  appearance: {
    theme: "dark",
    fontSize: "medium",
    density: "comfortable",
    animationsEnabled: true,
  },

  sidebar: {
    rightSidebarVisible: true,
    rightSidebarDefault: "tasks",
    rememberOpenState: true,
  },

  workspace: {
    startupPage: "dashboard",
  },

  developer: {
    developerToolsVisible: true,
  },
};

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

function isFontSizePreference(value: unknown): value is FontSizePreference {
  return (
    value === "small" ||
    value === "medium" ||
    value === "large" ||
    value === "extra-large"
  );
}

function isUiDensityPreference(value: unknown): value is UiDensityPreference {
  return value === "compact" || value === "comfortable";
}

function isSidebarContentPreference(
  value: unknown
): value is SidebarContentPreference {
  return (
    value === "tasks" ||
    value === "documents" ||
    value === "calendar" ||
    value === "mail"
  );
}

function isStartupPagePreference(
  value: unknown
): value is StartupPagePreference {
  return (
    value === "dashboard" ||
    value === "tasks" ||
    value === "documents" ||
    value === "calendar" ||
    value === "mail" ||
    value === "settings"
  );
}

function cloneDefaults(): AppSettings {
  return {
    schemaVersion: DEFAULT_SETTINGS.schemaVersion,

    appearance: {
      ...DEFAULT_SETTINGS.appearance,
    },

    sidebar: {
      ...DEFAULT_SETTINGS.sidebar,
    },

    workspace: {
      ...DEFAULT_SETTINGS.workspace,
    },

    developer: {
      ...DEFAULT_SETTINGS.developer,
    },
  };
}

function normalizeSettings(raw: unknown): AppSettings {
  const settings = cloneDefaults();

  if (!isObject(raw)) {
    return settings;
  }

  const appearance = isObject(raw.appearance) ? raw.appearance : null;
  const sidebar = isObject(raw.sidebar) ? raw.sidebar : null;
  const workspace = isObject(raw.workspace) ? raw.workspace : null;
  const developer = isObject(raw.developer) ? raw.developer : null;

  if (appearance) {
    if (isThemePreference(appearance.theme)) {
      settings.appearance.theme = appearance.theme;
    }

    if (isFontSizePreference(appearance.fontSize)) {
      settings.appearance.fontSize = appearance.fontSize;
    }

    if (isUiDensityPreference(appearance.density)) {
      settings.appearance.density = appearance.density;
    }

    if (typeof appearance.animationsEnabled === "boolean") {
      settings.appearance.animationsEnabled =
        appearance.animationsEnabled;
    }
  }

  if (sidebar) {
    if (typeof sidebar.rightSidebarVisible === "boolean") {
      settings.sidebar.rightSidebarVisible =
        sidebar.rightSidebarVisible;
    }

    if (isSidebarContentPreference(sidebar.rightSidebarDefault)) {
      settings.sidebar.rightSidebarDefault =
        sidebar.rightSidebarDefault;
    }

    if (typeof sidebar.rememberOpenState === "boolean") {
      settings.sidebar.rememberOpenState = sidebar.rememberOpenState;
    }
  }

  if (workspace) {
    if (isStartupPagePreference(workspace.startupPage)) {
      settings.workspace.startupPage = workspace.startupPage;
    }
  }

  if (developer) {
    if (typeof developer.developerToolsVisible === "boolean") {
      settings.developer.developerToolsVisible =
        developer.developerToolsVisible;
    }
  }

  return settings;
}

function readStoredSettings(): AppSettings {
  if (!hasWindow()) {
    return cloneDefaults();
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!raw) {
      return migrateLegacySettings();
    }

    return normalizeSettings(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

function migrateLegacySettings(): AppSettings {
  const settings = cloneDefaults();

  if (!hasWindow()) {
    return settings;
  }

  const legacySidebarMode = window.localStorage.getItem(
    LEGACY_SIDEBAR_MODE_KEY
  );

  if (
    legacySidebarMode === "tasks" ||
    legacySidebarMode === "documents"
  ) {
    settings.sidebar.rightSidebarDefault = legacySidebarMode;
  }

  writeStoredSettings(settings);

  return settings;
}

function writeStoredSettings(settings: AppSettings): void {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify(settings)
  );
}

function notifySettingsChanged(settings: AppSettings): void {
  if (!hasWindow()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AppSettings>(SETTINGS_CHANGED_EVENT, {
      detail: settings,
    })
  );
}

/*
 * Async by design so App.tsx can keep the same loading pattern if settings
 * later move to IndexedDB or cloud-backed storage.
 */
export async function getSettings(): Promise<AppSettings> {
  return readStoredSettings();
}

/*
 * Useful for initial React state where waiting for an effect would cause
 * a visible flash of default styles.
 */
export function getSettingsSnapshot(): AppSettings {
  return readStoredSettings();
}

export async function updateSettings(
  patch: AppSettingsPatch
): Promise<AppSettings> {
  const current = readStoredSettings();

  const updated: AppSettings = normalizeSettings({
    ...current,

    appearance: {
      ...current.appearance,
      ...patch.appearance,
    },

    sidebar: {
      ...current.sidebar,
      ...patch.sidebar,
    },

    workspace: {
      ...current.workspace,
      ...patch.workspace,
    },

    developer: {
      ...current.developer,
      ...patch.developer,
    },
  });

  writeStoredSettings(updated);
  notifySettingsChanged(updated);

  return updated;
}

export async function replaceSettings(
  settings: AppSettings
): Promise<AppSettings> {
  const normalized = normalizeSettings(settings);

  writeStoredSettings(normalized);
  notifySettingsChanged(normalized);

  return normalized;
}

export async function resetSettings(): Promise<AppSettings> {
  const defaults = cloneDefaults();

  writeStoredSettings(defaults);
  notifySettingsChanged(defaults);

  return defaults;
}

export function subscribeToSettings(
  listener: (settings: AppSettings) => void
): () => void {
  if (!hasWindow()) {
    return () => undefined;
  }

  const handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;

    listener(customEvent.detail ?? readStoredSettings());
  };

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY) {
      listener(readStoredSettings());
    }
  };

  window.addEventListener(
    SETTINGS_CHANGED_EVENT,
    handleSettingsChange
  );

  window.addEventListener("storage", handleStorageChange);

  return () => {
    window.removeEventListener(
      SETTINGS_CHANGED_EVENT,
      handleSettingsChange
    );

    window.removeEventListener("storage", handleStorageChange);
  };
}
