import { Show } from 'solid-js';

export interface Change {
  /** Short outcome headline, e.g. "Replacement Pod p4 created". */
  title: string;
  /** What changed in observable state. */
  changed: string;
  /** Kubernetes actor (component, controller or person) that caused it. */
  actor: string;
  /** Why the actor acted: the rule or mismatch that drove the change. */
  reason: string;
  /** The boundary the learner must not over-claim yet. */
  notYet?: string;
}

/** The one-interaction acceptance surface: what changed, who, why, what has not happened. */
export default function ChangeReport(props: { change: Change; busy?: boolean }) {
  return (
    <section class="anatomy-change" role="status" aria-live="polite" aria-atomic="true" aria-busy={props.busy ? 'true' : 'false'}>
      <strong class="anatomy-change-title">{props.change.title}</strong>
      <dl>
        <div><dt>Changed</dt><dd>{props.change.changed}</dd></div>
        <div><dt>Who</dt><dd>{props.change.actor}</dd></div>
        <div><dt>Why</dt><dd>{props.change.reason}</dd></div>
        <Show when={props.change.notYet}><div><dt>Not yet</dt><dd>{props.change.notYet}</dd></div></Show>
      </dl>
    </section>
  );
}
