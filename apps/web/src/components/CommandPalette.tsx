// apps/web/src/components/CommandPalette.tsx
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  commandRegistry,
} from "../commands/commandRegistry";
import type {
  CommandSearchResult,
} from "../commands/commandTypes";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

import "../styles/command-palette.css";

const OPEN_COMMAND_PALETTE_EVENT =
  "pioneer:open-command-palette";

export function openCommandPalette(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new Event(
        OPEN_COMMAND_PALETTE_EVENT
      )
    );
  }
}

const CommandPalette: React.FC = () => {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [open, setOpen] =
    useState(false);

  const [query, setQuery] =
    useState("");

  const [activeIndex, setActiveIndex] =
    useState(0);

  const [version, setVersion] =
    useState(0);

  const [executionError, setExecutionError] =
    useState<string | null>(null);

  useEffect(
    () =>
      commandRegistry.subscribe(
        () =>
          setVersion(
            (current) => current + 1
          )
      ),
    []
  );

  useEffect(() => {
    const show = () => {
      setOpen(true);
      setQuery("");
      setActiveIndex(0);
      setExecutionError(null);

      window.setTimeout(
        () => inputRef.current?.focus(),
        0
      );
    };

    window.addEventListener(
      OPEN_COMMAND_PALETTE_EVENT,
      show
    );

    return () => {
      window.removeEventListener(
        OPEN_COMMAND_PALETTE_EVENT,
        show
      );
    };
  }, []);

  const results = useMemo(() => {
    void version;

    return commandRegistry
      .search(query)
      .slice(0, 30);
  }, [query, version]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.length]);

  useBodyScrollLock(open);

  function close(): void {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setExecutionError(null);
  }

  async function execute(
    result: CommandSearchResult
  ): Promise<void> {
    if (
      result.command.enabled === false
    ) {
      return;
    }

    try {
      const executed =
        await commandRegistry.execute(
          result.command
        );

      if (executed) {
        close();
      }
    } catch (error) {
      console.error(
        "Command execution failed:",
        error
      );

      setExecutionError(
        "That command could not be completed."
      );
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      setActiveIndex(
        (current) =>
          (current + 1) %
          results.length
      );
    } else if (
      event.key === "ArrowUp"
    ) {
      event.preventDefault();

      setActiveIndex(
        (current) =>
          (current -
            1 +
            results.length) %
          results.length
      );
    } else if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      const result =
        results[activeIndex];

      if (result) {
        void execute(result);
      }
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="command-palette-overlay"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          close();
        }
      }}
    >
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        onKeyDown={handleKeyDown}
      >
        <header className="command-palette__header">
          <div>
            <p>Workspace commands</p>
            <h2 id="command-palette-title">
              Command Palette
            </h2>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Close command palette"
          >
            ×
          </button>
        </header>

        <div className="command-palette__input-row">
          <span aria-hidden="true">
            &gt;
          </span>

          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Type a command"
            aria-label="Search commands"
            autoComplete="off"
          />

          <kbd>Ctrl Shift P</kbd>
        </div>

        <div
          className="command-palette__results"
          role="listbox"
        >
          {!query.trim() &&
            results.some(
              (result) =>
                result.recentRank !== null
            ) && (
              <p className="command-palette__section-label">
                Recent and recommended
              </p>
            )}

          {executionError ? (
            <div className="command-palette__empty is-error">
              <strong>
                Command failed
              </strong>
              <p>{executionError}</p>
            </div>
          ) : results.length === 0 ? (
            <div className="command-palette__empty">
              <strong>
                No matching commands
              </strong>
              <p>
                Try a page name, action,
                or feature.
              </p>
            </div>
          ) : (
            results.map(
              (result, index) => {
                const command =
                  result.command;

                const disabled =
                  command.enabled === false;

                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={
                      index === activeIndex
                    }
                    aria-disabled={
                      disabled
                    }
                    className={[
                      "command-palette__result",
                      index === activeIndex
                        ? "is-active"
                        : "",
                      disabled
                        ? "is-disabled"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onMouseEnter={() =>
                      setActiveIndex(index)
                    }
                    onClick={() =>
                      void execute(result)
                    }
                  >
                    <span className="command-palette__category">
                      {command.category}
                    </span>

                    <span className="command-palette__main">
                      <strong>
                        {command.title}
                      </strong>

                      {(command.description ||
                        command.disabledReason) && (
                        <small>
                          {disabled
                            ? command.disabledReason
                            : command.description}
                        </small>
                      )}
                    </span>

                    {command.shortcut &&
                      command.shortcut.length >
                        0 && (
                        <span className="command-palette__shortcut">
                          {command.shortcut.map(
                            (key) => (
                              <kbd
                                key={`${command.id}:${key}`}
                              >
                                {key}
                              </kbd>
                            )
                          )}
                        </span>
                      )}
                  </button>
                );
              }
            )
          )}
        </div>

        <footer className="command-palette__footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            Navigate
          </span>

          <span>
            <kbd>Enter</kbd>
            Run
          </span>

          <span>
            <kbd>Esc</kbd>
            Close
          </span>
        </footer>
      </section>
    </div>
  );
};

export default CommandPalette;

