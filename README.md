# DTU Ticketing & Project Control Centre

A bilingual internal operations system for a Digital Transformation Unit. It combines project intake, portfolio tracking, tasks, support issues, QR reporting, reporter updates, a lab wallboard, CSV migration, and encrypted backups in one self-hosted application. The current production target is the Gigabyte AI Atom PC.

## Update from GitHub

From this repository folder, run:

```bash
git pull --ff-only origin main
```

For the AI PC, follow the [pull and deploy steps](#pull-and-deploy-the-update-on-the-ai-pc) after the latest changes have been pushed to GitHub.

## What is implemented

- Control panels follow the final marked positions: Line 1 is beside its mould-change platform at the circled space, rotated to face the waterjet-side area; its separate two-TV stand is at the blue-arrow location near auto glue/QC. Line 2 is moved to the marked rectangle beside the outlet and rotated, retaining its two mounted TVs. Pi boards and data endpoints rotate and move with their panels. Line camera views fit the relocated equipment on narrower displays. Nearby mould/outer storage is spaced clear of panels and the marked perimeter road. Normal car-park cars are removed; the separate EV bay remains.
- Smart Attendance is wall-mounted with a landscape screen, smaller portrait unit and short cable, facing the walkway in the marked direction. Its data endpoint and close-up camera follow that orientation. **Attendance unit** opens a close-up. Nine illustrative directed paths show six sensors → two panel-mounted Raspberry Pis → office, plus Smart Attendance → office. Cyan dots mark sensor traffic; purple dots mark office-bound traffic. The office receiving-point marker is displayed above the office for visibility. All motion still shares the pause control; no live data is implied.

- The Sendayan map uses a white architectural context with coloured monitored Asano/waterjet equipment, six sensor/transmitter markers, two Raspberry Pi cutaway boards inside the Asano control panels, and a wall-mounted Smart Attendance screen and smaller portrait unit. Three sensors per line (two waterjet and one forming-trolley sensor) send illustrative moving data dots toward their own Pi. Data paths and all machinery share Pause motion, reduced-motion defaults and hidden-tab pausing; the view does not claim live sensor or attendance readings. The office and toilet have L-shaped footprints based on the latest sketch, with upper/office-side entrance frames and an empty normal car-park strip. **Office & attendance** opens a close-up; the original photo-traced green walkways remain.
- The main fire plan is the reference for the office corner: office strip, meeting room, tables/chairs in front, L-shaped toilet and office, and MSB. The tar road follows only the user-marked perimeter ring, with dashed markings and no internal road branches. Guard house, eastern empty rack, EV parking bay and TNB positions follow the plan. The EV bay includes a parked car and a coloured charger; no live charging status is connected.

- **3D Factory Map** at `/factory-map`: signed-in Sendayan layout preview based on the fire plan and production-line sketch. Line 1 (lower Asano) and Line 2 (upper Asano) share equipment sizes and station arrangement, with the mould-change platform mirrored on Line 2: one forming machine, two ABB robotic waterjet stations, two UR auto-glue stations, and a QC line with repeated overhead/side lighting frames. Names appear on hover; click or tap equipment, or use the searchable list, for details. Robot motion is illustrative, with a pause/resume control; motion starts paused for reduced-motion preferences and stops while the tab is hidden. Includes orbit/zoom/pan and top/reset/line views. Geometry and positions are approximate, not measured. Live telemetry is not connected. The site selector reserves Port Klang for its future layout. Three.js is bundled locally and loaded only when opening the map page.
- Three project pins remain readable at a fixed screen size while zooming: Line 1 Checksheet (`PRJ-0014`), Line 2 Checksheet (`PRJ-0015`), and Smart Attendance (`PRJ-0013`). The mapping lives in `src/pages/factoryProjects.tsx`. Pins and monitored equipment open cards loaded from the existing authenticated `/api/staff/projects` endpoint, showing the saved project name, status, progress, latest progress photo, department and owner, with a link to the actual project ID. Cards follow the app's normal live refresh and show explicit missing-record or fetch-error states. No progress or status is hardcoded into the map, and these project records are separate from the illustrative sensor flows. Quick-find buttons focus the corresponding location.

- Factory map navigation: drag to rotate, hold Space and drag to pan, and scroll to zoom on desktop. On touchscreens, one finger pans and two fingers rotate/pinch to zoom. Tap equipment for details. ABB and UR motion runs at three times the initial preview speed.
- The loft-layer area has approximately two-storey rack rows with a central aisle and an animated forklift that drives forward and reverses inside it. Use **Loft area** for an aisle view. **Pause motion** controls both robots and the forklift; all animation respects the existing reduced-motion default and hidden-tab pause. Loft height and forklift movement are illustrative, not measured or live.
- The Asano models show car-floor-carpet forming: left-side loft-layer and roll feeds, heating section, forming press, right-side shaped carpet outlet, hydraulic unit, and mould-change platform. Rolls are also grouped in three staging areas based on the plan's red circles. Hover a machine section for its name. The press and input roll share the motion control. These are schematic interpretations, with approximate proportions.
- Each waterjet section has two animated ABB arms side by side on the same side of its mould, facing the same direction: four sections and eight ABB arms across Sendayan's two lines. Each auto-glue section retains one UR arm.
- Line 2's red mould-change platform is opposite Line 1's; its adjacent control cabinet is shifted clear of the platform. Filled green walkway boundaries are manually traced from the supplied fire-plan photograph, preserving the wide main aisles, narrower stepped Asano branch, lower cross-aisle and storage/car-park connection. Two striped crossings mark the main spine. The former perimeter band is removed because the photograph shows separate outside arrows. A shared depth correction preserves equal image scale on both ground axes; nearby equipment and storage positions are aligned clear of the trace. Photo proportions are approximate and have no measured metre scale.

- Direct MQTT IoT health monitoring for eight Checksheet/OEE systems over Tailscale, live production cards, telemetry details, and task/health wallboard rotation. Configure broker addresses and topics using [the IoT setup guide](docs/IOT_MONITORING.md) and [example configuration](config/iot-monitor.example.json).

- Project request workflow: Submitted → Triage → Needs Information → Approved/Rejected.
- Approval creates a linked project without losing the original request.
- Project portfolio with owner, department, priority, status, deadline, progress, and permanent QR token.
- All signed-in team members can publish project progress, notes, next actions, and supporting photos, including for projects owned by another person. Project setup and editing remain restricted to admins and leads.
- Tasks and issues with assignment, priority, deadline, comments, attachments, audit history, and notifications.
- Public bilingual project request and QR issue forms.
- Private reporter tracking links with public-safe updates and replies.
- Privacy-safe wallboard with a 30-second refresh.
- Monthly Review for admins and leads at `/monthly-review`: month-by-month project cards, saved AI/IoT/Software/Automation/Infrastructure categories, and separate Current Projects, Future Plans, and Request Pipeline views. Current Projects includes live work in progress, on hold, and under monitoring even without a monthly update. Future Plans includes projects with planned status. Presentation mode can switch between these sections, with an analysis overview and compact animated category rail in each. Loading and category changes use fades with reduced-motion support. Historical progress uses dated updates with Malaysian month boundaries; undated history is shown as unrecorded. Analysis states its recorded-progress and baseline coverage. Categories and project details use current settings. Categorized requests pass their category to the project on approval.
- Project Overview adds a live all-project table with No., project name, category, department, summary, progress, and status, also available in presentation mode. Select a row or project name to open details and saved system links. Monthly, current, and future views can switch between cards and tables.
- The main dashboard includes instant project search by name, ID, department, owner, and group name. Open a result directly or continue into the filtered project list.
- Project groups carry across All Projects, My Projects, Progress Briefing, Monthly Review cards/tables/presentations, System Links, and the wallboard portfolio. Expand or collapse groups, switch to individual projects, and navigate related projects from their detail pages. Filters and ownership apply before calculating visible group progress. Admins and leads can also use **Manage groups** in the project list or briefing.
- Use **Group projects** in Monthly Review to create an umbrella such as Safety Digital and select its existing child projects. Groups can be renamed, edited, expanded in the table, or ungrouped. Each project belongs to at most one group and keeps its original tasks, updates, links, status, and progress. Group progress is an equal-weight average of recorded progress for visible children (with coverage shown); differing child statuses display Mixed. Group membership is current reporting metadata, including when viewing historical months. Grouping never merges or deletes project records.
- Local Admin, Lead, and Member accounts using Argon2id passwords and server-side sessions. Sessions remain valid until logout or administrator revocation. Browser cookies persist across restarts and renew for 400 days on each authenticated request; clearing cookies or exceeding the browser's cookie lifetime requires signing in again. The former `SESSION_DAYS` setting is no longer used.
- CSRF checks, login throttling, public rate limits, upload magic-byte checks, randomized filenames, free-space protection, Helmet headers, and public-host route isolation.
- Preview-before-commit CSV imports for projects and unresolved tickets.
- Optional SMTP notifications.
- Installable PWA with a mobile navigation shell, offline status, safe static-asset caching, and opt-in device notifications.
- Role-focused workspaces for Administrators, Team Leads, and Team Members.
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

### Pull and deploy the update on the AI PC

After the changes have been pushed to GitHub, connect to the AI PC as `sugidigital` and run these commands from the cloned repository—not from `/opt/dtu-control/current`:

```bash
cd /srv/apps/dtu-ticketing-system
git status --short
git switch main
git pull --ff-only origin main
npm ci
npm run build
sudo bash deploy/install-ai-pc.sh
sudo systemctl status dtu-control --no-pager
curl http://127.0.0.1:3100/api/health
```

`git status --short` should normally return no output before pulling. The installer creates a new production release and restarts the application when it is already running. It preserves `/etc/dtu-control.env`, the database, uploads, backups, and logs.

If the health check does not return an `ok` response, inspect the latest service logs:

```bash
sudo journalctl -u dtu-control --since "10 minutes ago" --no-pager
```

## Company branding

The Sugihara Grand Industries logo is stored locally at `public/sugihara-grand-logo.png` and used by the staff portal, login page, public request portal, wallboard, and printable QR labels. Because it is bundled locally, the deployed AI PC does not need to contact GitHub to display the logo.

## Public and private routing

Set:

```dotenv
APP_BASE_URL=https://replace-with-your-staff-hostname.invalid
PUBLIC_BASE_URL=https://replace-with-your-public-hostname.invalid
PUBLIC_HOSTNAME=replace-with-your-public-hostname.invalid
SHOWCASE_BASE_URL=https://dtutracker.sugidigital.org
```

Requests received on the configured public hostname can use only:

- `/p/{project-token}`
- `/request`
- `/track/{private-token}`
- `/showcase/{guest-token}` and its project pages
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
SMTP_FROM=Digital Transformation Unit <replace-with-approved-sender@your-company-domain.invalid>
```

Use port `587` with `SMTP_SECURE=false` for STARTTLS, or port `465` with `SMTP_SECURE=true` for implicit TLS. `APP_BASE_URL` must be the private staff URL because links in staff notification emails use it.

After restarting the application:

1. Sign in as an administrator.
2. Open **Administration → System**.
3. Confirm SMTP shows as configured.
4. Send a test email from the SMTP integration panel.

Staff members receive matching in-app and email notifications when their account has an email address. These cover assignments, comments, approaching deadlines, new public issues and requests for leads/admins, and public replies. Requesters receive a branded confirmation email containing their secure tracking link. Admins and leads can also open, copy, or resend a fresh secure link from any existing request detail page. Reporters receive confirmation, status-change, and public-comment emails when they supplied an email address.

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

## Gigabyte AI Atom PC deployment

Use a 64-bit Linux distribution with `systemd` and Node.js 24 LTS.

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
npm ci
npm run build
sudo bash deploy/install-ai-pc.sh
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

The installer deploys a versioned production release under `/opt/dtu-control/releases` and installs production dependencies for the AI PC. It deliberately excludes local `.env` files, databases, uploads, backups, logs, Git history, Windows dependencies, and development tools.

For the complete deployment workflow, follow [docs/AI_PC_DEPLOYMENT.md](docs/AI_PC_DEPLOYMENT.md).

For reliable operation on the AI PC:

- Keep `MIN_FREE_STORAGE_MB` at 512 MB or higher.
- Confirm the backup timer every month.
- Perform a restore drill before relying on the system.
- Put `/var/lib/dtu-control` on reliable local storage included in your backup plan.

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

Project requests are separated into Pending review, Under review, Needs information, Approved, and Rejected sections with stage counts and filters. Approval requires an AI, IoT, Software, Automation, Infrastructure, or Other category, which is saved on the request and approved project. Monthly Review’s Request pipeline includes all stages, acceptance (approved / all requests), delivery (completed or monitoring / approved requests), and pending counts; these metrics reflect the live pipeline independently of the selected reporting month.

Project overview tables sort by newest project number first, with groups positioned by their newest child. Detail popups include up to four latest progress photos per project, alongside their details and system links.

The request overview table is the default in Project Requests and Monthly Review’s Request pipeline, including presentation mode. It sorts newest request numbers first and includes request name, category, department, summary, linked delivery progress, and status. Stage/category filters apply to the table; Cards restores the staged card sections. Select a request name to open its record or a linked project number to view delivery details.

Monthly Review request names open an in-place detail dialog in tables, cards, and presentation mode. The dialog includes request facts, problem/outcome, decision notes, supporting files, and the linked project’s progress, photos, and links. Project Overview also shows category counts/shares, status totals, departments, groups, and unassigned projects. Counts use individual records in the current filtered view, independent of table grouping.
