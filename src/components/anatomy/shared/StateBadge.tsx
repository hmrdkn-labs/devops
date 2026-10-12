export type BadgeTone = 'pass' | 'wait' | 'fail' | 'info' | 'selected';

const symbols: Record<BadgeTone, string> = { pass: '✓', wait: '…', fail: '✕', info: '•', selected: '◆' };

/** Text plus symbol; never colour alone. */
export default function StateBadge(props: { tone: BadgeTone; label: string }) {
  return <span class="anatomy-badge" data-tone={props.tone}><span aria-hidden="true">{symbols[props.tone]}</span>{props.label}</span>;
}
