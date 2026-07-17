import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEntraUserLookupFilter,
  formatDuplicateUserChoicesForThaiTts,
  normalizePhoneForTransfer,
} from './graph-user.js';

test('normalizePhoneForTransfer strips tel prefix and separators', () => {
  const normalized = normalizePhoneForTransfer('tel:+66 (810)-1002');
  assert.equal(normalized, '+668101002');
});

test('normalizePhoneForTransfer handles lineUri style values', () => {
  const normalized = normalizePhoneForTransfer('tel:+66-810-1001;ext=1001');
  assert.equal(normalized, '+668101001');
});

test('normalizePhoneForTransfer handles TelephoneNumbers style values', () => {
  const normalized = normalizePhoneForTransfer('+668101003');
  assert.equal(normalized, '+668101003');
});

test('normalizePhoneForTransfer returns null for blank values', () => {
  assert.equal(normalizePhoneForTransfer('   '), null);
  assert.equal(normalizePhoneForTransfer(null), null);
  assert.equal(normalizePhoneForTransfer(undefined), null);
});

test('buildEntraUserLookupFilter contains all supported fields', () => {
  const filter = buildEntraUserLookupFilter('Vichya');

  assert.equal(filter.includes("startswith(displayName, 'Vichya')"), true);
  assert.equal(filter.includes("startswith(userPrincipalName, 'Vichya')"), true);
  assert.equal(filter.includes("startswith(givenName, 'Vichya')"), true);
  assert.equal(filter.includes("startswith(surname, 'Vichya')"), true);
  assert.equal(filter.includes("startswith(mail, 'Vichya')"), true);
});

test('buildEntraUserLookupFilter escapes apostrophes and supports Thai input', () => {
  const filter = buildEntraUserLookupFilter("O'Brian");
  assert.equal(filter.includes("O''Brian"), true);

  const thaiFilter = buildEntraUserLookupFilter('อุทัย');
  assert.equal(thaiFilter.includes("startswith(displayName, 'อุทัย')"), true);
});

test('formatDuplicateUserChoicesForThaiTts renders spaced last 4 digits', () => {
  const text = formatDuplicateUserChoicesForThaiTts([
    { displayName: 'Vichya Sripibaln', userPrincipalName: 'vichya.s@wbgood.cloud', phoneNumber: '+668101000' },
    { displayName: 'Vichya Nttvoice', userPrincipalName: 'vichyantt@wbgood.cloud', phoneNumber: 'tel:+668101001' },
  ]);

  assert.equal(text.includes('Vichya Sripibaln เบอร์ลงท้าย 1 0 0 0'), true);
  assert.equal(text.includes('Vichya Nttvoice เบอร์ลงท้าย 1 0 0 1'), true);
});
