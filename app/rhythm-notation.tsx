import { createRhythmEvents, parseMeter, type RhythmEvent, type RhythmStepStrength } from './rhythm-notation-core';

type RhythmNotationProps = {
  activeStep: number | null;
  meter: string;
  pattern: readonly RhythmStepStrength[];
};

const renderRest = (event: RhythmEvent, x: number): React.ReactNode => {
  const restShape = event.flagCount === 0
    ? <path className="score-rest" d={`M ${x - 3} 22 l 7 6 -6 6 6 5 -5 8`} />
    : <>
      <circle className="score-rest-head" cx={x + 2} cy={event.flagCount === 1 ? 26 : 23} r="2.4" />
      <path className="score-rest" d={event.flagCount === 1 ? `M ${x + 3} 27 q -1 8 -8 15` : `M ${x + 3} 24 q -1 10 -8 19`} />
      {event.flagCount >= 2 ? <><circle className="score-rest-head" cx={x} cy="30" r="2.4" /><path className="score-rest" d={`M ${x + 1} 31 q -1 6 -6 11`} /></> : null}
    </>;
  return <g key={`rest-${event.index}`}>
    {restShape}
    {event.dotted ? <circle className="score-dot" cx={x + 8} cy="34" r="1.5" /> : null}
  </g>;
};

const renderNote = (event: RhythmEvent, x: number, activeStep: number | null): React.ReactNode => (
  <g key={`note-${event.index}`}>
    {event.strength === 2 ? <path className="score-accent" d={`M ${x - 6} 8 L ${x + 6} 12 L ${x - 6} 16`} /> : null}
    <ellipse className={`score-notehead ${event.strength === 2 ? 'is-accent' : ''} ${activeStep === event.index ? 'is-current' : ''}`} cx={x} cy="39" rx="4.6" ry="3.3" transform={`rotate(-18 ${x} 39)`} />
    <line className="score-stem" x1={x + 4} y1="38" x2={x + 4} y2="17" />
    {event.flagCount >= 1 ? <path className="score-flag" d={`M ${x + 4} 17 q 9 4 4 12`} /> : null}
    {event.flagCount >= 2 ? <path className="score-flag" d={`M ${x + 4} 23 q 9 4 4 12`} /> : null}
    {event.dotted ? <circle className="score-dot" cx={x + 8} cy="38" r="1.5" /> : null}
  </g>
);

export function RhythmNotation({ activeStep, meter, pattern }: RhythmNotationProps) {
  const meterParts = parseMeter(meter);
  const events = createRhythmEvents(pattern, meter);
  const isTriplet = pattern.length / meterParts.beats === 3 && meterParts.beatUnit === 4;
  const startX = 46;
  const endX = 282;
  const stepWidth = pattern.length === 1 ? 0 : (endX - startX) / (pattern.length - 1);

  return (
    <svg className="rhythm-notation" viewBox="0 0 300 64" aria-hidden="true" focusable="false">
      {[20, 26, 32, 38, 44].map((y) => <line key={y} className="score-staff" x1="4" y1={y} x2="296" y2={y} />)}
      <text className="score-meter" x="12" y="31">{meterParts.beats}</text>
      <text className="score-meter" x="12" y="45">{meterParts.beatUnit}</text>
      {isTriplet ? Array.from({ length: meterParts.beats }, (_, groupIndex) => {
        const firstIndex = groupIndex * 3;
        const lastIndex = firstIndex + 2;
        const left = startX + firstIndex * stepWidth - 5;
        const right = startX + lastIndex * stepWidth + 5;
        return <g key={`triplet-${groupIndex}`}><path className="score-triplet" d={`M ${left} 11 v -3 H ${right} v 3`} /><text className="score-triplet-number" x={(left + right) / 2} y="8">3</text></g>;
      }) : null}
      {events.map((event) => {
        const x = startX + event.index * stepWidth;
        return event.type === 'rest' ? renderRest(event, x) : renderNote(event, x, activeStep);
      })}
      <line className="score-barline" x1="294" y1="19" x2="294" y2="45" />
    </svg>
  );
}
