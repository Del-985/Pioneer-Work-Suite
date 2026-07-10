// apps/web/src/main.tsx

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "./App";
import {
  applySettingsToDocument,
  getSettingsSnapshot,
  subscribeToSettings,
} from "./api/settings";

import "./styles/global.css";

/*
 * Apply saved appearance settings before React renders.
 * This prevents a flash of the default theme during startup.
 */
const initialSettings = getSettingsSnapshot();

applySettingsToDocument(initialSettings);

/*
 * Keep the document attributes synchronized when settings change,
 * including changes received from another browser window or tab.
 */
subscribeToSettings((settings) => {
  applySettingsToDocument(settings);
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element #root not found");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
