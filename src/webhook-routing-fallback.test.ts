import test from 'node:test';
import assert from 'node:assert/strict';
import { inferRoutingFromSpeech, shouldForceHangup } from './routing-fallback.js';

test('fallback routing maps unknown Thai name to user target', () => {
  const result = inferRoutingFromSpeech({ target_type: 'unknown', extracted_value: '' }, 'อุทัย');
  assert.deepEqual(result, { target_type: 'user', extracted_value: 'อุทัย' });
});

test('fallback routing maps unknown 4-digit text to extension target', () => {
  const result = inferRoutingFromSpeech({ target_type: 'unknown', extracted_value: '' }, '1000');
  assert.deepEqual(result, { target_type: 'extension', extracted_value: '1000' });
});

test('shouldForceHangup detects explicit hangup phrases', () => {
  assert.equal(shouldForceHangup('วางสาย'), true);
  assert.equal(shouldForceHangup('ไม่ติดต่อแล้ว'), true);
});

test('shouldForceHangup does not match normal routing phrases', () => {
  assert.equal(shouldForceHangup('คุณวิชยะ'), false);
  assert.equal(shouldForceHangup('1001'), false);
});
