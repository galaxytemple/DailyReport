# Runbook: New VM Instance / IP Change

What to do when the OCI VM is recreated and its public IP changes. This project
uses **sslip.io** for its hostname, so an IP change cascades into a hostname
change, which cascades into the OAuth redirect URI — that is the part most
easily forgotten.

> Example used throughout: old IP `159.54.160.137` → new IP `163.192.56.9`.
> sslip host = the IP with dots replaced by hyphens: `163-192-56-9.sslip.io`.

---

## TL;DR checklist

- [ ] **GitHub Secrets**: `DEPLOY_HOST`, `PUBLIC_IP`, `PUBLIC_HOST` (3 values)
- [ ] **VM `~/.ssh/authorized_keys`**: add the CI deploy **public** key
      (`daily-report-deploy.pub`) — NOT the login key
- [ ] **Google OAuth**: add new redirect URI in Google Cloud Console
- [ ] **VM bootstrap** (only if the VM is freshly created, not just re-IP'd):
      dir + Docker + iptables + Ollama + wallet
- [ ] **Local files**: `scripts/ssh-vm`, `.env`, prune stale `known_hosts`
- [ ] **Deploy**: `gh workflow run deploy.yml --ref main`, then verify

---

## 1. GitHub Secrets (3 IP-dependent values)

`deploy.yml` reads these. Everything else (`ORACLE_*`, `AUTH_GOOGLE_*`,
`AUTH_SECRET`, `ADMIN_EMAILS`, `SMTP_*`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`) is
IP-independent — leave it alone.

| Secret        | New value                  | Note                         |
| ------------- | -------------------------- | ---------------------------- |
| `DEPLOY_HOST` | `163.192.56.9`             | SSH target (raw IP)          |
| `PUBLIC_IP`   | `163.192.56.9`             | raw IP                       |
| `PUBLIC_HOST` | `163-192-56-9.sslip.io`    | dots → hyphens               |

`AUTH_URL` is **not** a secret — `deploy.yml` derives it as
`https://${PUBLIC_HOST}`, so fixing `PUBLIC_HOST` is enough.

---

## 2. VM `authorized_keys` — the CI deploy key (easy to get wrong)

CI authenticates with the `DEPLOY_SSH_KEY` secret, whose **public** counterpart
must be in the VM's `~/.ssh/authorized_keys` for the `ubuntu` user. This is a
**different key from your interactive login key**.

- Login key (interactive, `scripts/ssh-vm`): `~/2fa/oracle/ssh-key-2026-05-03.key`
- **CI deploy key**: `~/2fa/oracle/daily-report-deploy/daily-report-deploy`
  (fingerprint `SHA256:9F7OfevYtGOQBoYij978lFhcosJ3KzyTAyXLwuGTh7Y`)

A fresh OCI image often ships only the login key (and sometimes an unrelated
key like `piepad-deploy`). If you skip this, CI fails at **Sync to VM** with
`Permission denied (publickey)`.

```bash
# Add the CI deploy public key to the new VM (using the login key to get in):
PUB=$(cat ~/2fa/oracle/daily-report-deploy/daily-report-deploy.pub)
ssh -i ~/2fa/oracle/ssh-key-2026-05-03.key ubuntu@163.192.56.9 \
  "grep -qF '$PUB' ~/.ssh/authorized_keys || echo '$PUB' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"

# Verify the CI key now works:
ssh -i ~/2fa/oracle/daily-report-deploy/daily-report-deploy ubuntu@163.192.56.9 'echo CI_KEY_OK'
```

---

## 3. Google OAuth redirect URI (login breaks without this)

The hostname changed, so NextAuth's Google callback URL changed. In
**Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client**:

- **Authorized redirect URIs**: add
  `https://163-192-56-9.sslip.io/api/auth/callback/google`
- (optional) **Authorized JavaScript origins**: add
  `https://163-192-56-9.sslip.io`

Without this the deploy succeeds but admin login fails with `redirect_uri_mismatch`.

---

## 4. VM bootstrap (fresh instance only)

Skip this section if the instance already had Docker/Ollama/wallet and only the
IP changed. Full reference: `~/Documents/workspace/share-pad/script/oci-vm-bootstrap.md`.
VM facts assumed: OCI Ampere A1, Ubuntu 22.04 (jammy), arm64, passwordless sudo,
`ubuntu` login user.

### 4a. Deploy dir (CI rsync target)

`/opt` is `root:root`, so `ubuntu` cannot create the dir — CI rsync fails
otherwise.

```bash
sudo mkdir -p /opt/daily-report
sudo chown -R "$USER:$USER" /opt/daily-report
sudo chmod 750 /opt/daily-report
```

### 4b. Docker Engine + Compose plugin

```bash
sudo apt-get update -qq
sudo apt-get install -y ca-certificates curl gnupg netfilter-persistent
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -qq
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # CI opens fresh sessions → group applies
```

### 4c. Open ports 80/443

OCI Ubuntu images DROP/REJECT everything except 22. Insert ACCEPT rules
**above** the trailing REJECT rule (check positions with `--line-numbers`).

```bash
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers | grep -E 'dpt:(80|443)|REJECT'
```

### 4d. Ollama + models (host LLM, run on the VM yourself)

The `job`/`crawler` containers reach the host's Ollama via
`host.docker.internal:11434`. Without it the containers stay "healthy" but all
LLM/embedding calls fail. The install pipes a remote script, so **run it on the
VM directly** (agents are blocked from piping remote installers):

```bash
curl -fsSL https://ollama.com/install.sh | sh

sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null <<'EOF'
[Service]
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama

ollama pull gemma2:9b          # ~6 GB, 5-10 min on free-tier bandwidth
ollama pull nomic-embed-text   # ~280 MB
ollama list                    # verify both present
```

### 4e. Oracle ADB wallet (one-time SCP)

`deploy.yml` excludes `wallet/`, so it lives on the VM permanently and must be
uploaded once. The target subdir must exist first.

```bash
ssh -i ~/2fa/oracle/ssh-key-2026-05-03.key ubuntu@163.192.56.9 \
  'mkdir -p /opt/daily-report/wallet'
scp -i ~/2fa/oracle/ssh-key-2026-05-03.key ./wallet/* \
  ubuntu@163.192.56.9:/opt/daily-report/wallet/
ssh -i ~/2fa/oracle/ssh-key-2026-05-03.key ubuntu@163.192.56.9 \
  'chmod 700 /opt/daily-report/wallet && chmod 600 /opt/daily-report/wallet/*'
```

---

## 5. Local files (convenience, not committed secrets)

```bash
# scripts/ssh-vm: update the hardcoded HOST default
#   HOST="${VM_HOST:-163.192.56.9}"

# .env (gitignored — CI rebuilds it from secrets, this is for local tooling):
#   AUTH_URL=https://163-192-56-9.sslip.io
#   PUBLIC_HOST=163-192-56-9.sslip.io
#   PUBLIC_IP=163.192.56.9

# Prune stale host keys so SSH/ssh-vm don't warn about a changed host key:
ssh-keygen -R 159.54.160.137
```

---

## 6. Deploy + verify

`deploy.yml` triggers on push to `main` or `workflow_dispatch`. To deploy
without a code change:

```bash
gh workflow run deploy.yml --ref main
gh run watch "$(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Note: migrations are **not** auto-run on deploy (`flyway/flyway:10-alpine` is
AMD64-only; the ARM VM can't run it). Run `pnpm db:migrate` locally against prod
when a new `V*.sql` lands. See the `flyway-alpine-pin` note.

Verify:

```bash
curl -fsS -o /dev/null -w 'HTTP %{http_code}\n' https://163-192-56-9.sslip.io/   # 302 → /login = OK
ssh -i ~/2fa/oracle/ssh-key-2026-05-03.key ubuntu@163.192.56.9 \
  'cd /opt/daily-report && ./scripts/dc ps'                                       # all services healthy
```

Then open `https://163-192-56-9.sslip.io/` and log in with an `ADMIN_EMAILS`
Google account to confirm the OAuth redirect URI is correct.
