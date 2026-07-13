import { useEffect, useSyncExternalStore } from "react";

import {
  clearStatusBarItems,
  getStatusBarItems,
  setStatusBarItems,
  subscribeToStatusBarItems,
} from "../status/statusRegistry";
import type {
  StatusBarItem,
} from "../status/statusRegistry";

export function useStatusBarItems(
  owner: string,
  items: StatusBarItem[]
): void {
  useEffect(() => {
    setStatusBarItems(owner, items);
    return () => clearStatusBarItems(owner);
  }, [items, owner]);
}

export function useRegisteredStatusBarItems(): StatusBarItem[] {
  return useSyncExternalStore(
    subscribeToStatusBarItems,
    getStatusBarItems,
    getStatusBarItems
  );
}
