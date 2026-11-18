export interface History<T> {
  readonly present: T;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  push(next: T): void;
  undo(): void;
  redo(): void;
}

export function createHistory<T>(initial: T): History<T> {
  const states: T[] = [initial];
  let index = 0;
  return {
    get present() { return states[index]; },
    get canUndo() { return index > 0; },
    get canRedo() { return index < states.length - 1; },
    push(next) {
      states.length = index + 1;
      states.push(next);
      index++;
    },
    undo() { if (index > 0) index--; },
    redo() { if (index < states.length - 1) index++; },
  };
}
