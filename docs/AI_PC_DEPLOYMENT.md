# Gigabyte AI Atom PC deployment

The Gigabyte AI Atom PC is the current production target. The application runs as a hardened `systemd` service with versioned releases, persistent data under `/var/lib/dtu-control`, and an optional backup timer.

## Requirements

- A 64-bit Linux distribution with `systemd`
- Node.js 24 LTS and npm
- Git, Python 3, and build-essential packages for native Node modules
- A reverse proxy or secure tunnel that terminates HTTPS

HTTPS is required for installation on phones, service workers outside `localhost`, and browser notification permission. Set the staff-facing `APP_BASE_URL` to its HTTPS address and set `COOKIE_SECURE=true`.

Set `PUBLIC_BASE_URL` and `PUBLIC_HOSTNAME` to the real HTTPS hostname used by employees submitting and tracking requests. The server now falls back to the incoming public hostname when these values are still examples, but configuring them explicitly is recommended for emailed links.

Set the approved SMTP relay and sender in `/etc/dtu-control.env` to enable the branded requester confirmation email. On each request detail page, an admin or lead can enter/correct the public portal address, open a fresh secure tracker, copy it, or email it to the requester. The screen reports delivery failure explicitly when SMTP is unavailable.

## First installation

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
git clone git@github.com:digitalsgisb/dtu-ticketing-system.git /srv/apps/dtu-ticketing-system
cd /srv/apps/dtu-ticketing-system
npm ci
npm run build
sudo bash deploy/install-ai-pc.sh
sudo nano /etc/dtu-control.env
sudo systemctl start dtu-control dtu-backup.timer
curl http://127.0.0.1:3100/api/health
```

The reverse proxy should forward the private HTTPS staff hostname to `http://127.0.0.1:3100`. Keep the public reporting hostname restricted as documented in the main README.

## Deploy an update

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

The installer keeps `/etc/dtu-control.env`, the SQLite database, uploaded files, backups, and logs outside each release. It switches `/opt/dtu-control/current` only after the new release is assembled.

## PWA verification

After deploying through HTTPS:

1. Open the staff URL on a phone and sign in.
2. Use the browser's **Add to Home Screen** action or the in-app **Install app** action when shown.
3. Open **Notifications**, enable device notifications, and accept the browser permission prompt.
4. Assign a test ticket to that user and confirm the in-app badge and device alert appear while the installed app is signed in.

The current device alerts are driven by authenticated polling every 30 seconds. Private notification data and API responses are never stored in the service-worker cache.
