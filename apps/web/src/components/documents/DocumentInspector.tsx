import React from "react";

import type { Document } from "../../api/documents";
import { formatDocumentDate } from "../../utils/documentText";
import type { DocumentStatistics } from "./documentUiTypes";

interface DocumentInspectorProps {
  document: Document;
  statistics: DocumentStatistics;
  lastSavedAt: string | null;
  cursorPosition: { line: number; column: number };
  onClose: () => void;
}

const DocumentInspector: React.FC<DocumentInspectorProps> = ({
  document,
  statistics,
  lastSavedAt,
  cursorPosition,
  onClose,
}) => (
  <aside className="documents-v3-inspector" aria-label="Document details">
    <div className="documents-v3-inspector__heading">
      <div>
        <span>Document</span>
        <strong>Details</strong>
      </div>
      <button type="button" onClick={onClose} aria-label="Close document details">
        Close
      </button>
    </div>

    <section>
      <h3>Overview</h3>
      <div className="documents-v3-inspector__metrics">
        <Metric label="Words" value={statistics.words} />
        <Metric label="Characters" value={statistics.characters} />
        <Metric label="Reading" value={`${statistics.readingMinutes} min`} />
        <Metric label="Paragraphs" value={statistics.paragraphs} />
      </div>
    </section>

    <section>
      <h3>Position</h3>
      <dl>
        <div>
          <dt>Line</dt>
          <dd>{cursorPosition.line}</dd>
        </div>
        <div>
          <dt>Column</dt>
          <dd>{cursorPosition.column}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{statistics.lines}</dd>
        </div>
        <div>
          <dt>Characters, no spaces</dt>
          <dd>{statistics.charactersWithoutSpaces}</dd>
        </div>
      </dl>
    </section>

    <section>
      <h3>File information</h3>
      <dl>
        <div>
          <dt>Created</dt>
          <dd>{formatDocumentDate(document.createdAt, true)}</dd>
        </div>
        <div>
          <dt>Last saved</dt>
          <dd>{formatDocumentDate(lastSavedAt || document.updatedAt, true)}</dd>
        </div>
        <div>
          <dt>Pinned</dt>
          <dd>{document.isPinned ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Favorite</dt>
          <dd>{document.isFavorite ? "Yes" : "No"}</dd>
        </div>
      </dl>
    </section>
  </aside>
);

const Metric: React.FC<{ label: string; value: string | number }> = ({
  label,
  value,
}) => (
  <div>
    <strong>{value}</strong>
    <span>{label}</span>
  </div>
);

export default DocumentInspector;
