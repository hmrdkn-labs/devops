import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import type { SchedulingNode, SchedulingPod, SchedulingPrototype as SchedulingPrototypeContent } from '@/lib/content/mental-model-schema';
import { evaluateNode } from '@/lib/learning/scheduling-prototype';
import { focusTask } from '@/lib/task-focus';
import './scheduling-prototype.css';

type Choice = SchedulingPrototypeContent['base']['choices'][number];

function entries(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => `${key}=${value}`).join(', ');
}

function PodSummary(props: { pod: SchedulingPod }) {
  const tolerations = () => props.pod.tolerations.map((item) => `${item.key}=${item.value}:${item.effect}`).join(', ');
  return <p class="scheduling-pod">
    <strong>{props.pod.name}</strong> requests {props.pod.cpu_m}m CPU and {props.pod.memory_mi}Mi memory
    {' · '}requires {entries(props.pod.required_labels) || 'no labels'}
    {' · '}prefers {entries(props.pod.preferred_labels) || 'no labels'}
    {' · '}{props.pod.tolerations.length ? `tolerates ${tolerations()}` : 'no tolerations'}
  </p>;
}

function NodeCards(props: { nodes: SchedulingNode[]; pod: SchedulingPod; revealed: boolean }) {
  return <div class="scheduling-nodes" aria-label="Candidate nodes">
    <For each={props.nodes}>{(node) => {
      const result = createMemo(() => evaluateNode(props.pod, node));
      return <article class="scheduling-node" classList={{ eligible: props.revealed && result().eligible, blocked: props.revealed && !result().eligible }}>
        <div class="scheduling-node-heading"><h3>{node.name}</h3><Show when={props.revealed}><strong>{result().eligible ? 'Eligible' : 'Filtered out'}</strong></Show></div>
        <dl>
          <div><dt>Available for requests</dt><dd>{node.cpu_available_m}m CPU · {node.memory_available_mi}Mi memory</dd></div>
          <div><dt>Labels</dt><dd>{Object.entries(node.labels).map(([key, value]) => `${key}=${value}`).join(' · ')}</dd></div>
          <div><dt>Taints</dt><dd>{node.taints.length ? node.taints.map((item) => `${item.key}=${item.value}:${item.effect}`).join(' · ') : 'None'}</dd></div>
        </dl>
        <Show when={props.revealed}>
          <Show when={result().reasons.length} fallback={<p class="scheduling-node-result">Passes every stated hard filter{result().preferred ? ' · matches the preference' : ''}.</p>}>
            <ul class="scheduling-node-result"><For each={result().reasons}>{(reason) => <li>{reason}</li>}</For></ul>
          </Show>
        </Show>
      </article>;
    }}</For>
  </div>;
}

function Prediction(props: {
  prompt: string;
  choices: Choice[];
  answerId: string;
  explanation: string;
  choice: string;
  revealed: boolean;
  disabled: boolean;
  group: string;
  onChoice: (id: string) => void;
  onReveal: () => void;
}) {
  const selected = createMemo(() => props.choices.find((choice) => choice.id === props.choice));
  const correct = createMemo(() => props.choice === props.answerId);
  let feedback: HTMLDivElement | undefined;
  function reveal() {
    props.onReveal();
    focusTask(() => feedback);
  }
  return <div class="scheduling-prediction">
    <h2>{props.prompt}</h2>
    <fieldset disabled={props.disabled || props.revealed}>
      <legend class="sr-only">Choose one prediction</legend>
      <For each={props.choices}>{(choice) => <label class="scheduling-choice" classList={{ chosen: props.choice === choice.id }} data-state={props.revealed ? choice.id === props.answerId ? 'correct' : choice.id === props.choice ? 'incorrect' : 'idle' : 'idle'}>
        <input type="radio" name={props.group} value={choice.id} checked={props.choice === choice.id} onChange={() => props.onChoice(choice.id)} />
        <span>{choice.text}</span>
        <Show when={props.revealed && choice.id === props.answerId}><small>Correct answer</small></Show>
        <Show when={props.revealed && choice.id === props.choice && choice.id !== props.answerId}><small>Your answer · Incorrect</small></Show>
      </label>}</For>
    </fieldset>
    <Show when={!props.revealed}><button class="button primary" disabled={props.disabled || !props.choice} onClick={reveal}>Check prediction</button></Show>
    <Show when={props.revealed}><div ref={feedback} class="scheduling-feedback" data-result={correct() ? 'correct' : 'incorrect'} role="status" tabIndex={-1}>
      <h3>{correct() ? 'Correct' : 'Not quite — update the placement model'}</h3>
      <p>{selected()?.rationale}</p>
      <Show when={props.choice !== props.answerId}><p><strong>Correct answer:</strong> {props.choices.find((choice) => choice.id === props.answerId)?.text}</p></Show>
      <p>{props.explanation}</p>
    </div></Show>
  </div>;
}

export default function SchedulingPrototype(props: { content: SchedulingPrototypeContent }) {
  const [hydrated, setHydrated] = createSignal(false);
  const [stage, setStage] = createSignal(0);
  const [baseChoice, setBaseChoice] = createSignal('');
  const [baseRevealed, setBaseRevealed] = createSignal(false);
  const [changeChoice, setChangeChoice] = createSignal('');
  const [changeRevealed, setChangeRevealed] = createSignal(false);
  const [transferChoice, setTransferChoice] = createSignal('');
  const [transferRevealed, setTransferRevealed] = createSignal(false);
  const [explanation, setExplanation] = createSignal('');
  let stageHeading: HTMLHeadingElement | undefined;
  onMount(() => setHydrated(true));

  function go(next: number) {
    setStage(next);
    focusTask(() => stageHeading);
  }

  function reset() {
    setBaseChoice(''); setBaseRevealed(false);
    setChangeChoice(''); setChangeRevealed(false);
    setTransferChoice(''); setTransferRevealed(false); setExplanation('');
    go(0);
  }

  return <section class="scheduling-prototype" aria-label="Pod scheduling teaching prototype" aria-busy={!hydrated()}>
    <div class="scheduling-progress" aria-label="Lesson progress">
      <span>Read</span><span>Try</span><span>Explain</span><span>Check</span>
      <p>Step {stage() + 1} of 5 · no score or mastery claim</p>
    </div>
    <Show when={!hydrated()}><p class="muted" role="status">Loading the interactive controls… The lesson remains readable.</p></Show>

    <Show when={stage() === 0}>
      <div class="scheduling-reading">
        <p class="eyebrow">Goal</p><p>{props.content.goal}</p>
        <p class="muted"><strong>Prerequisite:</strong> {props.content.prerequisite}</p>
        <h2 ref={stageHeading} tabIndex={-1}>{props.content.read.title}</h2>
        <For each={props.content.read.body}>{(paragraph) => <p>{paragraph}</p>}</For>
        <button class="button primary" disabled={!hydrated()} onClick={() => go(1)}>{props.content.read.start_label}</button>
      </div>
    </Show>

    <Show when={stage() === 1}>
      <div class="scheduling-scenario">
        <p class="eyebrow">Try · initial situation</p>
        <h2 ref={stageHeading} tabIndex={-1}>Inspect the Pod and three nodes</h2>
        <PodSummary pod={props.content.base.pod} />
        <aside class="scheduling-assumptions"><h3>Simplified constraints for this prediction</h3><ul><For each={props.content.assumptions}>{(item) => <li>{item}</li>}</For></ul></aside>
        <NodeCards nodes={props.content.base.nodes} pod={props.content.base.pod} revealed={baseRevealed()} />
        <Prediction prompt={props.content.base.prompt} choices={props.content.base.choices} answerId={props.content.base.answer_id} explanation={props.content.base.correct_explanation} choice={baseChoice()} revealed={baseRevealed()} disabled={!hydrated()} group="base-scheduling" onChoice={setBaseChoice} onReveal={() => setBaseRevealed(true)} />
        <Show when={baseRevealed()}><button class="button primary" onClick={() => go(2)}>Change one condition</button></Show>
      </div>
    </Show>

    <Show when={stage() === 2}>
      <div class="scheduling-scenario">
        <p class="eyebrow">Try · changed condition</p>
        <h2 ref={stageHeading} tabIndex={-1}>{props.content.change.title}</h2>
        <p>{props.content.change.description}</p>
        <NodeCards nodes={props.content.base.nodes} pod={props.content.change.pod} revealed={changeRevealed()} />
        <Prediction prompt={props.content.change.prompt} choices={props.content.change.choices} answerId={props.content.change.answer_id} explanation={props.content.change.correct_explanation} choice={changeChoice()} revealed={changeRevealed()} disabled={!hydrated()} group="changed-scheduling" onChoice={setChangeChoice} onReveal={() => setChangeRevealed(true)} />
        <Show when={changeRevealed()}>
          <div class="scheduling-concepts"><For each={props.content.concepts}>{(concept) => <article><h3>{concept.term}</h3><p>{concept.explanation}</p></article>}</For></div>
          <button class="button primary" onClick={() => go(3)}>Trace what happens next</button>
        </Show>
      </div>
    </Show>

    <Show when={stage() === 3}>
      <div class="scheduling-lifecycle">
        <p class="eyebrow">Explain · responsibility and proof</p>
        <h2 ref={stageHeading} tabIndex={-1}>{props.content.lifecycle.title}</h2>
        <ol><For each={props.content.lifecycle.stages}>{(item) => <li><h3>{item.actor}</h3><p>{item.action}</p><p class="muted"><strong>Observable:</strong> {item.observable}</p></li>}</For></ol>
        <details class="scheduling-proof"><summary>Inspect representative evidence</summary>
          <p class="muted">Illustrative authored output; nothing was provisioned or queried.</p>
          <h3><code>{props.content.lifecycle.proof.command}</code></h3>
          <pre tabIndex={0}><code>{props.content.lifecycle.proof.expected}</code></pre>
          <p><strong>Proves:</strong> {props.content.lifecycle.proof.proves}</p>
          <p><strong>Does not prove:</strong> {props.content.lifecycle.proof.limitation}</p>
        </details>
        <button class="button primary" onClick={() => go(4)}>Try a different scenario</button>
      </div>
    </Show>

    <Show when={stage() === 4}>
      <div class="scheduling-scenario">
        <p class="eyebrow">Independent check</p>
        <h2 ref={stageHeading} tabIndex={-1}>Apply the model to new nodes</h2>
        <PodSummary pod={props.content.transfer.pod} />
        <NodeCards nodes={props.content.transfer.nodes} pod={props.content.transfer.pod} revealed={transferRevealed()} />
        <Prediction prompt={props.content.transfer.prompt} choices={props.content.transfer.choices} answerId={props.content.transfer.answer_id} explanation={props.content.transfer.correct_explanation} choice={transferChoice()} revealed={transferRevealed()} disabled={!hydrated()} group="transfer-scheduling" onChoice={setTransferChoice} onReveal={() => setTransferRevealed(true)} />
        <Show when={transferRevealed()}><div class="scheduling-explanation">
          <label for="scheduling-own-words">{props.content.transfer.explain_prompt}</label>
          <textarea id="scheduling-own-words" rows="5" value={explanation()} onInput={(event) => setExplanation(event.currentTarget.value)} placeholder="Write a short explanation before comparing…" />
          <p class="muted">Your wording stays in this browser tab and is not graded or saved.</p>
          <details><summary>Compare with a model explanation</summary><p>{props.content.transfer.model_answer}</p><h3>Self-check</h3><ul><For each={props.content.transfer.checklist}>{(item) => <li>{item}</li>}</For></ul></details>
          <button class="button" onClick={reset}>Replay lesson</button>
        </div></Show>
      </div>
    </Show>
  </section>;
}
