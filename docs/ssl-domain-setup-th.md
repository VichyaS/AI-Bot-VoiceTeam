# SSL / Domain Setup (แบบละเอียด)

## 1. เลือกโดเมนและ TLS

- ใช้โดเมนที่มี A record ไปยัง Public IP ของ host
- สำหรับ HTTPS ให้ใช้ Nginx + Let's Encrypt หรือ Azure Load Balancer / App Gateway / Cloudflare SSL
- ถ้าเป็น SIP/TLS ต้องติดตั้ง certificate สำหรับ CN/SAN ที่ตรงกับโดเมนที่ SBC ใช้

## 2. ตัวอย่าง Nginx + Let's Encrypt (Ubuntu)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d voicebot.example.com
```

## 3. Reverse proxy ไปยัง Node app

```nginx
server {
    listen 80;
    server_name voicebot.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name voicebot.example.com;

    ssl_certificate /etc/letsencrypt/live/voicebot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voicebot.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 4. Health check

```bash
curl https://voicebot.example.com/api/health
```

## 5. Azure / Cloudflare / Load Balancer

- Azure: ใช้ Application Gateway หรือ Load Balancer + Certificate
- Cloudflare: เปิด SSL/TLS at edge และ proxy ท traffic ไป host ที่มี port 80/443
- Hostinger: ถ้าใช้ VPS จะติดตั้ง Nginx + Let's Encrypt ได้ตรง ๆ

## 6. SIP/TLS certificate

Set environment variables:

```bash
export SIP_TLS_ENABLED=true
export SIP_TLS_CERT_PATH=/etc/ssl/voicebot/voicebot.crt
export SIP_TLS_KEY_PATH=/etc/ssl/voicebot/voicebot.key
export SIP_TLS_PORT=5061
```

## 7. Firewall checklist

- Allow 80/tcp from Internet
- Allow 443/tcp from Internet
- Allow 5060/5061/tcp+udp from SBC
- Allow RTP range 10000-20000/udp from SBC
