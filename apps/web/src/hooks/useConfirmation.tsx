import React, { useCallback, useRef, useState } from "react";

import ConfirmationDialog from "../components/ui/ConfirmationDialog";

interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
}

export function useConfirmation() {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((accepted: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmationOptions) => {
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);

  const settle = useCallback((accepted: boolean) => {
    resolver.current?.(accepted);
    resolver.current = null;
    setRequest(null);
  }, []);

  const confirmationDialog = request ? (
    <ConfirmationDialog
      open
      {...request}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmationDialog };
}
