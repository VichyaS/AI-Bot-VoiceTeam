# AudioCodes SBC 7.60 – ตัวอย่างการกำหนดค่า

เอกสารนี้เป็นตัวอย่างสำหรับการต่อ VoiceAI Connect/IVR Bot กับ AudioCodes SBC 7.60 แบบที่มี SIP/TLS และ SRTP เป็นทางเลือก

## 1. คำแนะนำทั่วไป

- ใช้ Public IP ของ host ที่รองรับ SIP/RTP โดยตรง
- เปิดพอร์ต TCP/UDP 5060/5061 และ RTP range ตามที่กำหนดใน host
- สำหรับ SIP/TLS ใช้พอร์ต 5061 และไฟล์ cert/key ที่ถูกต้อง
- ถ้าเปิด SRTP ให้ตั้งค่า profile ที่ตรงกับ SBC และ peer
- สำหรับการทดสอบใน dev ควรใช้ SIP over UDP ก่อน แล้วค่อยย้ายไป TLS/SRTP

## 2. ตัวอย่าง SIP Trunk / Interface

- SIP Interface Name: `voicebot-sip`
- Transport: `UDP` หรือ `TLS`
- Listen Port: `5060` (UDP) หรือ `5061` (TLS)
- Remote Address: `your-host-public-ip`
- Proxy / Registrar: `your-host-public-ip`
- Media IP: `your-host-public-ip`

## 3. ตัวอย่าง Media Profile

- RTP Port Range: `10000-20000`
- SRTP: `Disabled` หรือ `Enabled` ตามความต้องการ
- Payload Type: `PCMU/8000` และ `PCMA/8000`
- Codec Preference: `PCMU, PCMA`

## 4. ตัวอย่าง SBC Routing Rule

- Source: Incoming trunk from carrier / SIP provider
- Destination: VoiceAI Connect / IVR endpoint
- Action: `Route to IVR`
- SIP Headers:
  - `P-Asserted-Identity`
  - `Remote-Party-ID`
- Media: `Pass-through`

## 5. ตัวอย่าง TLS Certificate

เตรียมตัวอย่างไฟล์:

```bash
mkdir -p /etc/ssl/voicebot
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 \
  -nodes -keyout /etc/ssl/voicebot/voicebot.key \
  -out /etc/ssl/voicebot/voicebot.crt \
  -subj "/CN=voicebot.example.com"
```

นำค่าเหล่านี้ไปใส่ใน environment variables:

```bash
export SIP_TLS_ENABLED=true
export SIP_TLS_CERT_PATH=/etc/ssl/voicebot/voicebot.crt
export SIP_TLS_KEY_PATH=/etc/ssl/voicebot/voicebot.key
export SIP_TLS_PORT=5061
export SRTP_ENABLED=false
```

## 6. ตัวอย่าง SDP / SIP behavior

- SBC ควรยอมรับ SDP ที่มี `m=audio` และ codec `PCMU/8000`
- ถ้าใช้ TLS ให้ตั้งค่าการเชื่อมต่อ SIP ของ peer เป็น TLS และใช้ certificate ที่เชื่อถือได้
- ถ้าใช้ SRTP ให้ตั้ง `srtpEnabled=true` และ `srtpProfile=AES_CM_128_HMAC_SHA1_80`

## 7. Checklist ก่อนใช้งานจริง

- [ ] Public DNS / IP reachable from SBC
- [ ] Port 80/443 open for Webhook / HTTPS
- [ ] Port 5060/5061 open for SIP signaling
- [ ] RTP ports open (10000-20000 or custom range)
- [ ] TLS certificate installed and trusted
- [ ] Firewall rule allows inbound traffic from SBC
- [ ] Health endpoint responds: `/api/health`
