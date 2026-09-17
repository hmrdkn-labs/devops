import { For, Show } from 'solid-js';

export interface MentalModelLink {
  slug: string;
  title: string;
  summary: string;
}

/** Optional depth: opening a model preserves the current study draft and step. */
export default function MentalModelLinks(props: { models?: MentalModelLink[] }) {
  return <Show when={props.models?.length}>
    <details class="feedback-depth" data-testid="mental-model-links">
      <summary>Interactive mental models ({props.models?.length})</summary>
      <p>Predict which component acts, follow the state change, and inspect the evidence. Opens in a new tab so your current work stays here.</p>
      <ul>
        <For each={props.models}>{(model) => <li>
          <a href={`/models/${model.slug}/`} target="_blank" rel="noopener">{model.title} ↗</a>
          <p>{model.summary}</p>
        </li>}</For>
      </ul>
    </details>
  </Show>;
}
