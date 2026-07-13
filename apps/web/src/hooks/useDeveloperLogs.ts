import { useSyncExternalStore } from "react";

import {
  getDeveloperLogs,
  subscribeToDeveloperLogs,
} from "../developer/logger";

export function useDeveloperLogs() {
  return useSyncExternalStore(
    subscribeToDeveloperLogs,
    getDeveloperLogs,
    getDeveloperLogs
  );
}

