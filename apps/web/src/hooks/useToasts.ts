import { useSyncExternalStore } from "react";

import { toastStore } from "../toasts/toastStore";

export function useToasts() {
  return useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot
  );
}
