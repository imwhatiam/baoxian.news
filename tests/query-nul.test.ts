// Decoded NUL in user filters must be rejected before PostgreSQL, while literal escapes and
// ordinary Unicode searches keep working through the site's own API.
import './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeDb } from '@aihot/backend/db';
import { buildApp } from '../apps/api/src/app.ts';

const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });

for (const url of [
  '/api/site/timeline?tag=AI%00',
  '/api/site/pool?q=AI%00',
]) test(`invalid NUL input is a request error: ${url}`, async () => {
  const response = await app.inject(url);
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(response.json().code, 'invalid_request');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['retry-after'], undefined);
});

test('ordinary Unicode and literal escape text remain searchable', async () => {
  for (const query of ['AI模型', 'AI\\u0000', 'AI%00']) {
    const response = await app.inject(`/api/site/pool?q=${encodeURIComponent(query)}`);
    assert.equal(response.statusCode, 200, `search: ${response.body}`);
  }
});
