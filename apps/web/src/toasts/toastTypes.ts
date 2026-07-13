export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastOptions {
  description?: string;
  duration?: number;
  action?: ToastAction;
}

export interface ToastMessage extends ToastOptions {
  id: string;
  tone: ToastTone;
  title: string;
  createdAt: number;
}
