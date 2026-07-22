import { useState } from "react";

import type {
  DocumentFindState,
  DocumentLibraryView,
} from "../components/documents/documentUiTypes";

export function useDocumentWorkspaceUi() {
  const [libraryView, setLibraryView] =
    useState<DocumentLibraryView>("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findState, setFindState] = useState<DocumentFindState>({
    query: "",
    replacement: "",
    currentIndex: -1,
    totalMatches: 0,
  });

  return {
    libraryView,
    setLibraryView,
    librarySearch,
    setLibrarySearch,
    libraryOpen,
    setLibraryOpen,
    inspectorOpen,
    setInspectorOpen,
    focusMode,
    setFocusMode,
    findOpen,
    setFindOpen,
    replaceOpen,
    setReplaceOpen,
    findState,
    setFindState,
  };
}
