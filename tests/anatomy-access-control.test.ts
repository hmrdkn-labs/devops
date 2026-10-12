import { describe, expect, it } from 'vitest';
import {
  evaluate, gateStates, initialConfig, liftOf, podLines, rbacLines, readKeys, restrictedViolations, stages, stateSymbol,
  type Config, type GateState,
} from '../src/components/anatomy/access-control/model';

const request = (overrides: Partial<Config>): Config => ({ ...initialConfig, ...overrides });

describe('authentication stops before any permission is evaluated', () => {
  it('an expired token stops at authentication and no later check runs', () => {
    expect(evaluate(request({ caller: 'expired-token' }))).toMatchObject({
      authn: 'fail', binding: 'unreached', rule: 'unreached', validate: 'unreached', persisted: false, stop: 'authn',
    });
  });

  it('an authentication stop reads no manifest line, because the credential is not in either manifest', () => {
    expect(readKeys(evaluate(request({ caller: 'expired-token' }))).size).toBe(0);
  });
});

describe('RBAC denies by default: a grant must name the subject, then the verb and resource', () => {
  it('an authenticated user without a binding is denied at the subject check', () => {
    expect(evaluate(request({ caller: 'user-alice' }))).toMatchObject({ authn: 'pass', binding: 'fail', rule: 'unreached', stop: 'binding' });
  });

  it('a bound ServiceAccount without a matching verb and resource is denied at the rule check', () => {
    expect(evaluate(request({ operation: 'get-secret' }))).toMatchObject({ binding: 'pass', rule: 'fail', validate: 'unreached', stop: 'rule' });
  });

  it('removing the RoleBinding denies a ServiceAccount that was otherwise allowed', () => {
    expect(evaluate(request({ roleBinding: false }))).toMatchObject({ binding: 'fail', stop: 'binding' });
  });
});

describe('admission runs only after authorization and is independent of it', () => {
  it('an authorized Pod that violates the namespace policy is rejected by admission, not RBAC', () => {
    const result = evaluate(request({ podProfile: 'minimal' }));
    expect(result).toMatchObject({ binding: 'pass', rule: 'pass', validate: 'fail', persisted: false, stop: 'validate' });
    expect(result.violations).toEqual(expect.arrayContaining(['runAsNonRoot must be true', 'allowPrivilegeEscalation must be false']));
  });

  it('a privileged container is not repaired by the mutating step', () => {
    const result = evaluate(request({ podProfile: 'privileged', mutatingDefaults: true }));
    expect(result.violations).toContain('privileged: true');
    expect(result.persisted).toBe(false);
    expect(result.context.privileged).toBe(true);
  });

  it('mutation fills only unset fields, and validation sees the mutated object', () => {
    const result = evaluate(request({ podProfile: 'minimal', mutatingDefaults: true }));
    expect(result.mutated).toEqual(['runAsNonRoot', 'allowPrivilegeEscalation', 'seccompRuntimeDefault', 'capabilitiesDropAll']);
    expect(result).toMatchObject({ validate: 'pass', persisted: true, stop: null });
    expect(evaluate(request({ mutatingDefaults: true })).mutated).toEqual([]);
  });

  it('without an enforce label the namespace does not check a restricted violation', () => {
    expect(evaluate(request({ podProfile: 'minimal', enforceRestricted: false }))).toMatchObject({ validate: 'off', persisted: true });
  });
});

describe('reads never reach admission', () => {
  it('no read request can be persisted or validated under the fixture role', () => {
    for (const caller of ['sa-deployer', 'user-alice', 'expired-token'] as const) {
      for (const roleBinding of [true, false]) {
        const result = evaluate(request({ caller, roleBinding, operation: 'get-secret' }));
        expect(result.persisted).toBe(false);
        expect(result.validate).toBe('unreached');
      }
    }
  });
});

describe('gate states, symbols and lift', () => {
  it('shows no gate result before a send', () => {
    expect(gateStates(null)).toEqual({ authn: 'idle', binding: 'idle', rule: 'idle', validate: 'idle' });
  });

  it('a check that was not enforced never lifts like a passed check', () => {
    expect(liftOf('pass')).toBe('up');
    expect(liftOf('off')).toBe('half');
    expect(liftOf('fail')).toBe('down');
    expect(liftOf('unreached')).toBe('down');
    expect(liftOf('idle')).toBe('down');
  });

  it('every gate state has its own symbol, so no state is shown by colour alone or shared with another', () => {
    const symbols = Object.values(stateSymbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('persisted implies every reached check passed, and rejected requests always name a stop', () => {
    for (const caller of ['sa-deployer', 'user-alice', 'expired-token'] as const)
      for (const operation of ['create-pod', 'get-secret'] as const)
        for (const podProfile of ['hardened', 'minimal', 'privileged'] as const)
          for (const roleBinding of [true, false]) for (const enforceRestricted of [true, false]) for (const mutatingDefaults of [true, false]) {
            const result = evaluate({ caller, operation, podProfile, roleBinding, enforceRestricted, mutatingDefaults });
            if (result.persisted) {
              expect([result.authn, result.binding, result.rule]).toEqual(['pass', 'pass', 'pass']);
              expect(['pass', 'off']).toContain(result.validate);
              expect(result.stop).toBeNull();
            } else {
              expect(result.stop).not.toBeNull();
            }
          }
  });

  it('each gate blade and its strip card come from the same evaluation', () => {
    const toneOf: Record<GateState, string> = { pass: 'pass', fail: 'fail', unreached: 'info', off: 'info', idle: 'wait' };
    for (const caller of ['sa-deployer', 'user-alice', 'expired-token'] as const)
      for (const operation of ['create-pod', 'get-secret'] as const)
        for (const podProfile of ['hardened', 'minimal', 'privileged'] as const)
          for (const roleBinding of [true, false]) for (const enforceRestricted of [true, false]) {
            const config = { caller, operation, podProfile, roleBinding, enforceRestricted, mutatingDefaults: false };
            const ev = evaluate(config);
            const states = gateStates(ev);
            const cards = stages(config, ev);
            for (const id of ['authn', 'binding', 'rule', 'validate'] as const) {
              expect(cards.find((card) => card.id === id)?.tone).toBe(toneOf[states[id]]);
            }
          }
  });
});

describe('what each send reads, so the manifests highlight the right lines', () => {
  it('the subject check reads the RoleBinding subjects, not the Pod', () => {
    expect(readKeys(evaluate(request({ caller: 'user-alice' })))).toEqual(new Set(['sa', 'rb']));
  });

  it('a Role rule failure reads the Role but not the namespace label or the Pod', () => {
    expect(readKeys(evaluate(request({ operation: 'get-secret' })))).toEqual(new Set(['sa', 'rb', 'role']));
  });

  it('a validated Pod reads its securityContext and the namespace label', () => {
    const keys = readKeys(evaluate(request({ podProfile: 'minimal' })));
    expect(keys.has('ns')).toBe(true);
    expect(keys.has('ctx')).toBe(true);
    expect(keys.has('ctx:runAsNonRoot')).toBe(true);
  });

  it('the Pod serviceAccountName is not read by any modelled check', () => {
    const config = request({});
    const ev = evaluate(config);
    const line = podLines(config, ev, readKeys(ev)).find((candidate) => candidate.text.includes('serviceAccountName'));
    expect(line?.highlight).toBe(false);
  });

  it('a rejected Minimal Pod highlights the absent securityContext that validation read', () => {
    const config = request({ podProfile: 'minimal' });
    const ev = evaluate(config);
    const line = podLines(config, ev, readKeys(ev)).find((candidate) => candidate.text.includes('securityContext: absent'));
    expect(line?.highlight).toBe(true);
  });

  it('an authentication stop highlights nothing in the Pod manifest', () => {
    const config = request({ caller: 'expired-token' });
    const ev = evaluate(config);
    expect(podLines(config, ev, readKeys(ev)).some((candidate) => candidate.highlight)).toBe(false);
  });
});

describe('the Pod body shows what was submitted, even when an earlier check stopped the request', () => {
  it('an expired-token send still shows the hardened securityContext as submitted', () => {
    const config = request({ caller: 'expired-token' });
    const lines = podLines(config, evaluate(config));
    expect(lines.some((line) => line.text.includes('runAsNonRoot: true'))).toBe(true);
  });

  it('a read has no Pod request body to show', () => {
    expect(podLines(request({ operation: 'get-secret' }), null)).toHaveLength(1);
  });
});

describe('restricted checks and the RBAC manifest', () => {
  it('the hardened profile passes every modelled restricted check', () => {
    expect(restrictedViolations(evaluate(initialConfig).context)).toEqual([]);
  });

  it('shows the RoleBinding object in the RBAC manifest only while the binding exists', () => {
    const kindLines = (config: Config) => rbacLines(config).filter((line) => line.text === 'kind: RoleBinding').length;
    expect(kindLines(request({ roleBinding: true }))).toBe(1);
    expect(kindLines(request({ roleBinding: false }))).toBe(0);
  });
});
