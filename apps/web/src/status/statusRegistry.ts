export type StatusItemTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export interface StatusBarItem {
  id: string;
  label: string;
  title?: string;
  tone?: StatusItemTone;
  priority?: number;
}

type Listener = () => void;

const itemsByOwner = new Map<string, StatusBarItem[]>();
const listeners = new Set<Listener>();
let snapshot: StatusBarItem[] = [];

function publish(): void {
  snapshot = [...itemsByOwner.values()]
    .flat()
    .sort(
      (left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0)
    );

  for (const listener of listeners) listener();
}

export function setStatusBarItems(
  owner: string,
  items: StatusBarItem[]
): void {
  itemsByOwner.set(owner, items);
  publish();
}

export function clearStatusBarItems(owner: string): void {
  itemsByOwner.delete(owner);
  publish();
}

export function getStatusBarItems(): StatusBarItem[] {
  return snapshot;
}

export function subscribeToStatusBarItems(
  listener: Listener
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
