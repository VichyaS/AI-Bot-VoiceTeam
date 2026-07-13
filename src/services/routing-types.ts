/**
 * A single department routing entry.
 */
export interface DepartmentEntry {
  /** Optional unique identifier for the Web UI */
  id?: string;
  /** Display name (e.g. "ไอที", "IT") */
  name: string;
  /** SIP URI (e.g. "sip:it-queue@company.com") */
  sipUri: string;
  /** Synonyms / keywords in Thai and English */
  aliases: string[];
}

/**
 * Default department mappings used when config.json has no `departments` field.
 */
export const DEFAULT_DEPARTMENTS: DepartmentEntry[] = [
  {
    name: 'IT',
    sipUri: 'sip:it-queue@company.com',
    aliases: ['ไอที', 'it', 'คอมพิวเตอร์', 'computer', 'สารสนเทศ', 'information', 'ระบบ', 'system', 'เทคนิค', 'technical', 'เทคโนโลยี', 'technology'],
  },
  {
    name: 'HR',
    sipUri: 'sip:hr-queue@company.com',
    aliases: ['บุคคล', 'hr', 'ทรัพยากรบุคคล', 'human resources', 'สมัครงาน', 'job', 'recruitment', 'กำลังคน', 'staffing'],
  },
  {
    name: 'Accounting',
    sipUri: 'sip:acct-queue@company.com',
    aliases: ['บัญชี', 'accounting', 'account', 'การเงิน', 'finance', 'จ่ายเงิน', 'payment', 'financial', 'งบประมาณ', 'budget'],
  },
  {
    name: 'Purchasing',
    sipUri: 'sip:po-queue@company.com',
    aliases: ['จัดซื้อ', 'purchasing', 'procurement', 'ซื้อของ', 'จัดหา', 'จัดซื้อจัดจ้าง', 'สั่งซื้อ', 'order', 'supplier'],
  },
  {
    name: 'Marketing',
    sipUri: 'sip:mkt-queue@company.com',
    aliases: ['การตลาด', 'marketing', 'โฆษณา', 'advertising', 'ประชาสัมพันธ์', 'pr', 'brand', 'แบรนด์'],
  },
  {
    name: 'Sales',
    sipUri: 'sip:sales-queue@company.com',
    aliases: ['ขาย', 'sales', 'ฝ่ายขาย', 'ลูกค้า', 'customer', 'ตัวแทนจำหน่าย', 'dealer', 'distributor'],
  },
  {
    name: 'Customer Service',
    sipUri: 'sip:cs-queue@company.com',
    aliases: ['บริการลูกค้า', 'customer service', 'support', 'ช่วยเหลือ', 'help', 'call center', 'contact center'],
  },
];