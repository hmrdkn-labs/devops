export type Profile = 'absent' | 'wrong-key' | 'wrong-value' | 'wrong-effect' | 'equal' | 'exists' | 'any-effect' | 'all-keys';
export interface Toleration { key: string; operator: 'Equal' | 'Exists'; value?: string; effect: string }
export interface Config { profile: Profile; tainted: boolean; cpuFits: boolean; alternate: boolean }
export const initialConfig: Config = { profile: 'absent', tainted: true, cpuFits: true, alternate: false };
export const profiles: Record<Profile, { label: string; toleration?: Toleration }> = {
  absent: { label: 'Absent toleration' },
  'wrong-key': { label: 'Wrong key', toleration: { key: 'team', operator: 'Equal', value: 'batch', effect: 'NoSchedule' } },
  'wrong-value': { label: 'Wrong value', toleration: { key: 'dedicated', operator: 'Equal', value: 'web', effect: 'NoSchedule' } },
  'wrong-effect': { label: 'Wrong effect', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: 'NoExecute' } },
  equal: { label: 'Matching Equal', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: 'NoSchedule' } },
  exists: { label: 'Matching Exists', toleration: { key: 'dedicated', operator: 'Exists', effect: 'NoSchedule' } },
  'any-effect': { label: 'Matching empty effect', toleration: { key: 'dedicated', operator: 'Equal', value: 'batch', effect: '' } },
  'all-keys': { label: 'Matching empty key + Exists', toleration: { key: '', operator: 'Exists', effect: 'NoSchedule' } },
};
export function matches(t: Toleration | undefined): boolean {
  return !!t && (t.effect === '' || t.effect === 'NoSchedule') &&
    (t.key === 'dedicated' || (t.key === '' && t.operator === 'Exists')) &&
    (t.operator === 'Exists' || t.value === 'batch');
}
export function evaluate(config: Config) {
  const taintPass = !config.tainted || matches(profiles[config.profile].toleration);
  const cpuAvailable = config.cpuFits ? 800 : 400;
  const capacityPass = cpuAvailable >= 600;
  const eligibleA = taintPass && capacityPass;
  // Deliberately fixed illustrative scores, independent of toleration presence.
  const selected = config.alternate ? 'node-b' : eligibleA ? 'node-a' : null;
  return { taintPass, capacityPass, cpuAvailable, eligibleA, selected,
    stopA: !taintPass ? -68 : !capacityPass ? 8 : 96 };
}
