# IoT health monitoring on the AI PC

The Node.js backend subscribes directly to eight local MQTT brokers over Tailscale. Node-RED is not required. IoT Scale is excluded. Subscriptions are read-only; the receiver does not publish commands or change the production systems.

## Where Tailscale goes

Keep Tailscale on every computer hosting an MQTT broker, as you already have it. Also install/sign in to Tailscale on the **AI PC running the DTU backend**, in the same tailnet. The dashboard browser does not need direct access to the brokers. The AI PC must remain running and connected to Tailscale for monitoring to continue.

Allow the AI PC to reach each broker's MQTT TCP port through Tailscale access rules and the broker computer's firewall. The broker must listen on an address reachable through Tailscale. No public internet port forwarding is needed. Use the MQTT port actually configured on each broker (commonly 1883; mqtts with TLS is supported too).

## Update an existing AI PC installation, one command at a time

Run these on the Linux AI PC, using the existing source checkout. The standard checkout below is `/srv/apps/dtu-ticketing-system`; use your actual checkout path if different. Run each command separately and continue only if it succeeds. This updates the existing `dtu-control` deployment; first-time application installation is covered in [AI PC deployment](AI_PC_DEPLOYMENT.md).

1. Open the checkout:

   ```bash
   cd /srv/apps/dtu-ticketing-system
   ```

2. Check for local changes. If files are listed, preserve/review them before pulling; do not discard them:

   ```bash
   git status --short
   ```

3. Select the deployment branch:

   ```bash
   git switch main
   ```

4. Download the update:

   ```bash
   git pull --ff-only origin main
   ```

5. Confirm Node is version 24 or newer:

   ```bash
   node --version
   ```

6. Install the locked dependencies, including MQTT:

   ```bash
   npm ci
   ```

7. Build the frontend and backend:

   ```bash
   npm run build
   ```

8. Deploy the built release (the installer also restarts the app if already running):

   ```bash
   sudo bash deploy/install-ai-pc.sh
   ```

9. Check Tailscale on the AI PC:

   ```bash
   tailscale status
   ```

   If the command is missing, install using the [official Linux instructions](https://tailscale.com/docs/install/linux):

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

   If the AI PC has not joined your tailnet, authenticate using the URL printed by:

   ```bash
   sudo tailscale up
   ```

10. Check the tested Sendayan broker's MQTT TCP port. This proves network/port reachability, not MQTT authentication or topic permissions:

    ```bash
    python3 -c 'import socket; s=socket.create_connection(("100.81.245.93",1883),timeout=10); print("Sendayan MQTT TCP port reachable"); s.close()'
    ```

11. Create the monitoring config only if it does not already exist (existing settings are kept):

    ```bash
    sudo test -e /var/lib/dtu-control/iot-monitor.json || sudo install -m 0640 -o root -g dtu config/iot-monitor.example.json /var/lib/dtu-control/iot-monitor.json
    ```

12. Edit broker addresses/topics and enable Sendayan Line 1 first:

    ```bash
    sudo nano /var/lib/dtu-control/iot-monitor.json
    ```

    Change only its `enabled` to `true` initially; the tested `mqtt://100.81.245.93:1883` and `sdy1/data` are already filled in. Leave the others disabled until configured. The JSON must keep its enclosing `systems` array. In nano, save with Ctrl+O, Enter, then exit with Ctrl+X.

13. Check JSON syntax:

    ```bash
    sudo python3 -m json.tool /var/lib/dtu-control/iot-monitor.json >/dev/null
    ```

14. Open the existing environment file:

    ```bash
    sudo nano /etc/dtu-control.env
    ```

    Add or update a single `IOT_MONITOR_CONFIG=/var/lib/dtu-control/iot-monitor.json` line. Keep the other existing settings. Add broker credential variables here if required, as described below.

15. Restart the backend to load monitoring configuration:

    ```bash
    sudo systemctl restart dtu-control
    ```

16. Check the service:

    ```bash
    sudo systemctl status dtu-control --no-pager
    ```

17. Check the application API:

    ```bash
    curl --fail http://127.0.0.1:3100/api/health
    ```

18. Inspect receiver/system statuses:

    ```bash
    curl --fail --silent http://127.0.0.1:3100/api/wallboard/iot | python3 -m json.tool
    ```

    Expect `receiverRunning: true`, `configurationError: false`, and eventually `healthy` for Sendayan Line 1 while it publishes. The other seven remain `unconfigured` until enabled. Healthy activity with `dataWarning: true` means the payload needs correction even though MQTT traffic is arriving.

19. If a check fails, read recent logs:

    ```bash
    sudo journalctl -u dtu-control -n 80 --no-pager
    ```

20. Open your existing **private staff dashboard URL**, sign in and choose **IoT health**. Use `/wallboard` for task/health rotation, or `/wallboard?view=health` for a fixed health display. Configure the remaining systems using the addresses and topics below, then repeat steps 13 and 15. If you changed the application's listening port from 3100, use that port in the curl commands.

## Where to put the Tailscale addresses

1. Copy [the configuration example](../config/iot-monitor.example.json) to a persistent file on the AI PC:

   ```bash
   sudo install -m 0640 -o root -g dtu config/iot-monitor.example.json /var/lib/dtu-control/iot-monitor.json
   sudo nano /var/lib/dtu-control/iot-monitor.json
   ```

   Run the copy from your source checkout after deploying. Copy only once; edit the existing file for later changes so you retain your settings.

2. In **each system's `brokerUrl`**, replace `REPLACE_WITH_TAILSCALE_IP` with that broker computer's Tailscale address:

   ```json
   {
     "id": "sdy-checksheet-l1",
     "enabled": true,
     "brokerUrl": "mqtt://100.81.245.93:1883",
     "topic": "sdy1/data",
     "delayedAfterSeconds": 30,
     "silentAfterSeconds": 120
   }
   ```

   Sendayan Line 1 is prefilled from your successful test. All eight entries initially have `enabled: false`; enable each only when its address and topic are ready. OEE site labels currently say Production because their physical locations have not been supplied.

3. Add this setting to `/etc/dtu-control.env` (including existing installations):

   ```dotenv
   IOT_MONITOR_CONFIG=/var/lib/dtu-control/iot-monitor.json
   ```

4. Restart after editing configuration or credentials:

   ```bash
   sudo systemctl restart dtu-control
   journalctl -u dtu-control -n 50 --no-pager
   ```

The configuration stays outside versioned application releases. Missing configuration leaves systems Not configured. Invalid configuration displays a configuration warning without stopping the task application. Broker addresses and credentials are not sent to the browser. Config changes require a backend restart.

For Windows development, copy the example to `data/iot-monitor.json`, edit it, and run `npm.cmd run dev`. Alternatively set `IOT_MONITOR_CONFIG` in the local `.env` to an absolute JSON path (forward slashes are simplest). Runtime configuration under `data/` is ignored by Git.

## Topics for the publishers

| System | Topic |
| --- | --- |
| Port Klang Checksheet Line 1 | `dtu/port-klang/checksheet/line1/telemetry` |
| Port Klang Checksheet Line 3 | `dtu/port-klang/checksheet/line3/telemetry` |
| Port Klang Checksheet MF | `dtu/port-klang/checksheet/mf/telemetry` |
| Sendayan Checksheet Line 1 | `sdy1/data` (existing tested topic) |
| Sendayan Checksheet Line 2 | `dtu/sendayan/checksheet/line2/telemetry` |
| OEE PE2 | `dtu/oee/pe2/telemetry` |
| OEE 4MTR | `dtu/oee/4mtr/telemetry` |
| OEE 2MTR | `dtu/oee/2mtr/telemetry` |

These are defaults, not mandatory publisher changes. You can keep any existing topic and change its `topic` in the JSON. Use one exact topic per system, without `+` or `#`. If you want Sendayan Line 1 to follow the naming convention too, use `dtu/sendayan/checksheet/line1/telemetry` in both the publisher and configuration.

Publish a full JSON snapshot **every 5 seconds, including during idle and planned stops**, to each system's own local broker. The AI PC subscribes to it remotely. Use real JSON `null`, not `*null*`. Numbers and booleans must have their native JSON types. Keep payloads under 64 KiB. Use QoS 0 or 1. `retain: false` is recommended; retained messages replayed on subscription are ignored and do not mark a publisher healthy.

Example payload (the rest of your supplied fields are also supported):

```json
{
  "shift_id": "20261102-Day-SDY1",
  "hour_slot": "15.00-16.00",
  "line": "SDY1",
  "date": "2026-11-02",
  "shift": "Day",
  "group": "-",
  "working_time": "8:00 AM to 4:15 PM",
  "overtime": false,
  "scheduled_end_at": "2026-11-02T16:15:00",
  "model": "T00W 5D PET",
  "lot_number": "4O_0469",
  "machine_status": 5,
  "current_mode": "PLANNED STOP",
  "product_count": 30,
  "total_product_count": 30,
  "hourly_output": 0,
  "total_reject": 0,
  "recovered_from_sqlite": true,
  "shift_entry_status": "ACTIVE",
  "shift_entry_window_ends_at": null,
  "current_cycle_time": 2.61,
  "standard_cycle_time": 1.71,
  "run_time": 2508.8,
  "downtime": 0
}
```

The receiver accepts the production fields supplied in this feature's sample, including operating, loading, delay, downtime, rest, planned-stop, model-change and total-machine times. It displays their original units and does not derive OEE or infer machine-status number meanings. Send `current_mode` as a human-readable machine state. Unknown fields are discarded; new schemas need a receiver mapping in `server/iotMonitor.ts`. If a publisher only needs health detection, a continuously published supported field such as `line` is enough.

Optional broker authentication: add `"usernameEnv": "SDY1_MQTT_USER"` and `"passwordEnv": "SDY1_MQTT_PASSWORD"` to its JSON entry, then set those variables in `/etc/dtu-control.env`. Keep secrets out of broker URLs and source control. Broker accounts need permission to subscribe to the configured topics. Use distinct credentials/variable names as needed. Missing configured credentials show Unreachable. TLS uses normal certificate validation.

## Dashboard behavior

- Open **IoT health** in the sidebar (`/iot-health`) for all eight cards and a clickable telemetry detail dialog.
- `/wallboard` alternates between the task board and health page every five minutes. Manual page controls and a pause toggle are available. Rotation pauses while inspecting health details or task details; portfolio/queue views remain open until you return. The wallboard fills the viewport without page scrolling. All eight health systems stay visible together: four columns/two rows on TV-width displays, with a denser health summary on narrower/shorter screens. Compact cards omit job details, and dense cards prioritize health, system name and message freshness; selecting a card opens the full readings. There is no automatic paging between health systems. The signed-in `/iot-health` page still lists all systems normally.
- `/wallboard?view=health` opens a fixed health page, with rotation initially paused.
- Newly arriving open tasks/issues immediately bring the wallboard back to its task-board overview, including when a detail view is open. This resets the five-minute display timer. Notification sound remains controlled by the existing sound toggle.
- The browser polls every five seconds and ages message timestamps every second. A failed request or stale receiver response marks monitoring unavailable and values stale. The health endpoint follows the existing private-network wallboard access rules and is blocked on the public reporting hostname. It contains operational data and must stay on the private staff host.
- Healthy means a fresh non-retained MQTT message arrived. Delayed starts at 30 seconds and Silent at 120 seconds by default; set both per system according to its actual publishing interval. A connected subscription with no first message starts Waiting, then becomes Delayed/Silent.
- A broker connection/subscription failure is Unreachable; machine health is unknown. MQTT connectivity alone cannot identify whether a fault is in Tailscale, the broker, a device, or its publishing software.
- Machine state (for example PLANNED STOP) is independent of MQTT connection health. Original machine values remain visible with stale markings if traffic stops. Invalid JSON/unsupported telemetry still proves message activity but raises a data warning and preserves the last valid snapshot with its own timestamp.
- Last-message times and telemetry are held in memory. After a backend restart, each system must send a new live message; historical monitoring storage and notifications are not part of this feature.

## Commissioning check

Enable Sendayan Line 1 first, keeping `sdy1/data`. Confirm the card becomes Healthy and matches the live payload. Stop only a test publisher: it should become Delayed, then Silent, while the broker stays connected. Disconnect broker access: it should become Unreachable. Restore the connection and publisher: it should recover automatically. Verify monitoring continues after closing and reopening the browser. Repeat for the other seven configured systems.
