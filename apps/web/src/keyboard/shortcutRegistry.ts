// apps/web/src/keyboard/shortcutRegistry.ts
import type {
  ShortcutDefinition,
  ShortcutDisplayItem,
  ShortcutUnregister,
} from "./keyboardTypes";
import {
  isEditableTarget,
  shortcutMatches,
  shortcutToDisplayItem,
} from "./shortcutUtils";

type RegistryListener = () => void;

interface RegisteredShortcut {
  definition: ShortcutDefinition;
  registrationOrder: number;
}

class ShortcutRegistry {
  private shortcuts =
    new Map<string, RegisteredShortcut>();

  private listeners =
    new Set<RegistryListener>();

  private registrationOrder = 0;

  register(
    definition: ShortcutDefinition
  ): ShortcutUnregister {
    this.registrationOrder += 1;

    const registrationOrder =
      this.registrationOrder;

    this.shortcuts.set(definition.id, {
      definition,
      registrationOrder,
    });

    this.publish();

    return () => {
      const current =
        this.shortcuts.get(definition.id);

      if (
        current?.registrationOrder !==
        registrationOrder
      ) {
        return;
      }

      this.shortcuts.delete(definition.id);
      this.publish();
    };
  }

  registerMany(
    definitions: ShortcutDefinition[]
  ): ShortcutUnregister {
    const unregister = definitions.map(
      (definition) =>
        this.register(definition)
    );

    return () => {
      unregister
        .reverse()
        .forEach((dispose) => dispose());
    };
  }

  handleKeydown(event: KeyboardEvent): boolean {
    if (event.defaultPrevented) {
      return false;
    }

    const editable =
      isEditableTarget(event.target);

    const matches = [
      ...this.shortcuts.values(),
    ]
      .filter(
        ({ definition }) =>
          definition.enabled !== false &&
          shortcutMatches(
            event,
            definition
          ) &&
          (!editable ||
            definition.allowInEditable)
      )
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
      });

    const match = matches[0]?.definition;

    if (!match) {
      return false;
    }

    if (match.preventDefault !== false) {
      event.preventDefault();
    }

    void match.handler(event);

    return true;
  }

  getDisplayItems(): ShortcutDisplayItem[] {
    return [...this.shortcuts.values()]
      .map(({ definition }) =>
        shortcutToDisplayItem(definition)
      )
      .sort((left, right) => {
        if (
          left.category !== right.category
        ) {
          return left.category.localeCompare(
            right.category
          );
        }

        return left.description.localeCompare(
          right.description
        );
      });
  }

  subscribe(
    listener: RegistryListener
  ): ShortcutUnregister {
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

export const shortcutRegistry =
  new ShortcutRegistry();
