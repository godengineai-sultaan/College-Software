'use strict';

require('./_db'); // MUST be first
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const app = require('../src/app');
const db = require('../src/db/connection');
const Fee = require('../src/services/fee');

let server, base;

before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { if (server) server.close(); });

// ---- tiny cookie-jar HTTP client -----------------------------------------
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorb(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
}
async function req(method, path, { jar = {}, body, headers = {} } = {}) {
  const h = { ...headers };
  if (Object.keys(jar).length) h.cookie = cookieHeader(jar);
  let b;
  if (body) { h['content-type'] = 'application/x-www-form-urlencoded'; b = new URLSearchParams(body).toString(); }
  const res = await fetch(base + path, { method, headers: h, body: b, redirect: 'manual' });
  absorb(jar, res);
  const text = await res.text();
  return { status: res.status, text, location: res.headers.get('location'), jar };
}
function csrf(html) {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}
async function login(username, password) {
  const jar = {};
  const g = await req('GET', '/login', { jar });
  const token = csrf(g.text);
  const p = await req('POST', '/login', { jar, body: { _csrf: token, username, password } });
  return { jar, ...p };
}

// ---- tests ----------------------------------------------------------------
test('health endpoint reports DB up', async () => {
  const res = await req('GET', '/health');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.text);
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'up');
});

test('security headers are present', async () => {
  const res = await fetch(base + '/login', { redirect: 'manual' });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('unauthenticated access redirects to login', async () => {
  const res = await req('GET', '/dashboard');
  assert.equal(res.status, 302);
  assert.match(res.location, /\/login/);
});

test('valid login reaches the dashboard', async () => {
  const { status, location, jar } = await login('admin', 'Admin@123');
  assert.equal(status, 302);
  assert.match(location, /\/dashboard/);
  const dash = await req('GET', '/dashboard', { jar });
  assert.equal(dash.status, 200);
  assert.match(dash.text, /Dashboard/);
});

test('invalid login is rejected', async () => {
  const { status } = await login('admin', 'wrong-password');
  assert.equal(status, 401);
});

test('RBAC — viewer cannot collect or manage users', async () => {
  const { jar } = await login('viewer', 'Viewer@123');
  assert.equal((await req('GET', '/collection', { jar })).status, 403);
  assert.equal((await req('GET', '/users', { jar })).status, 403);
  assert.equal((await req('GET', '/students', { jar })).status, 200); // read allowed
});

test('RBAC — receptionist is blocked from admin areas', async () => {
  const { jar } = await login('reception', 'Reception@123');
  assert.equal((await req('GET', '/settings', { jar })).status, 403);
  assert.equal((await req('GET', '/users', { jar })).status, 403);
  assert.equal((await req('GET', '/collection', { jar })).status, 200);
});

test('CSRF — POST without a token is rejected', async () => {
  const { jar } = await login('admin', 'Admin@123');
  const res = await req('POST', '/students', { jar, body: { name: 'No CSRF', branch_id: 1 } });
  assert.equal(res.status, 403);
});

test('end-to-end fee collection produces a receipt', async () => {
  const { jar } = await login('admin', 'Admin@123');

  // Find a student who still owes money.
  const rows = db.all('SELECT id FROM students WHERE deleted_at IS NULL');
  const debtor = rows.find((r) => Fee.summary(r.id).due > 100);
  assert.ok(debtor, 'a student with dues exists');

  const page = await req('GET', `/collection?student=${debtor.id}`, { jar });
  assert.equal(page.status, 200);
  const token = csrf(page.text);
  assert.ok(token);

  const post = await req('POST', '/collection', {
    jar,
    body: { _csrf: token, student_id: debtor.id, amount: '100', payment_mode: 'cash' },
  });
  assert.equal(post.status, 302);
  assert.match(post.location, /\/receipts\/\d+\?new=1/);

  const receiptId = /\/receipts\/(\d+)/.exec(post.location)[1];
  const receipt = await req('GET', `/receipts/${receiptId}`, { jar });
  assert.equal(receipt.status, 200);
  assert.match(receipt.text, /REC-/);
});
