/** Explicit task navigation moves only when the new heading is outside the viewport. */
export function focusTask(target: HTMLElement | undefined | (() => HTMLElement | undefined)) {
  queueMicrotask(() => {
    const element = typeof target === 'function' ? target() : target;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.top < 76 || box.bottom > window.innerHeight - 100) {
      element.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    element.focus({ preventScroll: true });
  });
}
