## The big picture

A release changes two things that people often treat as one. The **rollout** decides which ReplicaSet creates and removes Pods. The **release strategy** decides which Pods the Service sends requests to while you judge the new version. A rolling update changes both at once. Blue-green and canary keep the old and new Pods side by side, and the Service decides who gets traffic.

Rollback is not time travel. `kubectl rollout undo` makes an earlier template the target again, as a new rollout. It does not restore old Pods. The old ReplicaSet is scaled back up, its surviving Pods are kept, and any missing Pods are created with new UIDs.

Who sets what: you edit `spec.template` (a new revision) or `spec.replicas`; the Deployment controller creates ReplicaSets and sets their targets; each ReplicaSet controller creates or deletes Pods; the kubelet and probes set the `Ready` condition; and the Service selector, through EndpointSlices, decides which Ready Pods receive requests.

The bench is an **authored fixture**, not a cluster recording. Pod identities `p1`, `p2` and so on stand in for UIDs. The ReplicaSets are called RS-v1 and RS-v2 for readability. Nothing on the page submits a Kubernetes request.

## Who owns what

- **You** choose the release strategy: a template change, an undo, a selector switch, or a canary replica count.
- **The Deployment controller** owns the rolling rules, the ReplicaSets, the revision counter and the `Progressing` condition. It does not decide which Pods receive traffic.
- **A ReplicaSet controller** keeps its Pod count at its target, using its own template. Readiness is not its decision.
- **The kubelet and readiness probe** set each Pod's `Ready` condition. Ready means the probe passed. It says nothing about whether answers are correct.
- **The Service** sends requests only to Ready Pods that match its selector. It does not know which version a Pod runs. Labels decide membership.

`strategy.type` accepts only `Recreate` and `RollingUpdate`. Blue-green and canary are not Deployment strategy types. They are patterns built from two objects and a Service selector.

## How it works

### Revision history and undo

Each template change creates a ReplicaSet, or reuses one, and gives it the next revision number. Old ReplicaSets with zero replicas stay as rollback targets, up to `revisionHistoryLimit` (default 10). Set it to 0 and a rollout cannot be undone.

In the rolling bench, **Undo rollout** sets the template back to app:v1. RS-v1 becomes revision 3, and its target and Ready Pods stay as they were. The figure reports "no Pod created" when RS-v1 still holds its Pods. If RS-v1 was scaled to 0 by a completed rollout, the next Step creates Pods with new UIDs. The Deployment's revision counter moves forward, so the rolled-back ReplicaSet no longer carries its old number.

The fixture has two images. After a completed rollout, **Update template** stays disabled, because the template is already app:v2. **Reset / replay** returns to the app:v1 start, from which you can run another release.

### A stalled rollout waits; it does not roll back

Choose **Fails readiness** for the app:v2 build, press **Update template to app:v2**, and step. The new Pod p4 is created and stays Not Ready. With `maxUnavailable: 0`, the Deployment will not remove an old Ready Pod while the remaining Ready count would fall below desired 3. The rollout waits. Three old Pods serve requests, and p4 is not an endpoint.

After `progressDeadlineSeconds` (600 s by default) with no progress, the Deployment sets the `Progressing` condition to `False` with reason `ProgressDeadlineExceeded`. That is the whole reaction. Kubernetes takes no action on a stalled Deployment except to report it. The fixture button jumps the clock to make this visible. Undo is your decision, and `kubectl rollout status` only waits and reports.

### Ready is not correct

Choose **Ready, returns errors**. The new Pods pass readiness, so the Service sends them requests in proportion to their share of Ready endpoints. The failing share in the traffic panel equals the app:v2 share. A readiness probe checks only what it tests; a shallow probe lets a build that returns wrong answers stay Ready and keep receiving traffic.

### Blue-green: a selector switch

Blue is the Deployment `web-blue`. Its selector and template labels are `app: web` and `version: blue`, and it runs app:v1 Pods. Green is a second Deployment, `web-green`, with `app: web` and `version: green`, running app:v2 Pods. A Deployment's selector cannot change after creation, so the two versions need their own labels from the start. The Service selector is `app: web, version: blue`. Deploying green changes nothing for users, because green Pods do not match the selector. Switching the selector to `version: green` moves all requests to green at once. Switching back moves them to blue again, because blue Pods were never deleted.

A switch with no Ready green Pod leaves the Service without endpoints, and requests fail. Blue-green costs double capacity while both sets run.

### Canary: a share set by Ready Pod counts

Two Deployments carry a shared label `app: web` and differ by `track`. `web-stable` selects `app: web` and `track: stable`; `web-canary` selects `app: web` and `track: canary`. The Service selects only `app: web`, so it sends requests to Ready Pods of both. With three stable Pods and one canary Pod, the canary receives about 25% of requests. The Kubernetes canary tutorial states the same ratio. The share follows Ready Pod counts, not a traffic weight. A canary Pod that is Not Ready receives nothing.

The `track` label is what keeps the two Deployments apart. If the stable Deployment selected only `app: web`, its selector would also match the canary Pods, and the two Deployments would overlap. Kubernetes warns that overlapping selectors can make controllers conflict. Each Deployment's selector must match only its own Pods.

Stopping a canary is a scale-down: set the canary's replicas to 0, and its Pods leave in later steps. Requests to a canary Pod still reach it until that Pod is deleted.

### Compare by blast radius

| Strategy | Pods that receive requests | Share exposed to a bad build | Rollback action |
| --- | --- | --- | --- |
| Rolling update | Ready Pods of both ReplicaSets, roughly by count | Share of new Ready Pods, which grows as the rollout moves | `kubectl rollout undo`, a new rollout back to a kept ReplicaSet |
| Blue-green | All blue Pods, then all green Pods after the selector switch | 100% at the moment of the switch | Selector back to blue, while blue still runs |
| Canary | Ready Pods of stable and canary, by count | The canary's share of Ready Pods | Scale the canary to 0, and its Pods are removed by its ReplicaSet |

A rolling update's blast radius is bounded twice: by `maxSurge` and `maxUnavailable`, which limit how many new Pods exist, and by readiness, which decides which of them get requests. A shallow probe makes the new share grow regardless of correctness, so the rollout's bound limits capacity, not harm. See [Ready is not correct](#ready-is-not-correct) above.

[Replica reconciliation](/anatomy/replica-reconciliation/) walks through surge and availability one event at a time. This page assumes that arithmetic and asks which Pods receive traffic.

## YAML example

This is the Deployment the bench's ManifestPanel shows at the start. It is minimal but valid, and the controls edit only the annotated fields.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  revisionHistoryLimit: 10
  progressDeadlineSeconds: 600
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: app
          image: registry.example.com/app:v1
```

- `spec.template.spec.containers[].image` is the only field that starts a revision. Changing it to `app:v2` is the template change; undo changes it back.
- `spec.revisionHistoryLimit: 10` keeps ten old ReplicaSets, which are the rollback targets.
- `spec.progressDeadlineSeconds: 600` is how long the Deployment waits without progress before it sets `Progressing` to `False`. It does not roll anything back.
- `maxSurge: 1` and `maxUnavailable: 0` are the rolling rules the bench applies.

In blue-green mode the panel shows the Service. Its two comment lines name the selectors of the two Deployments, and switching the selector highlights the `version` line:

```yaml
# web-blue selects app: web + version: blue; web-green selects app: web + version: green.
# This Service selector alone decides which of the two receives requests.
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
    version: blue
  ports:
    - port: 80
      targetPort: 8080
```

The blue Deployment carries the same labels in its selector and its template. Its selector is immutable, which is why blue and green are separate Deployments from the start:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      version: blue
  template:
    metadata:
      labels:
        app: web
        version: blue
    spec:
      containers:
        - name: app
          image: registry.example.com/app:v1
```

In canary mode the panel shows the canary Deployment. Its two comment lines name both Deployments' selectors. Setting replicas to 1 highlights the `replicas` line:

```yaml
# web-stable selects app: web + track: stable; web-canary selects app: web + track: canary.
# Service web selects app: web only, so Ready Pods of both are endpoints.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
      track: canary
  template:
    metadata:
      labels:
        app: web
        track: canary
    spec:
      containers:
        - name: app
          image: registry.example.com/app:v2
```

The stable Deployment is not shown in the panel. Its selector and template labels carry `track: stable`, with the same shape as the canary block but `replicas: 3` and the app:v1 image.

## Try these changes

1. **Stall, then wait out the deadline.** Keep the build on *Fails readiness*. Press *Update template to app:v2* and step until the ChangeReport says Waiting. Expect p4 Not Ready, three Ready old Pods, and 0% app:v2 share. *Let progress deadline pass* should show Stalled with ProgressDeadlineExceeded, and the Pods should not change.
2. **Undo the stall.** Press *Undo rollout*. Expect RS-v1 to take revision 3 (it was 1), no new Pod, and the ChangeReport to say RS-v2 becomes the old ReplicaSet. Step once: p4 is retired and Ready stays 3. The revision history reads revision 3 for RS-v1 and revision 2 for RS-v2.
3. **Undo after a completed rollout.** Keep the build healthy and step until the rollout reads Complete. Press *Undo rollout*: no Pod is created because RS-v1 has target 0. Step: RS-v1 creates a Pod with a new identity, not one of the retired ones.
4. **Blue-green with a bad build.** Choose blue-green and *Ready, returns errors*. Deploy green and step until p4 to p6 are Ready. Expect 0% app:v2 share, because the selector still matches blue. Switch to green: the share and the failing share both read 100%. Switch back: both return to 0%, and the blue Pods never changed.
5. **Canary share by counts.** Choose canary and set the canary replicas to 1, then step until it is Ready. Expect 25% app:v2 share and 25% failing with the bad build. Set the canary to 3 and step until all three are Ready: 3 of 6 endpoints, so 50%. Set it to 0 to abort.

## Misconceptions

- **"Rollback brings back the old Pods."** No. The old ReplicaSet is scaled up again and gets a new revision number. Pods it still holds are kept. Pods it does not hold are created with new UIDs.
- **"A Ready Pod is a correct Pod."** Ready is the probe's result. A build that returns errors can be Ready and still receive requests.
- **"A stalled rollout rolls itself back."** Kubernetes reports `ProgressDeadlineExceeded` and takes no further action. A higher-level tool or a person must undo it.
- **"Blue-green is a Deployment strategy type."** It is not. The Deployment API offers `Recreate` and `RollingUpdate`. Blue-green is two Deployments with a Service selector switch.
- **"Creating the green Deployment sends it traffic."** It does not. Only the Service selector decides which Ready Pods are endpoints.
- **"The stable Deployment can keep the selector `app: web`."** Not once a canary exists. The stable Deployment would also match the canary Pods, so the two would overlap. Its selector needs `track: stable`, as the canary's needs `track: canary`.
- **"A canary at 1 of 4 Pods gets exactly 25%."** The share is approximate. The fixture assumes an equal share per endpoint; real balancing is not an exact count.

## Safe read-only observation

In a cluster you are authorized to inspect, replace `demo`, `web` and `app=web` with your namespace, Deployment name and label:

```sh
kubectl get deployment web -n demo -o yaml
kubectl rollout history deployment/web -n demo
kubectl get rs -n demo -l app=web
kubectl get deployment web -n demo -o jsonpath='{.status.conditions[?(@.type=="Progressing")].reason}'
kubectl get svc web -n demo -o jsonpath='{.spec.selector}'
kubectl get endpointslices -n demo -l kubernetes.io/service-name=web
```

Read `spec.strategy`, `spec.progressDeadlineSeconds` and each ReplicaSet's revision annotation. The `Progressing` reason separates a rollout that is progressing from one that stalled. The Service selector and the EndpointSlices show which Pods match and which Ready Pods are endpoints. For a canary, list each Deployment's selector with `kubectl get deploy -n demo -l app=web -o custom-columns=NAME:.metadata.name,SELECTOR:.spec.selector.matchLabels` to confirm that the stable and canary selectors differ.

**Limit:** these are independent read-only snapshots, not a history of the rollout. `kubectl rollout history` shows recorded revisions; a `CHANGE-CAUSE` appears only if someone set it. None of these commands reports the share of live requests a Pod receives, or whether an answer is correct. Traffic shares in this page are fixture arithmetic. This page does not run these commands and does not claim their output was observed.

## Predict and transfer

Start from three replicas, `maxSurge: 1`, `maxUnavailable: 0`, and a new image whose Pods never become Ready.

- After ten minutes, how many old Ready Pods remain? What is the Deployment's `Progressing` reason, and does the Service send requests to the new Pod?
- After undo, which ReplicaSet holds the three Ready Pods, and which revision does it report? Does a new Pod get created?
- Canary with two stable Ready Pods and two canary Ready Pods: what share of requests should you expect, and what would change it?

Now transfer. A canary returns HTTP 500 only on one path, and its readiness probe checks `/healthz`, which passes. Which signal would show the failure: Pod readiness, endpoints, or request errors? Why does scaling the canary to 0 limit the damage, and why does it not fix the stable version's data? Name one thing you would check before deciding that the Deployment controller is broken.

## Assumptions and limits

The fixture assumes three replicas, `maxSurge: 1`, `maxUnavailable: 0`, and `progressDeadlineSeconds: 600`. The deadline is a clock jump, not elapsed time. Each readiness event is an explicit step. Termination is immediate, no autoscaler acts, and requests are shared equally among endpoints.

The rolling steps are simplified. A real controller can combine several events in one sync, and terminating Pods can still be visible during a rollout. The bench shows one Deployment and two ReplicaSets; a real Deployment can keep more history. Real controllers also scale the old ReplicaSet down quickly, while the bench holds the old Pods until a Step retires them so each change can be read.

Blue-green is shown as a pattern, not as an API feature. Kubernetes documents canary releases with a `track` label and replica ratios, and it leaves weighted traffic splitting to other components such as a Gateway implementation, a service mesh or a progressive-delivery controller. None of those is modelled here.

Ready counts do not prove the Service selects healthy endpoints, that external routing works, or that answers are correct. Revision numbers are annotations on ReplicaSets; the fixture shows them as labels.

## Authoritative sources

This page supports the course objectives [Deployment ownership and revisions](/learn/kubernetes-deployments-rollouts?mode=reference) (`fpp:kubernetes-deployments-rollouts/revision`) and [Release strategies and application debugging](/learn/cloud-native-release-debugging?mode=reference) (`fpp:cloud-native-release-debugging/strategy`). Exploring this fixture does not record evidence for those objectives.

Public documentation review, 2026-10-12. This is a documentation review, not a live-cluster observation. Original explanation and apparatus; no course assets or copied proprietary questions.

- [Kubernetes Deployments: revision history, rollback, progress deadline, immutable selector and canary note](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Managing Workloads: canary deployments with a track label](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments)
- [Kubernetes tutorial: Deploy a Release Using a Canary Deployment](https://kubernetes.io/docs/tutorials/stateless-application/canary-deployment/)
- [Kubernetes Service: selectors and endpoints that are ready](https://kubernetes.io/docs/concepts/services-networking/service/)
