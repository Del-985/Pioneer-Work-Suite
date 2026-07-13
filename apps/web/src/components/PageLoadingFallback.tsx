import React from "react";

const PageLoadingFallback: React.FC = () => (
  <div className="page-loading-fallback" role="status" aria-live="polite">
    <span aria-hidden="true" />
    <strong>Loading workspace…</strong>
  </div>
);

export default PageLoadingFallback;
