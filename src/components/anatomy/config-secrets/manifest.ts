import { keyNameOf, objects, valueOf, type Spec, type Stored } from './model';

/** Fields the last interaction depends on; the panel highlights the lines carrying these tags. */
export type LineTag = 'source' | 'key' | 'optional' | 'delivery' | 'data-cm' | 'data-secret';
export interface Line { text: string; tag?: LineTag }

/** The Deployment template whose Pods the staged reference is written into. */
export function templateLines(spec: Spec): Line[] {
  const object = objects[spec.source];
  const lines: Line[] = [
    { text: 'apiVersion: apps/v1' },
    { text: 'kind: Deployment' },
    { text: 'metadata:' },
    { text: '  name: app' },
    { text: 'spec:' },
    { text: '  replicas: 1' },
    { text: '  selector:' },
    { text: '    matchLabels:' },
    { text: '      app: app' },
    { text: '  template:' },
    { text: '    metadata:' },
    { text: '      labels:' },
    { text: '        app: app' },
    { text: '    spec:' },
    { text: '      containers:' },
    { text: '        - name: app' },
    { text: '          image: registry.example/app:1.4.2' },
  ];
  if (spec.delivery === 'env') {
    const ref = spec.source === 'configmap' ? 'configMapKeyRef' : 'secretKeyRef';
    lines.push(
      { text: '          env:' },
      { text: `            - name: ${object.key}` },
      { text: '              valueFrom:' },
      { text: `                ${ref}:`, tag: 'source' },
      { text: `                  name: ${object.name}`, tag: 'source' },
      { text: `                  key: ${keyNameOf(spec)}`, tag: 'key' },
      { text: `                  optional: ${spec.optional}`, tag: 'optional' },
    );
    return lines;
  }
  lines.push({ text: '          volumeMounts:', tag: 'delivery' }, { text: '            - name: settings', tag: 'delivery' });
  if (spec.delivery === 'subpath') {
    lines.push({ text: `              mountPath: /etc/app/${object.file}`, tag: 'delivery' }, { text: `              subPath: ${object.file}`, tag: 'delivery' });
  } else {
    lines.push({ text: '              mountPath: /etc/app', tag: 'delivery' });
  }
  lines.push({ text: '              readOnly: true', tag: 'delivery' });
  const volume = spec.source === 'configmap'
    ? [{ text: '          configMap:', tag: 'source' as const }, { text: `            name: ${object.name}`, tag: 'source' as const }]
    : [{ text: '          secret:', tag: 'source' as const }, { text: `            secretName: ${object.name}`, tag: 'source' as const }];
  lines.push({ text: '      volumes:', tag: 'delivery' }, { text: '        - name: settings', tag: 'delivery' }, ...volume,
    { text: '            items:' }, { text: `              - key: ${keyNameOf(spec)}`, tag: 'key' }, { text: `                path: ${object.file}`, tag: 'delivery' },
    { text: `            optional: ${spec.optional}`, tag: 'optional' });
  return lines;
}

/** The stored objects. Secret data is base64: an encoding, not protection. */
export function storeLines(stored: Stored): Line[] {
  const cm = objects.configmap;
  const secret = objects.secret;
  return [
    { text: 'apiVersion: v1' },
    { text: 'kind: ConfigMap' },
    { text: 'metadata:' },
    { text: `  name: ${cm.name}` },
    { text: 'data:' },
    { text: `  ${cm.key}: ${valueOf('configmap', stored.configmap)}`, tag: 'data-cm' },
    { text: '---' },
    { text: 'apiVersion: v1' },
    { text: 'kind: Secret' },
    { text: 'metadata:' },
    { text: `  name: ${secret.name}` },
    { text: 'type: Opaque' },
    { text: 'data:' },
    { text: `  ${secret.key}: ${btoa(valueOf('secret', stored.secret))}`, tag: 'data-secret' },
  ];
}
