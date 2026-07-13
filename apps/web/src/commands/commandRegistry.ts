// apps/web/src/commands/commandRegistry.ts
import type {
  CommandDefinition,
  CommandSearchResult,
  CommandUnregister,
} from "./commandTypes";

const HISTORY_KEY =
  "pioneer:command-palette-history";

const HISTORY_LIMIT = 12;

type RegistryListener = () => void;

interface RegisteredCommand {
  definition: CommandDefinition;
  registrationOrder: number;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyScore(
  query: string,
  candidate: string
): number {
  const normalizedQuery = normalize(query);
  const normalizedCandidate =
    normalize(candidate);

  if (!normalizedQuery) {
    return 0;
  }

  if (
    normalizedCandidate ===
    normalizedQuery
  ) {
    return 1000;
  }

  if (
    normalizedCandidate.startsWith(
      normalizedQuery
    )
  ) {
    return 800;
  }

  if (
    normalizedCandidate.includes(
      normalizedQuery
    )
  ) {
    return 600;
  }

  const queryTokens =
    normalizedQuery.split(" ");

  const candidateTokens =
    normalizedCandidate.split(" ");

  let tokenScore = 0;

  for (const token of queryTokens) {
    const exact =
      candidateTokens.includes(token);

    const prefix =
      candidateTokens.some(
        (candidateToken) =>
          candidateToken.startsWith(token)
      );

    const partial =
      candidateTokens.some(
        (candidateToken) =>
          candidateToken.includes(token)
      );

    if (exact) {
      tokenScore += 120;
    } else if (prefix) {
      tokenScore += 80;
    } else if (partial) {
      tokenScore += 40;
    } else {
      return -1;
    }
  }

  return tokenScore;
}

function readHistory(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        HISTORY_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string =>
            typeof value === "string"
        )
      : [];
  } catch {
    return [];
  }
}

function writeHistory(
  commandIds: string[]
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        commandIds.slice(
          0,
          HISTORY_LIMIT
        )
      )
    );
  } catch {
    // Command history is optional.
  }
}

class CommandRegistry {
  private commands =
    new Map<string, RegisteredCommand>();

  private listeners =
    new Set<RegistryListener>();

  private registrationOrder = 0;

  register(
    definition: CommandDefinition
  ): CommandUnregister {
    this.registrationOrder += 1;

    const registrationOrder =
      this.registrationOrder;

    this.commands.set(definition.id, {
      definition,
      registrationOrder,
    });

    this.publish();

    return () => {
      const current =
        this.commands.get(definition.id);

      if (
        current?.registrationOrder !==
        registrationOrder
      ) {
        return;
      }

      this.commands.delete(definition.id);
      this.publish();
    };
  }

  registerMany(
    definitions: CommandDefinition[]
  ): CommandUnregister {
    const registrations = definitions.map(
      (definition) => {
        this.registrationOrder += 1;

        const registrationOrder =
          this.registrationOrder;

        this.commands.set(definition.id, {
          definition,
          registrationOrder,
        });

        return {
          id: definition.id,
          registrationOrder,
        };
      }
    );

    this.publish();

    return () => {
      let changed = false;

      for (const registration of [
        ...registrations,
      ].reverse()) {
        const current = this.commands.get(
          registration.id
        );

        if (
          current?.registrationOrder ===
          registration.registrationOrder
        ) {
          this.commands.delete(registration.id);
          changed = true;
        }
      }

      if (changed) {
        this.publish();
      }
    };
  }

  getCommands(): CommandDefinition[] {
    return [...this.commands.values()]
      .sort((left, right) => {
        const priorityDifference =
          (right.definition.priority ?? 0) -
          (left.definition.priority ?? 0);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (
          right.registrationOrder -
          left.registrationOrder
        );
      })
      .map(({ definition }) => definition);
  }

  search(
    query: string
  ): CommandSearchResult[] {
    const history = readHistory();

    return this.getCommands()
      .map((command) => {
        const candidate = [
          command.title,
          command.description ?? "",
          command.category,
          ...(command.keywords ?? []),
        ].join(" ");

        const score = query.trim()
          ? fuzzyScore(query, candidate)
          : 0;

        const historyIndex =
          history.indexOf(command.id);

        return {
          command,
          score,
          recentRank:
            historyIndex === -1
              ? null
              : historyIndex,
        };
      })
      .filter(
        (result) =>
          !query.trim() ||
          result.score >= 0
      )
      .sort((left, right) => {
        if (!query.trim()) {
          if (
            left.recentRank !== null ||
            right.recentRank !== null
          ) {
            if (
              left.recentRank === null
            ) {
              return 1;
            }

            if (
              right.recentRank === null
            ) {
              return -1;
            }

            return (
              left.recentRank -
              right.recentRank
            );
          }
        }

        if (
          right.score !== left.score
        ) {
          return (
            right.score -
            left.score
          );
        }

        const priorityDifference =
          (right.command.priority ?? 0) -
          (left.command.priority ?? 0);

        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return left.command.title.localeCompare(
          right.command.title
        );
      });
  }

  async execute(
    command: CommandDefinition
  ): Promise<boolean> {
    if (command.enabled === false) {
      return false;
    }

    await command.run();

    const nextHistory = [
      command.id,
      ...readHistory().filter(
        (id) => id !== command.id
      ),
    ];

    writeHistory(nextHistory);

    return true;
  }

  subscribe(
    listener: RegistryListener
  ): CommandUnregister {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const commandRegistry =
  new CommandRegistry();

