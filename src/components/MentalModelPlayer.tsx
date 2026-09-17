import { For, Show, batch, createMemo, createSignal } from 'solid-js';
import type { MentalModel } from '@/lib/content/mental-model-schema';
import './mental-model.css';

export default function MentalModelPlayer(props: { model: MentalModel }) {
  const [stepIndex, setStepIndex] = createSignal(0);
  const [failure, setFailure] = createSignal(false);
  const [choice, setChoice] = createSignal('');
  const [revealed, setRevealed] = createSignal(false);
  const [inspecting, setInspecting] = createSignal('');
  const step = createMemo(() => props.model.steps[stepIndex()]!);
  const selected = createMemo(() => step().prediction.options.find((item) => item.id === choice()));
  const component = createMemo(() => props.model.components.find((item) => item.id === inspecting()));
  const locations = createMemo(() => [...new Set(props.model.components.map((item) => item.location))]);
  let feedback: HTMLDivElement | undefined;
  let prompt: HTMLHeadingElement | undefined;

  function reset(nextStep = 0) {
    batch(() => {
      setStepIndex(nextStep); setFailure(false);
      setChoice(''); setRevealed(false); setInspecting('');
    });
    queueMicrotask(() => prompt?.focus({ preventScroll: true }));
  }

  function reveal() {
    if (!choice()) return;
    setRevealed(true);
    setInspecting(step().actor_id);
    queueMicrotask(() => feedback?.focus({ preventScroll: true }));
  }

  return <section class="mental-model-workspace" aria-label={props.model.title}>
    <div class="mental-model-toolbar">
      <button class="quiet-button" onClick={() => reset()}>Replay scenario</button>
      <span class="muted">{stepIndex() + 1} of {props.model.steps.length} steps · {step().layer}</span>
    </div>
    <p class="mental-model-situation">{props.model.scenario}</p>
    <details><summary>Scenario assumptions</summary><ul><For each={props.model.assumptions}>{(item) => <li>{item}</li>}</For></ul></details>
    <p class="muted">Teaching simulation · authored evidence</p>
    <div class="mental-model-grid">
      <div class="mental-model-diagram" aria-label="Component locations">
        <For each={locations()}>{(location) => <section class="mental-model-location">
          <h2>{location}</h2>
          <div class="mental-model-nodes">
            <For each={props.model.components.filter((item) => item.location === location)}>{(item) =>
              <button class="mental-model-node" classList={{ active: revealed() && !failure() && step().active_component_ids.includes(item.id), selected: inspecting() === item.id }}
                aria-pressed={inspecting() === item.id} onClick={() => setInspecting(item.id)}>
                {item.name}
                <Show when={revealed() && step().active_component_ids.includes(item.id)}><span>{item.id === step().actor_id ? 'Decision / action owner' : 'Participates in this step'}</span></Show>
              </button>
            }</For>
          </div>
        </section>}</For>
        <Show when={revealed() && !failure()}><div class="mental-model-flow" aria-label="Step interactions"><For each={step().edges}>{(edge) => <p>{props.model.components.find((item) => item.id === edge.from)?.name} <span aria-hidden="true">→</span> {props.model.components.find((item) => item.id === edge.to)?.name}<small>{edge.label}</small></p>}</For></div></Show>
        <Show when={component()} fallback={<p class="muted">Select a component to inspect its responsibility.</p>}>{(item) =>
          <aside class="mental-model-component"><h3>{item().name}</h3><p>{item().responsibility}</p><p class="muted">Lives in: {item().location}</p></aside>
        }</Show>
      </div>
      <div class="mental-model-task">
        <p class="eyebrow">Predict the next event</p>
        <h2 ref={prompt} tabIndex={-1}>{step().prediction.prompt}</h2>
        <p class="muted">Before this event</p><ul><For each={step().before}>{(item) => <li>{item}</li>}</For></ul>
        <fieldset disabled={revealed()} class="mental-model-choices">
          <legend class="sr-only">Choose your prediction</legend>
          <For each={step().prediction.options}>{(item) => <label class="mental-model-choice" classList={{ chosen: choice() === item.id }}>
            <input type="radio" name={'prediction-' + props.model.slug} value={item.id} checked={choice() === item.id} onChange={() => setChoice(item.id)} />
            <span>{item.text}</span>
          </label>}</For>
        </fieldset>
        <Show when={!revealed()}><button class="button primary" disabled={!choice()} onClick={reveal}>Check prediction & reveal</button></Show>
        <Show when={revealed()}>
          <div ref={feedback} tabIndex={-1} class="mental-model-feedback" role="status">
            <h3>{choice() === step().prediction.answer_id ? 'Correct prediction' : 'Let’s correct the model'}</h3>
            <p>{selected()?.rationale}</p>
            <Show when={choice() !== step().prediction.answer_id}><p><strong>Correct prediction:</strong> {step().prediction.options.find((item) => item.id === step().prediction.answer_id)?.text}</p></Show>
            <p><strong>What happens:</strong> {step().action}</p>
          </div>
          <p><strong>State after the event</strong></p><ul><For each={failure() ? [step().failure.consequence] : step().after}>{(item) => <li>{item}</li>}</For></ul>
          <label class="mental-model-choice"><input type="checkbox" checked={failure()} onChange={(event) => setFailure(event.currentTarget.checked)} /><span>Change condition: {step().failure.condition}</span></label>
          <Show when={failure()}><div class="mental-model-feedback"><p>{step().failure.consequence}</p><p><strong>Next check:</strong> {step().failure.next_check}</p></div></Show>
          <details class="mental-model-evidence"><summary>Inspect the evidence</summary>
            <p class="muted">Expected evidence for the healthy sequence. These are authored examples, not output from a running cluster.</p>
            <Show when={failure()}><p><strong>Changed condition:</strong> {step().failure.next_check}</p></Show>
            <section><h3><code>{step().proof.command}</code></h3><pre tabIndex={0} aria-label={'Expected evidence for ' + step().proof.command}><code>{step().proof.expected}</code></pre><p><strong>Proves:</strong> {step().proof.proves}</p><p><strong>Limit:</strong> {step().proof.limitation}</p></section>
          </details>
          <div class="mental-model-next"><Show when={stepIndex() + 1 < props.model.steps.length} fallback={<><p>Scenario complete. Change a condition to test your model again.</p><For each={props.model.transfer_questions}>{(item) => <details><summary>{item.prompt}</summary><p>{item.answer}</p></details>}</For><button class="button" onClick={() => reset()}>Try again</button></>}>
            <Show when={!failure()} fallback={<p>Return to the healthy condition before continuing the original sequence.</p>}><button class="button primary" onClick={() => reset(stepIndex() + 1)}>Predict next step</button></Show>
          </Show></div>
        </Show>
      </div>
    </div>
  </section>;
}
