# Deployment

## Names

Before deploying, register with your AD IDP:

- Redirect URI: `https://<hostname>/auth/callback`
- Post-logout redirect URI: `https://<hostname>``

## Secrets

To create OpenShift secrets:

```shell
# BFF secrets
$ oc create secret generic arbo-bff-secrets \
  --from-literal=ARBO_OIDC_CLIENT_SECRET=<your-secret> \
  --from-literal=ARBO_SESSION_SECRET=<your-secret> \
  -n wc-apps-dev

# API secrets  
$ oc create secret generic arbo-api-secrets \
  --from-literal=ARBO_PG_URL=<your-pg-url> \
  --from-literal=ARBO_ORACLE_USER=<user> \
  --from-literal=ARBO_ORACLE_PASSWORD=<password> \
  --from-literal=ARBO_ORACLE_CONNECT_STRING=<connect-string> \
  -n wc-apps-dev
```

## Push and Rollout

Deployment steps:

```shell
# Build images
$ podman build -f packages/bff/Dockerfile -t <registry>/arbo-bff:latest .
$ podman build -f packages/api/Dockerfile -t <registry>/arbo-api:latest .

# Push to Sonatype
$ podman push <registry>/arbo-bff:latest
$ podman push <registry>/arbo-api:latest

# Deploy to OpenShift
$ oc apply -f deploy/bff.yaml -n wc-apps-dev
$ oc apply -f deploy/api.yaml -n wc-apps-dev

# Watch rollout
$ oc rollout status deployment/arbo-bff -n wc-apps-dev
$ oc rollout status deployment/arbo-api -n wc-apps-dev
````

## Promotion

```shell
# eval
$ oc apply -f deploy/bff.yaml -n wc-apps-eval
$ oc apply -f deploy/api.yaml -n wc-apps-eval

# prod
$ oc apply -f deploy/bff.yaml -n wc-apps-prod
$ oc apply -f deploy/api.yaml -n wc-apps-prod
````
