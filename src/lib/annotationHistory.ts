export type EditHistory<T> = {
  undo: T[];
  redo: T[];
};

export function emptyEditHistory<T>(): EditHistory<T> {
  return { undo: [], redo: [] };
}

/** Save an immutable snapshot before a completed edit; a new edit clears redo. */
export function recordEdit<T>(
  history: EditHistory<T>,
  before: T,
  maxEntries = 100,
): EditHistory<T> {
  const limit = Math.max(0, Math.floor(maxEntries));
  return {
    undo: limit === 0 ? [] : [...history.undo, before].slice(-limit),
    redo: [],
  };
}

export function undoEdit<T>(history: EditHistory<T>, current: T): { history: EditHistory<T>; value: T } {
  if (history.undo.length === 0) return { history, value: current };
  const value = history.undo[history.undo.length - 1];
  return {
    value,
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, current] },
  };
}

export function redoEdit<T>(history: EditHistory<T>, current: T): { history: EditHistory<T>; value: T } {
  if (history.redo.length === 0) return { history, value: current };
  const value = history.redo[history.redo.length - 1];
  return {
    value,
    history: { undo: [...history.undo, current], redo: history.redo.slice(0, -1) },
  };
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}
