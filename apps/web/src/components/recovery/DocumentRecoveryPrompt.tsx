import React, { useEffect, useRef } from "react";

import type { DocumentRecoveryDraft } from "../../recovery/documentRecovery";

interface DocumentRecoveryPromptProps {
  draft: DocumentRecoveryDraft;
  currentUpdatedAt: string | null;
  onRestore: () => void;
  onDiscard: () => void | Promise<void>;
}

const DocumentRecoveryPrompt: React.FC<DocumentRecoveryPromptProps> = ({
  draft,
  currentUpdatedAt,
  onRestore,
  onDiscard,
}) => {
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const basedOnOlderVersion = Boolean(
    draft.baseUpdatedAt &&
      currentUpdatedAt &&
      draft.baseUpdatedAt !== currentUpdatedAt
  );

  useEffect(() => {
    restoreButtonRef.current?.focus();
  }, []);

  return (
    <div className="document-recovery-backdrop">
      <section
        className="document-recovery-prompt"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="document-recovery-title"
        aria-describedby="document-recovery-description"
      >
        <p className="document-recovery-prompt__eyebrow">
          Unsaved work found
        </p>
        <h3 id="document-recovery-title">Recover this document?</h3>
        <p id="document-recovery-description">
          Pioneer preserved edits captured {" "}
          <time dateTime={draft.capturedAt}>
            {new Date(draft.capturedAt).toLocaleString()}
          </time>
          . Restore them into the editor or discard the recovery copy.
        </p>

        {basedOnOlderVersion && (
          <p className="document-recovery-prompt__warning">
            The stored document changed after this recovery copy was created.
            Restoring will place the recovered text in the editor for you to
            review before it is saved.
          </p>
        )}

        <div className="document-recovery-prompt__actions">
          <button type="button" onClick={() => void onDiscard()}>
            Discard recovery copy
          </button>
          <button
            ref={restoreButtonRef}
            className="is-primary"
            type="button"
            onClick={onRestore}
          >
            Restore unsaved work
          </button>
        </div>
      </section>
    </div>
  );
};

export default DocumentRecoveryPrompt;
