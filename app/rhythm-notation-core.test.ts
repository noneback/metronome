import assert from 'node:assert/strict';
import test from 'node:test';

import { createRhythmEvents } from './rhythm-notation-core.ts';

void test('renders alternating sixteenth-grid clicks as eighth notes', () => {
  const events = createRhythmEvents([2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0], '4/4');
  assert.equal(events.length, 8);
  assert.ok(events.every((event) => event.type === 'note' && event.flagCount === 1));
});

void test('preserves a leading offbeat gap as a rest', () => {
  const events = createRhythmEvents([0, 0, 2, 0, 0, 0, 2, 0], '2/4');
  assert.equal(events[0].type, 'rest');
  assert.equal(events[0].duration, 2);
  assert.equal(events[0].flagCount, 1);
  assert.equal(events[1].type, 'note');
});

void test('does not mutate the playback pattern', () => {
  const pattern = [2, 0, 1, 0] as const;
  createRhythmEvents(pattern, '2/4');
  assert.deepEqual(pattern, [2, 0, 1, 0]);
});

void test('notates a metal gallop as eighth-sixteenth-sixteenth groups', () => {
  const events = createRhythmEvents([2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1], '4/4');

  assert.deepEqual(events.slice(0, 3).map((event) => event.duration), [2, 1, 1]);
  assert.deepEqual(events.slice(0, 3).map((event) => event.flagCount), [1, 2, 2]);
});

void test('notates a reverse gallop as sixteenth-sixteenth-eighth groups', () => {
  const events = createRhythmEvents([2, 1, 1, 0, 2, 1, 1, 0, 2, 1, 1, 0, 2, 1, 1, 0], '4/4');

  assert.deepEqual(events.slice(0, 3).map((event) => event.duration), [1, 1, 2]);
  assert.deepEqual(events.slice(0, 3).map((event) => event.flagCount), [2, 2, 1]);
});

void test('notates a 9/8 slip jig as quarter-eighth groups', () => {
  const events = createRhythmEvents([2, 0, 1, 1, 0, 1, 1, 0, 1], '9/8');

  assert.deepEqual(events.map((event) => event.duration), [2, 1, 2, 1, 2, 1]);
  assert.deepEqual(events.map((event) => event.flagCount), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(events.map((event) => event.strength), [2, 1, 1, 1, 1, 1]);
});
