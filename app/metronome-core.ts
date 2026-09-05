import { parseMeter } from './rhythm-notation-core.ts';

export type TapTempoResult = {
  bpm: number | null;
  tapTimes: readonly number[];
};

export type StepCount = {
  group: number;
  isGroupStart: boolean;
  label: string;
  position: number;
};

export const parseBpmDraft = (draft: string, minimum: number, maximum: number): number => {
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum >= maximum) {
    throw new RangeError(`BPM 范围必须由递增的整数定义，实际为 ${minimum}–${maximum}。`);
  }

  const normalizedDraft = draft.trim();
  if (!/^\d+$/.test(normalizedDraft)) {
    throw new RangeError(`BPM 必须是 ${minimum} 到 ${maximum} 的整数。`);
  }

  const bpm = Number(normalizedDraft);
  if (bpm < minimum || bpm > maximum) {
    throw new RangeError(`BPM 必须是 ${minimum} 到 ${maximum} 的整数。`);
  }
  return bpm;
};

const subdivisionLabels = (stepCount: number): readonly string[] => {
  if (stepCount === 1) return [];
  if (stepCount === 2) return ['&'];
  if (stepCount === 3) return ['la', 'li'];
  if (stepCount === 4) return ['e', '&', 'a'];
  throw new RangeError(`不支持每拍 ${stepCount} 个步进的口令。`);
};

const createGroupCounts = (group: number, stepCount: number): readonly StepCount[] => {
  const labels = [String(group), ...subdivisionLabels(stepCount)];
  return labels.map((label, position) => ({ group, isGroupStart: position === 0, label, position }));
};

export const createStepCounts = (meter: string, stepCount: number): readonly StepCount[] => {
  if (!Number.isInteger(stepCount) || stepCount < 1) throw new RangeError(`步进数量至少为 1，实际为 ${stepCount}。`);
  const meterParts = parseMeter(meter);

  if (meter === '7/8') {
    if (stepCount !== 7) throw new RangeError(`7/8 的 2+2+3 口令需要 7 个步进，实际为 ${stepCount}。`);
    return [2, 2, 3].flatMap((groupSteps, index) => createGroupCounts(index + 1, groupSteps));
  }

  const groupCount = meterParts.beatUnit === 4
    ? meterParts.beats
    : meterParts.beatUnit === 8 && meterParts.beats % 3 === 0
      ? meterParts.beats / 3
      : 0;
  if (groupCount === 0) throw new RangeError(`无法为拍号 ${meter} 创建练习口令。`);
  if (stepCount % groupCount !== 0) throw new RangeError(`${meter} 的 ${stepCount} 个步进无法平均分到 ${groupCount} 拍。`);
  const stepsPerGroup = stepCount / groupCount;
  return Array.from({ length: groupCount }, (_, index) => createGroupCounts(index + 1, stepsPerGroup)).flat();
};

export type ScheduleRecovery = {
  didRecover: boolean;
  nextNoteTime: number;
};

export const recoverLateSchedule = (
  nextNoteTime: number,
  currentTime: number,
  lateThresholdSeconds: number,
  startDelaySeconds: number,
): ScheduleRecovery => {
  if (!Number.isFinite(nextNoteTime) || nextNoteTime < 0) throw new RangeError(`下一个节拍时间必须是非负有限数值，实际为 ${nextNoteTime}。`);
  if (!Number.isFinite(currentTime) || currentTime < 0) throw new RangeError(`音频当前时间必须是非负有限数值，实际为 ${currentTime}。`);
  if (!Number.isFinite(lateThresholdSeconds) || lateThresholdSeconds <= 0) {
    throw new RangeError(`调度过期阈值必须为正数，实际为 ${lateThresholdSeconds}。`);
  }
  if (!Number.isFinite(startDelaySeconds) || startDelaySeconds < 0) {
    throw new RangeError(`恢复启动延迟不能为负数，实际为 ${startDelaySeconds}。`);
  }

  if (currentTime - nextNoteTime <= lateThresholdSeconds) return { didRecover: false, nextNoteTime };
  return { didRecover: true, nextNoteTime: currentTime + startDelaySeconds };
};

export const isAudibleStep = (strength: number, volumePercent: number): boolean => {
  if (!Number.isInteger(strength) || strength < 0 || strength > 2) {
    throw new RangeError(`节拍强度必须是 0、1 或 2，实际为 ${strength}。`);
  }
  if (!Number.isFinite(volumePercent) || volumePercent < 0 || volumePercent > 100) {
    throw new RangeError(`音量必须是 0 到 100 的有限数值，实际为 ${volumePercent}。`);
  }
  return strength > 0 && volumePercent > 0;
};

export const stepDurationSeconds = (bpm: number, tempoBeatsPerBar: number, stepCount: number): number => {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError(`BPM 必须为正数，实际为 ${bpm}。`);
  if (!Number.isFinite(tempoBeatsPerBar) || tempoBeatsPerBar <= 0) {
    throw new RangeError(`每小节基准拍数必须为正数，实际为 ${tempoBeatsPerBar}。`);
  }
  if (!Number.isInteger(stepCount) || stepCount < 1) throw new RangeError(`步进数量至少为 1，实际为 ${stepCount}。`);
  return ((60 / bpm) * tempoBeatsPerBar) / stepCount;
};

export const collectTapTempo = (
  tapTimes: readonly number[],
  now: number,
  timeoutMs: number,
  sampleLimit: number,
): TapTempoResult => {
  if (!Number.isFinite(now) || now < 0) throw new RangeError(`Tap 时间必须是非负有限数值，实际为 ${now}。`);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError(`Tap 超时时间必须为正数，实际为 ${timeoutMs}。`);
  if (!Number.isInteger(sampleLimit) || sampleLimit < 2) throw new RangeError(`Tap 样本上限至少为 2，实际为 ${sampleLimit}。`);
  if (tapTimes.some((time) => !Number.isFinite(time) || time < 0 || time > now)) {
    throw new RangeError('Tap 历史必须由不晚于当前时间的非负有限数值组成。');
  }
  if (tapTimes.some((time, index) => index > 0 && time <= tapTimes[index - 1])) {
    throw new RangeError('Tap 历史必须按时间严格递增。');
  }

  const recentTapTimes = [...tapTimes.filter((time) => now - time < timeoutMs), now].slice(-sampleLimit);
  if (recentTapTimes.length < 2) return { bpm: null, tapTimes: recentTapTimes };

  const intervals = recentTapTimes.slice(1).map((time, index) => time - recentTapTimes[index]);
  const sortedIntervals = [...intervals].sort((left, right) => left - right);
  const middle = Math.floor(sortedIntervals.length / 2);
  const medianInterval = sortedIntervals.length % 2 === 0
    ? (sortedIntervals[middle - 1] + sortedIntervals[middle]) / 2
    : sortedIntervals[middle];
  return { bpm: 60_000 / medianInterval, tapTimes: recentTapTimes };
};
