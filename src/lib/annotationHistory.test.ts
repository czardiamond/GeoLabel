import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyEditHistory, recordEdit, redoEdit, undoEdit } from './annotationHistory.ts';

test('undo then redo restores immutable snapshots in order', () => {
  const first = ['first'];
  const second = ['first', 'second'];
  let history = recordEdit(emptyEditHistory<string[]>(), first);
  const undone = undoEdit(history, second);
  assert.deepEqual(undone.value, first);
  history = undone.history;
  const redone = redoEdit(history, undone.value);
  assert.deepEqual(redone.value, second);
  assert.equal(redone.history.undo.length, 1);
});

test('a new edit clears redo history and the undo stack is bounded', () => {
  let history = emptyEditHistory<number>();
  history = recordEdit(history, 0, 2);
  history = recordEdit(history, 1, 2);
  history = recordEdit(history, 2, 2);
  assert.deepEqual(history.undo, [1, 2]);
  const undone = undoEdit(history, 3);
  history = recordEdit(undone.history, 4, 2);
  assert.deepEqual(history.redo, []);
});

test('empty undo and redo leave the current snapshot unchanged', () => {
  const state = emptyEditHistory<string>();
  assert.deepEqual(undoEdit(state, 'now').value, 'now');
  assert.deepEqual(redoEdit(state, 'now').value, 'now');
});
