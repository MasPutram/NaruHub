#!/bin/bash
# NaruHub WS Server - VPS Setup Script
# Run on VPS: bash setup-vps.sh

set -e

echo "=== NaruHub WS Server Setup ==="

# 1. Install nginx + certbot if not present
echo "[1/6] Installing nginx & certbot..."
sudo apt update -y
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. Create app directory
echo "[2/6] Setting up app directory..."
sudo mkdir -p /opt/naruhub-ws
sudo cp server.js package.json /opt/naruhub-ws/
cd /opt/naruhub-ws
npm install --production

# 3. Create systemd service
echo "[3/6] Creating systemd service..."
sudo tee /etc/systemd/system/naruhub-ws.service > /dev/null <<'EOF'
[Unit]
Description=NaruHub WebSocket Server
After=network.target redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/naruhub-ws
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=WS_PORT=8080
Environment=REDIS_URL=redis://127.0.0.1:6379
Environment=ACCESS_KEY=NARUHUB-PREMIUM-505

[Install]
WantedBy=multi-user.target
EOF

# 4. Nginx config for ws.naruhub.my.id
echo "[4/6] Configuring nginx..."
sudo tee /etc/nginx/sites-available/ws.naruhub.my.id > /dev/null <<'EOF'
server {
    listen 80;
    server_name ws.naruhub.my.id;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/ws.naruhub.my.id /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 5. SSL certificate
echo "[5/6] Getting SSL certificate..."
sudo certbot --nginx -d ws.naruhub.my.id --non-interactive --agree-tos -m putramadhan010@gmail.com

# 6. Start WS server
echo "[6/6] Starting WS server..."
sudo systemctl daemon-reload
sudo systemctl enable naruhub-ws
sudo systemctl start naruhub-ws

echo ""
echo "=== Done! ==="
echo "WS server running at wss://ws.naruhub.my.id"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status naruhub-ws    # check status"
echo "  sudo journalctl -u naruhub-ws -f    # view logs"
echo "  sudo systemctl restart naruhub-ws   # restart"
