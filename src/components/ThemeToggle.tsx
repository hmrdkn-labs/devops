import { createSignal, onMount } from 'solid-js';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const [theme, setTheme] = createSignal<Theme>('system');

  const apply = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem('hmrdkn-theme', next);
    setTheme(next);
  };

  onMount(() => {
    const saved = localStorage.getItem('hmrdkn-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') apply(saved);
  });

  const cycle = () => {
    const choices: Theme[] = ['system', 'light', 'dark'];
    apply(choices[(choices.indexOf(theme()) + 1) % choices.length]);
  };

  return (
    <button class="theme-toggle quiet-button" type="button" onClick={cycle} aria-label={'Theme: ' + theme()}>
      <span aria-hidden="true">{theme() === 'dark' ? '●' : theme() === 'light' ? '○' : '◐'}</span>
      <span class="theme-label">{theme()}</span>
    </button>
  );
}
