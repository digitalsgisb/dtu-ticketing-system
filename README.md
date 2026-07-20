# DTU Ticketing & Project Control Centre

A bilingual internal operations system for a Digital Transformation Unit. It combines project intake, portfolio tracking, tasks, support issues, QR reporting, reporter updates, a lab wallboard, CSV migration, and encrypted backups in one Raspberry Pi-friendly application.

## What is implemented

- Project request workflow: Submitted → Triage → Needs Information → Approved/Rejected.
- Approval creates a linked project without losing the original request.
- Project portfolio with owner, department, priority, status, deadline, progress, and permanent QR token.
- Tasks and issues with assignment, priority, deadline, comments, attachments, audit history, and notifications.
- Public bilingual project request and QR issue forms.
- Private reporter tracking links with public-safe updates and replies.
- Privacy-safe wallboard with a 30-second refresh.
- Local Admin, Lead, and Member accounts using Argon2id passwords and server-side sessions.
- CSRF checks, login throttling, public rate limits, upload magic-byte checks, randomized filenames, free-space protection, Helmet headers, and public-host route isolation.
- Preview-before-commit CSV imports for projects and unresolved tickets.
- Optional SMTP notifications.
- Nightly AES-256-GCM encrypted SQLite/attachment backups with Cloudflare R2 retention.

## Run locally

Requirements: Node.js 24 LTS.

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

### Why port 5173 here?

`npm.cmd run dev` starts two cooperating development processes:

| Address | Purpose |
| --- | --- |
| `http://localhost:5173` | Vite development frontend with instant refresh when code changes. This is the address you open while developing. |
| `http://localhost:3100` | Express API and database server. Vite forwards `/api` requests to it automatically. |

Initial credentials come from `.env`:

- Username: `admin`
- Password: `ChangeMe123!`

Change both values before the first production launch. The initial account is marked as requiring a password change.

### Production-style local run

This means running the application on your PC in the same packaged form used on the Raspberry Pi. The React files are built once, Express serves both the interface and API from a single port, and there is no developer hot reload.

```powershell
npm.cmd run build
$env:NODE_ENV="production"
$env:PUBLIC_BASE_URL="http://localhost:3100"
npm.cmd start
```

Open `http://localhost:3100`.

In short: use port `5173` while changing the code; use port `3100` for a built deployment or the Raspberry Pi.

Do not permanently put `NODE_ENV=production` in the local development `.env`; set it only for the production-style command as shown above. The Raspberry Pi receives its separate production environment template from `deploy/dtu-control.env.example`.

## GitHub pull and push commands

The repository uses the `main` branch and the `origin` remote at `https://github.com/digitalsgisb/dtu-ticketing-system.git`.

### Pull the latest changes from GitHub

Run this before starting new work:

```powershell
git switch main
git pull --ff-only origin main
```

The `--ff-only` option prevents Git from creating an unexpected merge commit. If Git reports that local changes would be overwritten, commit or stash those changes before pulling.

### Push changes to GitHub

Review, commit, synchronize, and push your work:

```powershell
git status
git diff
git add -A
git commit -m "Describe the changes made"
git pull --rebase origin main
git push origin main
```

For the first push of a new branch, set its upstream connection with:

```powershell
git push -u origin your-branch-name
```

After the upstream is configured, `git pull` and `git push` can be used without specifying the remote and branch each time.

### Pull and deploy the update on the Raspberry Pi

After the changes have been pushed to GitHub, connect to the Raspberry Pi and run these commands from the cloned repository—not from `/opt/dtu-control/current`:

```bash
cd ~/dtu-ticketing-system
git status --short
git switch main
git pull --ff-only origin main
npm ci
npm run build
sudo bash deploy/install-pi.sh
sudo systemctl status dtu-control --no-pager
curl http://127.0.0.1:3100/api/health
```

`git status --short` should normally return no output before pulling. The installer creates a new production release and restarts the application when it is already running. It preserves `/etc/dtu-control.env`, the database, uploads, backups, and logs.

If the health check does not return an `ok` response, inspect the latest service logs:

```bash
sudo journalctl -u dtu-control --since "10 minutes ago" --no-pager
```

## Company branding

The Sugihara Grand Industries logo is stored locally at `public/sugihara-grand-logo.png` and used by the staff portal, login page, public request portal, wallboard, and printable QR labels. Because it is bundled locally, the deployed Pi does not need to contact GitHub to display the logo.

## Public and private routing

Set:

```dotenv
APP_BASE_URL=http://dtu-control.local:3100
PUBLIC_BASE_URL=https://report.example.com
PUBLIC_HOSTNAME=report.example.com
```

Requests received with `Host: report.example.com` can use only:

- `/p/{project-token}`
- `/request`
- `/track/{private-token}`
- `/api/public/*`

Staff authentication, APIs, downloads, and the wallboard return `404` on that hostname. Staff should use the Pi's private LAN hostname or address.

The example [Cloudflare Tunnel configuration](deploy/cloudflared-config.yml.example) exposes only the public hostname through an outbound tunnel. Add a Cloudflare Access or gateway rule if company policy requires additional controls.

## Cloudflare Turnstile

Create a Turnstile widget for the reporting hostname and set:

```dotenv
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET=...
```

The client widget appears automatically when a site key is configured, and server verification is enforced when `TURNSTILE_SECRET` is configured. Public rate limits remain active independently.

## SMTP

Email is disabled when `SMTP_HOST` is empty. To enable it:

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=DTU Control Centre <dtu@example.com>
```

Use port `587` with `SMTP_SECURE=false` for STARTTLS, or port `465` with `SMTP_SECURE=true` for implicit TLS. `APP_BASE_URL` must be the private staff URL because links in staff notification emails use it.

After restarting the application:

1. Sign in as an administrator.
2. Open **Administration → System**.
3. Confirm SMTP shows as configured.
4. Send a test email from the SMTP integration panel.

Staff members receive matching in-app and email notifications when their account has an email address. These cover assignments, comments, approaching deadlines, new public issues and requests for leads/admins, and public replies. Reporters receive confirmation, status-change, and public-comment emails when they supplied an email address.

The adapter only sends fixed text/HTML bodies and does not expose Nodemailer's raw, URL, file, envelope, or transport-name options to application input.

## Backup and restore

Set a long private encryption passphrase and the R2 credentials:

```dotenv
BACKUP_ENCRYPTION_KEY=use-a-password-manager-generated-secret
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=dtu-control-backups
```

Run a backup:

```powershell
npm.cmd run backup
```

The backup process:

1. Uses SQLite's online backup API for a consistent snapshot.
2. Archives the snapshot and attachments.
3. Encrypts the archive with AES-256-GCM.
4. Uploads a daily object to R2.
5. Creates a monthly object on the first UTC day of each month.
6. Retains 30 daily and 12 monthly R2 objects plus seven local encrypted copies.

Restore only while the application is stopped:

```powershell
$env:RESTORE_FILE="C:\path\dtu-2026-06-22.tar.gz.enc"
$env:BACKUP_ENCRYPTION_KEY="same-secret-used-for-backup"
$env:CONFIRM_RESTORE="YES"
npm.cmd run restore
```

The restore creates a safety copy of the current database before replacing it. Afterward, start the application and verify `/api/health`, sign-in, attachments, and recent records.

## Raspberry Pi 5 deployment

Use 64-bit Raspberry Pi OS and Node.js 24 LTS.

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
npm ci
npm run build
sudo bash deploy/install-pi.sh
sudo nano /etc/dtu-control.env
sudo systemctl start dtu-control dtu-backup.timer
```

Useful checks:

```bash
systemctl status dtu-control
systemctl status dtu-backup.timer
journalctl -u dtu-control -f
curl http://127.0.0.1:3100/api/health
```

Install `deploy/dtu-kiosk.desktop` in the Pi desktop user's `~/.config/autostart/` directory to start Chromium on the wallboard after login. Install and configure `cloudflared` separately with the included tunnel example.

The installer deploys a versioned production release under `/opt/dtu-control/releases` and installs production dependencies for the Pi's ARM64 architecture. It deliberately excludes local `.env` files, databases, uploads, backups, logs, Git history, Windows dependencies, and development tools.

For the complete GitHub-to-Pi workflow, follow [docs/GITHUB_AND_PI.md](docs/GITHUB_AND_PI.md).

Because microSD is being used:

- Keep `MIN_FREE_STORAGE_MB` at 512 MB or higher.
- Confirm the backup timer every month.
- Perform a restore drill before relying on the system.
- Move `/var/lib/dtu-control` to a USB SSD when practical.

## CSV migration

Open Administration → CSV Import and download the correct template.

- Preview validates every row and project reference.
- No batch is stored when any row has an error.
- Commit runs as one SQLite transaction.
- Preview tokens expire after 30 minutes and cannot be reused.

## Tests

```powershell
npm.cmd test
npm.cmd run build
```

The API tests cover health, administrator login, CSRF rejection, project creation, QR issue submission, and public-host isolation.

## Pilot checklist

1. Change the initial administrator password.
2. Add DTU staff and department records.
3. Import only active projects and unresolved work.
4. Configure the public hostname, Tunnel, and Turnstile.
5. Configure R2 and successfully restore one encrypted backup.
6. Pilot with two or three projects.
7. Print QR labels only after testing them from a phone outside company Wi-Fi.
8. Configure SMTP once IT supplies an approved relay.
9. Disable a test staff account and confirm it can no longer sign in.
10. Reset a test staff password and confirm the forced password-change flow.
