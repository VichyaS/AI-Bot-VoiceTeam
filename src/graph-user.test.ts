import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntraUserLookupFilter, normalizePhoneForTransfer } from './graph-user.js';

test('normalizePhoneForTransfer strips tel prefix and separators', () => {
  const normalized = normalizePhoneForTransfer('tel:+66 (810)-1002');
  assert.equal(normalized, '+668101002');
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
