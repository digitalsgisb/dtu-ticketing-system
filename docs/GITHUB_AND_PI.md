# GitHub and Raspberry Pi Deployment Guide

This repository contains application source code only. Passwords, SMTP credentials, databases, uploads, backups, logs, `node_modules`, and compiled output must stay outside GitHub.

## 1. Install Git on the Windows development computer

Git is not currently available in this computer's command path.

1. Download Git for Windows from <https://git-scm.com/download/win>.
2. Install it with Git Credential Manager enabled.
3. Close and reopen PowerShell.
4. Confirm:

```powershell
git --version
```

## 2. Configure your Git identity

Use the name and email associated with your GitHub account:

```powershell
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 3. Verify that secrets and data are ignored

Open PowerShell in the project folder:

```powershell
Set-Location "C:\Users\haffizol\Desktop\Code\DTU Ticketing System"
git status
git check-ignore -v .env
git check-ignore -v data/dtu.sqlite
```

Both checks should print an ignore rule. Before every first push, inspect the staged files:

```powershell
git add .
git status
```

The staged list must not contain:

- `.env`
- `data/` or `data-test/`
- SQLite files
- uploads or encrypted backups
- `node_modules/`
- `dist/` or `dist-server/`
- log files

If a secret was previously tracked, stop before pushing. Remove it from Git tracking and rotate the exposed credential.

## 4. Make the first commit

This folder already appears to have Git metadata. If `git status` says it is not a repository, run `git init -b main` once.

```powershell
git add .
git status
git commit -m "Prepare DTU Control Centre for Raspberry Pi pilot"
git branch -M main
```

## 5. Create the GitHub repository

1. Sign in to <https://github.com/>.
2. Select **New repository**.
3. Use a name such as `dtu-ticketing-system`.
4. Choose **Private** unless the company explicitly approves public release.
5. Do not add a README, `.gitignore`, or license because this project already contains those files.
6. Create the repository and copy its HTTPS URL.

Connect and push:

```powershell
git remote -v
git remote add origin https://github.com/YOUR-ACCOUNT/dtu-ticketing-system.git
git push -u origin main
```

If `origin` already exists:

```powershell
git remote set-url origin https://github.com/YOUR-ACCOUNT/dtu-ticketing-system.git
git push -u origin main
```

Git Credential Manager should open a browser for GitHub sign-in. Do not use your GitHub account password as a Git password.

## 6. Prepare the Raspberry Pi

Use 64-bit Raspberry Pi OS, the official Raspberry Pi 5 power supply, active cooling, and preferably an SSD for `/var/lib/dtu-control`.

Set the timezone:

```bash
sudo timedatectl set-timezone Asia/Kuala_Lumpur
timedatectl
```

Install build prerequisites:

```bash
sudo apt update
sudo apt install -y git build-essential python3
node --version
npm --version
```

The Node version must be 24 or newer.

## 7. Give the Pi read-only access to a private repository

Generate a dedicated SSH key on the Pi:

```bash
ssh-keygen -t ed25519 -C "dtu-control-pi"
cat ~/.ssh/id_ed25519.pub
```

In the GitHub repository, open **Settings → Deploy keys → Add deploy key**. Paste the public key and leave write access disabled.

Clone:

```bash
cd ~
git clone git@github.com:YOUR-ACCOUNT/dtu-ticketing-system.git
cd dtu-ticketing-system
```

## 8. Build and install on the Pi

Never copy Windows `node_modules` to the Pi. Native modules must be installed for ARM64 on the Pi:

```bash
npm ci
npm run build
sudo bash deploy/install-pi.sh
sudo nano /etc/dtu-control.env
```

At minimum, replace:

- `APP_BASE_URL`
- `PUBLIC_BASE_URL` and `PUBLIC_HOSTNAME`
- `INITIAL_ADMIN_PASSWORD`
- Turnstile credentials
- SMTP credentials
- R2 credentials
- `BACKUP_ENCRYPTION_KEY`

Then:

```bash
sudo systemctl start dtu-control dtu-backup.timer
sudo systemctl start dtu-backup
systemctl status dtu-control --no-pager
systemctl status dtu-backup --no-pager
systemctl list-timers dtu-backup.timer
curl http://127.0.0.1:3100/api/health
```

## 9. Deploy later updates

Commit and push changes from Windows:

```powershell
git add .
git status
git commit -m "Describe the change"
git push
```

On the Pi:

```bash
cd ~/dtu-ticketing-system
git pull --ff-only
npm ci
npm run build
sudo bash deploy/install-pi.sh
sudo systemctl status dtu-control --no-pager
```

The installer creates a new versioned release and switches `/opt/dtu-control/current` to it. It does not copy `.env`, databases, uploads, backups, logs, Git history, or development dependencies.
