import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  beginSessionRecovery,
  markSessionRecoveryCleanExit,
  updateSessionRecoveryPath,
} from "../recovery/sessionRecovery";

export function useSessionRecovery(): string | null {
  const location = useLocation();
  const start = useRef(beginSessionRecovery()).current;
  const [recoveredPath, setRecoveredPath] = useState(start.recoveredPath);

  useEffect(() => {
    updateSessionRecoveryPath(`${location.pathname}${location.search}`);

    if (recoveredPath && location.pathname !== "/") {
      setRecoveredPath(null);
    }
  }, [location.pathname, location.search, recoveredPath]);

  useEffect(() => {
    window.addEventListener("pagehide", markSessionRecoveryCleanExit);

    return () => {
      window.removeEventListener("pagehide", markSessionRecoveryCleanExit);
    };
  }, []);

  return recoveredPath;
}
