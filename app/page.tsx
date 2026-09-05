'use client';

import { Clock3, Drum, Gauge, Languages, ListMusic, Minus, Moon, Music2, Pause, Play, Plus, RotateCcw, Sun, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { collectTapTempo, createStepCounts, isAudibleStep, parseBpmDraft, recoverLateSchedule, stepDurationSeconds } from './metronome-core';
import { RhythmNotation } from './rhythm-notation';

type StepStrength = 0 | 1 | 2;
type MeterKey = '2/4' | '3/4' | '4/4' | '5/4' | '6/8' | '7/8' | '9/8' | '12/8';
type SoundKey = 'wood' | 'studio' | 'digital';
type Locale = 'zh' | 'en';
type Theme = 'light' | 'dark';
type LocalizedText = Readonly<{ zh: string; en: string }>;

type TempoMark = '♩' | '♩.';
type Meter = { countUnit: LocalizedText; name: LocalizedText; tempoBeatsPerBar: number; tempoMark: TempoMark; tempoUnitName: LocalizedText; pattern: StepStrength[] };
type RhythmPreset = { id: string; name: LocalizedText; family: string; subdivision: LocalizedText; bpm: number; meter: MeterKey; description: LocalizedText; pattern: StepStrength[] };
type MetronomeError = { kind: 'audio' | 'bpm' | 'control'; message: string };

const text = (zh: string, en: string): LocalizedText => ({ zh, en });
const localize = (value: LocalizedText, locale: Locale): string => value[locale];

const METERS: Record<MeterKey, Meter> = {
  '2/4': { countUnit: text('拍', 'beat'), name: text('进行曲二拍', 'March, two beats'), tempoBeatsPerBar: 2, tempoMark: '♩', tempoUnitName: text('四分音符', 'quarter note'), pattern: [2, 0, 1, 0] },
  '3/4': { countUnit: text('拍', 'beat'), name: text('圆舞曲三拍', 'Waltz, three beats'), tempoBeatsPerBar: 3, tempoMark: '♩', tempoUnitName: text('四分音符', 'quarter note'), pattern: [2, 0, 1, 0, 1, 0] },
  '4/4': { countUnit: text('拍', 'beat'), name: text('常用四拍', 'Common time'), tempoBeatsPerBar: 4, tempoMark: '♩', tempoUnitName: text('四分音符', 'quarter note'), pattern: [2, 0, 1, 0, 1, 0, 1, 0] },
  '5/4': { countUnit: text('拍', 'beat'), name: text('3+2 五拍', '3+2 grouping'), tempoBeatsPerBar: 5, tempoMark: '♩', tempoUnitName: text('四分音符', 'quarter note'), pattern: [2, 0, 1, 0, 1, 0, 2, 0, 1, 0] },
  '6/8': { countUnit: text('组', 'group'), name: text('两组三拍', 'Two groups of three'), tempoBeatsPerBar: 2, tempoMark: '♩.', tempoUnitName: text('附点四分音符', 'dotted quarter note'), pattern: [2, 0, 0, 1, 0, 0] },
  '7/8': { countUnit: text('组', 'group'), name: text('2+2+3 七拍', '2+2+3 grouping'), tempoBeatsPerBar: 3.5, tempoMark: '♩', tempoUnitName: text('四分音符', 'quarter note'), pattern: [2, 0, 1, 0, 1, 0, 0] },
  '9/8': { countUnit: text('组', 'group'), name: text('三组三拍', 'Three groups of three'), tempoBeatsPerBar: 3, tempoMark: '♩.', tempoUnitName: text('附点四分音符', 'dotted quarter note'), pattern: [2, 0, 0, 1, 0, 0, 1, 0, 0] },
  '12/8': { countUnit: text('组', 'group'), name: text('四组三拍', 'Four groups of three'), tempoBeatsPerBar: 4, tempoMark: '♩.', tempoUnitName: text('附点四分音符', 'dotted quarter note'), pattern: [2, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] },
};

const PRESETS: RhythmPreset[] = [
  { id: 'rock', name: text('经典摇滚', 'Classic Rock'), family: 'Rock', subdivision: text('八分音符推进', 'Eighth-note drive'), bpm: 120, meter: '4/4', description: text('每拍分成两格，重音落在正拍', 'Two subdivisions per beat with accents on the pulse'), pattern: [2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0] },
  { id: 'pop', name: text('流行律动', 'Pop Groove'), family: 'Pop', subdivision: text('十六分音符反拍', 'Sixteenth-note offbeats'), bpm: 104, meter: '4/4', description: text('正拍稳定，间隙加入扫弦落点', 'Steady beats with strumming hits between the pulse'), pattern: [2, 0, 1, 1, 2, 0, 1, 0, 2, 1, 1, 0, 2, 0, 1, 1] },
  { id: 'funk', name: text('放克切分', 'Funk Syncopation'), family: 'Funk', subdivision: text('十六分音符切分', 'Sixteenth-note syncopation'), bpm: 98, meter: '4/4', description: text('连续十六分格，突出错位重音', 'A dense grid with displaced accents'), pattern: [2, 0, 1, 1, 0, 1, 2, 0, 1, 1, 0, 1, 2, 0, 1, 1] },
  { id: 'metal-gallop', name: text('金属 Gallop', 'Metal Gallop'), family: 'Metal', subdivision: text('八分加双十六分', 'Eighth plus two sixteenths'), bpm: 150, meter: '4/4', description: text('每拍长、短、短，适合闷音轮拨', 'Long-short-short groups for palm-muted picking'), pattern: [2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1, 2, 0, 1, 1] },
  { id: 'reverse-gallop', name: text('反向 Gallop', 'Reverse Gallop'), family: 'Metal', subdivision: text('双十六分加八分', 'Two sixteenths plus an eighth'), bpm: 136, meter: '4/4', description: text('每拍短、短、长，练习反向推进', 'Short-short-long groups for reverse drive'), pattern: [2, 1, 1, 0, 2, 1, 1, 0, 2, 1, 1, 0, 2, 1, 1, 0] },
  { id: 'swing', name: text('爵士 Swing', 'Jazz Swing'), family: 'Jazz', subdivision: text('八分三连音摇摆', 'Triplet eighth-note swing'), bpm: 132, meter: '4/4', description: text('每拍三格，第一与第三格形成摇摆', 'The first and third triplet slots create the swing'), pattern: [2, 0, 1, 1, 0, 1, 2, 0, 1, 1, 0, 1] },
  { id: 'shuffle', name: text('布鲁斯 Shuffle', 'Blues Shuffle'), family: 'Blues', subdivision: text('十二八拍 Shuffle', '12/8 shuffle'), bpm: 92, meter: '12/8', description: text('四组三连拍，形成拖拍律动', 'Four triplet groups create a laid-back pulse'), pattern: [2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1] },
  { id: 'slip-jig', name: text('Slip Jig', 'Slip Jig'), family: 'Celtic', subdivision: text('九八拍长短三连', '9/8 long-short groups'), bpm: 108, meter: '9/8', description: text('每组三格走长、短，形成三组摇曳推进', 'Three quarter-eighth groups create a rolling motion'), pattern: [2, 0, 1, 1, 0, 1, 1, 0, 1] },
  { id: 'bossa', name: text('Bossa Nova', 'Bossa Nova'), family: 'Latin', subdivision: text('十六分音符切分', 'Sixteenth-note syncopation'), bpm: 126, meter: '4/4', description: text('重音跨过正拍，形成轻盈推进', 'Accents cross the beat for a light forward motion'), pattern: [2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0, 0, 1, 0, 0] },
  { id: 'reggae', name: text('雷鬼反拍', 'Reggae Offbeat'), family: 'Reggae', subdivision: text('八分音符反拍', 'Eighth-note offbeats'), bpm: 78, meter: '4/4', description: text('正拍留空，只在拍后半格落点', 'Leave the downbeats silent and hit each offbeat'), pattern: [0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0] },
  { id: 'waltz', name: text('华尔兹', 'Waltz'), family: 'Classical', subdivision: text('三拍八分脉冲', 'Three-beat eighth-note pulse'), bpm: 88, meter: '3/4', description: text('第一拍强，第二和第三拍弱', 'Strong first beat followed by two light beats'), pattern: [2, 0, 1, 0, 1, 0] },
  { id: 'samba', name: text('Samba', 'Samba'), family: 'Latin', subdivision: text('十六分音符切分', 'Sixteenth-note syncopation'), bpm: 108, meter: '2/4', description: text('两拍内连续错位，适合舞曲练习', 'Continuous displacement across a two-beat bar'), pattern: [2, 0, 1, 1, 0, 1, 1, 0] },
  { id: 'edm', name: text('四拍重音', 'Four-on-the-floor'), family: 'EDM', subdivision: text('四分音符脉冲', 'Quarter-note pulse'), bpm: 128, meter: '4/4', description: text('每一拍都落重音，保持稳定推进', 'Accents on every beat keep the pulse driving'), pattern: [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0] },
  { id: 'hiphop', name: text('Hip-Hop', 'Hip-Hop'), family: 'Urban', subdivision: text('十六分半拍律动', 'Sixteenth-note half-time groove'), bpm: 86, meter: '4/4', description: text('稀疏正拍配合松弛的切分落点', 'Sparse downbeats with relaxed syncopation'), pattern: [2, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 2, 0, 1, 0] },
  { id: 'clave', name: text('3–2 Clave', '3–2 Clave'), family: 'Afro-Cuban', subdivision: text('十六分 3–2 骨架', 'Sixteenth-note 3–2 cell'), bpm: 112, meter: '4/4', description: text('前半三次、后半两次的拉丁骨架', 'Three hits in the first half and two in the second'), pattern: [2, 0, 0, 1, 0, 0, 1, 0, 0, 0, 2, 0, 1, 0, 0, 0] },
];

const TEMPO_NAMES = [
  { max: 59, label: text('Largo · 广板', 'Largo · Very slow') }, { max: 75, label: text('Adagio · 柔板', 'Adagio · Slow') },
  { max: 107, label: text('Andante · 行板', 'Andante · Walking pace') }, { max: 119, label: text('Moderato · 中板', 'Moderato · Moderate') },
  { max: 167, label: text('Allegro · 快板', 'Allegro · Fast') }, { max: 199, label: text('Presto · 急板', 'Presto · Very fast') },
  { max: 240, label: text('Prestissimo · 最急板', 'Prestissimo · Extremely fast') },
];
const SOUND_KEYS: readonly SoundKey[] = ['wood', 'studio', 'digital'];
const TAP_TIMEOUT_MS = 2_200;
const TAP_SAMPLE_LIMIT = 6;
const SCHEDULE_LOOKAHEAD_SECONDS = 0.12;
const SCHEDULE_LATE_THRESHOLD_SECONDS = 0.1;
const SCHEDULE_START_DELAY_SECONDS = 0.05;
const MINIMUM_BPM = 30;
const MAXIMUM_BPM = 240;
const COPY = {
  zh: {
    skip: '跳到主要练习区', home: 'PulseCraft 首页', subtitle: '节拍练习工作台', nav: '主要功能', metronome: '节拍器', grooves: '经典节奏', shortcut: '播放 / 暂停', switchLanguage: 'Switch to English', switchTheme: '切换到日间主题', lightTheme: '日间', darkTheme: '夜间', engine: '节拍引擎', preciseMetronome: '精准节拍器', playingMuted: '正在播放 · 静音', playing: '正在播放', ready: '已就绪', beatsPerMinute: '每分钟节拍', bar: '每小节', current: '第', directBpm: '直接输入每分钟节拍数', bpmHelp: '可输入 30 到 240 的整数。上下方向键调整一拍，Page Up 和 Page Down 调整十拍。', decreaseTempo: '速度减一', increaseTempo: '速度加一', pause: '暂停', startPractice: '开始练习', meterGrouping: '拍号与分组', sound: '音色', wood: '木鱼 · 温暖', studio: '录音室 · 清晰', digital: '电子 · 明亮', volume: '音量', muted: '静音', tapTempo: '点击测速', tapAlong: '跟着拍点按', tapAgain: '再点一次', times: '次', library: '节奏资料库', chooseFromScore: '读谱选择节奏', notationHelp: '音符和休止符就是实际落点，音符上方的 > 表示重音', kinds: '种', editor: '节奏编辑', accentEditor: '轻重拍编辑器', editorHelp: '点击循环切换关闭、普通、强拍；下方用练习口令标记分拍', off: '关闭', normal: '普通', accent: '强拍', reset: '重置', mobileNav: '移动端功能栏', beat: '节拍', rhythm: '节奏', startMetronome: '开始节拍器', pauseMetronome: '暂停节拍器', pauseMutedMetronome: '暂停已静音的节拍器', bpmError: 'BPM 必须是 30 到 240 的整数。', unsupportedAudio: '当前浏览器不支持 Web Audio，请使用最新版 Chrome、Edge 或 Safari。', audioFailure: '启动音频失败，请检查浏览器的声音权限。', invalidMeter: '无法识别拍号', invalidSound: '无法识别节拍器音色', volumeError: '音量必须在 0 到 100 之间', step: '步', groupPosition: '格', countCue: '口令', presetSelected: '选择节奏', theme: '主题', language: '语言',
  },
  en: {
    skip: 'Skip to practice area', home: 'PulseCraft home', subtitle: 'Rhythm practice workbench', nav: 'Primary navigation', metronome: 'Metronome', grooves: 'Classic rhythms', shortcut: 'Play / pause', switchLanguage: '切换到中文', switchTheme: 'Switch to dark theme', lightTheme: 'Light', darkTheme: 'Dark', engine: 'TEMPO ENGINE', preciseMetronome: 'Precision Metronome', playingMuted: 'Playing · Muted', playing: 'Playing', ready: 'Ready', beatsPerMinute: 'BEATS PER MINUTE', bar: 'Per bar', current: 'Current', directBpm: 'Enter beats per minute', bpmHelp: 'Enter an integer from 30 to 240. Arrow keys adjust by one; Page Up and Page Down adjust by ten.', decreaseTempo: 'Decrease tempo by one', increaseTempo: 'Increase tempo by one', pause: 'Pause', startPractice: 'Start practice', meterGrouping: 'Meter & grouping', sound: 'Sound', wood: 'Woodblock · Warm', studio: 'Studio · Clear', digital: 'Digital · Bright', volume: 'Volume', muted: 'Muted', tapTempo: 'Tap tempo', tapAlong: 'Tap with the beat', tapAgain: 'Tap again', times: 'taps', library: 'RHYTHM LIBRARY', chooseFromScore: 'Choose by notation', notationHelp: 'Notes and rests show the actual hits; > marks an accent', kinds: 'patterns', editor: 'RHYTHM EDITOR', accentEditor: 'Accent editor', editorHelp: 'Click to cycle off, normal, and accent; count syllables mark each subdivision', off: 'Off', normal: 'Normal', accent: 'Accent', reset: 'Reset', mobileNav: 'Mobile navigation', beat: 'Beat', rhythm: 'Rhythms', startMetronome: 'Start metronome', pauseMetronome: 'Pause metronome', pauseMutedMetronome: 'Pause muted metronome', bpmError: 'BPM must be an integer from 30 to 240.', unsupportedAudio: 'This browser does not support Web Audio. Use the latest Chrome, Edge, or Safari.', audioFailure: 'Could not start audio. Check the browser sound permissions.', invalidMeter: 'Unrecognized meter', invalidSound: 'Unrecognized metronome sound', volumeError: 'Volume must be between 0 and 100', step: 'step', groupPosition: 'position', countCue: 'count', presetSelected: 'Choose rhythm', theme: 'Theme', language: 'Language',
  },
} as const;

const clampBpm = (value: number): number => Math.min(MAXIMUM_BPM, Math.max(MINIMUM_BPM, Math.round(value)));
const tempoName = (bpm: number, locale: Locale): string => localize(TEMPO_NAMES.find((tempo) => bpm <= tempo.max)?.label ?? TEMPO_NAMES[TEMPO_NAMES.length - 1].label, locale);
const cycleStrength = (value: StepStrength): StepStrength => ((value + 1) % 3) as StepStrength;
const updatePatternStep = (pattern: StepStrength[], index: number): StepStrength[] => pattern.map((step, stepIndex) => stepIndex === index ? cycleStrength(step) : step);
const getSliderValue = (value: number | readonly number[]): number => typeof value === 'number' ? value : (value[0] ?? 100);
const isMeterKey = (value: string | null): value is MeterKey => value !== null && Object.hasOwn(METERS, value);
const isSoundKey = (value: string | null): value is SoundKey => value !== null && SOUND_KEYS.some((soundKey) => soundKey === value);
const ownsSpaceKey = (target: EventTarget | null): boolean => target instanceof Element && target.closest('button, a, input, select, textarea, [contenteditable="true"], [role="slider"], [role="combobox"]') !== null;
const patternsEqual = (left: readonly StepStrength[], right: readonly StepStrength[]): boolean => left.length === right.length && left.every((step, index) => step === right[index]);

const playClick = (context: AudioContext, destination: GainNode, at: number, strength: StepStrength, sound: SoundKey): OscillatorNode => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies: Record<SoundKey, [number, number]> = { wood: [920, 1350], studio: [740, 1120], digital: [1260, 1760] };
  const [normalFrequency, accentFrequency] = frequencies[sound];
  oscillator.type = sound === 'wood' ? 'sine' : sound === 'studio' ? 'triangle' : 'square';
  oscillator.frequency.setValueAtTime(strength === 2 ? accentFrequency : normalFrequency, at);
  gain.gain.setValueAtTime(strength === 2 ? 0.85 : 0.45, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + (sound === 'wood' ? 0.055 : 0.035));
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(at);
  oscillator.stop(at + 0.07);
  return oscillator;
};

export default function Home() {
  const [locale, setLocale] = useState<Locale>('zh');
  const [theme, setTheme] = useState<Theme>('dark');
  const [bpm, setBpm] = useState<number>(104);
  const [bpmDraft, setBpmDraft] = useState<string>('104');
  const [meterKey, setMeterKey] = useState<MeterKey>('4/4');
  const [sound, setSound] = useState<SoundKey>('wood');
  const [volume, setVolume] = useState<number>(72);
  const [pattern, setPattern] = useState<StepStrength[]>(PRESETS[1].pattern);
  const [patternBaseline, setPatternBaseline] = useState<StepStrength[]>(() => [...PRESETS[1].pattern]);
  const [patternBaselinePresetId, setPatternBaselinePresetId] = useState<string>('pop');
  const [activePresetId, setActivePresetId] = useState<string>('pop');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [audiblePulse, setAudiblePulse] = useState<number>(0);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [metronomeError, setMetronomeError] = useState<MetronomeError | null>(null);
  const copy = COPY[locale];

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextStepRef = useRef<number>(0);
  const nextNoteTimeRef = useRef<number>(0);
  const patternRef = useRef<StepStrength[]>(pattern);
  const bpmRef = useRef<number>(bpm);
  const meterRef = useRef<Meter>(METERS[meterKey]);
  const soundRef = useRef<SoundKey>(sound);
  const volumeRef = useRef<number>(volume);
  const playbackGenerationRef = useRef<number>(0);
  const scheduledClicksRef = useRef<Set<OscillatorNode>>(new Set());
  const playbackRequestedRef = useRef<boolean>(false);
  const playbackRequestVersionRef = useRef<number>(0);
  const isPatternEdited = !patternsEqual(pattern, patternBaseline);
  const stepCounts = createStepCounts(meterKey, pattern.length);
  const totalCountGroups = stepCounts[stepCounts.length - 1]?.group ?? 0;
  const activeCountGroup = activeStep >= 0 ? stepCounts[activeStep]?.group ?? null : null;
  const countUnit = localize(METERS[meterKey].countUnit, locale);
  const bpmHasError = metronomeError?.kind === 'bpm';

  useEffect(() => { patternRef.current = pattern; }, [pattern]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { meterRef.current = METERS[meterKey]; }, [meterKey]);
  useEffect(() => { soundRef.current = sound; }, [sound]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => {
    if (tapTimes.length === 0) return;
    const timeout = window.setTimeout(() => setTapTimes([]), TAP_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [tapTimes]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.lang = locale === 'zh' ? 'zh-CN' : 'en';
    root.style.colorScheme = theme;
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((themeColor) => {
      themeColor.content = theme === 'dark' ? '#0b1018' : '#f4f1e8';
    });
  }, [locale, theme]);

  const cancelScheduledClicks = useCallback((): void => {
    const context = audioContextRef.current;
    if (context) scheduledClicksRef.current.forEach((oscillator) => oscillator.stop(context.currentTime));
    scheduledClicksRef.current.clear();
  }, []);

  const stop = useCallback((): void => {
    playbackRequestedRef.current = false;
    playbackRequestVersionRef.current += 1;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    cancelScheduledClicks();
    playbackGenerationRef.current += 1;
    setIsPlaying(false);
    setActiveStep(-1);
    setAudiblePulse(0);
  }, [cancelScheduledClicks]);

  const schedule = useCallback((): void => {
    const context = audioContextRef.current;
    const destination = masterGainRef.current;
    if (!context || !destination) throw new Error('音频引擎尚未初始化，请重新点击播放。');
    const recovery = recoverLateSchedule(nextNoteTimeRef.current, context.currentTime, SCHEDULE_LATE_THRESHOLD_SECONDS, SCHEDULE_START_DELAY_SECONDS);
    if (recovery.didRecover) {
      nextNoteTimeRef.current = recovery.nextNoteTime;
      nextStepRef.current = 0;
      scheduledClicksRef.current.clear();
      playbackGenerationRef.current += 1;
      setActiveStep(-1);
      setAudiblePulse(0);
    }
    while (nextNoteTimeRef.current < context.currentTime + SCHEDULE_LOOKAHEAD_SECONDS) {
      const currentPattern = patternRef.current;
      const stepIndex = nextStepRef.current;
      const strength = currentPattern[stepIndex] ?? 0;
      const scheduledAt = nextNoteTimeRef.current;
      if (strength > 0) {
        const oscillator = playClick(context, destination, scheduledAt, strength, soundRef.current);
        scheduledClicksRef.current.add(oscillator);
        oscillator.onended = () => scheduledClicksRef.current.delete(oscillator);
      }
      const visualDelay = Math.max(0, (scheduledAt - context.currentTime) * 1000);
      const playbackGeneration = playbackGenerationRef.current;
      setTimeout(() => {
        if (playbackGenerationRef.current !== playbackGeneration) return;
        setActiveStep(stepIndex);
        if (isAudibleStep(strength, volumeRef.current)) setAudiblePulse((pulse) => pulse + 1);
      }, visualDelay);
      const meter = meterRef.current;
      nextNoteTimeRef.current += stepDurationSeconds(bpmRef.current, meter.tempoBeatsPerBar, currentPattern.length);
      nextStepRef.current = (stepIndex + 1) % currentPattern.length;
    }
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (playbackRequestedRef.current) return;
    playbackRequestedRef.current = true;
    const requestVersion = playbackRequestVersionRef.current + 1;
    playbackRequestVersionRef.current = requestVersion;
    try {
      if (!window.AudioContext) throw new Error(copy.unsupportedAudio);
      const context = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      if (playbackRequestVersionRef.current !== requestVersion) return;
      const destination = masterGainRef.current ?? context.createGain();
      destination.gain.setValueAtTime(volume / 100, context.currentTime);
      if (!masterGainRef.current) destination.connect(context.destination);
      masterGainRef.current = destination;
      nextStepRef.current = 0;
      nextNoteTimeRef.current = context.currentTime + SCHEDULE_START_DELAY_SECONDS;
      setMetronomeError(null);
      setIsPlaying(true);
      schedule();
      timerRef.current = setInterval(schedule, 25);
    } catch (error) {
      if (playbackRequestVersionRef.current !== requestVersion) return;
      stop();
      setMetronomeError({ kind: 'audio', message: error instanceof Error ? error.message : copy.audioFailure });
    }
  }, [copy.audioFailure, copy.unsupportedAudio, schedule, stop, volume]);

  const togglePlayback = useCallback((): void => { if (playbackRequestedRef.current) stop(); else void start(); }, [start, stop]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (ownsSpaceKey(event.target)) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback]);
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'hidden') return;
      playbackGenerationRef.current += 1;
      setActiveStep(-1);
      setAudiblePulse(0);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  useEffect(() => () => {
    stop();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    masterGainRef.current = null;
    if (context) void context.close();
  }, [stop]);

  const restartPatternPosition = (): void => {
    cancelScheduledClicks();
    playbackGenerationRef.current += 1;
    nextStepRef.current = 0;
    const context = audioContextRef.current;
    if (isPlaying && context) nextNoteTimeRef.current = context.currentTime + SCHEDULE_START_DELAY_SECONDS;
    setActiveStep(-1);
    setAudiblePulse(0);
  };
  const applyBpm = (value: number): void => {
    const nextBpm = clampBpm(value);
    bpmRef.current = nextBpm;
    setBpm(nextBpm);
    setBpmDraft(String(nextBpm));
    setTapTimes([]);
    setMetronomeError((error) => error?.kind === 'bpm' ? null : error);
  };
  const applyVolume = (value: number): void => {
    const nextVolume = Math.round(value);
    if (nextVolume < 0 || nextVolume > 100) throw new RangeError(`${copy.volumeError}: ${nextVolume}.`);
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
    const context = audioContextRef.current;
    const gain = masterGainRef.current;
    if (context && gain) gain.gain.setValueAtTime(nextVolume / 100, context.currentTime);
  };
  const commitBpmDraft = (): void => {
    try {
      applyBpm(parseBpmDraft(bpmDraft, MINIMUM_BPM, MAXIMUM_BPM));
    } catch (error) {
      setBpmDraft(String(bpmRef.current));
      setMetronomeError({ kind: 'bpm', message: locale === 'zh' && error instanceof Error ? error.message : copy.bpmError });
    }
  };
  const handleBpmKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const keyboardAdjustments: Readonly<Record<string, number>> = { ArrowUp: 1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    const adjustment = keyboardAdjustments[event.key];
    if (adjustment !== undefined) {
      event.preventDefault();
      try {
        applyBpm(parseBpmDraft(bpmDraft, MINIMUM_BPM, MAXIMUM_BPM) + adjustment);
      } catch (error) {
        setBpmDraft(String(bpmRef.current));
        setMetronomeError({ kind: 'bpm', message: locale === 'zh' && error instanceof Error ? error.message : copy.bpmError });
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setBpmDraft(String(bpmRef.current));
      setMetronomeError((error) => error?.kind === 'bpm' ? null : error);
      event.currentTarget.select();
    }
  };
  const choosePreset = (preset: RhythmPreset): void => {
    const nextPattern = [...preset.pattern];
    meterRef.current = METERS[preset.meter];
    patternRef.current = nextPattern;
    restartPatternPosition();
    setPatternBaseline([...preset.pattern]);
    setPatternBaselinePresetId(preset.id);
    setActivePresetId(preset.id);
    applyBpm(preset.bpm);
    setMeterKey(preset.meter);
    setPattern(nextPattern);
    setMetronomeError(null);
  };
  const chooseMeter = (value: string | null): void => {
    if (!isMeterKey(value)) { setMetronomeError({ kind: 'control', message: `${copy.invalidMeter}: ${String(value)}` }); return; }
    const nextPattern = [...METERS[value].pattern];
    meterRef.current = METERS[value];
    patternRef.current = nextPattern;
    restartPatternPosition();
    setPatternBaseline([...METERS[value].pattern]);
    setPatternBaselinePresetId('');
    setMeterKey(value);
    setPattern(nextPattern);
    setActivePresetId('');
    setMetronomeError(null);
  };
  const chooseSound = (value: string | null): void => {
    if (!isSoundKey(value)) { setMetronomeError({ kind: 'control', message: `${copy.invalidSound}: ${String(value)}` }); return; }
    soundRef.current = value;
    restartPatternPosition();
    setSound(value);
    setMetronomeError(null);
  };
  const handleTap = (now: number): void => {
    const result = collectTapTempo(tapTimes, now, TAP_TIMEOUT_MS, TAP_SAMPLE_LIMIT);
    if (result.bpm !== null) applyBpm(result.bpm);
    setTapTimes([...result.tapTimes]);
  };
  const resetPattern = (): void => {
    const nextPattern = [...patternBaseline];
    patternRef.current = nextPattern;
    restartPatternPosition();
    setPattern(nextPattern);
    setActivePresetId(patternBaselinePresetId);
  };
  const editPatternStep = (index: number): void => {
    const nextPattern = updatePatternStep(patternRef.current, index);
    patternRef.current = nextPattern;
    restartPatternPosition();
    setPattern(nextPattern);
    setActivePresetId(patternsEqual(nextPattern, patternBaseline) ? patternBaselinePresetId : '');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="signal-field" aria-hidden="true" />
      <a className="skip-link" href="#main-content">{copy.skip}</a>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#metronome" className="brand-lockup" aria-label={copy.home}>
            <span className="brand-mark"><Gauge /></span>
            <span><strong>PulseCraft</strong><small>{copy.subtitle}</small></span>
          </a>
          <nav className="desktop-nav" aria-label={copy.nav}><a href="#metronome">{copy.metronome}</a><a href="#grooves">{copy.grooves}</a></nav>
          <div className="header-actions">
            <div className="shortcut-hint"><kbd>Space</kbd><span>{copy.shortcut}</span></div>
            <button type="button" className="header-toggle" aria-label={copy.switchLanguage} title={copy.language} onClick={() => { setLocale((current) => current === 'zh' ? 'en' : 'zh'); setMetronomeError(null); }}><Languages /><span>{locale === 'zh' ? 'EN' : '中文'}</span></button>
            <button type="button" className="header-toggle" aria-label={copy.switchTheme} title={copy.theme} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun /> : <Moon />}<span>{theme === 'dark' ? copy.lightTheme : copy.darkTheme}</span></button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <div className="workbench-grid">
        <section id="metronome" className="rack-panel tempo-panel scroll-mt-20">
          <div className="section-head">
            <div><p className="eyebrow">{copy.engine}</p><h1>{copy.preciseMetronome}</h1></div>
            <output className={`status-pill ${isPlaying ? 'is-live' : ''}`} aria-live="polite"><span className="status-dot" />{isPlaying ? volume === 0 ? copy.playingMuted : copy.playing : copy.ready}</output>
          </div>

          <div className="tempo-console">
            <div className="tempo-stage">
              <div className="tempo-meta"><div><p className="eyebrow">{copy.beatsPerMinute}</p><p>{tempoName(bpm, locale)}</p></div><div className="tempo-meter-readout"><span>{meterKey}</span><small aria-hidden="true">{locale === 'zh' ? isPlaying && activeCountGroup !== null ? `第 ${activeCountGroup} / ${totalCountGroups} ${countUnit}` : `每小节 ${totalCountGroups} ${countUnit}` : isPlaying && activeCountGroup !== null ? `${countUnit} ${activeCountGroup} / ${totalCountGroups}` : `${totalCountGroups} ${countUnit}${totalCountGroups === 1 ? '' : 's'} per bar`}</small></div></div>
              <div className="tempo-orb">
                {isPlaying && audiblePulse > 0 ? <span key={audiblePulse} className="tempo-beat-pulse" aria-hidden="true" /> : null}
                <Input
                  aria-describedby="tempo-range-help"
                  aria-errormessage={bpmHasError ? 'metronome-error' : undefined}
                  aria-invalid={bpmHasError}
                  aria-label={copy.directBpm}
                  className="tempo-value tempo-input tabular-nums"
                  inputMode="numeric"
                  maxLength={3}
                  onBlur={commitBpmDraft}
                  onChange={(event) => setBpmDraft(event.currentTarget.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={handleBpmKeyDown}
                  pattern="[0-9]*"
                  type="text"
                  value={bpmDraft}
                />
                <div className="tempo-unit"><span aria-hidden="true">{METERS[meterKey].tempoMark}</span><span className="sr-only">{localize(METERS[meterKey].tempoUnitName, locale)}</span> / MIN</div>
              </div>
              <div className="tempo-range">
                <Slider aria-label={copy.beatsPerMinute} min={MINIMUM_BPM} max={MAXIMUM_BPM} step={1} value={bpm} onValueChange={(value) => applyBpm(getSliderValue(value))} className="tempo-slider" />
                <div id="tempo-range-help"><span className="sr-only">{copy.bpmHelp}</span><span>{MINIMUM_BPM}</span><span>135</span><span>{MAXIMUM_BPM}</span></div>
              </div>
              <div className="transport-row">
                <Button aria-label={copy.decreaseTempo} variant="outline" size="icon-lg" onClick={() => applyBpm(bpmRef.current - 1)}><Minus /></Button>
                <Button aria-pressed={isPlaying} className="primary-transport" onClick={togglePlayback}>{isPlaying ? <Pause /> : <Play className="fill-current" />}{isPlaying ? copy.pause : copy.startPractice}</Button>
                <Button aria-label={copy.increaseTempo} variant="outline" size="icon-lg" onClick={() => applyBpm(bpmRef.current + 1)}><Plus /></Button>
              </div>
              {metronomeError ? <p id="metronome-error" role="alert" className="error-message">{metronomeError.message}</p> : null}
            </div>

            <div className="control-bank">
              <div className="control-cell"><div id="meter-select-label" className="control-label"><Music2 />{copy.meterGrouping}</div><Select value={meterKey} onValueChange={chooseMeter}><SelectTrigger aria-labelledby="meter-select-label" className="console-select"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(METERS) as MeterKey[]).map((meter) => <SelectItem key={meter} value={meter}>{meter} · {localize(METERS[meter].name, locale)} · {METERS[meter].tempoMark}</SelectItem>)}</SelectContent></Select></div>
              <div className="control-cell"><div id="sound-select-label" className="control-label"><Drum />{copy.sound}</div><Select value={sound} onValueChange={chooseSound}><SelectTrigger aria-labelledby="sound-select-label" className="console-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="wood">{copy.wood}</SelectItem><SelectItem value="studio">{copy.studio}</SelectItem><SelectItem value="digital">{copy.digital}</SelectItem></SelectContent></Select></div>
              <div className="control-cell volume-cell"><div className="control-label">{volume === 0 ? <VolumeX /> : <Volume2 />}{copy.volume} <span>{volume === 0 ? copy.muted : `${volume}%`}</span></div><Slider aria-label={copy.volume} aria-valuetext={volume === 0 ? copy.muted : `${volume}%`} min={0} max={100} step={1} value={volume} onValueChange={(value) => applyVolume(getSliderValue(value))} /></div>
              <div className="tap-cell"><Button variant="secondary" onClick={(event) => handleTap(event.timeStamp)}><Clock3 />{copy.tapTempo}<output aria-live="polite">{tapTimes.length === 0 ? copy.tapAlong : tapTimes.length === 1 ? copy.tapAgain : `${tapTimes.length} ${copy.times} · ${bpm} BPM`}</output></Button></div>
            </div>
          </div>
        </section>

        <aside id="grooves" className="rack-panel groove-panel scroll-mt-20">
          <div className="section-head compact"><div><p className="eyebrow">{copy.library}</p><h2>{copy.chooseFromScore}</h2><p className="section-copy">{copy.notationHelp}</p></div><span className="section-count">{PRESETS.length} {copy.kinds}</span></div>
          <div className="preset-list">
            {PRESETS.map((preset) => (
              <button key={preset.id} type="button" aria-label={`${localize(preset.name, locale)}, ${preset.meter}, ${localize(preset.subdivision, locale)}. ${localize(preset.description, locale)}`} aria-pressed={activePresetId === preset.id} onClick={() => choosePreset(preset)} className={`preset-row ${activePresetId === preset.id ? 'is-selected' : ''}`}>
                <span className="preset-score"><RhythmNotation activeStep={activePresetId === preset.id && isPlaying ? activeStep : null} meter={preset.meter} pattern={preset.pattern} /></span>
                <span className="preset-info">
                  <span className="preset-copy"><span><strong>{localize(preset.name, locale)}</strong><small>{preset.family}</small></span><span className="preset-subdivision">{localize(preset.subdivision, locale)}</span><span className="preset-description">{localize(preset.description, locale)}</span></span>
                  <span className="preset-tempo tabular-nums"><strong>{preset.bpm}</strong><small>BPM · {preset.meter}</small></span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section id="steps" className="rack-panel step-panel scroll-mt-20">
          <div className="section-head compact">
            <div><p className="eyebrow">{copy.editor}</p><h2>{copy.accentEditor}</h2><p className="section-copy">{copy.editorHelp}</p></div>
            <div className="step-actions"><div className="legend-row"><span className="legend"><i className="off" />{copy.off}</span><span className="legend"><i className="normal" />{copy.normal}</span><span className="legend"><i className="accent" />{copy.accent}</span></div><Button variant="outline" disabled={!isPatternEdited} onClick={resetPattern}><RotateCcw />{copy.reset}</Button></div>
          </div>
          <div className="step-grid" style={{ '--step-count': pattern.length } as React.CSSProperties}>
            {pattern.map((strength, index) => {
              const count = stepCounts[index];
              const spokenCountLabel = count.label === '&' ? 'and' : count.label;
              return <button key={`${pattern.length}-${index}`} type="button" aria-label={locale === 'zh' ? `第 ${index + 1} ${copy.step}，第 ${count.group} ${countUnit}第 ${count.position + 1} ${copy.groupPosition}，${copy.countCue} ${spokenCountLabel}，${strength === 2 ? copy.accent : strength === 1 ? copy.normal : copy.off}` : `${copy.step} ${index + 1}, ${countUnit} ${count.group}, ${copy.groupPosition} ${count.position + 1}, ${copy.countCue} ${spokenCountLabel}, ${strength === 2 ? copy.accent : strength === 1 ? copy.normal : copy.off}`} aria-pressed={strength > 0} onClick={() => editPatternStep(index)} className={`step-button strength-${strength} ${count.isGroupStart ? 'is-group-start' : ''} ${activeStep === index && isPlaying ? 'is-current' : ''}`}><span className="step-bar" /><small>{count.label}</small></button>;
            })}
          </div>
        </section>
        </div>
      </main>

      <nav className="mobile-dock" aria-label={copy.mobileNav}>
        <a href="#metronome"><Gauge /><span>{copy.beat}</span></a>
        <button type="button" className="mobile-play" onClick={togglePlayback} aria-label={isPlaying ? volume === 0 ? copy.pauseMutedMetronome : copy.pauseMetronome : copy.startMetronome} aria-pressed={isPlaying}>
          {isPlaying ? <Pause /> : <Play className="fill-current" />}
          <span>{isPlaying ? copy.pause : copy.beat}</span>
        </button>
        <a href="#grooves"><ListMusic /><span>{copy.rhythm}</span></a>
      </nav>
    </div>
  );
}
