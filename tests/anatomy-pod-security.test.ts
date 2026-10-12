import { describe, expect, it } from 'vitest';
import {
  admit, agentOf, apply, cacheWrite, capsView, defaultDraft, editDraft, editNamespace, effectiveUid, initialState, isHighlighted,
  manifestLines, noNewPrivs, probeCache, removeAgent, retestOf, retestPods, runtimeReadout, seccompEffective, specFacts, startAgent,
  violations, type Namespace, type Spec, type State,
} from '../src/components/anatomy/pod-security/model';

const spec = (patch: Partial<Spec>): Spec => ({ ...defaultDraft, ...patch });
const labels = (patch: Partial<Namespace>): Namespace => ({ enforce: 'none', audit: 'none', warn: 'none', ...patch });

/** A fixture state with the given draft and namespace labels; the legacy Pod stays as loaded. */
function withDraft(patch: Partial<Spec>, ns: Partial<Namespace> = {}): State {
  const s = initialState();
  return { ...s, ns: { ...s.ns, ...ns }, draft: { ...s.draft, ...patch } };
}

describe('Pod Security Standards boundaries', () => {
  it('baseline allows an absent seccomp profile and NET_BIND_SERVICE, but refuses NET_ADMIN, privileged and Unconfined', () => {
    expect(violations(spec({ seccomp: 'unset', caps: 'drop-all-bind' }), 'baseline')).toEqual([]);
    expect(violations(spec({ caps: 'add-net-admin' }), 'baseline').map((v) => v.field)).toEqual(['capabilities.add']);
    expect(violations(spec({ privileged: true }), 'baseline').map((v) => v.field)).toEqual(['privileged']);
    expect(violations(spec({ seccomp: 'Unconfined' }), 'baseline').map((v) => v.field)).toEqual(['seccompProfile.type']);
  });

  it('restricted requires an explicit RuntimeDefault profile, not an absent one', () => {
    expect(violations(spec({ seccomp: 'unset' }), 'restricted').map((v) => v.field)).toContain('seccompProfile.type');
    expect(violations(spec({ seccomp: 'RuntimeDefault' }), 'restricted')).toEqual([]);
  });

  it('restricted requires allowPrivilegeEscalation to be exactly false, and drop ALL', () => {
    expect(violations(spec({ allowPrivilegeEscalation: 'unset' }), 'restricted').map((v) => v.field)).toContain('allowPrivilegeEscalation');
    expect(violations(spec({ allowPrivilegeEscalation: 'false' }), 'restricted')).toEqual([]);
    expect(violations(spec({ caps: 'default' }), 'restricted').map((v) => v.field)).toContain('capabilities.drop');
  });

  it('restricted refuses runAsUser 0 and admits an unset runAsUser, because admission cannot see the image USER', () => {
    expect(violations(spec({ runAsUser: '0' }), 'restricted').map((v) => v.field)).toContain('runAsUser');
    expect(admit(spec({ runAsUser: 'unset', imageUser: '0' }), labels({ enforce: 'restricted' })).outcome).toBe('accepted');
  });

  it('restricted does not require a read-only root filesystem or any volume', () => {
    const plain = spec({ readOnlyRootFilesystem: false, emptyDirCache: false });
    expect(admit(plain, labels({ enforce: 'restricted' })).outcome).toBe('accepted');
  });

  it('the restricted-compliant default draft is accepted and produces no warning at warn restricted', () => {
    const outcome = admit(defaultDraft, labels({ enforce: 'restricted', warn: 'restricted' }));
    expect(outcome).toMatchObject({ outcome: 'accepted', warnings: [] });
  });

  it('none and privileged levels never refuse a Pod', () => {
    const worst = spec({ privileged: true, caps: 'add-net-admin', seccomp: 'Unconfined', runAsUser: '0', allowPrivilegeEscalation: 'unset' });
    expect(admit(worst, labels({ enforce: 'none' })).outcome).toBe('accepted');
    expect(admit(worst, labels({ enforce: 'privileged' })).outcome).toBe('accepted');
  });

  it('refuses privileged together with allowPrivilegeEscalation false as invalid, before any namespace level', () => {
    const inconsistent = spec({ privileged: true, allowPrivilegeEscalation: 'false' });
    expect(admit(inconsistent, labels({ enforce: 'none' })).outcome).toBe('invalid');
    expect(admit(inconsistent, labels({ enforce: 'restricted' })).outcome).toBe('invalid');
  });

  it('warn and audit never refuse; they return warnings and audit annotations', () => {
    const outcome = admit(spec({ runAsNonRoot: false }), labels({ enforce: 'none', warn: 'restricted', audit: 'restricted' }));
    expect(outcome.outcome).toBe('accepted');
    if (outcome.outcome !== 'accepted') throw new Error('expected acceptance');
    expect(outcome.warnings.map((v) => v.field)).toContain('runAsNonRoot');
    expect(outcome.audits.map((v) => v.field)).toContain('runAsNonRoot');
  });
});

describe('kubelet start: admission and runtime are separate checks', () => {
  it('a restricted-admitted Pod whose image runs as root is refused at container start, not at admission', () => {
    let s = apply(withDraft({ runAsNonRoot: true, runAsUser: 'unset', imageUser: '0' }, { enforce: 'restricted' }));
    expect(agentOf(s)?.container).toBe('waiting');
    s = startAgent(s);
    expect(agentOf(s)).toMatchObject({ pull: 'ok', container: 'refused' });
  });

  it('runAsUser 1000 lets the same Pod run, as UID 1000', () => {
    let s = apply(withDraft({ runAsNonRoot: true, runAsUser: '1000', imageUser: '0' }, { enforce: 'restricted' }));
    s = startAgent(s);
    expect(agentOf(s)?.container).toBe('running');
    expect(effectiveUid(agentOf(s)!.spec)).toBe(1000);
  });

  it('an image USER of 1000 gives UID 1000 when runAsUser is unset', () => {
    expect(effectiveUid(spec({ runAsUser: 'unset', imageUser: '1000' }))).toBe(1000);
  });

  it('without runAsNonRoot, a root image starts as UID 0 and nothing refuses it', () => {
    let s = apply(withDraft({ runAsNonRoot: false, runAsUser: 'unset', imageUser: '0' }));
    s = startAgent(s);
    expect(agentOf(s)).toMatchObject({ container: 'running' });
    expect(effectiveUid(agentOf(s)!.spec)).toBe(0);
  });

  it('a missing imagePullSecret fails the pull, and the container never starts or is refused', () => {
    let s = apply(withDraft({ pullSecret: false }));
    s = startAgent(s);
    expect(agentOf(s)).toMatchObject({ pull: 'failed', container: 'waiting' });
    expect(startAgent(s)).toBe(s);
  });
});

describe('write probe decisions', () => {
  it('an emptyDir volume is writable whatever the root filesystem flag or UID', () => {
    expect(cacheWrite(spec({ emptyDirCache: true, readOnlyRootFilesystem: true, runAsUser: '1000' })).ok).toBe(true);
  });

  it('without a volume, a read-only root filesystem denies even UID 0', () => {
    expect(cacheWrite(spec({ emptyDirCache: false, readOnlyRootFilesystem: true, runAsUser: '0' }))).toMatchObject({ ok: false, decidedBy: 'readOnlyRootFilesystem' });
  });

  it('without a volume and with a writable root, a non-root UID is denied by image file permissions', () => {
    expect(cacheWrite(spec({ emptyDirCache: false, readOnlyRootFilesystem: false, runAsUser: '1000' }))).toMatchObject({ ok: false, decidedBy: 'permissions' });
    expect(cacheWrite(spec({ emptyDirCache: false, readOnlyRootFilesystem: false, runAsUser: '0' })).ok).toBe(true);
  });

  it('a probe with no running container changes nothing', () => {
    const s = apply(withDraft({}));
    expect(probeCache(s)).toBe(s);
  });
});

describe('namespace relabel never changes an existing Pod', () => {
  it('enforce restricted re-tests the legacy privileged Pod and reports a warning, but leaves it running and unchanged', () => {
    const s0 = initialState();
    const retests = retestPods(s0.pods, 'restricted');
    expect(retests.map((item) => item.pod.name)).toEqual(['legacy-agent']);
    const s1 = editNamespace(s0, 'enforce', 'restricted');
    expect(s1.pods).toEqual(s0.pods);
    expect(s1.pods[0]).toMatchObject({ uid: 1, container: 'running' });
  });

  it('audit and warn changes leave every Pod as it was', () => {
    const s0 = apply(withDraft({}));
    const s1 = editNamespace(editNamespace(s0, 'audit', 'restricted'), 'warn', 'baseline');
    expect(s1.pods).toEqual(s0.pods);
  });

  it('a Pod that already violates a newly enforced level still runs; only the next create is refused', () => {
    const s = editNamespace(initialState(), 'enforce', 'restricted');
    const refused = apply(editDraft(s, { runAsNonRoot: false }, 'runAsNonRoot', 'runAsNonRoot set to false'));
    expect(agentOf(refused)).toBeUndefined();
    expect(refused.pods.map((pod) => pod.name)).toEqual(['legacy-agent']);
  });
});

describe('Pod identity and immutable spec', () => {
  it('delete and re-apply gives a new UID under the same name', () => {
    let s = apply(withDraft({}));
    const first = agentOf(s)!.uid;
    s = apply(removeAgent(s));
    expect(agentOf(s)!.name).toBe('agent');
    expect(agentOf(s)!.uid).toBeGreaterThan(first);
  });

  it('editing the draft after apply does not change the applied Pod spec', () => {
    const s0 = apply(withDraft({ runAsUser: 'unset' }));
    const s1 = editDraft(s0, { runAsUser: '1000' }, 'runAsUser', 'runAsUser set to 1000');
    expect(agentOf(s1)!.spec.runAsUser).toBe('unset');
    expect(s1.draft.runAsUser).toBe('1000');
  });

  it('apply while an agent Pod exists creates nothing', () => {
    const s = apply(withDraft({}));
    expect(apply(s)).toBe(s);
  });

  it('a refused request creates no Pod object and leaves the draft for another attempt', () => {
    const s = apply(withDraft({ runAsNonRoot: false }, { enforce: 'restricted' }));
    expect(agentOf(s)).toBeUndefined();
    expect(s.admission?.outcome).toBe('rejected');
    expect(s.draft.runAsNonRoot).toBe(false);
  });
});

describe('capabilities, no_new_privs and seccomp as the runtime sees them', () => {
  it('drop ALL plus NET_BIND_SERVICE leaves exactly that capability', () => {
    expect(capsView('drop-all-bind')).toEqual({ defaultSet: false, allDropped: true, extra: 'NET_BIND_SERVICE' });
  });

  it('allowPrivilegeEscalation false sets no_new_privs, and privileged never does', () => {
    expect(noNewPrivs(spec({ allowPrivilegeEscalation: 'false' }))).toBe(true);
    expect(noNewPrivs(spec({ allowPrivilegeEscalation: 'unset' }))).toBe(false);
  });

  it('a privileged container runs Unconfined even when RuntimeDefault is requested', () => {
    expect(seccompEffective(spec({ privileged: true, seccomp: 'RuntimeDefault' }))).toBe('Unconfined');
    expect(seccompEffective(spec({ seccomp: 'unset' }))).toBe('Unconfined');
  });
});

describe('manifest follows the model and highlights the last interaction', () => {
  it('shows an unset runAsUser as a comment carrying its field, and as a line once set', () => {
    const unset = manifestLines(initialState()).find((line) => line.field === 'runAsUser');
    expect(unset?.text.trim().startsWith('#')).toBe(true);
    const set = manifestLines(withDraft({ runAsUser: '1000' })).find((line) => line.field === 'runAsUser');
    expect(set?.text.trim()).toBe('runAsUser: 1000');
  });

  it('after apply, namespace labels and the admitted security fields are highlighted', () => {
    const s = apply(withDraft({}, { enforce: 'baseline' }));
    const lines = manifestLines(s);
    expect(lines.filter((line) => isHighlighted(s, line)).map((line) => line.field)).toContain('enforce');
    expect(lines.filter((line) => isHighlighted(s, line)).map((line) => line.field)).toContain('runAsNonRoot');
  });

  it('a probe highlights the volume and root-filesystem fields it read', () => {
    const s = probeCache(startAgent(apply(withDraft({ runAsUser: '1000' }))));
    const highlighted = manifestLines(s).filter((line) => isHighlighted(s, line)).map((line) => line.field);
    expect(highlighted).toEqual(expect.arrayContaining(['emptyDir', 'readOnlyRootFilesystem', 'runAsUser']));
  });
});

const highlighted = (s: State) => new Set(manifestLines(s).filter((line) => isHighlighted(s, line)).map((line) => line.field));

describe('each refusal highlights only what it depended on', () => {
  it('API validation highlights privileged and allowPrivilegeEscalation, and nothing else', () => {
    expect(highlighted(apply(withDraft({ privileged: true })))).toEqual(new Set(['privileged', 'allowPrivilegeEscalation']));
  });

  it('an enforce refusal highlights the enforce label and the violating fields only', () => {
    const s = apply(withDraft({ privileged: true, allowPrivilegeEscalation: 'unset' }, { enforce: 'restricted' }));
    expect(highlighted(s)).toEqual(new Set(['enforce', 'privileged', 'allowPrivilegeEscalation']));
  });

  it('a kubelet refusal highlights runAsNonRoot, the absent runAsUser and the image USER', () => {
    expect(highlighted(startAgent(apply(withDraft({}))))).toEqual(new Set(['runAsNonRoot', 'runAsUser', 'imageUser']));
  });

  it('a failed pull highlights the imagePullSecrets line only', () => {
    expect(highlighted(startAgent(apply(withDraft({ pullSecret: false }))))).toEqual(new Set(['imagePullSecrets']));
  });

  it('a relabel highlights the enforce label only', () => {
    expect(highlighted(editNamespace(initialState(), 'enforce', 'restricted'))).toEqual(new Set(['enforce']));
  });
});

describe('runtime readout says applied only after the container runs', () => {
  it('no row is applied before Start, and a refused container applies nothing', () => {
    expect(runtimeReadout(initialState()).every((row) => !row.applied)).toBe(true);
    expect(runtimeReadout(startAgent(apply(withDraft({})))).every((row) => !row.applied)).toBe(true);
  });

  it('every row is applied once the container runs, and the UID row shows the effective UID', () => {
    const rows = runtimeReadout(startAgent(apply(withDraft({ runAsUser: '1000' }))));
    expect(rows.every((row) => row.applied)).toBe(true);
    expect(rows.find((row) => row.label === 'Effective UID')?.value).toBe('1000');
  });

  it('a deleted agent has no applied rows', () => {
    expect(runtimeReadout(removeAgent(startAgent(apply(withDraft({ runAsUser: '1000' }))))).some((row) => row.applied)).toBe(false);
  });
});

describe('an enforce relabel keeps the warned Pod running and records why', () => {
  it('names the fields behind the warning for the legacy Pod, and the Pod is untouched', () => {
    const s = editNamespace(initialState(), 'enforce', 'restricted');
    expect(retestOf(s, 1)?.fields).toEqual(expect.arrayContaining(['privileged', 'runAsNonRoot']));
    expect(s.pods[0]).toMatchObject({ uid: 1, container: 'running' });
  });

  it('a relabel to none clears the warning record', () => {
    expect(retestOf(editNamespace(editNamespace(initialState(), 'enforce', 'restricted'), 'enforce', 'none'), 1)).toBeNull();
  });
});

describe('ledger facts keep unset and false apart', () => {
  it('the legacy Pod shows privileged yes and runAsUser 0', () => {
    const facts = Object.fromEntries(specFacts(initialState().pods[0]!.spec).map((fact) => [fact.label, fact.value]));
    expect(facts.privileged).toBe('yes');
    expect(facts.runAsUser).toBe('0');
  });

  it('an unset runAsUser is shown with the image USER it falls back to', () => {
    const runAsUser = specFacts(spec({ runAsUser: 'unset', imageUser: '1000' })).find((fact) => fact.label === 'runAsUser');
    expect(runAsUser?.value).toBe('unset (image USER 1000)');
  });
});
