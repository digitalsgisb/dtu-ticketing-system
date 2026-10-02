# Operations Runbook

## Daily

- Check the dashboard for untriaged requests, unassigned issues, overdue work, and low storage.
- Make public comments only when they are appropriate for the reporter.
- Resolve work first, then close it after the reporter or DTU confirms completion.
- Choose **Individual** for a task that requires each assignee to complete their part and submit their own note and up to three photos or documents. It closes when everyone finishes. Choose **Group** when one assignee should submit the team's completion and evidence; that submission closes the task for everyone. A lead or admin can change the method in task settings. Changing it reopens the task and resets active completion checks while preserving earlier notes and files in the history.
- To submit a result, open the assigned task, choose **Submit my work** (Individual) or **Submit for the team** (Group), write a note or choose at least one document/photo, then confirm. Attach up to three files of 5 MB each. The note and files appear in **Completion evidence** on the task page after submission.
- Project task completion is displayed separately from manually published delivery progress. Individual tasks contribute each assignee's share; group tasks contribute when the team submission is complete. General tasks do not affect project percentages.

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
- Every staff alert now includes a branded HTML email and a plain text alternative. Set each staff member's email in their profile or Administration → Users.

## Phone push notifications

1. Generate one VAPID key pair with `npx web-push generate-vapid-keys` on a trusted computer.
2. Put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT=mailto:admin@your-domain` in `/etc/dtu-control.env`. Keep the private key out of Git and backups that are shared externally. Restart `dtu-control`.
3. Open the HTTPS staff site on each phone, install the app where the browser requires it, sign in, and select **Enable notifications** on the Notifications page.
4. In **Administration → System**, check **Phone push** and select **Send test phone notification**. It sends to the devices registered to your admin account and reports whether the push service accepted it. Confirm that the alert actually appeared on the phone; acceptance alone does not prove display.
5. Each staff member can use **Send test to my phone** on their Notifications page after background push is linked. Create a test task assigned to another user and verify the in-app alert, email, and phone notification. Browser and phone notification permission must be allowed. On iPhone, add the site to the Home Screen before enabling push.

If VAPID keys are absent, the in-app feed and email still work, and device alerts appear while the app is open. Push subscriptions are tied to the signed-in user and removed when they turn off notifications.

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
