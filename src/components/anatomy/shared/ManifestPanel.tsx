import { For } from 'solid-js';

export interface ManifestLine {
  text: string;
  /** Marks a field the current interaction reads or changed. */
  highlight?: boolean;
}

/** YAML that the figure's state renders; highlighted lines are what the last interaction depends on. */
export default function ManifestPanel(props: { title: string; lines: ManifestLine[]; note?: string }) {
  return (
    <figure class="anatomy-manifest">
      <figcaption>{props.title}</figcaption>
      <pre tabindex="0" role="region" aria-label={props.title}><code class="language-yaml"><For each={props.lines}>{(line) =>
        line.highlight ? <mark>{line.text + '\n'}</mark> : <>{line.text + '\n'}</>
      }</For></code></pre>
      {props.note && <p class="anatomy-manifest-note">{props.note}</p>}
    </figure>
  );
}
