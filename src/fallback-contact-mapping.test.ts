import test from 'node:test';
import assert from 'node:assert/strict';
import { getConfig } from './config-manager.js';
import { resolveFallbackMappedPhone } from './fallback-contact-mapping.js';

const originalMappings = [...(getConfig().fallbackMappings || [])];

function withMappings(mappings: Array<Record<string, string>>, run: () => void): void {
  const cfg = getConfig();
  cfg.fallbackMappings = mappings as any;
  try {
    run();
  } finally {
    cfg.fallbackMappings = [...originalMappings];
  }
}

test('resolveFallbackMappedPhone matches by extension', () => {
  withMappings([
    { extension: '1001', phone: 'tel:+668101001' },
  ], () => {
    const phone = resolveFallbackMappedPhone({ extension: '1001' });
    assert.equal(phone, '+668101001');
  });
});

test('resolveFallbackMappedPhone matches by name and strips Thai prefix', () => {
  withMappings([
    { name: 'วิชยะ', phone: '+668101000' },
  ], () => {
    const phone = resolveFallbackMappedPhone({ name: 'คุณวิชยะ' });
    assert.equal(phone, '+668101000');
  });
});

test('resolveFallbackMappedPhone can derive extension from lineURI', () => {
  withMappings([
    { lineURI: 'tel:+668101003;ext=1003', phone: 'tel:+668101003' },
  ], () => {
    const phone = resolveFallbackMappedPhone({ extension: '1003' });
    assert.equal(phone, '+668101003');
  });
});
