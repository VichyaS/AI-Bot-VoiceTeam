#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/AI-Bot-VoiceTeam}"
APP_REPO="${APP_REPO:-https://github.com/VichyaS/AI-Bot-VoiceTeam.git}"
NODE_MAJOR="${NODE_MAJOR:-24}"

echo "Installing base packages..."
sudo apt update
sudo apt install -y curl git nginx ufw build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

if [ ! -d "$APP_DIR/.git" ]; then
  sudo git clone "$APP_REPO" "$APP_DIR"
else
  sudo git -C "$APP_DIR" pull --ff-only
fi

cd "$APP_DIR"
sudo npm ci
sudo npm run build:all

echo "Opening firewall ports for HTTPS, SIP, SIP/TLS, and RTP..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 5060/udp
sudo ufw allow 5061/tcp
sudo ufw allow 10000:20000/udp
sudo ufw --force enable

echo "Starting app with PM2..."
pm2 start dist/webhook-server.js --name voice-bot-api --env production || pm2 restart voice-bot-api
pm2 save

echo "Bootstrap complete. Configure environment variables, TLS certs, and Nginx before production use."