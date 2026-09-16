# Troubleshoot from process to pod

Troubleshooting is the disciplined reduction of uncertainty. Start by defining
the failed transaction, time window, expected result, and observed result.
Collect evidence before restarting or editing; a state change can erase the
clue that localizes the fault.

Move through an evidence ladder:

1. **Intent:** Is the right object, revision, namespace, and configuration
   declared?
2. **Reconciliation:** Do conditions and events show a controller making
   progress or reporting a constraint?
3. **Placement:** Is the Pod scheduled, and do node, volume, image, and resource
   requirements fit?
4. **Runtime:** Did containers start? Inspect current and previous state, exit
   code, reason, command, and logs.
5. **Process health:** Is the application listening and able to perform its
   local work?
6. **Discovery and endpoints:** Does the name resolve, and does the Service
   select ready endpoints on the expected port?
7. **Packet path and policy:** Can request and response traverse routes, CNI,
   NetworkPolicy, firewalls, and load balancers?
8. **Application protocol:** Do TLS identity, HTTP authority, path, and upstream
   behavior match?

Use the narrowest safe observation point. An ephemeral debug container can
share a Pod's network namespace without modifying the application image.
Events explain transitions but expire; logs explain application behavior but
may omit kernel or data-plane decisions.

Form a falsifiable hypothesis: “The Service has no endpoints because the Pod is
not ready.” Then collect the one observation that would disprove it. Avoid
changing several layers at once.

The goal is not a favorite command. It is a causal account from declared intent
to the user's failed transaction, followed by the smallest reversible fix and a
verification at the original boundary.

## Worked case: A healthy process can be absent from its Service

The following authored observations are in one namespace and time window, with no publishNotReadyAddresses override.

~~~text
checkout DNS → 10.96.20.4
Service selector → app=checkout; targetPort=8080
Pod labels → app=cart; Running=True; Ready=True
Pod-IP:8080/health → HTTP 200
checkout EndpointSlice backend addresses → none
~~~

The API endpoint controller derives backend membership from selectors and readiness. The mismatched label is enough to explain why this Pod is absent; neither the scheduler nor DNS owns that relationship. Read `kubectl get svc checkout -n demo -o yaml`, Pod labels and EndpointSlices labelled `kubernetes.io/service-name=checkout`. A reviewed correction should produce the intended endpoint, followed by a repeat of the original Service-name request. If endpoints already contain this Ready Pod, this selector hypothesis is falsified and the next checks are port mapping, listener and packet policy.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
