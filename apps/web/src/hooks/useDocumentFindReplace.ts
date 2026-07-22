import { useEffect } from "react";

import type { DocumentEditorHandle } from "../components/documents/DocumentEditor";
import type { DocumentFindState } from "../components/documents/documentUiTypes";

interface DocumentFindReplaceOptions {
  editorRef: React.RefObject<DocumentEditorHandle>;
  editContent: string;
  findOpen: boolean;
  setFindOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setReplaceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  findState: DocumentFindState;
  setFindState: React.Dispatch<React.SetStateAction<DocumentFindState>>;
  resetFindState(): void;
}

function getMatchIndexes(text: string, query: string): number[] {
  const normalizedQuery = query.toLocaleLowerCase();
  if (!normalizedQuery) return [];
  const normalizedText = text.toLocaleLowerCase();
  const matches: number[] = [];
  let cursor = 0;
  while (cursor <= normalizedText.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
    if (matchIndex === -1) break;
    matches.push(matchIndex);
    cursor = matchIndex + Math.max(1, normalizedQuery.length);
  }
  return matches;
}

export function useDocumentFindReplace({
  editorRef,
  editContent,
  findOpen,
  setFindOpen,
  setReplaceOpen,
  findState,
  setFindState,
  resetFindState,
}: DocumentFindReplaceOptions) {
  useEffect(() => {
    if (!findOpen || !findState.query) {
      setFindState((current) => ({
        ...current,
        totalMatches: 0,
        currentIndex: -1,
      }));
      return;
    }
    const editor = editorRef.current?.getEditor?.();
    if (!editor) return;
    const matches = getMatchIndexes(editor.getText(), findState.query);
    setFindState((current) => ({
      ...current,
      totalMatches: matches.length,
      currentIndex:
        matches.length === 0
          ? -1
          : Math.min(Math.max(current.currentIndex, 0), matches.length - 1),
    }));
  }, [editContent, editorRef, findOpen, findState.query, setFindState]);

  function navigateMatch(direction: 1 | -1): void {
    const editor = editorRef.current?.getEditor?.();
    if (!editor || !findState.query) return;
    const matches = getMatchIndexes(editor.getText(), findState.query);
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
        ? direction === 1 ? 0 : matches.length - 1
        : (findState.currentIndex + direction + matches.length) % matches.length;
    editor.setSelection(matches[nextIndex], findState.query.length, "silent");
    editor.focus();
    setFindState((current) => ({
      ...current,
      totalMatches: matches.length,
      currentIndex: nextIndex,
    }));
  }

  function replaceCurrentMatch(): void {
    const editor = editorRef.current?.getEditor?.();
    if (!editor || !findState.query) return;
    const matches = getMatchIndexes(editor.getText(), findState.query);
    if (matches.length === 0) return;
    const currentIndex = findState.currentIndex >= 0
      ? Math.min(findState.currentIndex, matches.length - 1)
      : 0;
    const matchPosition = matches[currentIndex];
    const formats = editor.getFormat(matchPosition, findState.query.length);
    editor.deleteText(matchPosition, findState.query.length, "user");
    if (findState.replacement) {
      editor.insertText(
        matchPosition,
        findState.replacement,
        formats,
        "user"
      );
    }
    editor.setSelection(matchPosition, findState.replacement.length, "silent");
    window.setTimeout(() => navigateMatch(1), 0);
  }

  function replaceAllMatches(): void {
    const editor = editorRef.current?.getEditor?.();
    if (!editor || !findState.query) return;
    const matches = getMatchIndexes(editor.getText(), findState.query);
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const position = matches[index];
      const formats = editor.getFormat(position, findState.query.length);
      editor.deleteText(position, findState.query.length, "user");
      if (findState.replacement) {
        editor.insertText(position, findState.replacement, formats, "user");
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
    editorRef.current?.getEditor?.()?.focus?.();
  }

  return {
    navigateMatch,
    replaceCurrentMatch,
    replaceAllMatches,
    closeFind,
  };
}
