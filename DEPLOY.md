# Deployment

## Prerequisites

- `podman` or `docker`
- `oc` CLI logged into the OpenShift cluster
- Access to Sonatype image registry
- AD IDP client credentials for `arbo-bff`

## IDP Registration

Before deploying to a new environment, register with your AD IDP:

- Redirect URI: `https://<hostname>/auth/callback`
- Post-logout redirect URI: `https://<hostname>`

## Namespaces

| Environment | Namespace      |
| ----------- | -------------- |
| dev         | `wc-apps-dev`  |
| eval        | `wc-apps-eval` |
| prod        | `wc-apps-prod` |

## Secrets

Create once per namespace. These are never stored in source control.

```shell
# BFF secrets
oc create secret generic arbo-bff-secrets \
  --from-literal=ARBO_OIDC_CLIENT_SECRET= \
  --from-literal=ARBO_SESSION_SECRET=<32-char-minimum-random-string> \
  -n wc-apps-dev

# API secrets
oc create secret generic arbo-api-secrets \
  --from-literal=ARBO_PG_URL= \
  --from-literal=ARBO_ORACLE_USER= \
  --from-literal=ARBO_ORACLE_PASSWORD= \
  --from-literal=ARBO_ORACLE_CONNECT_STRING= \
  -n wc-apps-dev
```

Generate a session secret:

```shell
node --input-type=module << 'EOF'
import { randomBytes } from 'crypto';
console.log(randomBytes(32).toString('hex'));
EOF
```

## Build and Push

```shell
# Build images from monorepo root
podman build -f packages/bff/Dockerfile -t /arbo-bff:latest .
podman build -f packages/api/Dockerfile -t /arbo-api:latest .

# Push to Sonatype
podman push /arbo-bff:latest
podman push /arbo-api:latest
```

## Deploy

```shell
# Deploy to OpenShift
oc apply -f deploy/bff.yaml -n wc-apps-dev
oc apply -f deploy/api.yaml -n wc-apps-dev

# Watch rollout
oc rollout status deployment/arbo-bff -n wc-apps-dev
oc rollout status deployment/arbo-api -n wc-apps-dev
```

## Promotion

```shell
# eval
oc apply -f deploy/bff.yaml -n wc-apps-eval
oc apply -f deploy/api.yaml -n wc-apps-eval

# prod
oc apply -f deploy/bff.yaml -n wc-apps-prod
oc apply -f deploy/api.yaml -n wc-apps-prod
```

## Rollback

```shell
oc rollout undo deployment/arbo-bff -n wc-apps-dev
oc rollout undo deployment/arbo-api -n wc-apps-dev
```

## Health checks

```shell
# BFF
curl https://<hostname>/healthz

# API (internal only — exec into BFF pod)
oc exec -n wc-apps-dev deployment/arbo-bff -- curl http://arbo-api:3001/healthz
```

## TODO

- [ ] Add Dockerfiles (`packages/bff/Dockerfile`, `packages/api/Dockerfile`)
- [ ] Create deploy manifests (`deploy/bff.yaml`, `deploy/api.yaml`)
- [ ] Migrate to Kustomize overlays for per-environment config
