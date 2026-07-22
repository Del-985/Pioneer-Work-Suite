import React from "react";

import type { Document } from "../../api/documents";
import type {
  DocumentFindState,
  DocumentStatistics,
} from "./documentUiTypes";
import DocumentEditor from "./DocumentEditor";
import type { DocumentEditorHandle } from "./DocumentEditor";
import DocumentInspector from "./DocumentInspector";

interface DocumentWorkspaceProps {
  selectedDocument: Document | null;
  onCreateDocument(): Promise<void>;
  editTitle: string;
  setEditTitle: React.Dispatch<React.SetStateAction<string>>;
  setHasLocalChanges: React.Dispatch<React.SetStateAction<boolean>>;
  setSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  libraryOpen: boolean;
  setLibraryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onTogglePinned(document: Document): Promise<void>;
  onToggleFavorite(document: Document): Promise<void>;
  inspectorOpen: boolean;
  setInspectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  focusMode: boolean;
  setFocusMode: React.Dispatch<React.SetStateAction<boolean>>;
  onDuplicate(): Promise<void>;
  duplicating: boolean;
  onExportText(): void;
  onExportHtml(): void;
  onSave(): Promise<boolean>;
  isSaving: boolean;
  renderSaveStatus(): React.ReactNode;
  findOpen: boolean;
  setFindOpen: React.Dispatch<React.SetStateAction<boolean>>;
  replaceOpen: boolean;
  setReplaceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  findState: DocumentFindState;
  setFindState: React.Dispatch<React.SetStateAction<DocumentFindState>>;
  navigateMatch(direction: -1 | 1): void;
  closeFind(): void;
  replaceCurrentMatch(): void;
  replaceAllMatches(): void;
  selectedId: string | null;
  editorRevision: number;
  editorRef: React.RefObject<DocumentEditorHandle>;
  editContent: string;
  setEditContent: React.Dispatch<React.SetStateAction<string>>;
  setCursorPosition: React.Dispatch<
    React.SetStateAction<{ line: number; column: number }>
  >;
  statistics: DocumentStatistics;
  lastSavedAt: string | null;
  cursorPosition: { line: number; column: number };
}

const DocumentWorkspace: React.FC<DocumentWorkspaceProps> = ({
  selectedDocument,
  onCreateDocument: handleCreateDocument,
  editTitle,
  setEditTitle,
  setHasLocalChanges,
  setSaveError,
  libraryOpen,
  setLibraryOpen,
  onTogglePinned: handleTogglePinned,
  onToggleFavorite: handleToggleFavorite,
  inspectorOpen,
  setInspectorOpen,
  focusMode,
  setFocusMode,
  onDuplicate: handleDuplicate,
  duplicating,
  onExportText: handleExportText,
  onExportHtml: handleExportHtml,
  onSave: saveCurrentDocument,
  isSaving,
  renderSaveStatus,
  findOpen,
  setFindOpen,
  replaceOpen,
  setReplaceOpen,
  findState,
  setFindState,
  navigateMatch,
  closeFind,
  replaceCurrentMatch,
  replaceAllMatches,
  selectedId,
  editorRevision,
  editorRef: quillRef,
  editContent,
  setEditContent,
  setCursorPosition,
  statistics,
  lastSavedAt,
  cursorPosition,
}) => (
        <main className="documents-v2-editor-shell">
          {!selectedDocument ? (
            <div className="documents-v2-no-selection">
              <h2>
                Select or create a document
              </h2>
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
                      className={libraryOpen ? "is-active" : ""}
                      onClick={() => setLibraryOpen((current) => !current)}
                      aria-pressed={libraryOpen}
                    >
                      Library
                    </button>

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
                      className={inspectorOpen ? "is-active" : ""}
                      onClick={() => setInspectorOpen((current) => !current)}
                      aria-pressed={inspectorOpen}
                    >
                      Details
                    </button>

                    <button
                      type="button"
                      className={focusMode ? "is-active" : ""}
                      onClick={() => setFocusMode((current) => !current)}
                      aria-pressed={focusMode}
                    >
                      {focusMode ? "Exit focus" : "Focus"}
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
                            onClick={handleExportText}
                          >
                            Export TXT
                          </button>
                          <button
                            type="button"
                            onClick={handleExportHtml}
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

              <DocumentEditor
                key={`${selectedId ?? "no-document"}-${editorRevision}`}
                ref={quillRef}
                initialValue={editContent}
                documentTitle={editTitle}
                onChange={(html) => {
                  setEditContent(html);
                  setHasLocalChanges(true);
                  setSaveError(null);
                }}
                onCursorChange={setCursorPosition}
              />

              {inspectorOpen && !focusMode && (
                <DocumentInspector
                  document={selectedDocument}
                  statistics={statistics}
                  lastSavedAt={lastSavedAt}
                  cursorPosition={cursorPosition}
                  onClose={() => setInspectorOpen(false)}
                />
              )}
            </>
          )}
        </main>
);

export default DocumentWorkspace;
