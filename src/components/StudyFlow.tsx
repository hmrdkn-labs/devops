import { For, Show, createMemo, createResource, createSignal } from 'solid-js';

interface Question {
  id: string;
  kind: 'explain' | 'predict' | 'objective' | 'scenario';
  prompt: string;
  model_answer: string;
  critical_points: string[];
  objective_ids: string[];
}

interface Card {
  id: string;
  type: 'short' | 'prompt' | 'scenario';
  front: string;
  back: string;
  critical_points: string[];
  objective_ids: string[];
}

interface Practice {
  id: string;
  title: string;
  prompt: string;
  steps: string[];
  success_checks: string[];
  safety: string[];
}

interface Source {
  id: string;
  title: string;
  url: string;
  publisher: string;
  note: string;
}

interface Props {
  unit: {
    id: string;
    revision: number;
    title: string;
    summary: string;
    layer: string;
    estimatedMinutes: number;
    questions: Question[];
    cards: Card[];
    practices: Practice[];
    sources: Source[];
    lessonHtml: string;
  };
}

interface Me {
  authenticated: boolean;
  authConfigured: boolean;
}

export default function StudyFlow(props: Props) {
  const [questionIndex, setQuestionIndex] = createSignal(0);
  const [answer, setAnswer] = createSignal('');
  const [revealed, setRevealed] = createSignal(false);
  const [rated, setRated] = createSignal(false);
  const [finished, setFinished] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveMessage, setSaveMessage] = createSignal('');
  const [checked, setChecked] = createSignal<string[]>([]);
  const [note, setNote] = createSignal('');
  const [noteLoaded, setNoteLoaded] = createSignal(false);
  const [noteMessage, setNoteMessage] = createSignal('');
  const [me] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    return response.json() as Promise<Me>;
  });
  const question = createMemo(() => props.unit.questions[questionIndex()]);
  const progress = createMemo(() => ((questionIndex() + (finished() ? 1 : 0)) / props.unit.questions.length) * 100);

  async function reveal() {
    if (!answer().trim()) return;
    setSaving(true);
    setSaveMessage('');
    if (me()?.authenticated) {
      const response = await fetch('/api/attempt', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: props.unit.id,
          unitRevision: props.unit.revision,
          questionId: question().id,
          answerMarkdown: answer(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setSaveMessage(response.ok ? 'Private answer saved.' : 'Answer kept in memory; saving failed.');
    } else {
      setSaveMessage('Guest answer kept in memory for this page only.');
    }
    setSaving(false);
    setRevealed(true);
  }

  async function rate(value: 'again' | 'hard' | 'good' | 'easy') {
    setSaving(true);
    const preferredType = question().kind === 'scenario' ? 'scenario' : 'prompt';
    const card = props.unit.cards.find((candidate) =>
      candidate.type === preferredType &&
      candidate.objective_ids.some((id) => question().objective_ids.includes(id)),
    ) ?? props.unit.cards.find((candidate) => candidate.type === preferredType) ?? props.unit.cards[0];
    if (me()?.authenticated && card) {
      const response = await fetch('/api/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: card.id,
          unitId: props.unit.id,
          unitRevision: props.unit.revision,
          rating: value,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) setSaveMessage('Rating kept in memory; scheduling failed.');
    }
    setSaving(false);
    setRated(true);
  }

  function next() {
    if (questionIndex() + 1 < props.unit.questions.length) {
      setQuestionIndex((value) => value + 1);
      setAnswer('');
      setRevealed(false);
      setRated(false);
      setChecked([]);
      setSaveMessage('');
    } else {
      setFinished(true);
    }
  }

  async function loadNote() {
    if (!me()?.authenticated || noteLoaded()) return;
    const response = await fetch('/api/notes?unitId=' + encodeURIComponent(props.unit.id), {
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json() as { markdown: string };
      setNote(data.markdown);
      setNoteLoaded(true);
    }
  }

  async function saveNote() {
    setNoteMessage('Saving…');
    const response = await fetch('/api/notes', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitId: props.unit.id, markdown: note() }),
    });
    setNoteMessage(response.ok ? 'Saved privately.' : 'Could not save.');
  }

  return (
    <div class="study-flow">
      <header class="unit-heading shell narrow">
        <div class="unit-meta">
          <span>{props.unit.layer}</span>
          <span>{props.unit.estimatedMinutes} min</span>
          <span>revision {props.unit.revision}</span>
        </div>
        <h1>{props.unit.title}</h1>
        <p>{props.unit.summary}</p>
      </header>

      <div class="study-layout shell">
        <aside class="study-rail" aria-label="Unit context">
          <div class="rail-card">
            <span class="section-kicker">Current unit</span>
            <strong>{props.unit.layer}</strong>
            <p>{props.unit.estimatedMinutes} min · revision {props.unit.revision}</p>
          </div>
          <ol class="rail-list" aria-label="Questions in this unit">
            <For each={props.unit.questions}>{(item, index) => (
              <li classList={{ 'is-active': index() === questionIndex() }}>
                <span>{String(index() + 1).padStart(2, '0')}</span>
                <span>{item.kind}</span>
              </li>
            )}</For>
          </ol>
        </aside>

        <div class="study-main">
          <section class="question-stage" aria-labelledby="question-title">
            <div class="stage-progress" aria-label={'Question progress ' + Math.round(progress()) + '%'}>
              <span style={{ width: progress() + '%' }} />
            </div>
            <p class="section-kicker">Think before the lesson · {questionIndex() + 1}/{props.unit.questions.length}</p>
            <h2 id="question-title">{question().prompt}</h2>
            <Show when={!revealed()}>
              <label class="answer-label" for="private-answer">Your explanation</label>
              <textarea
                id="private-answer"
                value={answer()}
                onInput={(event) => setAnswer(event.currentTarget.value)}
                placeholder="Reason it through in your own words. Accuracy comes after retrieval."
                rows={8}
              />
              <div class="stage-actions">
                <button class="button primary" disabled={!answer().trim() || saving()} onClick={reveal}>
                  {saving() ? 'Saving…' : 'Save privately & reveal'}
                </button>
                <span class="microcopy">No AI grading. You compare the reasoning yourself.</span>
              </div>
            </Show>

            <Show when={revealed()}>
              <div class="comparison">
                <div>
                  <p class="comparison-label">Your answer</p>
                  <p class="preserve-lines">{answer()}</p>
                </div>
                <div class="model-answer">
                  <p class="comparison-label">Concise model</p>
                  <p>{question().model_answer}</p>
                </div>
              </div>
              <fieldset class="critical-check">
                <legend>Critical-point self-check</legend>
                <For each={question().critical_points}>{(point) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={checked().includes(point)}
                      onChange={(event) => setChecked((items) =>
                        event.currentTarget.checked ? [...items, point] : items.filter((item) => item !== point))}
                    />
                    <span>{point}</span>
                  </label>
                )}</For>
              </fieldset>
              <Show when={!rated()} fallback={
                <div class="stage-actions">
                  <button class="button primary" onClick={next}>
                    {questionIndex() + 1 < props.unit.questions.length ? 'Next question' : 'Open the lesson'}
                  </button>
                  <span class="save-status" role="status">{saveMessage()}</span>
                </div>
              }>
                <div class="rating-block">
                  <p>How effortful was accurate recall?</p>
                  <div class="rating-buttons" role="group" aria-label="Recall rating">
                    <button disabled={saving()} onClick={() => rate('again')}>Again</button>
                    <button disabled={saving()} onClick={() => rate('hard')}>Hard</button>
                    <button disabled={saving()} onClick={() => rate('good')}>Good</button>
                    <button disabled={saving()} onClick={() => rate('easy')}>Easy</button>
                  </div>
                </div>
              </Show>
            </Show>
          </section>

          <Show when={finished()}>
            <article class="lesson">
              <div class="lesson-divider"><span>Lesson revealed</span></div>
              <div class="markdown-body" innerHTML={props.unit.lessonHtml} />
            </article>

            <section class="depth-grid" aria-labelledby="practice-title">
              <div>
                <p class="section-kicker">Guided practice</p>
                <h2 id="practice-title">Apply the model safely</h2>
              </div>
              <For each={props.unit.practices}>{(practice) => (
                <details class="depth-card">
                  <summary>{practice.title}</summary>
                  <p>{practice.prompt}</p>
                  <ol><For each={practice.steps}>{(step) => <li>{step}</li>}</For></ol>
                  <h3>Success checks</h3>
                  <ul><For each={practice.success_checks}>{(item) => <li>{item}</li>}</For></ul>
                  <Show when={practice.safety.length}>
                    <h3>Safety boundary</h3>
                    <ul><For each={practice.safety}>{(item) => <li>{item}</li>}</For></ul>
                  </Show>
                </details>
              )}</For>
            </section>

            <section class="card-preview" aria-labelledby="cards-title">
              <p class="section-kicker">Future recall</p>
              <h2 id="cards-title">Cards created by this unit</h2>
              <div class="mini-card-grid">
                <For each={props.unit.cards}>{(card) => (
                  <details class="mini-card">
                    <summary><span>{card.type}</span>{card.front}</summary>
                    <p>{card.back}</p>
                  </details>
                )}</For>
              </div>
            </section>

            <section class="notes-panel" aria-labelledby="notes-title">
              <div>
                <p class="section-kicker">Private notebook</p>
                <h2 id="notes-title">What changed in your mental model?</h2>
              </div>
              <Show when={me()?.authenticated} fallback={
                <p class="guest-note">Sign in as the allowlisted owner to keep per-unit Markdown notes.</p>
              }>
                <textarea
                  rows={7}
                  value={note()}
                  onFocus={loadNote}
                  onInput={(event) => setNote(event.currentTarget.value)}
                  placeholder="Write a correction, connection, or question in Markdown."
                />
                <div class="stage-actions">
                  <button class="button primary" onClick={saveNote}>Save note</button>
                  <span role="status">{noteMessage()}</span>
                </div>
              </Show>
            </section>

            <footer class="unit-sources">
              <h2>Primary references</h2>
              <ul><For each={props.unit.sources}>{(source) => (
                <li><a href={source.url} rel="noopener noreferrer">{source.title}</a> · {source.publisher}<small>{source.note}</small></li>
              )}</For></ul>
              <a class="raw-link" href={'/raw/v1/units/' + props.unit.id.split(':')[1] + '/unit.md'}>Open raw Markdown</a>
            </footer>
          </Show>
        </div>
      </div>
    </div>
  );
}
