import { Show, createResource, createSignal } from 'solid-js';
import { authClient } from '@/lib/auth-client';

interface Me {
  authenticated: boolean;
  authConfigured: boolean;
  user: { id: string; name: string; image?: string | null } | null;
}

export default function AuthMenu() {
  const [busy, setBusy] = createSignal(false);
  const [me, { refetch }] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    return response.json() as Promise<Me>;
  });

  async function signIn(provider: 'github' | 'google') {
    setBusy(true);
    await authClient.signIn.social({ provider, callbackURL: window.location.href });
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    await refetch();
    setBusy(false);
  }

  return (
    <div class="auth-menu">
      <Show when={me()?.authenticated && me()?.user} fallback={
        <details class="auth-popover">
          <summary class="quiet-button">
            <span class="status-dot" aria-hidden="true" />
            Guest
          </summary>
          <div class="popover-panel">
            <strong>Read freely. Save as owner.</strong>
            <p>Guest answers stay in memory and disappear when this page closes.</p>
            <Show when={me()?.authConfigured} fallback={
              <p class="microcopy">Owner OAuth is not configured on this deployment yet.</p>
            }>
              <button disabled={busy()} onClick={() => signIn('github')}>Continue with GitHub</button>
              <button disabled={busy()} onClick={() => signIn('google')}>Continue with Google</button>
            </Show>
          </div>
        </details>
      }>
        {(user) => (
          <details class="auth-popover">
            <summary class="quiet-button owner-chip">
              <span class="status-dot saved" aria-hidden="true" />
              {user().name}
            </summary>
            <div class="popover-panel">
              <a href="/dashboard">Dashboard</a>
              <a href="/settings">Settings & export</a>
              <button disabled={busy()} onClick={signOut}>Sign out</button>
            </div>
          </details>
        )}
      </Show>
    </div>
  );
}
