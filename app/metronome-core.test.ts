import assert from 'node:assert/strict';
import test from 'node:test';

import { collectTapTempo, createStepCounts, isAudibleStep, parseBpmDraft, recoverLateSchedule, stepDurationSeconds } from './metronome-core.ts';

void test('parses an exact BPM draft within the supported range', () => {
  assert.equal(parseBpmDraft(' 137 ', 30, 240), 137);
});

void test('rejects empty, decimal, and out-of-range BPM drafts', () => {
  const expectedMessage = 'BPM 必须是 30 到 240 的整数。';

  assert.throws(() => parseBpmDraft('', 30, 240), { message: expectedMessage });
  assert.throws(() => parseBpmDraft('98.5', 30, 240), { message: expectedMessage });
  assert.throws(() => parseBpmDraft('241', 30, 240), { message: expectedMessage });
});

void test('calculates tempo from all recent tap intervals without mutating history', () => {
  const history = [0, 500, 1_000];
  const result = collectTapTempo(history, 1_500, 2_200, 6);

  assert.equal(result.bpm, 120);
  assert.deepEqual(result.tapTimes, [0, 500, 1_000, 1_500]);
  assert.deepEqual(history, [0, 500, 1_000]);
});

void test('starts a fresh tap sequence after the timeout', () => {
  const result = collectTapTempo([0, 500], 3_000, 2_200, 6);

  assert.equal(result.bpm, null);
  assert.deepEqual(result.tapTimes, [3_000]);
});

void test('keeps only the configured number of recent taps', () => {
  const result = collectTapTempo([0, 500, 1_000, 1_500, 2_000, 2_500], 3_000, 4_000, 6);

  assert.equal(result.tapTimes.length, 6);
  assert.deepEqual(result.tapTimes, [500, 1_000, 1_500, 2_000, 2_500, 3_000]);
});

void test('uses the median interval so one mistimed tap does not pull the tempo', () => {
  const result = collectTapTempo([0, 500, 1_000, 1_700], 2_200, 3_000, 6);

  assert.equal(result.bpm, 120);
});

void test('treats compound-meter BPM as dotted-quarter beats', () => {
  const stepDuration = stepDurationSeconds(120, 2, 6);
  const nineEightStepDuration = stepDurationSeconds(120, 3, 9);

  assert.equal(stepDuration, 1 / 6);
  assert.equal(stepDuration * 6, 1);
  assert.equal(nineEightStepDuration, 1 / 6);
  assert.equal(nineEightStepDuration * 9, 1.5);
});

void test('keeps an irregular 7/8 bar on a quarter-note tempo mark', () => {
  const stepDuration = stepDurationSeconds(120, 3.5, 7);

  assert.equal(stepDuration, 0.25);
  assert.equal(stepDuration * 7, 1.75);
});

void test('keeps a schedule that is only slightly behind the audio clock', () => {
  const recovery = recoverLateSchedule(10, 10.08, 0.1, 0.05);

  assert.deepEqual(recovery, { didRecover: false, nextNoteTime: 10 });
});

void test('drops stale timing and restarts after a long scheduler stall', () => {
  const recovery = recoverLateSchedule(10, 12, 0.1, 0.05);

  assert.deepEqual(recovery, { didRecover: true, nextNoteTime: 12.05 });
});

void test('signals a pulse only for an audible pattern step', () => {
  assert.equal(isAudibleStep(2, 72), true);
  assert.equal(isAudibleStep(1, 0), false);
  assert.equal(isAudibleStep(0, 72), false);
  assert.throws(() => isAudibleStep(3, 72), { message: '节拍强度必须是 0、1 或 2，实际为 3。' });
  assert.throws(() => isAudibleStep(1, 101), { message: '音量必须是 0 到 100 的有限数值，实际为 101。' });
});

void test('creates standard sixteenth-note counting for 4/4', () => {
  const counts = createStepCounts('4/4', 16);

  assert.deepEqual(counts.map((count) => count.label), ['1', 'e', '&', 'a', '2', 'e', '&', 'a', '3', 'e', '&', 'a', '4', 'e', '&', 'a']);
  assert.deepEqual(counts.filter((count) => count.isGroupStart).map((count) => count.group), [1, 2, 3, 4]);
});

void test('creates three-part counts for compound and irregular meters', () => {
  assert.deepEqual(createStepCounts('6/8', 6).map((count) => count.label), ['1', 'la', 'li', '2', 'la', 'li']);
  assert.deepEqual(createStepCounts('9/8', 9).map((count) => count.label), ['1', 'la', 'li', '2', 'la', 'li', '3', 'la', 'li']);
  assert.deepEqual(createStepCounts('7/8', 7).map((count) => count.label), ['1', '&', '2', '&', '3', 'la', 'li']);
});
