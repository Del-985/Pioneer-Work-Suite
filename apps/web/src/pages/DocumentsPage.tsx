// apps/web/src/pages/DocumentsPage.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

import {
  createDocument,
  deleteDocument,
  Document,
  duplicateDocument,
  fetchDocuments,
  updateDocument,
} from "../api/documents";
import {
  calculateDocumentStatistics,
  exportDocumentAsHtml,
  exportDocumentAsText,
  formatDocumentDate,
  htmlToPlainText,
} from "../utils/documentText";

import "../styles/documents.css";

const LAST_DOC_KEY = "suite:lastDocumentId";
const RECENT_DOCUMENT_LIMIT = 12;

type LibraryView =
  | "all"
  | "recent"
  | "pinned"
  | "favorites";

interface FindState {
  query: string;
  replacement: string;
  currentIndex: number;
  totalMatches: number;
}

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

function sortByUpdatedAt(
  documents: Document[]
): Document[] {
  return [...documents].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    const leftTime = new Date(
      left.updatedAt || left.createdAt
    ).getTime();
    const rightTime = new Date(
      right.updatedAt || right.createdAt
    ).getTime();

    return rightTime - leftTime;
  });
}

function getMatchIndexes(
  text: string,
  query: string
): number[] {
  const normalizedQuery = query.toLocaleLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const normalizedText = text.toLocaleLowerCase();
  const matches: number[] = [];
  let cursor = 0;

  while (cursor <= normalizedText.length) {
    const matchIndex = normalizedText.indexOf(
      normalizedQuery,
      cursor
    );

    if (matchIndex === -1) {
      break;
    }

    matches.push(matchIndex);
    cursor = matchIndex + Math.max(1, normalizedQuery.length);
  }

  return matches;
}

const DocumentsPage: React.FC = () => {
  const quillRef = useRef<any>(null);
  const fileInputRef =
    useRef<HTMLInputElement | null>(null);
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

  const [libraryView, setLibraryView] =
    useState<LibraryView>("all");
  const [librarySearch, setLibrarySearch] =
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

  const [findOpen, setFindOpen] =
    useState(false);
  const [replaceOpen, setReplaceOpen] =
    useState(false);
  const [findState, setFindState] =
    useState<FindState>({
      query: "",
      replacement: "",
      currentIndex: -1,
      totalMatches: 0,
    });

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

  const filteredDocuments = useMemo(() => {
    const normalizedSearch =
      librarySearch.trim().toLocaleLowerCase();

    let result = sortByUpdatedAt(documents);

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

  const handleImageFileChange = useCallback(
    (
      event: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      const reader = new FileReader();

      reader.onload = (loadEvent) => {
        const base64 =
          loadEvent.target?.result;

        if (
          !base64 ||
          typeof base64 !== "string"
        ) {
          return;
        }

        const editor =
          quillRef.current?.getEditor?.();

        if (!editor) {
          return;
        }

        const range =
          editor.getSelection(true);
        const index = range
          ? range.index
          : Math.max(0, editor.getLength() - 1);

        editor.insertEmbed(
          index,
          "image",
          base64,
          "user"
        );
        editor.setSelection(index + 1, 0);
      };

      reader.readAsDataURL(file);
    },
    []
  );

  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [
            {
              header: [1, 2, 3, false],
            },
          ],
          [
            "bold",
            "italic",
            "underline",
            "strike",
          ],
          [{ background: [] }],
          [
            { list: "ordered" },
            { list: "bullet" },
          ],
          [{ align: [] }],
          ["blockquote", "code-block"],
          ["link", "image"],
          ["checklist"],
          ["clean"],
          ["undo", "redo"],
        ],
        handlers: {
          undo: () => {
            const editor =
              quillRef.current?.getEditor?.();

            editor?.history?.undo();
          },
          redo: () => {
            const editor =
              quillRef.current?.getEditor?.();

            editor?.history?.redo();
          },
          image: () => {
            if (!fileInputRef.current) {
              return;
            }

            fileInputRef.current.value = "";
            fileInputRef.current.click();
          },
          checklist: () => {
            const editor =
              quillRef.current?.getEditor?.();

            if (!editor) {
              return;
            }

            const current =
              editor.getFormat()?.list;

            editor.format(
              "list",
              current === "checked" ||
                current === "unchecked"
                ? false
                : "checked",
              "user"
            );
          },
        },
      },
      history: {
        delay: 500,
        maxStack: 150,
        userOnly: true,
      },
    }),
    []
  );

  const quillFormats = useMemo(
    () => [
      "header",
      "font",
      "size",
      "bold",
      "italic",
      "underline",
      "strike",
      "background",
      "list",
      "bullet",
      "align",
      "blockquote",
      "code-block",
      "link",
      "image",
    ],
    []
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
      sortByUpdatedAt(
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
          sortByUpdatedAt(loaded);

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
            sortByUpdatedAt([
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
      3000
    );

    return () =>
      window.clearTimeout(timeout);
  }, [
    editContent,
    editTitle,
    hasLocalChanges,
    saveCurrentDocument,
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
    function handleKeydown(
      event: KeyboardEvent
    ): void {
      if (!selectedDocument) {
        return;
      }

      const primaryModifier =
        event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (
        primaryModifier &&
        !event.altKey &&
        !event.shiftKey &&
        key === "s"
      ) {
        event.preventDefault();

        if (!isSaving) {
          void saveCurrentDocument();
        }

        return;
      }

      if (
        primaryModifier &&
        !event.altKey &&
        key === "f"
      ) {
        event.preventDefault();
        setFindOpen(true);

        if (event.shiftKey) {
          setReplaceOpen(true);
        }

        window.setTimeout(() => {
          document
            .querySelector<HTMLInputElement>(
              "#document-find-input"
            )
            ?.focus();
        }, 0);

        return;
      }

      const editor =
        quillRef.current?.getEditor?.();

      if (!editor) {
        return;
      }

      if (
        primaryModifier &&
        event.altKey
      ) {
        if (
          key === "1" ||
          key === "2" ||
          key === "3"
        ) {
          event.preventDefault();
          editor.format(
            "header",
            Number(key),
            "user"
          );
        } else if (key === "0") {
          event.preventDefault();
          editor.format(
            "header",
            false,
            "user"
          );
        }
      }
    }

    window.addEventListener(
      "keydown",
      handleKeydown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKeydown
      );
  }, [
    isSaving,
    saveCurrentDocument,
    selectedDocument,
  ]);

  useEffect(() => {
    if (!findOpen || !findState.query) {
      setFindState((current) => ({
        ...current,
        totalMatches: 0,
        currentIndex: -1,
      }));
      return;
    }

    const editor =
      quillRef.current?.getEditor?.();

    if (!editor) {
      return;
    }

    const matches = getMatchIndexes(
      editor.getText(),
      findState.query
    );

    setFindState((current) => ({
      ...current,
      totalMatches: matches.length,
      currentIndex:
        matches.length === 0
          ? -1
          : Math.min(
              Math.max(
                current.currentIndex,
                0
              ),
              matches.length - 1
            ),
    }));
  }, [
    editContent,
    findOpen,
    findState.query,
  ]);

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
        sortByUpdatedAt([
          created,
          ...current.filter(
            (document) =>
              document.id !== created.id
          ),
        ])
      );
      setSelectedDocumentState(created);
    } catch (error) {
      console.error(
        "Unable to create document:",
        error
      );
      setSaveError(
        "Unable to create document."
      );
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
        sortByUpdatedAt([
          duplicate,
          ...current.filter(
            (document) =>
              document.id !== duplicate.id
          ),
        ])
      );
      setSelectedDocumentState(duplicate);
    } catch (error) {
      console.error(
        "Unable to duplicate document:",
        error
      );
      setSaveError(
        "Unable to duplicate document."
      );
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
      sortByUpdatedAt(
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
    } catch (error) {
      console.error(
        "Unable to update pinned state:",
        error
      );
      setDocuments(previous);
      setSaveError(
        "Unable to update pinned state."
      );
    }
  }

  async function handleToggleFavorite(
    document: Document
  ): Promise<void> {
    const nextValue =
      !document.isFavorite;
    const previous = documents;

    setDocuments((current) =>
      sortByUpdatedAt(
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
    } catch (error) {
      console.error(
        "Unable to update favorite state:",
        error
      );
      setDocuments(previous);
      setSaveError(
        "Unable to update favorite state."
      );
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

    if (
      hasContent &&
      !window.confirm(
        `Delete "${title || "Untitled document"}"? This cannot be undone.`
      )
    ) {
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

    try {
      await deleteDocument(id);
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
      }
    } finally {
      setDeletingId(null);
    }
  }

  function navigateMatch(
    direction: 1 | -1
  ): void {
    const editor =
      quillRef.current?.getEditor?.();

    if (
      !editor ||
      !findState.query
    ) {
      return;
    }

    const matches = getMatchIndexes(
      editor.getText(),
      findState.query
    );

    if (matches.length === 0) {
      setFindState((current) => ({
        ...current,
        totalMatches: 0,
        currentIndex: -1,
      }));
      return;
    }

    const nextIndex =
      findState.currentIndex === -1
        ? direction === 1
          ? 0
          : matches.length - 1
        : (findState.currentIndex +
            direction +
            matches.length) %
          matches.length;

    editor.setSelection(
      matches[nextIndex],
      findState.query.length,
      "silent"
    );
    editor.focus();

    setFindState((current) => ({
      ...current,
      totalMatches: matches.length,
      currentIndex: nextIndex,
    }));
  }

  function replaceCurrentMatch(): void {
    const editor =
      quillRef.current?.getEditor?.();

    if (
      !editor ||
      !findState.query
    ) {
      return;
    }

    const matches = getMatchIndexes(
      editor.getText(),
      findState.query
    );

    if (matches.length === 0) {
      return;
    }

    const currentIndex =
      findState.currentIndex >= 0
        ? Math.min(
            findState.currentIndex,
            matches.length - 1
          )
        : 0;

    const matchPosition =
      matches[currentIndex];

    const formats = editor.getFormat(
      matchPosition,
      findState.query.length
    );

    editor.deleteText(
      matchPosition,
      findState.query.length,
      "user"
    );

    if (findState.replacement) {
      editor.insertText(
        matchPosition,
        findState.replacement,
        formats,
        "user"
      );
    }

    editor.setSelection(
      matchPosition,
      findState.replacement.length,
      "silent"
    );

    window.setTimeout(
      () => navigateMatch(1),
      0
    );
  }

  function replaceAllMatches(): void {
    const editor =
      quillRef.current?.getEditor?.();

    if (
      !editor ||
      !findState.query
    ) {
      return;
    }

    const matches = getMatchIndexes(
      editor.getText(),
      findState.query
    );

    for (
      let index = matches.length - 1;
      index >= 0;
      index -= 1
    ) {
      const position = matches[index];

      const formats = editor.getFormat(
        position,
        findState.query.length
      );

      editor.deleteText(
        position,
        findState.query.length,
        "user"
      );

      if (findState.replacement) {
        editor.insertText(
          position,
          findState.replacement,
          formats,
          "user"
        );
      }
    }

    setFindState((current) => ({
      ...current,
      totalMatches: 0,
      currentIndex: -1,
    }));
  }

  function closeFind(): void {
    setFindOpen(false);
    setReplaceOpen(false);
    resetFindState();

    quillRef.current
      ?.getEditor?.()
      ?.focus?.();
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

  return (
    <div className="documents-v2-page">
      <header className="documents-v2-header">
        <div>
          <p className="documents-v2-eyebrow">
            Documents v2
          </p>
          <h2>Documents</h2>
          <p>
            Write, organize, search, and export
            your work from one workspace.
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

      <div className="documents-v2-layout">
        <aside
          className="documents-v2-library"
          aria-label="Document library"
        >
          <div className="documents-v2-library-header">
            <div>
              <h3>Library</h3>
              <span>
                {documents.length} document
                {documents.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>
          </div>

          <div className="documents-v2-library-search">
            <input
              type="search"
              value={librarySearch}
              onChange={(event) =>
                setLibrarySearch(
                  event.target.value
                )
              }
              placeholder="Search documents"
              aria-label="Search document library"
            />
          </div>

          <nav
            className="documents-v2-library-tabs"
            aria-label="Document views"
          >
            {(
              [
                ["all", "All"],
                ["recent", "Recent"],
                ["pinned", "Pinned"],
                ["favorites", "Favorites"],
              ] as Array<
                [LibraryView, string]
              >
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  libraryView === value
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setLibraryView(value)
                }
              >
                <span>{label}</span>
                <small>
                  {documentCounts[value]}
                </small>
              </button>
            ))}
          </nav>

          {listError && (
            <div
              className="documents-v2-library-error"
              role="alert"
            >
              {listError}
            </div>
          )}

          <div className="documents-v2-list">
            {listLoading ? (
              <LibraryLoading />
            ) : filteredDocuments.length ===
              0 ? (
              <p className="documents-v2-empty">
                {librarySearch
                  ? "No documents match your search."
                  : "No documents in this view."}
              </p>
            ) : (
              filteredDocuments.map(
                (document) => (
                  <article
                    key={document.id}
                    className={
                      document.id === selectedId
                        ? "documents-v2-list-item is-active"
                        : "documents-v2-list-item"
                    }
                  >
                    <button
                      className="documents-v2-list-main"
                      type="button"
                      onClick={() =>
                        void handleSelectDocument(
                          document.id
                        )
                      }
                    >
                      <span className="documents-v2-list-title">
                        {document.isPinned && (
                          <span
                            aria-label="Pinned"
                            title="Pinned"
                          >
                            ●
                          </span>
                        )}
                        {document.isFavorite && (
                          <span
                            aria-label="Favorite"
                            title="Favorite"
                          >
                            ★
                          </span>
                        )}
                        <strong>
                          {document.title ||
                            "Untitled document"}
                        </strong>
                      </span>
                      <small>
                        Updated{" "}
                        {formatDocumentDate(
                          document.updatedAt ||
                            document.createdAt
                        )}
                      </small>
                    </button>

                    <div className="documents-v2-list-actions">
                      <button
                        type="button"
                        className={
                          document.isPinned
                            ? "is-active"
                            : ""
                        }
                        onClick={() =>
                          void handleTogglePinned(
                            document
                          )
                        }
                        aria-label={
                          document.isPinned
                            ? `Unpin ${document.title}`
                            : `Pin ${document.title}`
                        }
                        title={
                          document.isPinned
                            ? "Unpin"
                            : "Pin"
                        }
                      >
                        P
                      </button>
                      <button
                        type="button"
                        className={
                          document.isFavorite
                            ? "is-active"
                            : ""
                        }
                        onClick={() =>
                          void handleToggleFavorite(
                            document
                          )
                        }
                        aria-label={
                          document.isFavorite
                            ? `Remove ${document.title} from favorites`
                            : `Add ${document.title} to favorites`
                        }
                        title={
                          document.isFavorite
                            ? "Remove favorite"
                            : "Favorite"
                        }
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleDelete(
                            document.id
                          )
                        }
                        disabled={
                          deletingId === document.id
                        }
                        aria-label={`Delete ${document.title}`}
                        title="Delete"
                      >
                        {deletingId ===
                        document.id
                          ? "…"
                          : "×"}
                      </button>
                    </div>
                  </article>
                )
              )
            )}
          </div>
        </aside>

        <main className="documents-v2-editor-shell">
          {!selectedDocument ? (
            <div className="documents-v2-no-selection">
              <h3>
                Select or create a document
              </h3>
              <p>
                Choose something from the
                library, or create a new
                document to begin writing.
              </p>
              <button
                type="button"
                onClick={() =>
                  void handleCreateDocument()
                }
              >
                New document
              </button>
            </div>
          ) : (
            <>
              <section className="documents-v2-document-header">
                <div className="documents-v2-title-row">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(event) => {
                      setEditTitle(
                        event.target.value
                      );
                      setHasLocalChanges(true);
                      setSaveError(null);
                    }}
                    placeholder="Document title"
                    aria-label="Document title"
                  />

                  <div className="documents-v2-document-actions">
                    <button
                      type="button"
                      className={
                        selectedDocument.isPinned
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        void handleTogglePinned(
                          selectedDocument
                        )
                      }
                    >
                      {selectedDocument.isPinned
                        ? "Pinned"
                        : "Pin"}
                    </button>

                    <button
                      type="button"
                      className={
                        selectedDocument.isFavorite
                          ? "is-active"
                          : ""
                      }
                      onClick={() =>
                        void handleToggleFavorite(
                          selectedDocument
                        )
                      }
                    >
                      {selectedDocument.isFavorite
                        ? "Favorite"
                        : "Favorite"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void handleDuplicate()
                      }
                      disabled={duplicating}
                    >
                      {duplicating
                        ? "Duplicating…"
                        : "Duplicate"}
                    </button>

                    <div className="documents-v2-export-menu">
                      <details>
                        <summary>
                          Export
                        </summary>
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              exportDocumentAsText(
                                editTitle,
                                editContent
                              )
                            }
                          >
                            Export TXT
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              exportDocumentAsHtml(
                                editTitle,
                                editContent
                              )
                            }
                          >
                            Export HTML
                          </button>
                        </div>
                      </details>
                    </div>

                    <button
                      className="is-primary"
                      type="button"
                      onClick={() =>
                        void saveCurrentDocument()
                      }
                      disabled={isSaving}
                    >
                      {isSaving
                        ? "Saving…"
                        : "Save"}
                    </button>
                  </div>
                </div>

                <div className="documents-v2-status-row">
                  <div className="documents-v2-save-status">
                    {renderSaveStatus()}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setFindOpen(true);
                      window.setTimeout(() => {
                        document
                          .querySelector<HTMLInputElement>(
                            "#document-find-input"
                          )
                          ?.focus();
                      }, 0);
                    }}
                  >
                    Find in document
                  </button>
                </div>
              </section>

              {findOpen && (
                <section
                  className="documents-v2-find-panel"
                  aria-label="Find and replace"
                >
                  <div className="documents-v2-find-row">
                    <input
                      id="document-find-input"
                      type="search"
                      value={findState.query}
                      onChange={(event) =>
                        setFindState(
                          (current) => ({
                            ...current,
                            query:
                              event.target
                                .value,
                            currentIndex:
                              -1,
                          })
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter"
                        ) {
                          event.preventDefault();
                          navigateMatch(
                            event.shiftKey
                              ? -1
                              : 1
                          );
                        }

                        if (
                          event.key === "Escape"
                        ) {
                          closeFind();
                        }
                      }}
                      placeholder="Find"
                    />

                    <span className="documents-v2-match-count">
                      {findState.totalMatches === 0
                        ? "0 results"
                        : `${
                            findState.currentIndex +
                            1
                          } of ${
                            findState.totalMatches
                          }`}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        navigateMatch(-1)
                      }
                      aria-label="Previous match"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        navigateMatch(1)
                      }
                      aria-label="Next match"
                    >
                      ↓
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReplaceOpen(
                          (current) =>
                            !current
                        )
                      }
                    >
                      {replaceOpen
                        ? "Hide replace"
                        : "Replace"}
                    </button>

                    <button
                      type="button"
                      onClick={closeFind}
                      aria-label="Close find"
                    >
                      ×
                    </button>
                  </div>

                  {replaceOpen && (
                    <div className="documents-v2-replace-row">
                      <input
                        type="text"
                        value={
                          findState.replacement
                        }
                        onChange={(event) =>
                          setFindState(
                            (current) => ({
                              ...current,
                              replacement:
                                event.target
                                  .value,
                            })
                          )
                        }
                        placeholder="Replace with"
                      />
                      <button
                        type="button"
                        onClick={
                          replaceCurrentMatch
                        }
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={
                          replaceAllMatches
                        }
                      >
                        Replace all
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="documents-v2-editor">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={
                    handleImageFileChange
                  }
                />

                <ReactQuill
                  key={
                    selectedId ??
                    "no-document"
                  }
                  ref={quillRef}
                  defaultValue={editContent}
                  onChange={(html) => {
                    setEditContent(html);
                    setHasLocalChanges(true);
                    setSaveError(null);
                  }}
                  placeholder="Start writing your document here..."
                  theme="snow"
                  modules={quillModules}
                  formats={quillFormats}
                />
              </section>

              <section className="documents-v2-information">
                <div className="documents-v2-stat-grid">
                  <Stat
                    label="Words"
                    value={statistics.words}
                  />
                  <Stat
                    label="Characters"
                    value={
                      statistics.characters
                    }
                  />
                  <Stat
                    label="No spaces"
                    value={
                      statistics.charactersWithoutSpaces
                    }
                  />
                  <Stat
                    label="Reading time"
                    value={
                      statistics.readingMinutes
                    }
                    suffix="min"
                  />
                  <Stat
                    label="Paragraphs"
                    value={
                      statistics.paragraphs
                    }
                  />
                  <Stat
                    label="Lines"
                    value={statistics.lines}
                  />
                </div>

                <div className="documents-v2-metadata">
                  <h4>Metadata</h4>
                  <dl>
                    <div>
                      <dt>Created</dt>
                      <dd>
                        {formatDocumentDate(
                          selectedDocument.createdAt,
                          true
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Modified</dt>
                      <dd>
                        {formatDocumentDate(
                          lastSavedAt ||
                            selectedDocument.updatedAt,
                          true
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Reading time</dt>
                      <dd>
                        {
                          statistics.readingMinutes
                        }{" "}
                        minute
                        {statistics.readingMinutes ===
                        1
                          ? ""
                          : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt>Word count</dt>
                      <dd>
                        {statistics.words}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

interface StatProps {
  label: string;
  value: number;
  suffix?: string;
}

const Stat: React.FC<StatProps> = ({
  label,
  value,
  suffix,
}) => {
  return (
    <article className="documents-v2-stat">
      <span>{label}</span>
      <strong>
        {value}
        {suffix ? ` ${suffix}` : ""}
      </strong>
    </article>
  );
};

const LibraryLoading: React.FC = () => {
  return (
    <div
      className="documents-v2-library-loading"
      aria-label="Loading documents"
    >
      <span />
      <span />
      <span />
      <span />
    </div>
  );
};

export default DocumentsPage;
