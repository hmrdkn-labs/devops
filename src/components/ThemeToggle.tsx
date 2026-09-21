import { createSignal, onCleanup, onMount } from 'solid-js';

type Theme = 'light' | 'dark' | 'system';

export default function ThemeToggle() {
  const [theme, setTheme] = createSignal<Theme>('system');

  const syncThemeColor = (next: Theme, systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches) => {
    const dark = next === 'dark' || (next === 'system' && systemDark);
    document.querySelector<HTMLMetaElement>('#theme-color')?.setAttribute('content', dark ? '#151c24' : '#f7f5f0');
  };

  const apply = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem('hmrdkn-theme', next);
    syncThemeColor(next);
    setTheme(next);
  };

  onMount(() => {
    const saved = localStorage.getItem('hmrdkn-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') apply(saved);
    else apply('system');
    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (event: MediaQueryListEvent) => {
      if (theme() === 'system') syncThemeColor('system', event.matches);
    };
    colorScheme.addEventListener('change', followSystem);
    onCleanup(() => colorScheme.removeEventListener('change', followSystem));
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
