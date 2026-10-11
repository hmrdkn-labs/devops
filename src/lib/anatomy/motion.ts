import { onCleanup, onMount } from 'solid-js';

/** One bounded animation loop; the caller's step returns whether motion remains. */
export function createAnatomyMotion(
  element: () => HTMLElement | undefined,
  step: (seconds: number, reducedMotion: boolean) => boolean,
): () => void {
  let frame = 0;
  let last = 0;
  let visible = false;
  let reduced = false;
  let observer: IntersectionObserver | undefined;
  let media: MediaQueryList | undefined;
  let mounted = false;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const tick = (now: number) => {
    frame = 0;
    if (!visible || document.hidden) return;
    const seconds = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const moving = step(seconds, reduced);
    if (moving && !reduced) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!mounted) return;
    if (reduced) {
      stop();
      step(0, true);
    } else if (visible && !document.hidden && !frame) {
      frame = requestAnimationFrame(tick);
    }
  };
  const mediaChanged = () => {
    reduced = media!.matches;
    stop();
    wake();
  };
  const visibilityChanged = () => {
    if (document.hidden) stop();
    else wake();
  };
  onMount(() => {
    mounted = true;
    media = matchMedia('(prefers-reduced-motion: reduce)');
    reduced = media.matches;
    media.addEventListener('change', mediaChanged);
    document.addEventListener('visibilitychange', visibilityChanged);
    observer = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (!latest) return;
      visible = latest.isIntersecting;
      if (visible) wake();
      else stop();
    }, { rootMargin: '120px 0px' });
    const stage = element();
    if (stage) observer.observe(stage);
    if (reduced) step(0, true);
  });
  onCleanup(() => {
    if (!mounted) return;
    mounted = false;
    stop();
    observer?.disconnect();
    media?.removeEventListener('change', mediaChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
  });
  return wake;
}
