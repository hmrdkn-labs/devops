import { For, Show, createMemo, createResource, createSignal } from 'solid-js';

interface Entry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  layer: string;
  text: string;
  objective_titles: string[];
}

export default function SearchClient() {
  const [query, setQuery] = createSignal('');
  const [layer, setLayer] = createSignal('all');
  const [index] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/search-index.json');
    return response.json() as Promise<Entry[]>;
  });
  const layers = createMemo(() => [...new Set((index() ?? []).map((entry) => entry.layer))]);
  const results = createMemo(() => {
    const terms = query().toLowerCase().trim().split(/\s+/).filter(Boolean);
    return (index() ?? []).filter((entry) => {
      if (layer() !== 'all' && entry.layer !== layer()) return false;
      if (!terms.length) return true;
      const haystack = [entry.title, entry.summary, entry.text, ...entry.objective_titles].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    }).slice(0, 40);
  });

  return (
    <div class="search-app">
      <div class="search-controls">
        <label>
          <span>Exact content search</span>
          <input
            type="search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            placeholder="Try: readiness probe, cgroup, DNS…"
            autofocus
          />
        </label>
        <label>
          <span>Layer</span>
          <select value={layer()} onChange={(event) => setLayer(event.currentTarget.value)}>
            <option value="all">All layers</option>
            <For each={layers()}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
      </div>
      <p class="result-count" aria-live="polite">{results().length} matching units</p>
      <div class="search-results">
        <For each={results()}>{(entry) => (
          <a class="search-result" href={'/learn/' + entry.slug}>
            <span>{entry.layer}</span>
            <h2>{entry.title}</h2>
            <p>{entry.summary}</p>
          </a>
        )}</For>
        <Show when={!results().length}>
          <div class="empty-state">
            <strong>No exact match yet.</strong>
            <p>Try fewer technical terms. Ranked semantic retrieval is intentionally outside the owner-beta core.</p>
          </div>
        </Show>
      </div>
    </div>
  );
}
