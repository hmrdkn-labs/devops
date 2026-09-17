import { Show, createResource, createSignal } from 'solid-js';
import { authClient } from '@/lib/auth-client';

interface Me {
  authenticated: boolean;
  authConfigured: boolean;
  user: { id: string; name: string; image?: string | null } | null;
}

export default function AuthMenu() {
  const [busy, setBusy] = createSignal(false);
  const [actionError, setActionError] = createSignal('');
  const [me, { refetch }] = createResource(() => typeof window !== 'undefined', async () => {
    const response = await fetch('/api/me', { credentials: 'include' });
    if (!response.ok) throw new Error('Account status could not be loaded.');
    return response.json() as Promise<Me>;
  });

  async function signIn(provider: 'google') {
    setBusy(true);
    setActionError('');
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: window.location.href });
      if (result.error) setActionError('Sign-in could not be started. Please try again.');
    } catch {
      setActionError('Sign-in could not be started. Please try again.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setActionError('');
    try {
      const result = await authClient.signOut();
      if (result.error) setActionError('Sign-out failed. Please try again.');
      else await refetch();
    } catch {
      setActionError('Sign-out failed. Please try again.');
    } finally { setBusy(false); }
  }

  return (
    <div class="auth-menu">
      <Show when={!me.error && me()?.authenticated && me()?.user} fallback={
        <details class="auth-popover">
          <summary class="quiet-button">
            <span class="status-dot" aria-hidden="true" />
            {/* SSR has no account result; only a resolved response establishes guest status. */}
            {!me.error && me()?.authenticated === false ? 'Guest' : 'Account'}
          </summary>
          <div class="popover-panel">
            <Show when={!me.loading && (me.error || me())} fallback={<p role="status">Checking account…</p>}>
              <Show when={!me.error} fallback={<><p role="status">Account status is unavailable. You can keep learning.</p><button disabled={me.loading} onClick={() => refetch()}>Retry account</button></>}>
                <strong>Read freely. Save as owner.</strong>
                <p>Guest answers stay in memory and disappear when this page closes.</p>
                <Show when={me()?.authConfigured} fallback={
                  <p class="microcopy">Owner OAuth is not configured on this deployment yet.</p>
                }>
                  <button disabled={busy()} onClick={() => signIn('google')}>Continue with Google</button>
                </Show>
              </Show>
            </Show>
            <Show when={actionError()}><p role="alert">{actionError()}</p></Show>
          </div>
        </details>
      }>
        {(user) => (
          <details class="auth-popover">
            <summary class="quiet-button owner-chip">
              <span class="status-dot saved" aria-hidden="true" />
              Account
            </summary>
            <div class="popover-panel">
              <strong class="account-name">{user().name}</strong>
              <a href="/dashboard">Progress</a>
              <a href="/settings">Settings & export</a>
              <button disabled={busy()} onClick={signOut}>Sign out</button>
              <Show when={actionError()}><p role="alert">{actionError()}</p></Show>
            </div>
          </details>
        )}
      </Show>
    </div>
  );
}
