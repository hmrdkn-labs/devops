export const actors = [
  { id: 'api', name: 'API server', location: 'Control plane · top drawer', role: 'Authenticates, authorizes and admission-processes API requests; exposes the shared API. It does not start containers.' },
  { id: 'store', name: 'etcd', location: 'Control plane · second drawer', role: 'Durably stores Kubernetes API state through the API server. This is not the application’s database.' },
  { id: 'controllers', name: 'Deployment / ReplicaSet controllers', location: 'Control plane · third drawer', role: 'The Deployment controller creates a ReplicaSet; the ReplicaSet controller creates the managed Pod. Both act through the API, not directly on a runtime.' },
  { id: 'scheduler', name: 'Scheduler', location: 'Control plane · bottom drawer', role: 'Selects a feasible node for a Pod without a node assignment and records the binding through the API. It never launches containers.' },
  { id: 'kubelet', name: 'Kubelet', location: 'Node · upper tray', role: 'Observes the Pod assigned to this node, coordinates node-side setup and requests container operations through CRI; reports status through the API.' },
  { id: 'runtime', name: 'Container runtime', location: 'Node · lower cartridge', role: 'Creates and starts containers on the node at the kubelet’s request. Networking and storage setup must also succeed.' },
] as const;

export type ActorId = typeof actors[number]['id'];
export const stages = [
  { title: 'Draft only', actor: 'api', detail: 'One-replica Deployment intent is local. No API objects exist in this fixture yet.' },
  { title: 'Request processed', actor: 'api', detail: 'Authentication, authorization and admission succeed. Persistence is the next illustrated checkpoint, not a separate kubectl success response.' },
  { title: 'Deployment persisted', actor: 'store', detail: 'The API server has persisted Deployment desired state in etcd. No Pod has been created yet.' },
  { title: 'ReplicaSet created', actor: 'controllers', detail: 'The Deployment controller has created a ReplicaSet through the API. Its desired replica count is one.' },
  { title: 'Pod created · unassigned', actor: 'controllers', detail: 'The ReplicaSet controller has created Pod demo-pod through the API. Its nodeName is still empty; it is not running.' },
  { title: 'Pod assigned · not running', actor: 'scheduler', detail: 'The scheduler has selected node-a and recorded the binding through the API. This does not start any container.' },
  { title: 'Kubelet observes assignment', actor: 'kubelet', detail: 'The kubelet on node-a now coordinates setup and requests runtime operations. The container is not started at this checkpoint.' },
  { title: 'Container running · status reported', actor: 'runtime', detail: 'The runtime has started the container after successful setup; the kubelet reports Pod status through the API. Running is not proof of application readiness.' },
] as const satisfies ReadonlyArray<{ title: string; actor: ActorId; detail: string }>;

export function snapshot(stage: number) {
  const index = Math.max(0, Math.min(stages.length - 1, Math.trunc(stage)));
  return {
    index,
    checkpoint: stages[index],
    deployment: index >= 2 ? 1 : 0,
    replicaSet: index >= 3 ? 1 : 0,
    pod: index >= 4 ? 1 : 0,
    node: index >= 5 ? 'node-a' : 'unassigned',
    running: index >= 7 ? 1 : 0,
    apiStatus: index >= 7 ? 'Running reported' : index >= 4 ? 'Pending' : 'no Pod',
  };
}
