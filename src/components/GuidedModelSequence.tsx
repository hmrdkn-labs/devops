import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import type { GuidedSequence } from '@/lib/content/mental-model-schema';
import { focusTask } from '@/lib/task-focus';
import './guided-model-sequence.css';

type Scenario = GuidedSequence['initial'] | GuidedSequence['change'] | GuidedSequence['transfer'];
type Choice = Scenario['choices'][number];

function ScenarioCards(props: { cards: Scenario['cards'] }) {
  return <div class="guided-model-cards">
    <For each={props.cards}>{(card) => <article>
      <p class="eyebrow">{card.eyebrow}</p>
      <h3>{card.title}</h3>
      <dl><For each={card.facts}>{(fact) => <div><dt>{fact.label}</dt><dd>{fact.value}</dd></div>}</For></dl>
    </article>}</For>
  </div>;
}

function Prediction(props: {
  scenario: Scenario;
  choice: string;
  revealed: boolean;
  disabled: boolean;
  group: string;
  onChoice: (choice: string) => void;
  onReveal: () => void;
}) {
  const selected = createMemo(() => props.scenario.choices.find((choice) => choice.id === props.choice));
  const correct = createMemo(() => props.choice === props.scenario.answer_id);
  let feedback: HTMLDivElement | undefined;
  function reveal() {
    props.onReveal();
    focusTask(() => feedback);
  }
  return <div class="guided-model-prediction">
    <h2>{props.scenario.prompt}</h2>
    <fieldset disabled={props.disabled || props.revealed}>
      <legend class="sr-only">Choose one prediction</legend>
      <For each={props.scenario.choices}>{(choice: Choice) => <label data-state={props.revealed ? choice.id === props.scenario.answer_id ? 'correct' : choice.id === props.choice ? 'incorrect' : 'idle' : 'idle'}>
        <input type="radio" name={props.group} checked={choice.id === props.choice} onChange={() => props.onChoice(choice.id)} />
        <span>{choice.text}</span>
        <Show when={props.revealed && choice.id === props.scenario.answer_id}><small>Correct answer</small></Show>
        <Show when={props.revealed && choice.id === props.choice && choice.id !== props.scenario.answer_id}><small>Your answer · Incorrect</small></Show>
      </label>}</For>
    </fieldset>
    <Show when={!props.revealed}><button class="button primary" disabled={props.disabled || !props.choice} onClick={reveal}>Check prediction</button></Show>
    <Show when={props.revealed}><div ref={feedback} tabIndex={-1} role="status" class="guided-model-feedback" data-result={correct() ? 'correct' : 'incorrect'}>
      <h3>{correct() ? 'Correct' : 'Not quite — revise the model'}</h3>
      <p>{selected()?.rationale}</p>
      <Show when={!correct()}><p><strong>Correct answer:</strong> {props.scenario.choices.find((choice) => choice.id === props.scenario.answer_id)?.text}</p></Show>
      <p>{props.scenario.correct_explanation}</p>
    </div></Show>
  </div>;
}

export default function GuidedModelSequence(props: { content: GuidedSequence; title: string }) {
  const [hydrated, setHydrated] = createSignal(false);
  const [stage, setStage] = createSignal(0);
  const [initialChoice, setInitialChoice] = createSignal('');
  const [initialRevealed, setInitialRevealed] = createSignal(false);
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

  function StageNav(props: { previous?: number; next?: number; nextLabel?: string }) {
    return <nav class="guided-model-stage-nav" aria-label="Sequence stages">
      <Show when={props.previous !== undefined}><button class="button" disabled={!hydrated()} onClick={() => go(props.previous!)}>← Revisit previous stage</button></Show>
      <Show when={props.next !== undefined}><button class="button primary" disabled={!hydrated()} onClick={() => go(props.next!)}>{props.nextLabel ?? 'Continue'}</button></Show>
    </nav>;
  }

  return <section class="guided-model" aria-label={`${props.title} guided sequence`} aria-busy={!hydrated()}>
    <header class="guided-model-progress">
      <span>Read</span><span>Try</span><span>Explain</span><span>Check</span>
      <p>Step {stage() + 1} of 5 · Exploration only · progress is not saved</p>
    </header>
    <Show when={!hydrated()}><p role="status" class="muted">Loading interactive controls… The worked example remains readable.</p></Show>

    <Show when={stage() === 0}><div class="guided-model-reading">
      <p class="eyebrow">Goal</p><p>{props.content.goal}</p>
      <p class="muted"><strong>Prerequisite:</strong> {props.content.prerequisite}</p>
      <h2 ref={stageHeading} tabIndex={-1}>{props.content.read.title}</h2>
      <p class="guided-model-worked"><strong>Worked example:</strong> {props.content.read.worked_example}</p>
      <For each={props.content.read.body}>{(paragraph) => <p>{paragraph}</p>}</For>
      <details><summary>Assumptions and limits</summary><ul><For each={props.content.assumptions}>{(item) => <li>{item}</li>}</For></ul></details>
      <StageNav next={1} nextLabel={props.content.read.start_label} />
    </div></Show>

    <Show when={stage() === 1}><div>
      <p class="eyebrow">Try · initial situation</p>
      <h2 ref={stageHeading} tabIndex={-1}>{props.content.initial.title}</h2>
      <p>{props.content.initial.setup}</p>
      <ScenarioCards cards={props.content.initial.cards} />
      <Prediction scenario={props.content.initial} choice={initialChoice()} revealed={initialRevealed()} disabled={!hydrated()} group="guided-initial" onChoice={setInitialChoice} onReveal={() => setInitialRevealed(true)} />
      <StageNav previous={0} next={initialRevealed() ? 2 : undefined} nextLabel="Change one condition" />
    </div></Show>

    <Show when={stage() === 2}><div>
      <p class="eyebrow">Try · changed condition</p>
      <h2 ref={stageHeading} tabIndex={-1}>{props.content.change.title}</h2>
      <p class="guided-model-change"><strong>Only this condition changes:</strong> {props.content.change.changed_condition}</p>
      <p>{props.content.change.setup}</p>
      <ScenarioCards cards={props.content.change.cards} />
      <Prediction scenario={props.content.change} choice={changeChoice()} revealed={changeRevealed()} disabled={!hydrated()} group="guided-change" onChoice={setChangeChoice} onReveal={() => setChangeRevealed(true)} />
      <StageNav previous={1} next={changeRevealed() ? 3 : undefined} nextLabel="Explain the boundaries" />
    </div></Show>

    <Show when={stage() === 3}><div class="guided-model-explain">
      <p class="eyebrow">Explain · actors, locations, and proof</p>
      <h2 ref={stageHeading} tabIndex={-1}>{props.content.explain.title}</h2>
      <p>{props.content.explain.intro}</p>
      <div class="guided-model-actors"><For each={props.content.explain.actors}>{(actor) => <article>
        <p class="eyebrow">{actor.location}</p><h3>{actor.name}</h3><p>{actor.responsibility}</p><p class="muted"><strong>Observable:</strong> {actor.observable}</p>
      </article>}</For></div>
      <div class="guided-model-tracks"><For each={props.content.explain.tracks}>{(track) => <section data-kind={track.kind}>
        <p class="eyebrow">{track.kind === 'control' ? 'Control/configuration' : 'Execution/data path'}</p><h3>{track.title}</h3><ol><For each={track.steps}>{(item) => <li>{item}</li>}</For></ol>
      </section>}</For></div>
      <details class="guided-model-proof"><summary>Inspect representative evidence</summary>
        <p class="muted">Illustrative authored output; no cluster was provisioned or queried.</p>
        <h3><code>{props.content.explain.proof.command}</code></h3><pre tabIndex={0}><code>{props.content.explain.proof.expected}</code></pre>
        <p><strong>Proves:</strong> {props.content.explain.proof.proves}</p><p><strong>Does not prove:</strong> {props.content.explain.proof.limitation}</p>
      </details>
      <StageNav previous={2} next={4} nextLabel="Try an independent case" />
    </div></Show>

    <Show when={stage() === 4}><div>
      <p class="eyebrow">Independent check</p>
      <h2 ref={stageHeading} tabIndex={-1}>{props.content.transfer.title}</h2>
      <p>{props.content.transfer.setup}</p>
      <ScenarioCards cards={props.content.transfer.cards} />
      <Prediction scenario={props.content.transfer} choice={transferChoice()} revealed={transferRevealed()} disabled={!hydrated()} group="guided-transfer" onChoice={setTransferChoice} onReveal={() => setTransferRevealed(true)} />
      <Show when={transferRevealed()}><div class="guided-model-compare">
        <label for="guided-own-words">{props.content.transfer.explain_prompt}</label>
        <textarea id="guided-own-words" rows="5" value={explanation()} onInput={(event) => setExplanation(event.currentTarget.value)} placeholder="Write a short explanation before comparing…" />
        <p class="muted">This wording stays in this tab. It is not graded, saved, or counted as mastery.</p>
        <details><summary>Compare with an authored explanation</summary><p>{props.content.transfer.model_answer}</p><h3>Self-check</h3><ul><For each={props.content.transfer.checklist}>{(item) => <li>{item}</li>}</For></ul></details>
        <section class="guided-model-next"><h3>Continue learning</h3><ul><For each={props.content.next_links}>{(link) => <li><a href={link.href}>{link.label}</a><p>{link.description}</p></li>}</For></ul></section>
      </div></Show>
      <StageNav previous={3} />
    </div></Show>
  </section>;
}
