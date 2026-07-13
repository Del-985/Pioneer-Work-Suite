import { useEffect, useState } from "react";

import {
  getSettingsSnapshot,
  subscribeToSettings,
} from "../api/settings";

export function useAppSettings() {
  const [settings, setSettings] = useState(getSettingsSnapshot);

  useEffect(() => subscribeToSettings(setSettings), []);

  return settings;
}
