import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import { developerLogger } from "../developer/logger";
import { useBodyScrollLock } from "./useBodyScrollLock";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

interface AccessibleDialogOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement>;
  initialFocusRef?: RefObject<HTMLElement>;
  onClose?: () => void;
  closeOnEscape?: boolean;
  source?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((element) => {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

export function useAccessibleDialog({
  open,
  containerRef,
  initialFocusRef,
  onClose,
  closeOnEscape = true,
  source = "accessibility.dialog",
}: AccessibleDialogOptions): void {
  useBodyScrollLock(open);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const container = containerRef.current;

    if (!container) {
      developerLogger.warning(
        source,
        "Dialog focus management started without a mounted container"
      );
      return;
    }

    const focusInitialElement = () => {
      try {
        const target =
          initialFocusRef?.current ??
          getFocusableElements(container)[0] ??
          container;
        target.focus({ preventScroll: true });
      } catch (error) {
        developerLogger.error(
          source,
          "Unable to place focus inside a dialog",
          error
        );
      }
    };

    const frame = window.requestAnimationFrame(focusInitialElement);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown, true);

      try {
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus({ preventScroll: true });
        }
      } catch (error) {
        developerLogger.error(
          source,
          "Unable to restore focus after closing a dialog",
          error
        );
      }
    };
  }, [
    closeOnEscape,
    containerRef,
    initialFocusRef,
    open,
    source,
  ]);
}
