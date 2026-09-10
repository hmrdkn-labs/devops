# CNCF ecosystem, projects, standards, and community

Kubernetes is one project in a much larger cloud-native ecosystem. KCNA expects you to recognize common responsibilities, not memorize every logo in the CNCF Landscape.

## Learn projects by job

Representative examples:

| Need | Example project or interface | Mental model |
| --- | --- | --- |
| Container runtime | containerd | Runs containers beneath higher-level orchestration |
| Cluster DNS | CoreDNS | Resolves service/workload names using pluggable DNS behavior |
| Metrics monitoring | Prometheus | Scrapes/stores/query labeled time-series metrics and evaluates alert rules |
| Telemetry instrumentation | OpenTelemetry | Vendor-neutral APIs, SDKs, semantic conventions, and Collector |
| Proxy/data plane | Envoy | L4/L7 proxy often used by gateways and service meshes |
| Logging pipeline | Fluentd | Collects and routes log/event data |
| Package management | Helm | Templates and packages Kubernetes resources as charts |
| GitOps delivery | Flux / Argo CD | Reconciles version-controlled desired state into a target platform |

The table is a responsibility map, not a required architecture. You can run Kubernetes without using every listed project.

## Landscape is a catalog, not a product prescription

The CNCF Landscape organizes a very large ecosystem of projects and products. Inclusion in the landscape does not mean CNCF requires or endorses every item as part of one standard stack.

For exam questions, identify the category first: runtime, networking, observability, delivery, storage, security, service mesh, or another responsibility. Then recognize representative tools.

## Project maturity and governance

CNCF-hosted projects can move through maturity levels such as Sandbox, Incubating, and Graduated according to CNCF governance and project criteria. Maturity indicates project status within CNCF; it does not mean a Sandbox project is automatically unsafe or a Graduated project fits every use case.

The CNCF Technical Oversight Committee and project maintainers participate in project governance. Kubernetes itself has a large community structure with Special Interest Groups (SIGs), Working Groups, and other contributor roles that divide ownership by technical area.

## Open interfaces reduce hard coupling

Cloud-native systems benefit from stable interfaces between responsibilities. Examples include:

- OCI image/runtime specifications for container artifacts and runtime behavior;
- CRI between kubelet and container runtimes;
- CNI conventions for container/Pod network integration;
- CSI for storage integration.

These boundaries allow implementations to evolve behind a known contract. Do not confuse an interface with one implementation: CNI is not itself a single network plugin, and CSI is not a storage backend.

## Community collaboration is part of the architecture story

Open governance matters because cloud-native infrastructure is built by many organizations that need shared specifications, interoperable implementations, documented ownership, and public technical decision processes.

When you encounter an unfamiliar project, ask three questions:

1. What responsibility does it own?
2. Which interface or control/data-plane boundary does it implement?
3. Is it an implementation, a specification, a hosted project, or a catalog entry?

That method is more durable than memorizing the visual layout of the CNCF Landscape.
