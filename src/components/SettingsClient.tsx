import { Show, createResource, createSignal } from 'solid-js';

interface Profile {
  activePathId: string;
  timezone: string;
  requestedRetention: number;
}

export default function SettingsClient() {
  const [message, setMessage] = createSignal('');
  const [profile, { mutate }] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/profile', { credentials: 'include' });
    if (!response.ok) return null;
    return response.json() as Promise<Profile>;
  });

  async function save() {
    const value = profile();
    if (!value) return;
    setMessage('Saving…');
    const response = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    setMessage(response.ok ? 'Settings saved.' : 'Could not save settings.');
  }

  return (
    <Show when={profile()} fallback={
      <div class="empty-state">
        <strong>Owner settings are private.</strong>
        <p>Sign in with the allowlisted Google identity to configure scheduling and export data.</p>
      </div>
    }>
      {(value) => (
        <div class="settings-grid">
          <section class="settings-card">
            <p class="section-kicker">Review scheduling</p>
            <h2>Requested retention</h2>
            <label class="range-label">
              <span>FSRS target</span>
              <strong>{Math.round(value().requestedRetention * 100)}%</strong>
              <input
                type="range"
                min="0.85"
                max="0.95"
                step="0.01"
                value={value().requestedRetention}
                onInput={(event) => mutate({ ...value(), requestedRetention: Number(event.currentTarget.value) })}
              />
            </label>
            <p>Higher retention creates more frequent reviews. The default is 90%.</p>
            <label>
              <span>Timezone</span>
              <input
                value={value().timezone}
                onInput={(event) => mutate({ ...value(), timezone: event.currentTarget.value })}
                placeholder="Asia/Jakarta"
              />
            </label>
            <button class="button primary" onClick={save}>Save scheduling settings</button>
            <span role="status">{message()}</span>
          </section>

          <section class="settings-card">
            <p class="section-kicker">Portability</p>
            <h2>Export all learner data</h2>
            <p>The archive contains lossless versioned JSON, table-level CSV files, and a Markdown summary. It excludes OAuth tokens and sessions.</p>
            <div class="stacked-actions">
              <a class="button primary" href="/api/export">Download full archive</a>
              <a class="button" href="/api/export?format=json">Download JSON only</a>
            </div>
          </section>
        </div>
      )}
    </Show>
  );
}
