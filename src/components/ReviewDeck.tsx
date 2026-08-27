import { Show, createResource, createSignal } from 'solid-js';

interface ReviewItem {
  cardId: string;
  unitId: string;
  unitRevision: number;
  type: 'short' | 'prompt' | 'scenario';
  dueAt: number;
  front: string;
  back: string;
  criticalPoints: string[];
  unitTitle: string;
}

export default function ReviewDeck() {
  const [revealed, setRevealed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [completed, setCompleted] = createSignal(0);
  const [queue, { refetch }] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/review?limit=20', { credentials: 'include' });
    if (!response.ok) return null;
    return (await response.json() as { queue: ReviewItem[] }).queue;
  });
  const current = () => queue()?.[0];

  async function rate(rating: 'again' | 'hard' | 'good' | 'easy') {
    const card = current();
    if (!card) return;
    setBusy(true);
    const response = await fetch('/api/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.cardId,
        unitId: card.unitId,
        unitRevision: card.unitRevision,
        rating,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    if (response.ok) {
      setCompleted((value) => value + 1);
      setRevealed(false);
      await refetch();
    }
    setBusy(false);
  }

  return (
    <div class="review-deck">
      <Show when={queue()} fallback={
        <div class="empty-state">
          <strong>Owner sign-in required</strong>
          <p>Guest study never persists or creates a review queue.</p>
        </div>
      }>
        {(cards) => (
          <Show when={current()} fallback={
            <div class="empty-state">
              <strong>{completed() ? 'Review complete.' : 'Nothing is due.'}</strong>
              <p>Study a learning unit or return when FSRS schedules the next review.</p>
              <a class="button primary" href="/paths/from-process-to-pod">Continue focus path</a>
            </div>
          }>
            {(card) => (
              <>
                <div class="review-meta">
                  <span>{card().type}</span>
                  <span>{card().unitTitle}</span>
                  <span>{cards().length} due</span>
                </div>
                <section class="review-card" aria-live="polite">
                  <p class="section-kicker">Retrieve before revealing</p>
                  <h2>{card().front}</h2>
                  <Show when={revealed()}>
                    <div class="review-answer">
                      <p>{card().back}</p>
                      <Show when={card().criticalPoints.length}>
                        <ul>{card().criticalPoints.map((point) => <li>{point}</li>)}</ul>
                      </Show>
                    </div>
                  </Show>
                </section>
                <Show when={!revealed()} fallback={
                  <div class="rating-block review-rating">
                    <p>Rate the retrieval, not the card.</p>
                    <div class="rating-buttons">
                      <button disabled={busy()} onClick={() => rate('again')}>Again</button>
                      <button disabled={busy()} onClick={() => rate('hard')}>Hard</button>
                      <button disabled={busy()} onClick={() => rate('good')}>Good</button>
                      <button disabled={busy()} onClick={() => rate('easy')}>Easy</button>
                    </div>
                  </div>
                }>
                  <button class="button primary reveal-card" onClick={() => setRevealed(true)}>Reveal answer</button>
                </Show>
              </>
            )}
          </Show>
        )}
      </Show>
    </div>
  );
}
