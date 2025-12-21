// apps/web/src/components/UpdateBanner.tsx
import React from "react";

/**
 * Temporary no-op update banner.
 * This file is intentionally safe in both browser and Tauri.
 * Once everything is stable again, we can reintroduce real updater logic
 * in a Tauri-only entrypoint.
 */
const UpdateBanner: React.FC = () => {
  return null;
};

export default UpdateBanner;