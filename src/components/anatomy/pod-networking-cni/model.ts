// Pure, deterministic model of Pod networking across two nodes. Authored fixture, not a cluster recording.
// Modelled: sandbox creation, CNI ADD (address from the node's range) and DEL (release), Ready-driven
// EndpointSlice membership, one kube-proxy Service rule on the source node, one ingress NetworkPolicy and the
// installed CNI's enforcement. Not modelled: route or overlay failure, Service load balancing, HTTP, egress,
// readiness probe timing and any real packet.

export type NodeId = 'node-a' | 'node-b';
export type Stage = 'created' | 'bound' | 'sandbox' | 'networked' | 'running' | 'ready';
/** ManifestPanel fields a step reads or changes; those YAML lines are highlighted. */
export type Field = 'api' | 'nodeName' | 'sandbox' | 'podIP' | 'phase' | 'ready' | 'policy';
export type Route = 'direct' | 'service';
export type HopId = 'address' | 'client' | 'kube-proxy' | 'endpoints' | 'route' | 'policy' | 'listener';
export type Waypoint = 'start' | 'client-port' | 'kube-proxy' | 'switch-a' | 'link' | 'gate' | 'switch-b' | 'api-port' | 'api';
export type Verdict = 'pass' | 'stop' | 'skip';

export interface PodObject { uid: number; node: NodeId | null; stage: Stage; ip: string | null }
export interface NodeState { id: NodeId; cidr: string; prefix: string; plugin: boolean; kubeProxy: boolean; nextHost: number }
export interface Released { uid: number; ip: string; node: NodeId }
export interface Hop { id: HopId; label: string; owner: string; verdict: Verdict; detail: string; at: Waypoint }
export interface Probe { route: Route; target: string; hops: Hop[]; stopAt: Waypoint | null; trail: Waypoint[] }
export interface Change { title: string; changed: string; actor: string; reason: string; notYet: string }
export interface NetState {
  nodes: Record<NodeId, NodeState>;
  client: PodObject;
  api: PodObject | null;
  nextUid: number;
  released: Released[];
  policy: boolean;
  enforcing: boolean;
  probe: Probe | null;
  /** UID of the Pod created by the latest replacement; shown as a new identity until deleted. */
  fresh: number | null;
  change: Change;
  reads: Field[];
}
export interface ManifestRow { text: string; field?: Field }

export const VIP = '10.96.0.20';
export const POLICY_NAME = 'api-deny-ingress';
export const stages: Stage[] = ['created', 'bound', 'sandbox', 'networked', 'running', 'ready'];
export const stageAtLeast = (stage: Stage, floor: Stage) => stages.indexOf(stage) >= stages.indexOf(floor);

const PATH_DIRECT: Waypoint[] = ['start', 'client-port', 'switch-a', 'link', 'gate', 'switch-b', 'api-port', 'api'];
const PATH_SERVICE: Waypoint[] = ['start', 'client-port', 'kube-proxy', 'switch-a', 'link', 'gate', 'switch-b', 'api-port', 'api'];

export function initialState(): NetState {
  return {
    nodes: {
      'node-a': { id: 'node-a', cidr: '10.244.1.0/24', prefix: '10.244.1', plugin: true, kubeProxy: true, nextHost: 5 },
      'node-b': { id: 'node-b', cidr: '10.244.2.0/24', prefix: '10.244.2', plugin: true, kubeProxy: true, nextHost: 8 },
    },
    client: { uid: 1, node: 'node-a', stage: 'ready', ip: '10.244.1.4' },
    api: { uid: 2, node: 'node-b', stage: 'ready', ip: '10.244.2.7' },
    nextUid: 3,
    released: [],
    policy: false,
    enforcing: true,
    probe: null,
    fresh: null,
    change: {
      title: 'Start: client and api are Ready',
      changed: 'client (node-a, 10.244.1.4) and api (node-b, 10.244.2.7) are Running and Ready. The CNI plugin on each node gave its Pod the address during sandbox setup.',
      actor: 'Authored start state. Each address was assigned by the CNI plugin on that Pod\'s node.',
      reason: 'Pod IPs come from node network setup. The kubelet runs the sequence; kube-proxy is not involved.',
      notYet: 'No replacement, request or NetworkPolicy has happened yet.',
    },
    reads: [],
  };
}

const moved = (state: NetState, change: Change, reads: Field[], patch: Partial<NetState> = {}): NetState =>
  ({ ...state, ...patch, change, reads });

/** A Delete is allowed only for a Ready api Pod with an address. The replacement is created by the next step. */
export function deleteApi(state: NetState): NetState {
  const pod = state.api;
  if (!pod || pod.stage !== 'ready' || pod.ip === null || pod.node === null) return state;
  return moved(state, {
    title: `api u${pod.uid} deleted`,
    changed: `Pod u${pod.uid} is removed. Its containers stop, and ${pod.ip} is released from ${pod.node}. Nothing else changes.`,
    actor: 'You, in the fixture, deleting the Pod object. The kubelet stops the containers; the runtime tears down the sandbox and calls the CNI plugin (DEL) to release the interface and address.',
    reason: 'Deleting the Pod ends its sandbox, and the address returns to the node\'s pool.',
    notYet: `No replacement exists yet. Nothing holds ${pod.ip} now, so a client that cached it reaches no Pod.`,
  }, ['api', 'podIP'], {
    api: null,
    probe: null,
    fresh: null,
    released: [...state.released, { uid: pod.uid, ip: pod.ip, node: pod.node }],
  });
}

function wire(state: NetState, pod: PodObject): NetState {
  const node = state.nodes[pod.node ?? 'node-b'];
  if (!node.plugin) {
    return moved(state, {
      title: 'Network setup failed on node-b',
      changed: `The sandbox has no network: no CNI plugin is installed on ${node.id}. api u${pod.uid} has no IP, and its containers do not start.`,
      actor: `The container runtime on ${node.id}, which cannot run the CNI plugin it is configured to use.`,
      reason: 'The runtime calls the node\'s CNI plugin to configure sandbox networking, and none is installed.',
      notYet: 'The Pod stays in sandbox. Install the plugin and step again. Other nodes and existing Pods are unchanged.',
    }, ['sandbox']);
  }
  const ip = `${node.prefix}.${node.nextHost}`;
  return moved(state, {
    title: `CNI plugin gave api u${pod.uid} ${ip}`,
    changed: `A veth pair joins the Pod's namespace to node-b's switch. IPAM assigned ${ip} from ${node.cidr}.`,
    actor: `The container runtime calling the CNI plugin on ${node.id} (ADD). The plugin and its IPAM allocate the address.`,
    reason: 'The Kubernetes network model needs each Pod to have its own IP, and the node\'s CNI plugin implements that here.',
    notYet: 'Containers have not started, so nothing listens on the Pod IP yet. Phase is still Pending and Ready is False.',
  }, ['podIP', 'sandbox'], {
    nodes: { ...state.nodes, [node.id]: { ...node, nextHost: node.nextHost + 1 } },
    api: { ...pod, stage: 'networked', ip },
  });
}

/** One step advances the replacement by one owner's action. A failed step leaves the Pod where it is. */
export function advance(state: NetState): NetState {
  const pod = state.api;
  if (pod === null) {
    const uid = state.nextUid;
    return moved(state, {
      title: `Replacement api u${uid} created`,
      changed: `api u${uid} exists with no nodeName and no IP. The deleted Pod's UID does not return, and its address stays released.`,
      actor: 'The workload controller that owns api (not drawn). It creates the Pod object from the template.',
      reason: 'Pods are disposable. A replacement is a new object with a new UID, not the old Pod coming back.',
      notYet: 'Not scheduled, no sandbox, no IP, not Running and not Ready. No endpoint exists for it.',
    }, ['api'], { api: { uid, node: null, stage: 'created', ip: null }, nextUid: uid + 1, probe: null, fresh: uid });
  }
  switch (pod.stage) {
    case 'created':
      return moved(state, {
        title: `Scheduler bound api u${pod.uid} to node-b`,
        changed: 'spec.nodeName is now node-b, so the kubelet on node-b owns this Pod\'s lifecycle. The fixture chooses node-b to keep the path cross-node.',
        actor: 'kube-scheduler, which sets nodeName.',
        reason: 'Scheduling picks a node once; the Pod then stays on that node.',
        notYet: 'Bound is not Running: there is no sandbox, no address and no container yet.',
      }, ['nodeName'], { api: { ...pod, node: 'node-b', stage: 'bound' } });
    case 'bound':
      return moved(state, {
        title: 'Sandbox created on node-b',
        changed: 'The kubelet asked the runtime for a Pod sandbox: a network namespace exists with no address yet. Containers have not started.',
        actor: 'The kubelet on node-b, through the CRI call to the container runtime.',
        reason: 'The runtime creates the namespace that the Pod\'s containers will share. Creating a sandbox is not address assignment.',
        notYet: 'No IP yet. The next step asks the CNI plugin to wire the sandbox.',
      }, ['sandbox'], { api: { ...pod, stage: 'sandbox' } });
    case 'sandbox':
      return wire(state, pod);
    case 'networked':
      return moved(state, {
        title: `api u${pod.uid} Running on ${pod.ip}`,
        changed: 'The app and log-shipper containers started in the shared network namespace. They share the Pod IP and reach each other on localhost. The phase is Running.',
        actor: 'The kubelet and the container runtime on node-b.',
        reason: 'Containers start inside the sandbox that the CNI plugin already wired.',
        notYet: 'Ready is False. Service endpoints leave this Pod out until readiness passes.',
      }, ['phase', 'podIP'], { api: { ...pod, stage: 'running' } });
    case 'running':
      return moved(state, {
        title: `api u${pod.uid} Ready`,
        changed: 'The readiness probe passed, so the Ready condition is True. The EndpointSlice now lists the Pod IP as a ready endpoint.',
        actor: 'The kubelet runs the readiness probe; the EndpointSlice controller updates the endpoint.',
        reason: 'Ready decides Service membership. It does not change the Pod IP or the CNI route.',
        notYet: 'Ready shows that a probe passed, not that every request is answered correctly.',
      }, ['ready'], { api: { ...pod, stage: 'ready' } });
    case 'ready':
      return state;
  }
}

export const needsSteps = (state: NetState) => state.api === null || state.api.stage !== 'ready';

export function setPlugin(state: NetState, node: NodeId, installed: boolean): NetState {
  const current = state.nodes[node];
  if (current.plugin === installed) return state;
  const nodes = { ...state.nodes, [node]: { ...current, plugin: installed } };
  const waiting = state.api?.stage === 'sandbox';
  return moved(state, installed ? {
    title: `CNI plugin installed on ${node}`,
    changed: `${node} can run CNI ADD again. ${waiting ? 'The Pod waiting in sandbox can be wired on the next step.' : 'No Pod is created or networked by this change alone.'}`,
    actor: `You, administering ${node} in the fixture.`,
    reason: 'The runtime calls the plugin installed on the node to configure a new sandbox.',
    notYet: 'Installing a plugin does not restart a Pod or change any address.',
  } : {
    title: `CNI plugin removed from ${node}`,
    changed: `${node} cannot run CNI ADD for a new sandbox. Existing Pods on ${node} are not modelled as changed.`,
    actor: `You, administering ${node} in the fixture.`,
    reason: 'Without a plugin, the runtime cannot configure networking for a new sandbox on this node.',
    notYet: `Existing sandboxes keep their network; only new sandboxes on ${node} are affected.`,
  }, [], { nodes });
}

export function setKubeProxy(state: NetState, running: boolean): NetState {
  const current = state.nodes['node-a'];
  if (current.kubeProxy === running) return state;
  const nodes = { ...state.nodes, 'node-a': { ...current, kubeProxy: running } };
  return moved(state, running ? {
    title: 'kube-proxy running on node-a',
    changed: 'node-a programs Service rules again from the Service and EndpointSlice objects.',
    actor: 'You, administering node-a in the fixture.',
    reason: 'A stopped kube-proxy cannot translate Service-address traffic on its node.',
    notYet: 'No Pod was created or re-addressed by this change.',
  } : {
    title: 'kube-proxy stopped on node-a',
    changed: `node-a has no Service rule for ${VIP}:80 in this fixture. Pod IP routes are unchanged.`,
    actor: 'You, administering node-a in the fixture.',
    reason: 'kube-proxy programs Service addresses on each node. It does not wire Pods or route Pod IPs.',
    notYet: 'Direct requests to Pod IPs are unaffected. Service requests from node-a now stop at the kube-proxy hop.',
  }, [], { nodes });
}

export function setPolicy(state: NetState, on: boolean): NetState {
  if (state.policy === on) return state;
  if (on) {
    return moved(state, {
      title: `NetworkPolicy ${POLICY_NAME} created`,
      changed: 'The API server stores a policy that selects api Pods for Ingress and allows no source.',
      actor: 'You, through the API (fixture). The API server stores the object; it does not filter packets.',
      reason: state.enforcing
        ? 'The installed CNI enforces NetworkPolicy, so node-b will drop packets to api that no policy allows.'
        : 'The installed CNI does not enforce NetworkPolicy, so this object has no effect on traffic.',
      notYet: state.enforcing ? 'No request has been sent since the policy was created.' : 'Traffic is unchanged. Only a CNI that enforces the object can change it.',
    }, ['policy'], { policy: true });
  }
  return moved(state, {
    title: `NetworkPolicy ${POLICY_NAME} deleted`,
    changed: 'The stored policy is removed. No policy selects api for Ingress.',
    actor: 'You, through the API (fixture).',
    reason: 'With no selecting policy, api is not isolated for Ingress and accepts the connection from node-a.',
    notYet: 'The installed CNI\'s enforcement setting is unchanged.',
  }, ['policy'], { policy: false });
}

export function setEnforcing(state: NetState, on: boolean): NetState {
  if (state.enforcing === on) return state;
  return moved(state, on ? {
    title: 'Installed CNI enforces NetworkPolicy',
    changed: 'The network implementation now enforces the policy objects it sees. The policy object itself is unchanged.',
    actor: 'You, in the fixture, as a different CNI installation on the cluster.',
    reason: 'Enforcement belongs to the network implementation, not to the NetworkPolicy object.',
    notYet: 'No request has been sent under the new behaviour.',
  } : {
    title: 'Installed CNI does not enforce NetworkPolicy',
    changed: `Policy objects are stored but ignored by the network implementation. ${POLICY_NAME} is unchanged.`,
    actor: 'You, in the fixture, as a different CNI installation on the cluster.',
    reason: 'A CNI without policy support accepts a NetworkPolicy object and does nothing with it.',
    notYet: 'Requests already delivered are not re-evaluated; the next request is judged by the new behaviour.',
  }, ['policy'], { enforcing: on });
}

interface Check { id: HopId; label: string; owner: string; at: Waypoint; ok: boolean; detail: string }

/** Ordered checks for one request. The first failing check stops the request; later checks are not tested. */
function checksFor(state: NetState, route: Route): Check[] {
  const api = state.api;
  const ip = api?.ip ?? null;
  const client: Check = {
    id: 'client', label: 'client veth', owner: 'CNI on node-a (wired when client started)', at: 'client-port',
    ok: state.client.stage === 'ready',
    detail: `client (${state.client.ip}) is Ready on node-a, so its interface carries the request.`,
  };
  const routeCheck: Check = {
    id: 'route', label: 'node-b route', owner: 'CNI dataplane (routes for the node-b Pod range)', at: 'link',
    ok: true,
    detail: `The route to ${state.nodes['node-b'].cidr} is programmed. The fixture assumes routing works.`,
  };
  const isolated = state.policy && state.enforcing;
  const policy: Check = {
    id: 'policy', label: 'NetworkPolicy', owner: 'Installed CNI enforcement on node-b', at: 'gate',
    ok: !isolated,
    detail: isolated
      ? `${POLICY_NAME} selects api for Ingress and allows no source. This CNI enforces it, so node-b drops the packet from node-a.`
      : state.policy
        ? `${POLICY_NAME} exists, but this CNI does not enforce it. Traffic is allowed.`
        : 'No NetworkPolicy selects api, so Ingress is not isolated.',
  };
  const listening = api !== null && (api.stage === 'running' || api.stage === 'ready');
  const listener: Check = {
    id: 'listener', label: 'api listener', owner: 'api containers in the shared Pod namespace', at: 'api',
    ok: listening,
    detail: listening
      ? `The api containers listen on ${ip}.`
      : api
        ? `api u${api.uid} ${ip ? `has ${ip} but its` : 'has no IP and its'} containers have not started, so nothing listens.`
        : 'No api Pod exists, so nothing listens.',
  };
  if (route === 'direct') {
    const address: Check = {
      id: 'address', label: 'Pod IP', owner: 'CNI ADD on the Pod\'s node (assigns the address)', at: 'start',
      ok: ip !== null,
      detail: ip ? `api holds ${ip}.` : 'No Pod holds an address yet: CNI ADD has not run for the current api Pod.',
    };
    return [address, client, routeCheck, policy, listener];
  }
  const proxy: Check = {
    id: 'kube-proxy', label: `Service ${VIP}:80 rule`, owner: 'kube-proxy on node-a (Service forwarding)', at: 'kube-proxy',
    ok: state.nodes['node-a'].kubeProxy,
    detail: state.nodes['node-a'].kubeProxy
      ? `The rule maps ${VIP}:80 to the api endpoint set.`
      : 'No Service rule exists on node-a: kube-proxy is stopped in this fixture.',
  };
  const endpoint: Check = {
    id: 'endpoints', label: 'ready endpoint', owner: 'Pod Ready condition, mirrored into the EndpointSlice', at: 'kube-proxy',
    ok: api?.stage === 'ready',
    detail: api === null
      ? 'No api Pod exists, so the EndpointSlice has no endpoint.'
      : api.stage === 'ready'
        ? `${ip} is a ready endpoint.`
        : api.stage === 'running'
          ? `api is Running but not Ready, so the EndpointSlice leaves ${ip} out. A direct request to ${ip} is not gated by Ready.`
          : `api is ${api.stage}: its Ready condition is not True, so it is not an endpoint.`,
  };
  return [client, proxy, endpoint, routeCheck, policy, listener];
}

/** Turns checks into hops with verdicts and the packet's trail along the route's waypoints. */
function compile(route: Route, checks: Check[]): Probe {
  const stopIndex = checks.findIndex((check) => !check.ok);
  const hops: Hop[] = checks.map((check, index) => {
    const verdict: Verdict = stopIndex === -1 || index < stopIndex ? 'pass' : index === stopIndex ? 'stop' : 'skip';
    return {
      id: check.id, label: check.label, owner: check.owner, at: check.at, verdict,
      detail: verdict === 'skip' ? 'Not tested: an earlier hop stopped the request.' : check.detail,
    };
  });
  const path = route === 'direct' ? PATH_DIRECT : PATH_SERVICE;
  const stopAt = stopIndex === -1 ? null : checks[stopIndex]!.at;
  const end = stopAt === null ? path.length - 1 : path.indexOf(stopAt);
  return { route, target: '', hops, stopAt, trail: path.slice(0, end + 1) };
}

/** Sends one request. It reads the state and records a probe; it never changes the cluster. */
export function probe(state: NetState, route: Route): NetState {
  const ip = state.api?.ip ?? null;
  const compiled = compile(route, checksFor(state, route));
  const next: Probe = { ...compiled, target: route === 'direct' ? (ip ?? 'no address') : `${VIP}:80` };
  const reads: Field[] = route === 'direct' ? ['podIP', 'policy'] : ['policy', 'ready'];
  const passed = next.hops.filter((hop) => hop.verdict === 'pass').map((hop) => hop.label);
  const stopped = next.hops.findIndex((hop) => hop.verdict === 'stop');
  if (stopped === -1) {
    const change: Change = route === 'direct'
      ? {
        title: `Request reached api at ${ip}`,
        changed: `client sent a TCP request to ${ip}. Hops passed: ${passed.join(', ')}. No cluster state changed.`,
        actor: 'The CNI dataplane for the route and the policy check; the api containers for the listener.',
        reason: 'Pod IPs are routable across nodes by the cluster network, without NAT and without kube-proxy.',
        notYet: 'Only reachability to one listener was tested. HTTP status, DNS and other ports were not.',
      }
      : {
        title: `Request reached api through ${VIP}:80`,
        changed: `client sent to the Service address. kube-proxy on node-a mapped it to endpoint ${ip}, and the request then took the Pod path. No cluster state changed.`,
        actor: 'kube-proxy on node-a for the Service address; the EndpointSlice for the endpoint; the CNI dataplane for the Pod hop.',
        reason: 'A Service address is not a Pod address. kube-proxy translates it to a ready endpoint, which is routed like any Pod IP.',
        notYet: 'One endpoint was used, so load balancing across several endpoints was not tested.',
      };
    return moved(state, change, reads, { probe: next });
  }
  const hop = next.hops[stopped]!;
  const skipped = next.hops.filter((item) => item.verdict === 'skip').map((item) => item.label);
  const change: Change = {
    title: `Request stopped at ${hop.label}`,
    changed: `The request stopped at hop ${stopped + 1} of ${next.hops.length}. Earlier hops passed. No cluster state changed.`,
    actor: hop.owner,
    reason: hop.detail,
    notYet: skipped.length ? `Not tested after this stop: ${skipped.join(', ')}.` : 'Every hop after this one is already tested.',
  };
  return moved(state, change, reads, { probe: next });
}

/** The api Pod and the NetworkPolicy as the API returns them. Lines carry the field a step read or changed. */
export function manifestOf(state: NetState): ManifestRow[] {
  const rows: ManifestRow[] = [];
  const pod = state.api;
  if (pod === null) {
    rows.push({ text: '# api Pod: no object (deleted; replacement not created yet)', field: 'api' });
  } else {
    const networked = stageAtLeast(pod.stage, 'networked');
    const started = stageAtLeast(pod.stage, 'running');
    const ready = pod.stage === 'ready';
    rows.push(
      { text: 'apiVersion: v1' },
      { text: 'kind: Pod' },
      { text: 'metadata:' },
      { text: '  name: api' },
      { text: `  uid: u${pod.uid}   # fixture stand-in`, field: 'api' },
      { text: '  labels:' },
      { text: '    app: api' },
      { text: 'spec:' },
      pod.node === null
        ? { text: '  # nodeName: unset (not bound yet)', field: 'nodeName' }
        : { text: `  nodeName: ${pod.node}`, field: 'nodeName' },
      { text: '  containers:' },
      { text: '    - name: app' },
      { text: '      image: registry.example.com/api:1.4' },
      { text: '    - name: log-shipper' },
      { text: '      image: registry.example.com/log-shipper:0.9' },
      { text: 'status:' },
      { text: `  phase: ${started ? 'Running' : 'Pending'}`, field: 'phase' },
      networked
        ? { text: `  podIP: ${pod.ip}`, field: 'podIP' }
        : { text: '  # podIP: not allocated yet', field: 'podIP' },
      { text: '  conditions:' },
      { text: '    - type: PodReadyToStartContainers' },
      { text: `      status: "${networked ? 'True' : 'False'}"`, field: 'sandbox' },
      { text: '    - type: Ready' },
      { text: `      status: "${ready ? 'True' : 'False'}"`, field: 'ready' },
    );
  }
  if (state.policy) {
    rows.push(
      { text: '---' },
      { text: 'apiVersion: networking.k8s.io/v1' },
      { text: 'kind: NetworkPolicy' },
      { text: 'metadata:' },
      { text: `  name: ${POLICY_NAME}`, field: 'policy' },
      { text: 'spec:' },
      { text: '  podSelector:' },
      { text: '    matchLabels:' },
      { text: '      app: api' },
      { text: '  policyTypes:' },
      { text: '    - Ingress', field: 'policy' },
    );
  } else {
    rows.push({ text: `# NetworkPolicy ${POLICY_NAME}: not created`, field: 'policy' });
  }
  return rows;
}
