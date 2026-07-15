# ────────────────────────────────────────────────────────────
# Fly.io Secrets Setup — ใส่ค่าจริงของคุณแทน placeholder
# รันทีละบรรทัดใน PowerShell หรือ Terminal
# ────────────────────────────────────────────────────────────

# 1. Auth & Admin
flyctl secrets set JWT_SECRET=your-jwt-secret --app voiceteam-bot
flyctl secrets set ADMIN_USERNAME=superadmin --app voiceteam-bot
flyctl secrets set ADMIN_ROLE=SUPER_ADMIN --app voiceteam-bot

# 2. OpenRouter AI
flyctl secrets set CONFIG_openRouterApiKey=sk-or-v1-your-key-here --app voiceteam-bot
flyctl secrets set CONFIG_aiModelId=openai/gpt-5.6-luna --app voiceteam-bot

# 3. Azure Entra ID
flyctl secrets set CONFIG_tenantId=your-tenant-id --app voiceteam-bot
flyctl secrets set CONFIG_clientId=your-client-id --app voiceteam-bot
flyctl secrets set CONFIG_clientSecret=your-client-secret --app voiceteam-bot
flyctl secrets set CONFIG_secretExpiryDate=2027-07-13 --app voiceteam-bot
flyctl secrets set CONFIG_searchScope=@yourdomain.com --app voiceteam-bot

# 4. Azure Speech Services
flyctl secrets set CONFIG_speechKey=your-speech-key --app voiceteam-bot
flyctl secrets set CONFIG_speechRegion=eastasia --app voiceteam-bot

# 5. SIP & Routing
flyctl secrets set CONFIG_sipDomain=sip:sbc.yourdomain.com --app voiceteam-bot
flyctl secrets set CONFIG_sbcPort=5061 --app voiceteam-bot
flyctl secrets set CONFIG_transferProtocol=TLS --app voiceteam-bot
flyctl secrets set CONFIG_routingMode="Blind Transfer" --app voiceteam-bot
flyctl secrets set CONFIG_transferTimeout=15 --app voiceteam-bot
flyctl secrets set CONFIG_maxMatchResults=1 --app voiceteam-bot
flyctl secrets set CONFIG_operatorFallbackSip=sip:operator-queue@company.com --app voiceteam-bot

# 6. Messages
flyctl secrets set CONFIG_welcomeMessage="Voice Teams สวัสดีค่ะ ต้องการติดต่อใคร หรือกดหมายเลขที่ท่านทราบค่ะ" --app voiceteam-bot
flyctl secrets set CONFIG_fallbackMessage="ขออภัยค่ะ ไม่พบชื่อนี้ในระบบ กรุณาลองใหม่อีกครั้ง" --app voiceteam-bot
flyctl secrets set CONFIG_fallbackDestination=+668101001 --app voiceteam-bot
flyctl secrets set CONFIG_webhookPublicUrl=https://voiceteam-bot.fly.dev/api/audiocodes/webhook --app voiceteam-bot

# 7. MFA
flyctl secrets set CONFIG_mfaEnabled=true --app voiceteam-bot
flyctl secrets set CONFIG_mfaAllowedDomain=wbgood.cloud --app voiceteam-bot

# 8. AI Parameters
flyctl secrets set CONFIG_temperature=0 --app voiceteam-bot
flyctl secrets set CONFIG_maxTokens=150 --app voiceteam-bot
flyctl secrets set CONFIG_topP=1 --app voiceteam-bot
flyctl secrets set CONFIG_maxRetries=3 --app voiceteam-bot

# 9. Departments (JSON array)
flyctl secrets set CONFIG_departments='[{"name":"ฝ่ายไอที","sipUri":"sip:668101001@placeholder.domain","aliases":["ฝ่ายไอที","IT","ติดต่อ IT","แจ้งคอมเสีย","password lock"]}]' --app voiceteam-bot

# 10. Ngrok
flyctl secrets set NGROK_AUTHTOKEN=your-ngrok-token --app voiceteam-bot

# ⚠️ systemPrompt: ตั้งค่าผ่าน Admin Dashboard UI
# หรือใช้: flyctl secrets set CONFIG_systemPrompt='คุณคือระบบ AI...' --app voiceteam-bot