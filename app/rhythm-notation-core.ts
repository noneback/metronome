export type RhythmStepStrength = 0 | 1 | 2;

export type RhythmEvent = {
  dotted: boolean;
  duration: number;
  flagCount: number;
  index: number;
  strength: RhythmStepStrength;
  type: 'note' | 'rest';
};

type MeterParts = {
  beatUnit: number;
  beats: number;
};

export const parseMeter = (meter: string): MeterParts => {
  const match = /^(\d+)\/(\d+)$/.exec(meter);
  if (!match) throw new Error(`无法绘制拍号：${meter}`);
  const beats = Number(match[1]);
  const beatUnit = Number(match[2]);
  if (!Number.isInteger(beats) || !Number.isInteger(beatUnit) || beats <= 0 || beatUnit <= 0) throw new RangeError(`拍号数值无效：${meter}`);
  return { beatUnit, beats };
};

const durationAppearance = (duration: number, stepsPerQuarter: number): Pick<RhythmEvent, 'dotted' | 'flagCount'> => {
  if (Math.abs(stepsPerQuarter - 3) < 0.001) {
    if (duration === 1) return { dotted: false, flagCount: 1 };
    if (duration === 2) return { dotted: false, flagCount: 0 };
  }
  const quarterDuration = duration / stepsPerQuarter;
  const appearances = [
    { dotted: false, flagCount: 0, value: 1 },
    { dotted: true, flagCount: 0, value: 1.5 },
    { dotted: false, flagCount: 1, value: 0.5 },
    { dotted: true, flagCount: 1, value: 0.75 },
    { dotted: false, flagCount: 2, value: 0.25 },
    { dotted: true, flagCount: 2, value: 0.375 },
  ];
  const closest = appearances.reduce((best, appearance) => Math.abs(quarterDuration - appearance.value) < Math.abs(quarterDuration - best.value) ? appearance : best);
  return { dotted: closest.dotted, flagCount: closest.flagCount };
};

export const createRhythmEvents = (pattern: readonly RhythmStepStrength[], meter: string): readonly RhythmEvent[] => {
  if (pattern.length === 0) throw new RangeError('节奏谱至少需要一个步进。');
  const meterParts = parseMeter(meter);
  const quarterNotesPerBar = meterParts.beats * (4 / meterParts.beatUnit);
  const stepsPerQuarter = pattern.length / quarterNotesPerBar;
  const activeIndices = pattern.flatMap((strength, index) => strength > 0 ? [index] : []);
  if (activeIndices.length === 0) {
    const appearance = durationAppearance(pattern.length, stepsPerQuarter);
    return [{ ...appearance, duration: pattern.length, index: 0, strength: 0, type: 'rest' }];
  }

  const initialRest = activeIndices[0] === 0 ? [] : [{
    ...durationAppearance(activeIndices[0], stepsPerQuarter),
    duration: activeIndices[0],
    index: 0,
    strength: 0 as const,
    type: 'rest' as const,
  }];
  const notes = activeIndices.map((index, eventIndex): RhythmEvent => {
    const nextIndex = activeIndices[eventIndex + 1] ?? pattern.length;
    const duration = nextIndex - index;
    return {
      ...durationAppearance(duration, stepsPerQuarter),
      duration,
      index,
      strength: pattern[index],
      type: 'note',
    };
  });
  return [...initialRest, ...notes];
};
