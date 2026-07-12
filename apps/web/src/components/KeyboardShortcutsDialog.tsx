// apps/web/src/components/KeyboardShortcutsDialog.tsx
import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  shortcutRegistry,
} from "../keyboard/shortcutRegistry";
import type {
  ShortcutCategory,
  ShortcutDisplayItem,
} from "../keyboard/keyboardTypes";

import "../styles/keyboard-shortcuts.css";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: ShortcutCategory[] = [
  "Search",
  "Create",
  "Documents",
  "Navigation",
  "Interface",
  "Reserved",
];

const KeyboardShortcutsDialog: React.FC<
  KeyboardShortcutsDialogProps
> = ({
  open,
  onClose,
}) => {
  const [version, setVersion] =
    useState(0);

  useEffect(
    () =>
      shortcutRegistry.subscribe(
        () =>
          setVersion(
            (current) =>
              current + 1
          )
      ),
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleEscape,
      true
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleEscape,
        true
      );
    };
  }, [onClose, open]);

  const groups = useMemo(() => {
    void version;

    const items =
      shortcutRegistry.getDisplayItems();

    return CATEGORY_ORDER
      .map((category) => ({
        category,
        items: items.filter(
          (item) =>
            item.category === category
        ),
      }))
      .filter(
        (group) =>
          group.items.length > 0
      );
  }, [version]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="keyboard-shortcuts-overlay"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="keyboard-shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        <header>
          <div>
            <p>Keyboard productivity</p>
            <h2 id="keyboard-shortcuts-title">
              Keyboard shortcuts
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
          >
            ×
          </button>
        </header>

        <div className="keyboard-shortcuts-content">
          {groups.map((group) => (
            <section
              key={group.category}
              className="keyboard-shortcuts-group"
            >
              <h3>{group.category}</h3>

              <ul>
                {group.items.map(
                  (
                    item: ShortcutDisplayItem
                  ) => (
                    <li
                      key={item.id}
                      className={
                        item.enabled
                          ? ""
                          : "is-disabled"
                      }
                    >
                      <span>
                        {item.description}
                        {!item.enabled && (
                          <small>
                            Coming next
                          </small>
                        )}
                      </span>

                      <span className="keyboard-shortcuts-keys">
                        {item.keys.map(
                          (key, index) => (
                            <React.Fragment
                              key={`${item.id}:${key}:${index}`}
                            >
                              <kbd>
                                {key}
                              </kbd>
                              {index <
                                item.keys
                                  .length -
                                  1 && (
                                <span>
                                  +
                                </span>
                              )}
                            </React.Fragment>
                          )
                        )}
                      </span>
                    </li>
                  )
                )}
              </ul>
            </section>
          ))}
        </div>

        <footer>
          Shortcuts adapt to the active page.
          Document-only commands appear while the
          editor is open.
        </footer>
      </section>
    </div>
  );
};

export default KeyboardShortcutsDialog;
