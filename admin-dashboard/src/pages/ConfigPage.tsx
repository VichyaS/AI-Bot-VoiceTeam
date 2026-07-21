import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConfigApi } from '../hooks/useConfigApi';
import { useAuth } from '../contexts/AuthContext';
import ConfigTab from '../components/ConfigTab';
import FieldGroup from '../components/FieldGroup';
import Toast from '../components/Toast';
import ConnectionTestModal from '../components/ConnectionTestModal';

/* ── Inline SVG icons ─────────────────────────────────────────────── */
const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
);
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
);
const BrainIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a4 4 0 0 0-3.09 6.5A4 4 0 0 0 8 16h8a4 4 0 0 0-.91-7.5A4 4 0 0 0 12 2Z" /><path d="M17 15a3 3 0 0 1 0 6H8a3 3 0 0 1 0-6" /></svg>
);
const AzureIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="4" /><path d="M7 7h10M7 12h10M7 17h6" /></svg>
);
const SipIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v8Z" /><path d="M8 12h8" /><path d="M10 9l2 3 2-3" /></svg>
);
const AudioIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
);
const RouteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" /></svg>
);
const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const LoaderIcon = () => (
  <svg className="size-4 animate-spin" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
);
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);

function TextInput({ value, onChange, placeholder, type = 'text', error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (show ? 'text' : 'password') : type;
  return (
    <div className="relative">
      <input
        type={inputType} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/30 ${
          error ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'
        } ${isPassword ? 'pr-10' : ''}`}
      />
      {isPassword && value && (
        <button
          type="button"
          onClick={() => setShow((p) => !p)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          tabIndex={-1}
        >
          {show ? 'HIDE' : 'SHOW'}
        </button>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, min = 1, error }: {
  value: number; onChange: (v: number) => void; min?: number; error?: string;
}) {
  return (
    <input
      type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className={`block w-28 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-indigo-500/30 ${
        error ? 'border-red-400' : 'border-gray-300 focus:border-indigo-500'
      }`}
    />
  );
}

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-gray-800">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/* ── Dashboard Page ───────────────────────────────────────────────── */
export default function ConfigPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const {
    form, patch, errors, loading, saving, testing, toast, dismissToast,
    successBanner, dismissSuccessBanner,
    handleSave, handleTestConnection, runTestConnection,
  } = useConfigApi();

  const [activeTab, setActiveTab] = useState(0);
  const [testModal, setTestModal] = useState<{ open: true; service: 'openrouter' | 'azure' | 'audiocodes' | 'sip' } | { open: false }>({ open: false });

  const applyRecommendedPrompt = () => {
    patch({
      systemPrompt: `You are a production call-routing operator for a Thai/English voice bot.

Your job is to convert a caller's speech transcript into exactly one routing intent.

Return ONLY valid JSON with exactly these keys:
{
  "target_type": "user" | "department" | "extension" | "unknown",
  "extracted_value": "string"
}

Rules:
- Understand Thai and English equally well.
- Resolve names spoken in Thai, English, mixed Thai-English, or phonetic spelling.
- Be tolerant of Thai homophones, alternate spellings, and common romanizations.
- Normalize Thai names written in English when they clearly refer to a Thai person.
- If the caller says a department, return the department name only, without prefixes like แผนก/ฝ่าย/ทีม.
- If the caller says an extension, return digits only.
- If the caller says a person's name, return the best normalized name string that can be used for lookup.
- If ambiguous, return unknown with an empty extracted_value.
- Do not invent details that were not spoken.
- Do not explain your answer.
- Do not wrap output in markdown.`
    });
  };

  const tabs = [
    { icon: <MicIcon />, title: 'AudioCodes VoiceAI', description: 'Webhook secret, welcome & fallback prompts' },
    { icon: <BrainIcon />, title: 'OpenRouter AI', description: 'API key, model ID & system prompt for name extraction' },
    { icon: <AzureIcon />, title: 'Microsoft Entra ID', description: 'Azure AD tenant, client ID & secret' },
    { icon: <SipIcon />, title: 'Call Routing & SIP', description: 'SIP domain & max match results' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/portal')} className="flex size-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700" title="Back to Portal">
              <ArrowLeftIcon />
            </button>
            <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">VT</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">VoiceTeam Bot Admin</h1>
              <p className="text-xs text-gray-500">Configuration Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{user?.username}</span>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
              <LogoutIcon /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Success banner */}
        {successBanner && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 shadow-sm">
            <span className="mt-0.5 shrink-0 text-emerald-600 text-lg">✓</span>
            <p className="flex-1 text-sm font-medium text-emerald-800 leading-relaxed">{successBanner}</p>
            <button onClick={dismissSuccessBanner} className="shrink-0 text-emerald-400 hover:text-emerald-600">&times;</button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon />
            <span className="ml-3 text-sm text-gray-500">Loading configuration…</span>
          </div>
        )}

        {!loading && (
          <>
            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tabs.map((tab, i) => (
                <ConfigTab key={i} icon={tab.icon} title={tab.title} description={tab.description}
                  active={activeTab === i} onClick={() => setActiveTab(i)} />
              ))}
            </div>

            {activeTab === 0 && (
              <SectionPanel title="AudioCodes VoiceAI Connect Settings">
                <FieldGroup label="Webhook Secret Token" hint="Used to verify incoming webhook requests" error={errors.webhookSecret}>
                  <TextInput type="password" value={form.webhookSecret} onChange={(v) => patch({ webhookSecret: v })} placeholder="Enter your webhook secret" error={errors.webhookSecret} />
                </FieldGroup>
                <FieldGroup label="Webhook Public URL" hint="Public URL for AudioCodes VoiceAI to send webhooks to (e.g. https://your-app.onrender.com/api/audiocodes/webhook)">
                  <TextInput value={form.webhookPublicUrl} onChange={(v) => patch({ webhookPublicUrl: v })} placeholder="https://your-app.onrender.com/api/audiocodes/webhook" />
                </FieldGroup>
                <FieldGroup label="Default Welcome Message" hint="Played to the caller when a new session starts" error={errors.welcomeMessage}>
                  <TextInput value={form.welcomeMessage} onChange={(v) => patch({ welcomeMessage: v })} placeholder="สวัสดีค่ะ ต้องการติดต่อใครคะ?" error={errors.welcomeMessage} />
                </FieldGroup>
                <FieldGroup label="Fallback Error Message" hint="Played when the caller's name is not recognized" error={errors.fallbackMessage}>
                  <TextInput value={form.fallbackMessage} onChange={(v) => patch({ fallbackMessage: v })} placeholder="ขออภัยค่ะ ไม่พบชื่อนี้ในระบบ" error={errors.fallbackMessage} />
                </FieldGroup>
                <FieldGroup label="Fallback Phone Number / SIP URI" hint="เบอร์กลางหรือ SIP URI สำหรับโอนสายอัตโนมัติในกรณีที่บอทโอนสายไม่สำเร็จ หรือผู้โทรระบุเป้าหมายไม่ชัดเจนติดต่อกันครบ 3 ครั้ง" error={errors.fallbackDestination}>
                  <TextInput value={form.fallbackDestination} onChange={(v) => patch({ fallbackDestination: v })} placeholder="e.g., +6621234567 or sip:operator@company.com" error={errors.fallbackDestination} />
                </FieldGroup>
                <FieldGroup label="Max Retry Attempts" hint="จำนวนครั้งสูงสุดที่ให้ผู้โทรพูดใหม่ก่อนโอนสายไปยังเจ้าหน้าที่">
                  <input type="number" min={1} max={10} step={1} value={form.maxRetries}
                    onChange={(e) => patch({ maxRetries: parseInt(e.target.value) || 3 })}
                    className="block w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                </FieldGroup>
                <FieldGroup label="Fallback Transfer Prompt (ครบ 3 ครั้ง)" hint="ข้อความ TTS ที่เล่นเมื่อโอนสายไปยังเจ้าหน้าที่ operator หลังจากหาชื่อไม่เจอครบ 3 ครั้ง">
                  <textarea value={form.fallbackTransferPrompt} onChange={(e) => patch({ fallbackTransferPrompt: e.target.value })}
                    placeholder="ระบบกำลังโอนสายไปยังเจ้าหน้าที่ศูนย์กลางค่ะ" rows={2}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                </FieldGroup>
              </SectionPanel>
            )}

            {activeTab === 1 && (
              <SectionPanel title="OpenRouter AI Settings">
                <FieldGroup label="OpenRouter API Key" hint="Your OpenRouter API key for LLM inference" error={errors.openRouterApiKey}>
                  <TextInput type="password" value={form.openRouterApiKey} onChange={(v) => patch({ openRouterApiKey: v })} placeholder="sk-or-v1-..." error={errors.openRouterApiKey} />
                </FieldGroup>
                <FieldGroup label="AI Model ID" hint="The LLM model used for Thai name extraction" error={errors.aiModelId}>
                  <TextInput value={form.aiModelId} onChange={(v) => patch({ aiModelId: v })} placeholder="openai/gpt-4o-mini" error={errors.aiModelId} />
                </FieldGroup>
                <FieldGroup label="System Prompt / Instructions" hint="Optional custom instructions to tune extraction behavior">
                  <textarea value={form.systemPrompt} onChange={(e) => patch({ systemPrompt: e.target.value })}
                    placeholder="You are a strict Thai IVR Name Extractor..." rows={4}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                </FieldGroup>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={applyRecommendedPrompt}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                    <BrainIcon />
                    Use recommended operator prompt
                  </button>
                  <FieldGroup label="CSV Template" hint="Download a sample CSV format for fallback mappings">
                    <a
                      href="data:text/csv;charset=utf-8,name,aliases,upn,extension,lineURI,phone%0Aวิชยะ,วิชญะ|vichya|vichaya,wichaya@company.com,1001,sip:1001@company.com,1001%0Aอุทัย,uthai,uthai@company.com,1002,sip:1002@company.com,tel:+6621234567"
                      download="fallback-mappings-template.csv"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <DownloadIcon />
                      Download template
                    </a>
                  </FieldGroup>
                </div>
                {/* Advanced parameters row */}
                <div className="grid grid-cols-3 gap-4">
                  <FieldGroup label="Temperature" hint="ควบคุมความน่าจะเป็นในการตอบกลับ แนะนำตั้งค่าเป็น 0.0 สำหรับระบบ IVR เพื่อล็อกผลลัพธ์ JSON ให้นิ่งที่สุด">
                    <input type="number" min={0} max={2} step={0.1} value={form.temperature}
                      onChange={(e) => patch({ temperature: parseFloat(e.target.value) || 0 })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                  </FieldGroup>
                  <FieldGroup label="Max Tokens" hint="จำกัดความยาวของคำตอบจาก AI ช่วยประหยัดค่าใช้จ่ายและทำให้บอทตอบโต้เร็วขึ้น">
                    <input type="number" min={1} max={4096} step={1} value={form.maxTokens}
                      onChange={(e) => patch({ maxTokens: parseInt(e.target.value) || 150 })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                  </FieldGroup>
                  <FieldGroup label="Top P" hint="Nucleus sampling parameter, ปล่อยค่าเริ่มต้นเป็น 1.0">
                    <input type="number" min={0} max={1} step={0.05} value={form.topP}
                      onChange={(e) => patch({ topP: parseFloat(e.target.value) || 1 })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                  </FieldGroup>
                </div>
              </SectionPanel>
            )}

            {activeTab === 2 && (
              <SectionPanel title="Microsoft Entra ID (Azure AD) Credentials">
                <FieldGroup label="Tenant ID" hint="Your Azure AD tenant (directory) ID" error={errors.tenantId}>
                  <TextInput value={form.tenantId} onChange={(v) => patch({ tenantId: v })} placeholder="00000000-0000-0000-0000-000000000000" error={errors.tenantId} />
                </FieldGroup>
                <FieldGroup label="Client ID / Application ID" hint="The app registration client ID" error={errors.clientId}>
                  <TextInput value={form.clientId} onChange={(v) => patch({ clientId: v })} placeholder="00000000-0000-0000-0000-000000000000" error={errors.clientId} />
                </FieldGroup>
                <FieldGroup label="Client Secret" hint="The app registration client secret" error={errors.clientSecret}>
                  <TextInput type="password" value={form.clientSecret} onChange={(v) => patch({ clientSecret: v })} placeholder="Enter your client secret" error={errors.clientSecret} />
                </FieldGroup>
                <FieldGroup label="Client Secret Expiry Date" hint="วันหมดอายุของ Client Secret บน Azure Portal ระบบจะแสดงการแจ้งเตือนเตือนล่วงหน้า 30 วันก่อนคีย์หมดอายุเพื่อป้องกันระบบค้นหาพนักงานขัดข้อง">
                  <input type="date" value={form.secretExpiryDate} onChange={(e) => patch({ secretExpiryDate: e.target.value })}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                </FieldGroup>
                <FieldGroup label="Search Scope Base DN / Domain Filter (Optional)" hint="กรองเฉพาะผู้ใช้ในโดเมนหรือกลุ่มที่ระบุ เพื่อป้องกันไม่ให้บอทค้นหาเจอ User ภายนอกหรือบัญชีระบบ (Service Accounts)">
                  <TextInput value={form.searchScope} onChange={(v) => patch({ searchScope: v })} placeholder="e.g., @yourcompany.com or ou=Staff" />
                </FieldGroup>
                {/* Azure Speech Services ASR */}
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-4 py-3 space-y-3">
                  <p className="text-xs font-semibold text-indigo-700 mb-2">Azure Speech Services (ASR)</p>
                  <p className="text-[11px] text-indigo-600 mb-2">ใช้สำหรับแปลงเสียงพูดเป็นข้อความ (Speech-to-Text) จาก SBC VoiceAI. สร้าง Resource ที่ Azure Portal → Speech Services → กด Keys and Endpoint</p>
                  <FieldGroup label="Speech Key" hint="Azure Speech Service Key (subscription key)">
                    <TextInput type="password" value={form.speechKey} onChange={(v) => patch({ speechKey: v })} placeholder="Enter your Azure Speech key" />
                  </FieldGroup>
                  <FieldGroup label="Speech Region" hint="Region ของ Speech Resource (e.g. southeastasia)">
                    <TextInput value={form.speechRegion} onChange={(v) => patch({ speechRegion: v })} placeholder="e.g., southeastasia" />
                  </FieldGroup>
                </div>
                {/* MFA Login Settings */}
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 space-y-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">MFA Login Settings (Sign in with Microsoft)</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.mfaEnabled}
                      onChange={(e) => patch({ mfaEnabled: e.target.checked })}
                      className="accent-indigo-600 size-4"
                    />
                    <span className="text-xs text-blue-600">Enable MFA login for admin dashboard</span>
                  </label>
                  <FieldGroup label="Allowed Email Domain" hint="กรองโดเมนอีเมลที่อนุญาตให้ล็อกอิน เช่น company.com (ปล่อยว่างเพื่ออนุญาตทุกโดเมน)">
                    <TextInput value={form.mfaAllowedDomain} onChange={(v) => patch({ mfaAllowedDomain: v })} placeholder="e.g., company.com" />
                  </FieldGroup>
                </div>
                {/* API permissions reminder */}
                <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-700 mb-2">Required Azure App API Permissions:</p>
                  <label className="flex items-center gap-2 text-xs text-blue-600">
                    <input type="checkbox" checked readOnly className="accent-blue-600" />
                    <span>User.Read.All (Application Permission) — Grant Admin Consent</span>
                  </label>
                </div>
              </SectionPanel>
            )}

            {activeTab === 3 && (
              <SectionPanel title="Call Routing & SIP Settings">
                <FieldGroup label="SIP Domain / SBC Gateway URI" hint="The SIP URI domain used for call transfers (e.g. sip:company.com)" error={errors.sipDomain}>
                  <TextInput value={form.sipDomain} onChange={(v) => patch({ sipDomain: v })} placeholder="sip:company.com" error={errors.sipDomain} />
                </FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="SBC Signaling Port" hint="พอร์ตสัญญาณ SIP สำหรับการโอนสาย โดยปกติหากต่อ Direct Routing กับ Microsoft Teams มักจะใช้พอร์ต TLS 5061">
                    <input type="number" min={1} max={65535} step={1} value={form.sbcPort}
                      onChange={(e) => patch({ sbcPort: parseInt(e.target.value) || 5061 })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                  </FieldGroup>
                  <FieldGroup label="Transfer Protocol" hint="โปรโตคอลความปลอดภัยสำหรับการส่งสัญญาณโอนสาย แนะนำให้เลือก TLS บนระบบ Production">
                    <select value={form.transferProtocol} onChange={(e) => patch({ transferProtocol: e.target.value })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30">
                      <option value="TLS">TLS</option>
                      <option value="TCP">TCP</option>
                      <option value="UDP">UDP</option>
                    </select>
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FieldGroup label="Call Routing Mode" hint="รูปแบบการโอนสาย โดย Blind Transfer คือการโอนสายไปทันทีโดยบอทวางสาย และ Consultative คือการรอสายปลายทางตอบรับก่อน">
                    <select value={form.routingMode} onChange={(e) => patch({ routingMode: e.target.value })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30">
                      <option value="Blind Transfer">Blind Transfer</option>
                      <option value="Consultative Transfer">Consultative Transfer</option>
                    </select>
                  </FieldGroup>
                  <FieldGroup label="SIP Transfer Timeout (Seconds)" hint="ระยะเวลาสูงสุดที่บอทรอให้สายปลายทางตอบรับการโอนสาย หากเกินเวลานี้จะดึงสายกลับมาเข้าสู่ระบบ Fallback เบอร์กลางอัตโนมัติ">
                    <input type="number" min={5} max={60} step={1} value={form.transferTimeout}
                      onChange={(e) => patch({ transferTimeout: parseInt(e.target.value) || 15 })}
                      className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30" />
                  </FieldGroup>
                </div>
                <FieldGroup label="Max Match Results" hint="Maximum number of directory matches to consider" error={errors.maxMatchResults}>
                  <NumberInput value={form.maxMatchResults} onChange={(v) => patch({ maxMatchResults: v })} min={1} error={errors.maxMatchResults} />
                </FieldGroup>
              </SectionPanel>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">
                {saving ? <LoaderIcon /> : <CheckIcon />}
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
              <button type="button" onClick={() => setTestModal({ open: true, service: 'openrouter' })} disabled={testing !== 'idle'}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-700 shadow-sm hover:bg-amber-100 disabled:opacity-60">
                {testing === 'openrouter' ? <LoaderIcon /> : <BrainIcon />}
                {testing === 'openrouter' ? 'Testing…' : 'Test OpenRouter'}
              </button>
              <button type="button" onClick={() => setTestModal({ open: true, service: 'azure' })} disabled={testing !== 'idle'}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 shadow-sm hover:bg-sky-100 disabled:opacity-60">
                {testing === 'azure' ? <LoaderIcon /> : <AzureIcon />}
                {testing === 'azure' ? 'Testing…' : 'Test Azure AD'}
              </button>
              <button type="button" onClick={() => setTestModal({ open: true, service: 'audiocodes' })} disabled={testing !== 'idle'}
                className="inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-5 py-2.5 text-sm font-semibold text-teal-700 shadow-sm hover:bg-teal-100 disabled:opacity-60">
                {testing === 'audiocodes' ? <LoaderIcon /> : <AudioIcon />}
                {testing === 'audiocodes' ? 'Testing…' : 'Test VoiceAI'}
              </button>
              <button type="button" onClick={() => setTestModal({ open: true, service: 'sip' })} disabled={testing !== 'idle'}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-5 py-2.5 text-sm font-semibold text-violet-700 shadow-sm hover:bg-violet-100 disabled:opacity-60">
                {testing === 'sip' ? <LoaderIcon /> : <RouteIcon />}
                {testing === 'sip' ? 'Testing…' : 'Test Routing & SIP'}
              </button>
              {/* Export Config */}
              <ExportConfigButton />
            </div>

            {/* Connection test modal */}
            {testModal.open && (
              <ConnectionTestModal
                open={testModal.open}
                service={testModal.service}
                onClose={() => setTestModal({ open: false })}
                onRunTest={runTestConnection}
              />
            )}
          </>
        )}
      </main>

      {toast && <Toast toast={toast} onClose={dismissToast} />}
    </div>
  );
}

/* ── Export Config Button ─────────────────────────────────────────── */
function ExportConfigButton() {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      const token = localStorage.getItem('ac_bot_admin_token');
      const res = await fetch('/api/admin/config/export', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config = await res.json();

      // Build CONFIG_* format text
      const lines: string[] = [];
      for (const [key, value] of Object.entries(config)) {
        if (value === null || value === undefined) continue;
        const envKey = `CONFIG_${key}`;
        if (typeof value === 'string') {
          lines.push(`${envKey}=${value}`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          lines.push(`${envKey}=${String(value)}`);
        } else if (Array.isArray(value)) {
          lines.push(`${envKey}=${JSON.stringify(value)}`);
        }
      }

      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setExportMsg(`✅ Config JSON คัดลอกไปยัง Clipboard แล้ว!

📋 วิธีอัปเดตบน Render:

1. เปิด https://dashboard.render.com
2. เลือก Web Service → Environment
3. ลบ CONFIG_JSON (ถ้ามี)
4. สำหรับฟิลด์ที่เปลี่ยนแปลง:
   - CONFIG_systemPrompt (ถ้าเปลี่ยน system prompt)
   - CONFIG_departments (ถ้าเปลี่ยนแผนก)
   - CONFIG_* ของฟิลด์อื่นๆ ที่เปลี่ยน
5. Save → Deploy`);
    } catch (err) {
      setExportMsg(`❌ Export failed: ${(err as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-60"
      >
        <DownloadIcon />
        {exporting ? 'Exporting…' : 'Export Config'}
      </button>
      {exportMsg && (
        <div className="text-xs text-gray-500 whitespace-pre-wrap max-w-md bg-gray-50 rounded-lg border border-gray-200 p-3">
          {exportMsg}
        </div>
      )}
    </div>
  );
}
