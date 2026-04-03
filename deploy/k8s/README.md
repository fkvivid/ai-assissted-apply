# Kubernetes (homelab)

Manifests use **Kustomize**. The UI pod’s nginx listens on **8080** and proxies `/api` to the Service **`api`** on port **8000** (same pattern as Docker Compose). The API pod has **no PVC** — scratch uses the container filesystem (`/tmp`, `$HOME`); it runs as **uid 10001**.

## 1. Images

Build and push from the repo root (Docker Hub example; use `ghcr.io/…` if you prefer):

```bash
export IMAGE_PREFIX=docker.io/YOUR_USER/
docker compose build
docker login
docker compose push
```

Edit `kustomization.yaml` → replace `CHANGE_ME` in both `newName` values with your Docker Hub/GitHub username or org so they match what you pushed.

## 2. Secret

The API needs your OpenAI key:

```bash
kubectl create namespace ai-assisted-apply --dry-run=client -o yaml | kubectl apply -f -

kubectl -n ai-assisted-apply create secret generic ai-assisted-apply-secrets \
  --from-literal=openai-api-key="$OPENAI_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -
```

Optional: patch `api-deployment.yaml` to set `OPENAI_MODEL`, `PDF_REMOTE_COMPILE_URL`, or `CORS_ORIGINS` (only required if the browser calls the API from a different origin than the SPA).

## 3. Deploy

```bash
kubectl apply -k deploy/k8s
```

Port-forward the UI:

```bash
kubectl -n ai-assisted-apply port-forward svc/web 8080:80
```

Open http://localhost:8080

## 4. Ingress (optional)

Uncomment `ingress.yaml` in `kustomization.yaml`, edit host/TLS/`ingressClassName`, then apply again. Point DNS at your ingress, and set `CORS_ORIGINS` on the API deployment to your public `https://` UI URL if you expose the API separately.

## Private registry

Add `imagePullSecrets` to both Deployments (same namespace) if your registry requires it.
