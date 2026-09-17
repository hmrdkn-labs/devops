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

interface Props {
  pathSlug?: string;
  nextHref?: string;
  nextLabel?: string;
}

export default function ReviewDeck(props: Props) {
  const [revealed, setRevealed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [completed, setCompleted] = createSignal(0);
  const [message, setMessage] = createSignal<string | null>(null);
  const [queueError, setQueueError] = createSignal<string | null>(null);
  const [ownerRequired, setOwnerRequired] = createSignal(false);
  const [retryRating, setRetryRating] = createSignal<'again' | 'hard' | 'good' | 'easy' | null>(null);
  let lastQueue: ReviewItem[] | null = null;
  let pendingRating: { cardId: string; rating: string; key: string } | undefined;
  const [queue, { refetch, mutate }] = createResource(() => typeof window !== 'undefined', async () => {
    setQueueError(null);
    setOwnerRequired(false);
    const params = new URLSearchParams({ limit: '20' });
    if (props.pathSlug) params.set('path', props.pathSlug);
    try {
      const response = await fetch('/api/review?' + params.toString(), { credentials: 'include' });
      if (response.status === 401 || response.status === 403) {
        setOwnerRequired(true);
        return null;
      }
      if (!response.ok) throw new Error('queue unavailable');
      lastQueue = (await response.json() as { queue: ReviewItem[] }).queue;
      return lastQueue;
    } catch {
      setQueueError('Could not load your review queue. Try again when connected.');
      return lastQueue;
    }
  });
  const current = () => queue()?.[0];

  async function rate(rating: 'again' | 'hard' | 'good' | 'easy') {
    const card = current();
    if (!card || busy() || (retryRating() !== null && retryRating() !== rating)) return;
    setBusy(true);
    setMessage(null);
    if (pendingRating?.cardId !== card.cardId || pendingRating.rating !== rating) {
      pendingRating = { cardId: card.cardId, rating, key: crypto.randomUUID() };
    }
    try {
    const response = await fetch('/api/review', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.cardId,
        unitId: card.unitId,
        unitRevision: card.unitRevision,
        rating,
        idempotencyKey: pendingRating.key,
      }),
    });
    if (response.ok) {
      pendingRating = undefined;
      setRetryRating(null);
      setCompleted((value) => value + 1);
      setRevealed(false);
      lastQueue = queue()?.filter((item) => item.cardId !== card.cardId) ?? null;
      mutate(lastQueue);
      await refetch();
    } else {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 409 && body?.error === 'content_revision_changed') {
        pendingRating = undefined;
        setRetryRating(null);
        lastQueue = null;
        mutate(null);
        setMessage('Content changed since this review was scheduled. Refreshing the queue…');
        setRevealed(false);
        await refetch();
      } else {
        setRetryRating(rating);
        setMessage('Could not save this review. Your card was not advanced; try again.');
      }
    }
    } catch {
      setRetryRating(rating);
      setMessage('Could not confirm this review was saved. Your card stays here; retry the same rating safely.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="review-deck">
      <Show when={queue.loading}>
        <p role="status" data-testid="review-loading">Loading your review queue…</p>
      </Show>
      <Show when={queueError()}>
        <div class="empty-state" data-testid="review-error">
          <p role="status">{queueError()}</p>
          <button class="button" type="button" disabled={queue.loading || busy() || retryRating() !== null} onClick={() => void refetch()}>Retry loading reviews</button>
          <p><a href="/">Learn a unit</a> or <a href="/practice">choose a practice activity</a> while reviews are unavailable.</p>
        </div>
      </Show>
      <Show when={queue()} fallback={
        <Show when={ownerRequired()}>
        <div class="empty-state">
          <strong>Owner sign-in required</strong>
          <p>Guest study never persists or creates a review queue.</p>
          <p>You can <a href="/">start learning</a> or <a href="/practice">practice without signing in</a>.</p>
        </div>
        </Show>
      }>
        {(cards) => (
          <Show when={current()} fallback={
            <Show when={!queueError() && !queue.loading}>
            <div class="empty-state">
              <strong>{completed() ? 'Review complete.' : 'Nothing is due.'}</strong>
              <p>{props.pathSlug ? 'This focused queue is clear. Continue with the next learning unit.' : 'Learn a unit or return when your next review is due.'}</p>
              <a class="button primary" href={props.nextHref ?? '/'}>{props.nextLabel ?? 'Continue learning'}</a>
              <p><a href="/practice">Choose a practice activity</a></p>
            </div>
            </Show>
          }>
            {(card) => (
              <>
                <div class="review-meta" aria-label="Review context">
                  <span><strong>{cards().length}</strong> due · {completed()} done</span>
                  <span>{card().unitTitle}</span>
                  <span>{props.pathSlug ? props.pathSlug.toUpperCase() : 'Recall'}</span>
                </div>
                <section class="review-card" aria-live="polite">
                  <p class="section-kicker">{revealed() ? 'Answer revealed' : 'Retrieve before revealing'}</p>
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
                    <p id="review-rating-help">Again: missed it. Hard: remembered with difficulty. Good: remembered correctly. Easy: remembered immediately.</p>
                    <div class="rating-buttons" role="group" aria-label="Rate your recall" aria-describedby="review-rating-help">
                      <button disabled={busy() || retryRating() !== null} onClick={() => rate('again')}>Again</button>
                      <button disabled={busy() || retryRating() !== null} onClick={() => rate('hard')}>Hard</button>
                      <button disabled={busy() || retryRating() !== null} onClick={() => rate('good')}>Good</button>
                      <button disabled={busy() || retryRating() !== null} onClick={() => rate('easy')}>Easy</button>
                    </div>
                  </div>
                }>
                  <button class="button primary reveal-card" onClick={() => setRevealed(true)}>Reveal answer</button>
                </Show>
                <Show when={message()}>
                  {(text) => <p class="review-message" role="status">{text()}</p>}
                </Show>
                <Show when={busy()}><p role="status">Saving review…</p></Show>
                <Show when={retryRating()}>{(value) => <button type="button" class="button" data-testid="review-retry-save" disabled={busy()} onClick={() => void rate(value())}>Retry saving “{value()}”</button>}</Show>
              </>
            )}
          </Show>
        )}
      </Show>
    </div>
  );
}
