// apps/web/src/pages/DocumentsPage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DocumentRecoveryPrompt from "../components/recovery/DocumentRecoveryPrompt";
import DocumentEditor from "../components/documents/DocumentEditor";
import type { DocumentEditorHandle } from "../components/documents/DocumentEditor";
import DocumentInspector from "../components/documents/DocumentInspector";
import DocumentLibrary from "../components/documents/DocumentLibrary";
import DocumentWorkspace from "../components/documents/DocumentWorkspace";
import type {
  DocumentLibraryView,
} from "../components/documents/documentUiTypes";

import {
  createDocument,
  deleteDocument,
  Document,
  duplicateDocument,
  fetchDocuments,
  updateDocument,
} from "../api/documents";
import {
  useCommands,
} from "../commands/useCommands";
import type {
  CommandDefinition,
} from "../commands/commandTypes";
import {
  useShortcuts,
} from "../keyboard/useShortcuts";
import type {
  ShortcutDefinition,
} from "../keyboard/keyboardTypes";
import { useStatusBarItems } from "../hooks/useStatusBarItems";
import { useAppSettings } from "../hooks/useAppSettings";
import { useConfirmation } from "../hooks/useConfirmation";
import { useDocumentWorkspaceUi } from "../hooks/useDocumentWorkspaceUi";
import { useDocumentFindReplace } from "../hooks/useDocumentFindReplace";
import type { StatusBarItem } from "../status/statusRegistry";
import { toast } from "../toasts/toastStore";
import { developerLogger } from "../developer/logger";
import {
  deleteDocumentRecoveryDraft,
  readDocumentRecoveryDraft,
  writeDocumentRecoveryDraft,
} from "../recovery/documentRecovery";
import type { DocumentRecoveryDraft } from "../recovery/documentRecovery";
import {
  calculateDocumentStatistics,
  exportDocumentAsHtml,
  exportDocumentAsText,
  formatDocumentDate,
  htmlToPlainText,
} from "../utils/documentText";
import {
  sortDocumentsByPinnedThenUpdated,
} from "../utils/documentSort";

import "../styles/documents.css";

const LAST_DOC_KEY = "suite:lastDocumentId";
const RECENT_DOCUMENT_LIMIT = 12;

function rememberLastDocument(id: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (id) {
      window.localStorage.setItem(LAST_DOC_KEY, id);
    } else {
      window.localStorage.removeItem(LAST_DOC_KEY);
    }
  } catch {
    // Local document selection history is optional.
  }
}

function getRememberedDocumentId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(LAST_DOC_KEY);
  } catch {
    return null;
  }
}

const DocumentsPage: React.FC = () => {
  const settings = useAppSettings();
  const { confirm, confirmationDialog } = useConfirmation();
  const {
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
  } = useDocumentWorkspaceUi();
  const quillRef = useRef<DocumentEditorHandle>(null);
  const createQueryHandledRef = useRef(false);
  const savePromiseRef =
    useRef<Promise<boolean> | null>(null);

  const [documents, setDocuments] =
    useState<Document[]>([]);
  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [editTitle, setEditTitle] =
    useState("");
  const [editContent, setEditContent] =
    useState("");

  const [listLoading, setListLoading] =
    useState(false);
  const [listError, setListError] =
    useState<string | null>(null);
  const [saveError, setSaveError] =
    useState<string | null>(null);
  const [isSaving, setIsSaving] =
    useState(false);
  const [creating, setCreating] =
    useState(false);
  const [duplicating, setDuplicating] =
    useState(false);
  const [deletingId, setDeletingId] =
    useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] =
    useState<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] =
    useState(false);
  const [recoveryDraft, setRecoveryDraft] =
    useState<DocumentRecoveryDraft | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const [cursorPosition, setCursorPosition] =
    useState({ line: 1, column: 1 });

  const selectedDocument = useMemo(
    () =>
      selectedId
        ? documents.find(
            (document) =>
              document.id === selectedId
          ) ?? null
        : null,
    [documents, selectedId]
  );

  const statistics = useMemo(
    () =>
      calculateDocumentStatistics(editContent),
    [editContent]
  );

  const statusItems = useMemo<StatusBarItem[]>(() => {
    if (!selectedDocument) {
      return [
        {
          id: "document-selection",
          label: "No document selected",
          priority: 10,
        },
      ];
    }

    let saveLabel = "Saved";
    let saveTone: StatusBarItem["tone"] = "success";

    if (saveError) {
      saveLabel = "Save failed";
      saveTone = "danger";
    } else if (isSaving) {
      saveLabel = "Saving…";
      saveTone = "warning";
    } else if (hasLocalChanges) {
      saveLabel = "Unsaved changes";
      saveTone = "warning";
    } else if (lastSavedAt) {
      const savedDate = new Date(lastSavedAt);
      if (!Number.isNaN(savedDate.getTime())) {
        saveLabel = `Saved ${savedDate.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`;
      }
    }

    return [
      {
        id: "document-save",
        label: saveLabel,
        title: saveError ?? "Current document save status",
        tone: saveTone,
        priority: 30,
      },
      {
        id: "document-words",
        label: `${statistics.words} word${statistics.words === 1 ? "" : "s"}`,
        priority: 20,
      },
      {
        id: "document-cursor",
        label: `Ln ${cursorPosition.line}, Col ${cursorPosition.column}`,
        priority: 10,
      },
    ];
  }, [
    cursorPosition.column,
    cursorPosition.line,
    hasLocalChanges,
    isSaving,
    lastSavedAt,
    saveError,
    selectedDocument,
    statistics.words,
  ]);

  useStatusBarItems("documents-page", statusItems);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch =
      librarySearch.trim().toLocaleLowerCase();

    let result = sortDocumentsByPinnedThenUpdated(documents);

    if (libraryView === "recent") {
      result = result.slice(
        0,
        RECENT_DOCUMENT_LIMIT
      );
    } else if (libraryView === "pinned") {
      result = result.filter(
        (document) => document.isPinned
      );
    } else if (libraryView === "favorites") {
      result = result.filter(
        (document) => document.isFavorite
      );
    }

    if (normalizedSearch) {
      result = result.filter((document) => {
        const title =
          document.title.toLocaleLowerCase();
        const content = htmlToPlainText(
          document.content
        ).toLocaleLowerCase();

        return (
          title.includes(normalizedSearch) ||
          content.includes(normalizedSearch)
        );
      });
    }

    return result;
  }, [documents, librarySearch, libraryView]);

  const documentCounts = useMemo(
    () => ({
      all: documents.length,
      recent: Math.min(
        documents.length,
        RECENT_DOCUMENT_LIMIT
      ),
      pinned: documents.filter(
        (document) => document.isPinned
      ).length,
      favorites: documents.filter(
        (document) => document.isFavorite
      ).length,
    }),
    [documents]
  );

  function setSelectedDocumentState(
    document: Document | null
  ): void {
    setSelectedId(document?.id ?? null);
    setEditTitle(document?.title ?? "");
    setEditContent(document?.content ?? "");
    setLastSavedAt(
      document?.updatedAt ??
        document?.createdAt ??
        null
    );
    setHasLocalChanges(false);
    setRecoveryDraft(null);
    setEditorRevision((current) => current + 1);
    setSaveError(null);
    resetFindState();
  }

  function resetFindState(): void {
    setFindState((current) => ({
      ...current,
      currentIndex: -1,
      totalMatches: 0,
    }));
  }

  function mergeSavedDocument(
    updated: Document
  ): void {
    setDocuments((current) =>
      sortDocumentsByPinnedThenUpdated(
        current.map((document) =>
          document.id === updated.id
            ? updated
            : document
        )
      )
    );
  }

  const saveCurrentDocument =
    useCallback(async (): Promise<boolean> => {
      if (!selectedDocument) {
        return false;
      }

      if (savePromiseRef.current) {
        return savePromiseRef.current;
      }

      const targetId = selectedDocument.id;
      const title =
        editTitle.trim() ||
        "Untitled document";
      const content = editContent;

      const savePromise = (async () => {
        setIsSaving(true);
        setSaveError(null);

        try {
          const updated =
            await updateDocument(targetId, {
              title,
              content,
            });

          try {
            await deleteDocumentRecoveryDraft(targetId);
          } catch {
            // The recovery module records sanitized diagnostics. A completed
            // document save must not be reported as failed because cleanup did.
          }

          mergeSavedDocument(updated);
          setEditTitle(updated.title);
          setLastSavedAt(
            updated.updatedAt ||
              updated.createdAt
          );
          setHasLocalChanges(false);

          return true;
        } catch (error) {
          console.error(
            "Error saving document:",
            error
          );
          setSaveError("Save failed.");
          toast.error("Unable to save document", {
            description: "Your unsaved work remains available for recovery.",
            action: {
              label: "Retry",
              run: async () => {
                await saveCurrentDocument();
              },
            },
          });

          return false;
        } finally {
          setIsSaving(false);
          savePromiseRef.current = null;
        }
      })();

      savePromiseRef.current = savePromise;

      return savePromise;
    }, [
      editContent,
      editTitle,
      selectedDocument,
    ]);

  async function saveBeforeLeaving(): Promise<boolean> {
    if (!hasLocalChanges) {
      return true;
    }

    return saveCurrentDocument();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments(): Promise<void> {
      setListLoading(true);
      setListError(null);

      try {
        const loaded =
          await fetchDocuments();

        if (cancelled) {
          return;
        }

        const sorted =
          sortDocumentsByPinnedThenUpdated(loaded);

        setDocuments(sorted);

        const searchParams =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : new URLSearchParams();

        const createRequested =
          searchParams.get("create") === "1";
        const requestedDocumentId =
          searchParams.get("document");

        if (
          createRequested &&
          !createQueryHandledRef.current
        ) {
          createQueryHandledRef.current = true;

          const created =
            await createDocument(
              "Untitled document",
              ""
            );

          if (cancelled) {
            return;
          }

          setDocuments((current) =>
            sortDocumentsByPinnedThenUpdated([
              created,
              ...current.filter(
                (document) =>
                  document.id !== created.id
              ),
            ])
          );
          setSelectedDocumentState(created);

          return;
        }

        if (sorted.length === 0) {
          setSelectedDocumentState(null);
          return;
        }

        const rememberedId =
          getRememberedDocumentId();

        const initial =
          sorted.find(
            (document) =>
              document.id === requestedDocumentId
          ) ??
          sorted.find(
            (document) =>
              document.id === rememberedId
          ) ??
          sorted[0];

        setSelectedDocumentState(initial);
      } catch (error) {
        console.error(
          "Error loading documents:",
          error
        );

        if (!cancelled) {
          setListError(
            "Failed to load documents."
          );
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    rememberLastDocument(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedDocument) {
      setRecoveryDraft(null);
      return;
    }

    let cancelled = false;
    const documentId = selectedDocument.id;

    void readDocumentRecoveryDraft(documentId)
      .then(async (draft) => {
        if (cancelled || !draft) return;

        if (
          draft.title === selectedDocument.title &&
          draft.content === selectedDocument.content
        ) {
          try {
            await deleteDocumentRecoveryDraft(documentId);
          } catch {
            // Failure is already recorded by the recovery module.
          }
          return;
        }

        setRecoveryDraft(draft);
      })
      .catch(() => {
        // The recovery module records the read failure with its document ID.
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDocument?.id, selectedDocument?.updatedAt]);

  useEffect(() => {
    if (!selectedDocument || !hasLocalChanges) return;

    const timeout = window.setTimeout(() => {
      void writeDocumentRecoveryDraft({
        schemaVersion: 1,
        documentId: selectedDocument.id,
        title: editTitle,
        content: editContent,
        baseUpdatedAt:
          selectedDocument.updatedAt ?? selectedDocument.createdAt ?? null,
        capturedAt: new Date().toISOString(),
      }).catch(() => {
        // The recovery module records write failures without document content.
      });
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [editContent, editTitle, hasLocalChanges, selectedDocument]);

  useEffect(() => {
    if (
      !selectedDocument ||
      !hasLocalChanges
    ) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        void saveCurrentDocument();
      },
      settings.editor.autosaveInterval
    );

    return () =>
      window.clearTimeout(timeout);
  }, [
    editContent,
    editTitle,
    hasLocalChanges,
    saveCurrentDocument,
    settings.editor.autosaveInterval,
    selectedDocument,
  ]);

  useEffect(() => {
    function handleBeforeUnload(
      event: BeforeUnloadEvent
    ): void {
      if (!hasLocalChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () =>
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
  }, [hasLocalChanges]);

  useEffect(() => {
    if (!focusMode) return;

    document.body.classList.add("documents-focus-active");

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !findOpen) {
        setFocusMode(false);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.classList.remove("documents-focus-active");
      window.removeEventListener("keydown", handleEscape);
    };
  }, [findOpen, focusMode]);

  const documentShortcuts =
    useMemo<ShortcutDefinition[]>(
      () => [
        {
          id: "document-save",
          key: "s",
          primary: true,
          description:
            "Save current document",
          category: "Documents",
          allowInEditable: true,
          priority: 100,
          enabled:
            Boolean(selectedDocument) &&
            !isSaving,
          handler: () => {
            void saveCurrentDocument();
          },
        },
        {
          id: "document-find",
          key: "f",
          primary: true,
          description:
            "Find in current document",
          category: "Documents",
          allowInEditable: true,
          priority: 100,
          enabled:
            Boolean(selectedDocument),
          handler: () => {
            setFindOpen(true);

            window.setTimeout(() => {
              document
                .querySelector<HTMLInputElement>(
                  "#document-find-input"
                )
                ?.focus();
            }, 0);
          },
        },
        {
          id: "document-replace",
          key: "f",
          primary: true,
          shift: true,
          description:
            "Find and replace",
          category: "Documents",
          allowInEditable: true,
          priority: 110,
          enabled:
            Boolean(selectedDocument),
          handler: () => {
            setFindOpen(true);
            setReplaceOpen(true);

            window.setTimeout(() => {
              document
                .querySelector<HTMLInputElement>(
                  "#document-find-input"
                )
                ?.focus();
            }, 0);
          },
        },
        {
          id: "document-focus-mode",
          key: "e",
          primary: true,
          shift: true,
          description: "Toggle document focus mode",
          category: "Documents",
          allowInEditable: true,
          priority: 100,
          enabled: Boolean(selectedDocument),
          handler: () => {
            setFocusMode((current) => !current);
          },
        },
        ...[1, 2, 3].map(
          (
            level
          ): ShortcutDefinition => ({
            id: `document-heading-${level}`,
            key: String(level),
            primary: true,
            alt: true,
            description:
              `Apply heading ${level}`,
            category: "Documents",
            allowInEditable: true,
            priority: 100,
            enabled:
              Boolean(selectedDocument),
            handler: () => {
              quillRef.current
                ?.getEditor?.()
                ?.format(
                  "header",
                  level,
                  "user"
                );
            },
          })
        ),
        {
          id: "document-paragraph",
          key: "0",
          primary: true,
          alt: true,
          description:
            "Apply paragraph style",
          category: "Documents",
          allowInEditable: true,
          priority: 100,
          enabled:
            Boolean(selectedDocument),
          handler: () => {
            quillRef.current
              ?.getEditor?.()
              ?.format(
                "header",
                false,
                "user"
              );
          },
        },
      ],
      [
        isSaving,
        saveCurrentDocument,
        selectedDocument,
      ]
    );

  useShortcuts(documentShortcuts);

  const {
    navigateMatch,
    replaceCurrentMatch,
    replaceAllMatches,
    closeFind,
  } = useDocumentFindReplace({
    editorRef: quillRef,
    editContent,
    findOpen,
    setFindOpen,
    setReplaceOpen,
    findState,
    setFindState,
    resetFindState,
  });

  async function handleSelectDocument(
    id: string
  ): Promise<void> {
    if (id === selectedId) {
      return;
    }

    const canLeave =
      await saveBeforeLeaving();

    if (!canLeave) {
      return;
    }

    const next =
      documents.find(
        (document) => document.id === id
      ) ?? null;

    setSelectedDocumentState(next);
  }

  async function handleCreateDocument(): Promise<void> {
    if (creating) {
      return;
    }

    const canLeave =
      await saveBeforeLeaving();

    if (!canLeave) {
      return;
    }

    setCreating(true);
    setSaveError(null);

    try {
      const created =
        await createDocument(
          "Untitled document",
          ""
        );

      setDocuments((current) =>
        sortDocumentsByPinnedThenUpdated([
          created,
          ...current.filter(
            (document) =>
              document.id !== created.id
          ),
        ])
      );
      setSelectedDocumentState(created);
      toast.success("Document created");
    } catch (error) {
      console.error(
        "Unable to create document:",
        error
      );
      setSaveError(
        "Unable to create document."
      );
      toast.error("Unable to create document");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(): Promise<void> {
    if (
      !selectedDocument ||
      duplicating
    ) {
      return;
    }

    const canLeave =
      await saveBeforeLeaving();

    if (!canLeave) {
      return;
    }

    setDuplicating(true);
    setSaveError(null);

    try {
      const source: Document = {
        ...selectedDocument,
        title:
          editTitle.trim() ||
          "Untitled document",
        content: editContent,
      };

      const duplicate =
        await duplicateDocument(source);

      setDocuments((current) =>
        sortDocumentsByPinnedThenUpdated([
          duplicate,
          ...current.filter(
            (document) =>
              document.id !== duplicate.id
          ),
        ])
      );
      setSelectedDocumentState(duplicate);
      toast.success("Document duplicated", {
        description: duplicate.title,
      });
    } catch (error) {
      console.error(
        "Unable to duplicate document:",
        error
      );
      setSaveError(
        "Unable to duplicate document."
      );
      toast.error("Unable to duplicate document");
    } finally {
      setDuplicating(false);
    }
  }

  async function handleTogglePinned(
    document: Document
  ): Promise<void> {
    const nextValue = !document.isPinned;
    const previous = documents;

    setDocuments((current) =>
      sortDocumentsByPinnedThenUpdated(
        current.map((entry) =>
          entry.id === document.id
            ? {
                ...entry,
                isPinned: nextValue,
              }
            : entry
        )
      )
    );

    try {
      const updated =
        await updateDocument(
          document.id,
          {
            isPinned: nextValue,
          }
        );

      mergeSavedDocument(updated);
      toast.success(nextValue ? "Document pinned" : "Document unpinned");
    } catch (error) {
      console.error(
        "Unable to update pinned state:",
        error
      );
      setDocuments(previous);
      setSaveError(
        "Unable to update pinned state."
      );
      toast.error("Unable to update pinned state");
    }
  }

  async function handleToggleFavorite(
    document: Document
  ): Promise<void> {
    const nextValue =
      !document.isFavorite;
    const previous = documents;

    setDocuments((current) =>
      sortDocumentsByPinnedThenUpdated(
        current.map((entry) =>
          entry.id === document.id
            ? {
                ...entry,
                isFavorite: nextValue,
              }
            : entry
        )
      )
    );

    try {
      const updated =
        await updateDocument(
          document.id,
          {
            isFavorite: nextValue,
          }
        );

      mergeSavedDocument(updated);
      toast.success(
        nextValue ? "Document added to favorites" : "Document removed from favorites"
      );
    } catch (error) {
      console.error(
        "Unable to update favorite state:",
        error
      );
      setDocuments(previous);
      setSaveError(
        "Unable to update favorite state."
      );
      toast.error("Unable to update favorite state");
    }
  }

  async function handleDelete(
    id: string
  ): Promise<void> {
    const target = documents.find(
      (document) => document.id === id
    );

    if (!target) {
      return;
    }

    const content =
      target.id === selectedId
        ? editContent
        : target.content;
    const title =
      target.id === selectedId
        ? editTitle
        : target.title;

    const hasContent =
      title.trim().length > 0 ||
      htmlToPlainText(content).length > 0;

    const accepted = !hasContent || await confirm({
      title: `Delete "${title || "Untitled document"}"?`,
      description: "This permanently removes the document and cannot be undone.",
      confirmLabel: "Delete document",
      dangerous: true,
    });

    if (!accepted) {
      return;
    }

    setDeletingId(id);
    setSaveError(null);

    const previous = documents;
    const remaining = documents.filter(
      (document) => document.id !== id
    );

    setDocuments(remaining);

    if (id === selectedId) {
      setSelectedDocumentState(
        remaining[0] ?? null
      );
    }

    let deletionConfirmed = false;

    try {
      await deleteDocument(id);
      deletionConfirmed = true;
    } catch (error: any) {
      console.error(
        "Unable to delete document:",
        error
      );

      if (
        error?.response?.status !== 404
      ) {
        setDocuments(previous);
        setSaveError(
          "Unable to delete document."
        );
      } else {
        deletionConfirmed = true;
      }
    } finally {
      if (deletionConfirmed) {
        try {
          await deleteDocumentRecoveryDraft(id);
        } catch {
          // Snapshot cleanup failure is logged without failing deletion.
        }
        toast.success("Document deleted", {
          description: title || "Untitled document",
        });
      }
      setDeletingId(null);
    }
  }

  function restoreRecoveryDraft(): void {
    if (!recoveryDraft) return;

    setEditTitle(recoveryDraft.title);
    setEditContent(recoveryDraft.content);
    setHasLocalChanges(true);
    setEditorRevision((current) => current + 1);
    setRecoveryDraft(null);

    developerLogger.info(
      "recovery.document",
      "Restored an unsaved document snapshot",
      { documentId: recoveryDraft.documentId }
    );
  }

  async function discardRecoveryDraft(): Promise<void> {
    if (!recoveryDraft) return;

    const documentId = recoveryDraft.documentId;

    try {
      await deleteDocumentRecoveryDraft(documentId);
      setRecoveryDraft(null);
      developerLogger.info(
        "recovery.document",
        "Discarded a document recovery snapshot",
        { documentId }
      );
    } catch {
      setSaveError(
        "Unable to discard the recovery copy. See Developer Tools for details."
      );
    }
  }

  function handleExportText(): void {
    if (!selectedDocument) return;

    try {
      exportDocumentAsText(editTitle, editContent);
      toast.success("TXT export complete", {
        description: editTitle || "Untitled document",
      });
    } catch (error) {
      developerLogger.error(
        "documents.export",
        "Unable to export a document as text",
        error
      );
      toast.error("TXT export failed");
    }
  }

  function handleExportHtml(): void {
    if (!selectedDocument) return;

    try {
      exportDocumentAsHtml(editTitle, editContent);
      toast.success("HTML export complete", {
        description: editTitle || "Untitled document",
      });
    } catch (error) {
      developerLogger.error(
        "documents.export",
        "Unable to export a document as HTML",
        error
      );
      toast.error("HTML export failed");
    }
  }

  function renderSaveStatus(): React.ReactNode {
    if (!selectedDocument) {
      return null;
    }

    if (isSaving) {
      return <span>Saving…</span>;
    }

    if (saveError) {
      return (
        <span className="is-error">
          {saveError}
        </span>
      );
    }

    if (hasLocalChanges) {
      return (
        <span className="is-unsaved">
          Unsaved changes
        </span>
      );
    }

    if (lastSavedAt) {
      return (
        <span>
          Saved{" "}
          {formatDocumentDate(
            lastSavedAt,
            true
          )}
        </span>
      );
    }

    return <span>Saved</span>;
  }

  const documentCommands =
    useMemo<CommandDefinition[]>(
      () => [
        {
          id: "documents-create",
          title: "Create new document",
          category: "Documents",
          description:
            "Create a blank document in the current workspace",
          keywords: [
            "new doc",
            "write",
          ],
          shortcut: [
            "Ctrl",
            "Shift",
            "N",
          ],
          enabled: !creating,
          disabledReason:
            "A document is already being created.",
          run: () =>
            handleCreateDocument(),
        },
        {
          id: "documents-save-current",
          title: "Save current document",
          category: "Documents",
          description:
            "Save the selected document",
          keywords: [
            "write",
            "commit changes",
          ],
          shortcut: [
            "Ctrl",
            "S",
          ],
          enabled:
            Boolean(selectedDocument) &&
            !isSaving,
          disabledReason:
            !selectedDocument
              ? "Select a document first."
              : "The document is currently saving.",
          run: () =>
            saveCurrentDocument().then(() => undefined),
        },
        {
          id: "documents-find",
          title: "Find in current document",
          category: "Documents",
          description:
            "Search within the active document",
          shortcut: [
            "Ctrl",
            "F",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: () => {
            setFindOpen(true);

            window.setTimeout(() => {
              document
                .querySelector<HTMLInputElement>(
                  "#document-find-input"
                )
                ?.focus();
            }, 0);
          },
        },
        {
          id: "documents-find-replace",
          title: "Find and replace",
          category: "Documents",
          description:
            "Search and replace within the active document",
          shortcut: [
            "Ctrl",
            "Shift",
            "F",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: () => {
            setFindOpen(true);
            setReplaceOpen(true);

            window.setTimeout(() => {
              document
                .querySelector<HTMLInputElement>(
                  "#document-find-input"
                )
                ?.focus();
            }, 0);
          },
        },
        {
          id: "documents-focus-mode",
          title: focusMode
            ? "Exit document focus mode"
            : "Enter document focus mode",
          category: "Documents",
          description: "Hide app chrome and side panels for distraction-free writing",
          shortcut: ["Ctrl", "Shift", "E"],
          enabled: Boolean(selectedDocument),
          disabledReason: "Select a document first.",
          run: () => setFocusMode((current) => !current),
        },
        {
          id: "documents-duplicate",
          title: "Duplicate current document",
          category: "Documents",
          description:
            "Create a copy of the active document",
          keywords: [
            "copy document",
            "clone",
          ],
          enabled:
            Boolean(selectedDocument) &&
            !duplicating,
          disabledReason:
            !selectedDocument
              ? "Select a document first."
              : "The document is currently being duplicated.",
          run: () =>
            handleDuplicate(),
        },
        {
          id: "documents-export-text",
          title:
            "Export current document as TXT",
          category: "Documents",
          description:
            "Download a plain-text copy",
          keywords: [
            "download",
            "text",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: handleExportText,
        },
        {
          id: "documents-export-html",
          title:
            "Export current document as HTML",
          category: "Documents",
          description:
            "Download a formatted HTML copy",
          keywords: [
            "download",
            "web",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: handleExportHtml,
        },
        {
          id: "documents-toggle-pin",
          title: selectedDocument?.isPinned
            ? "Unpin current document"
            : "Pin current document",
          category: "Documents",
          description:
            "Change the active document's pinned state",
          keywords: [
            "favorite",
            "keep",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: () => {
            if (selectedDocument) {
              return handleTogglePinned(
                selectedDocument
              );
            }
          },
        },
        {
          id: "documents-toggle-favorite",
          title:
            selectedDocument?.isFavorite
              ? "Remove current document from favorites"
              : "Add current document to favorites",
          category: "Documents",
          description:
            "Change the active document's favorite state",
          keywords: [
            "star",
            "bookmark",
          ],
          enabled:
            Boolean(selectedDocument),
          disabledReason:
            "Select a document first.",
          run: () => {
            if (selectedDocument) {
              return handleToggleFavorite(
                selectedDocument
              );
            }
          },
        },
        {
          id: "documents-view-all",
          title: "Documents: Show all",
          category: "Documents",
          description:
            "Show the complete document library",
          enabled:
            libraryView !== "all",
          disabledReason:
            "The complete library is already shown.",
          run: () =>
            setLibraryView("all"),
        },
        {
          id: "documents-view-recent",
          title: "Documents: Show recent",
          category: "Documents",
          description:
            "Show recently edited documents",
          enabled:
            libraryView !== "recent",
          disabledReason:
            "Recent documents are already shown.",
          run: () =>
            setLibraryView("recent"),
        },
        {
          id: "documents-view-pinned",
          title: "Documents: Show pinned",
          category: "Documents",
          description:
            "Filter the library to pinned documents",
          enabled:
            libraryView !== "pinned",
          disabledReason:
            "Pinned documents are already shown.",
          run: () =>
            setLibraryView("pinned"),
        },
        {
          id: "documents-view-favorites",
          title:
            "Documents: Show favorites",
          category: "Documents",
          description:
            "Filter the library to favorite documents",
          enabled:
            libraryView !== "favorites",
          disabledReason:
            "Favorite documents are already shown.",
          run: () =>
            setLibraryView("favorites"),
        },
        {
          id: "documents-focus-library-search",
          title:
            "Focus document library search",
          category: "Documents",
          description:
            "Move focus to the document filter",
          keywords: [
            "filter docs",
            "library",
          ],
          run: () => {
            document
              .querySelector<HTMLInputElement>(
                'input[aria-label="Search documents"]'
              )
              ?.focus();
          },
        },
        {
          id: "documents-clear-library-search",
          title:
            "Clear document library search",
          category: "Documents",
          description:
            "Remove the current document filter",
          enabled:
            Boolean(librarySearch.trim()),
          disabledReason:
            "The document search is already empty.",
          run: () =>
            setLibrarySearch(""),
        },
      ],
      [
        creating,
        duplicating,
        editContent,
        editTitle,
        focusMode,
        isSaving,
        librarySearch,
        libraryView,
        saveCurrentDocument,
        selectedDocument,
      ]
    );

  useCommands(documentCommands);

  return (
    <div
      className={
        focusMode
          ? "documents-v2-page is-focus-mode"
          : "documents-v2-page"
      }
    >
      {recoveryDraft && selectedDocument && (
        <DocumentRecoveryPrompt
          draft={recoveryDraft}
          currentUpdatedAt={
            selectedDocument.updatedAt ?? selectedDocument.createdAt ?? null
          }
          onRestore={restoreRecoveryDraft}
          onDiscard={discardRecoveryDraft}
        />
      )}
      <header className="documents-v2-header">
        <div>
          <p className="documents-v2-eyebrow">
            Documents 3.0
          </p>
          <h1>Documents</h1>
          <p>
            A focused, page-based writing workspace with everything close at hand.
          </p>
        </div>

        <button
          className="documents-v2-new-button"
          type="button"
          onClick={() =>
            void handleCreateDocument()
          }
          disabled={creating}
        >
          {creating
            ? "Creating…"
            : "New document"}
        </button>
      </header>

      <div
        className={`documents-v2-layout${libraryOpen ? "" : " is-library-collapsed"}${inspectorOpen ? " has-inspector" : ""}`}
      >
        <DocumentLibrary
          documents={documents}
          filteredDocuments={filteredDocuments}
          selectedId={selectedId}
          libraryOpen={libraryOpen}
          librarySearch={librarySearch}
          libraryView={libraryView}
          documentCounts={documentCounts}
          listError={listError}
          listLoading={listLoading}
          deletingId={deletingId}
          setLibrarySearch={setLibrarySearch}
          setLibraryView={setLibraryView}
          onSelect={handleSelectDocument}
          onTogglePinned={handleTogglePinned}
          onToggleFavorite={handleToggleFavorite}
          onDelete={handleDelete}
        />

        <DocumentWorkspace
          selectedDocument={selectedDocument}
          onCreateDocument={handleCreateDocument}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          setHasLocalChanges={setHasLocalChanges}
          setSaveError={setSaveError}
          libraryOpen={libraryOpen}
          setLibraryOpen={setLibraryOpen}
          onTogglePinned={handleTogglePinned}
          onToggleFavorite={handleToggleFavorite}
          inspectorOpen={inspectorOpen}
          setInspectorOpen={setInspectorOpen}
          focusMode={focusMode}
          setFocusMode={setFocusMode}
          onDuplicate={handleDuplicate}
          duplicating={duplicating}
          onExportText={handleExportText}
          onExportHtml={handleExportHtml}
          onSave={saveCurrentDocument}
          isSaving={isSaving}
          renderSaveStatus={renderSaveStatus}
          findOpen={findOpen}
          setFindOpen={setFindOpen}
          replaceOpen={replaceOpen}
          setReplaceOpen={setReplaceOpen}
          findState={findState}
          setFindState={setFindState}
          navigateMatch={navigateMatch}
          closeFind={closeFind}
          replaceCurrentMatch={replaceCurrentMatch}
          replaceAllMatches={replaceAllMatches}
          selectedId={selectedId}
          editorRevision={editorRevision}
          editorRef={quillRef}
          editContent={editContent}
          setEditContent={setEditContent}
          setCursorPosition={setCursorPosition}
          statistics={statistics}
          lastSavedAt={lastSavedAt}
          cursorPosition={cursorPosition}
        />
      </div>
      {confirmationDialog}
    </div>
  );
};

export default DocumentsPage;
