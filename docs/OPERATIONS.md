# Operations Runbook

## Daily

- Check the dashboard for untriaged requests, unassigned issues, overdue work, and low storage.
- Make public comments only when they are appropriate for the reporter.
- Resolve work first, then close it after the reporter or DTU confirms completion.

## Weekly

- Review projects marked On Hold.
- Check workload distribution.
- Send an SMTP test from Administration → System and confirm delivery.
- Confirm the newest encrypted backup exists in R2.
- Review the audit feed for unexpected account or workflow changes.

## Deploy an update

From the checked-out repository on the Pi:

```bash
git pull --ff-only
npm ci
npm run build
sudo bash deploy/install-pi.sh
sudo systemctl status dtu-control --no-pager
```

Application data and secrets remain under `/var/lib/dtu-control` and `/etc/dtu-control.env`; the installer does not replace them.

## Email delivery checks

- SMTP configuration is read from the server environment at startup; restart `dtu-control` after changing it.
- Port 587 normally uses `SMTP_SECURE=false`; port 465 normally uses `SMTP_SECURE=true`.
- Staff accounts without an email address still receive in-app notifications, but cannot receive email notifications.
- If the admin test fails, check `journalctl -u dtu-control`, then verify the relay hostname, port, TLS mode, credentials, sender address, and whether the relay allows the Pi's network address.

## Incident response

### Application is unavailable

1. On the Pi, run `systemctl status dtu-control`.
2. Check `journalctl -u dtu-control --since "30 minutes ago"`.
3. Confirm `curl http://127.0.0.1:3100/api/health`.
4. If local health works but public forms do not, check `systemctl status cloudflared`.
5. Restart only the failed service and record the incident as a DTU work item.

### Uploads stop

The server returns HTTP 507 before the configured free-space reserve is crossed. Remove obsolete local backup copies only after confirming R2 contains them. Do not manually delete files from the uploads directory because attachment records would become inconsistent.

### Suspected account compromise

1. Disable external access at Cloudflare if public abuse is ongoing.
2. Stop the application if staff access is compromised.
3. Preserve the database and logs.
4. Rotate the affected account password, SMTP credentials, Tunnel token, R2 credentials, and backup key as applicable.
5. Review `audit_events`, `sessions`, and public submission volume.

## Restore drill

Perform quarterly:

1. Copy the newest R2 object to a clean test Pi or isolated directory.
2. Set the original backup encryption key.
3. Run the restore command documented in the README.
4. Start the application.
5. Verify login, project count, latest ticket, comments, and at least one attachment.
6. Record the restore date, backup date, duration, and any issue found.
