# KCNA content coverage audit

2026-09-21 · inventory complete, targeted enrichment reviewed

## What this audit does and does not claim

This matrix checks the 32 units on the KCNA path for the existence of five
learning supports: a canonical explanation, a concrete example, a
misconception check, an independent unit question, and a later-review card.
It also counts module-filtered MCQs. Existence is not the same as correctness.

All 32 units have canonical prose. All 76 objectives appear in at least one
independent unit question and at least one review card. The path contains 165
unit questions and 212 review cards; the full MCQ set now contains 82 questions.
This pass source-reviewed the new Security, Storage, Service Mesh,
Fundamentals, and Resources questions. Other rows marked **inventory only**
were counted and sampled but were not recertified line by line.

`worked` means the article labels a worked case. `embedded` means a concrete
manifest, command, table, or request trace exists without that label. `gap`
means the canonical article still needs a clearer worked example even though
questions, cards, or visuals may exist. Objective coverage is written as
`objective: independent questions/review cards`.

## Objective coverage matrix

| Unit | Objectives | Example | Unit Q | Cards | MCQ | Objective question/card coverage | Review scope |
| --- | ---: | --- | ---: | ---: | ---: | --- | --- |
| kcna-domain-map | 2 | worked | 3 | 5 | 0 | domains 2/2; layers 2/3 | inventory only |
| ip-subnets | 2 | worked | 3 | 5 | 0 | address-prefix 3/4; local-or-routed 2/2 | inventory only |
| ports-sockets-dns | 2 | worked | 3 | 5 | 0 | socket-endpoint 3/3; dns-resolution 2/2 | inventory only |
| container-lifecycle | 2 | worked | 3 | 5 | 6 | create-start-stop 2/2; pid1-exit 2/3 | targeted source review |
| git-yaml-declarative | 2 | worked | 5 | 5 | 0 | versioned-intent 3/3; yaml-schema 3/2 | inventory only |
| kubernetes-control-loop | 2 | gap | 5 | 5 | 2 | api-state 4/2; reconciliation 4/3 | novice pilot MCQ reviewed; prose gap remains |
| kubernetes-manifests | 2 | embedded | 5 | 5 | 3 | object-shape 4/4; proof-boundary 3/1 | novice pilot MCQ reviewed |
| kubernetes-architecture-components | 2 | embedded | 5 | 5 | 6 | roles 4/4; request-path 3/1 | novice pilot MCQ reviewed |
| kcna-kubernetes-fundamentals-review | 2 | worked | 5 | 10 | 3 | ownership 2/5; runtime 4/5 | novice pilot MCQ reviewed |
| kubernetes-pod-model | 2 | worked | 5 | 5 | 2 | lifecycle 4/3; ownership 3/2 | novice pilot MCQ reviewed |
| pods-workloads | 2 | worked | 5 | 5 | 0 | pod-boundary 3/2; controller-choice 3/3 | inventory only |
| kubernetes-labels-replicasets | 2 | embedded | 5 | 5 | 3 | selection 4/3; reconciliation 3/2 | novice pilot MCQ reviewed |
| kubernetes-deployments-rollouts | 2 | embedded | 5 | 5 | 6 | ownership-chain 3/2; revision 5/3 | novice pilot MCQ reviewed |
| kubernetes-apply-live-state | 2 | worked | 5 | 5 | 3 | declarative 3/2; live-state 5/3 | inventory only |
| kubernetes-namespaces-scope | 2 | worked | 5 | 5 | 5 | scope 4/4; boundary 2/1 | novice pilot MCQ reviewed |
| kcna-kubernetes-resources-review | 2 | worked | 3 | 8 | 1 | ownership 2/4; api-objects 2/4 | inventory only |
| kubernetes-object-lexicon | 3 | embedded | 6 | 10 | 2 | object-choice 5/8; scope-group 3/2; schema-discovery 1/2 | novice pilot MCQ reviewed |
| kubernetes-resource-operations | 4 | embedded | 8 | 12 | 9 | command-intent 1/5; selectors-defaults 3/2; apply-state 1/2; scope-capacity 3/3 | inventory only; thin objectives recorded |
| services-dns-ingress | 3 | embedded | 7 | 7 | 6 | mesh-path 1/1; service-endpoints 4/4; external-routing 4/2 | targeted mesh review |
| kubernetes-networking-request-path | 2 | embedded | 6 | 7 | 4 | service-path 3/2; boundaries 5/5 | inventory only |
| scheduling-resources-health | 2 | worked | 5 | 5 | 4 | requests-limits 3/2; probe-semantics 3/3 | inventory only |
| kubernetes-scheduling-placement | 2 | gap | 5 | 5 | 7 | feasibility 3/2; policy 4/3 | article gap offset by reviewed scheduling prototype, not closed here |
| kcna-scheduling-review | 5 | worked | 10 | 17 | 12 | decision-path 6/5; placement-policy 3/6; resource-policy 1/2; node-ownership 1/3; scheduler-extension 4/4 | inventory only; two thin objectives recorded |
| config-secrets-storage | 2 | worked | 3 | 5 | 0 | config-secret 1/3; pv-topology 3/2 | inventory only; config-secret transfer gap |
| kubernetes-storage-lifecycle | 3 | worked | 6 | 7 | 7 | persistence 1/2; claim 4/3; failure-domain 4/2 | targeted source review |
| kubernetes-security-access | 4 | worked | 8 | 9 | 7 | client-trust 2/3; artifact-execution 1/1; request 4/4; workload 4/2 | targeted source review; artifact-execution remains thin |
| cloud-native-delivery-gitops | 2 | worked | 5 | 7 | 3 | pipeline 3/3; gitops 4/5 | inventory only |
| troubleshoot-process-to-pod | 2 | worked | 5 | 5 | 3 | evidence-ladder 5/3; cross-layer 4/2 | inventory only |
| cloud-native-release-debugging | 2 | worked | 5 | 5 | 4 | strategy 3/3; evidence 3/2 | inventory only |
| cloud-native-observability-signals | 3 | worked | 6 | 9 | 4 | reliability 2/2; signals 3/4; tools 4/4 | inventory only |
| cloud-native-architecture-principles | 3 | worked | 6 | 8 | 8 | mesh 1/1; properties 2/3; scale 4/4 | targeted mesh review; mesh unit question remains thin |
| cncf-ecosystem-community | 2 | worked | 4 | 6 | 1 | projects 4/4; community 2/2 | inventory only |

Misconception coverage was inventoried by looking for an explicit contrast in
objective-linked question prompts, model answers, critical points, or cards
(for example “not,” “distinguish,” “separate,” or “rather than”). Seventy-five
of 76 objectives have such a signal. `kubernetes-resource-operations` /
`command-intent` is the recorded exception: it has independent question and
card coverage, but needs a more explicit misconception-oriented transfer
check. This wording scan does not certify that each misconception is the most
important one. The new 19 MCQs all include per-choice rationales and use
concept, scenario, and kubectl forms.

## Targeted enrichment

| Displayed practice module | Before | After | Added decisions |
| --- | ---: | ---: | --- |
| Kubernetes Fundamentals | 6 | 10 | image/container/process; API-to-controller-to-scheduler-to-kubelet; CRI boundary; restart versus Pod replacement |
| Kubernetes Resources | 14 | 18 | selector/template agreement; scale versus rollout; schema discovery; namespace scope |
| Security | 3 | 7 | ServiceAccount identity versus RBAC; registry credentials versus securityContext; admission/process/network boundaries; exact `auth can-i` check |
| Storage | 2 | 6 | RWO versus RWOP; topology-aware binding; reclaim policy; PVC evidence ladder |
| Service Mesh | 3 | 6 | routing objects versus proxy execution; gateway versus workload proxy; telemetry proof limits |

These are the counts learners see in the practice module filters. The UI uses
an explicit `course_module` when present and otherwise derives a module from a
question's `unit_ids`; the before counts therefore include both kinds of
attribution. The 19 new questions use explicit assignments. The additions are
otherwise additive: no existing question ID, answer history, unit ID, or card
ID changed. The practice set revision increased from 5 to 6. Curriculum revision
3 adds section targets only when the canonical heading directly covers the
source row. Rows such as CNI Weave, monoliths/microservices, and Docker driver
details remain untargeted rather than opening a misleading broad page.

## Primary-source checks for this pass

- [Kubernetes ServiceAccounts](https://kubernetes.io/docs/concepts/security/service-accounts/): workload identity is namespaced; RBAC grants are separate from identity.
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/): Role/ClusterRole rules and bindings grant verbs on resources to subjects.
- [Kubernetes NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/): connectivity policy is distinct from admission, process privilege, and API authorization, and needs supporting enforcement.
- [Kubernetes Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/): PVC/PV responsibilities, reclaim behavior, and RWO versus RWOP semantics.
- [Kubernetes StorageClasses](https://kubernetes.io/docs/concepts/storage/storage-classes/): provisioners, reclaim policy, and `WaitForFirstConsumer` topology behavior.
- [Istio architecture](https://istio.io/latest/docs/ops/deployment/architecture/) and [traffic management](https://istio.io/latest/docs/concepts/traffic-management/): control/data plane split, Envoy execution, VirtualService, DestinationRule, and gateway boundaries.
- [CNCF Service Mesh glossary](https://glossary.cncf.io/service-mesh/): vendor-neutral purpose, benefits, and operational tradeoffs.

These checks support the newly authored questions; they are not a blanket
certification of every older sentence in the corpus.

## Recorded gaps and next review queue

1. Add a compact worked example to `kubernetes-control-loop` and a prose
   placement example to `kubernetes-scheduling-placement`; current visuals and
   questions do not make the canonical articles worked-example complete.
2. Add independent transfer questions for `config-secret`,
   `artifact-execution`, `mesh`, scheduling `resource-policy`, and scheduling
   `node-ownership`. Each has later-review coverage, but only one unit question.
3. Review `command-intent` and `apply-state` in
   `kubernetes-resource-operations`: broad MCQ/card coverage exists, but each
   objective maps to one independent free-response question; `command-intent`
   is also the sole objective without an explicit misconception contrast in
   its linked unit question/card text.
4. Continue source-reviewing inventory-only rows before making correctness or
   exam-readiness claims. Counts measure opportunity to learn, not retention or
   exam prediction.
5. Keep source-aligned curriculum rows without an exact canonical section
   unlinked at section level until focused authored material exists. Do not use
   a document top as a substitute for granular coverage.
