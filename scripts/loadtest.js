'use strict';

/**
 * Dependency-free load test — simulates concurrent authenticated users hitting
 * the app, and reports throughput + latency percentiles.
 *
 *   npm run loadtest                      # 50 users, 10s, against localhost:3000
 *   BASE=http://localhost:3000 CONCURRENCY=50 DURATION=10 npm run loadtest
 *
 * Verifies the brain-chart target of "50+ concurrent users".
 */

const BASE = process.env.BASE || 'http://localhost:3000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY, 10) || 50;
const DURATION = parseInt(process.env.DURATION, 10) || 10; // seconds
const USER = process.env.LOAD_USER || 'admin';
const PASS = process.env.LOAD_PASS || 'Admin@123';
const PATHS = ['/dashboard', '/students', '/receipts', '/reports', '/health'];

function cookieHeader(jar) { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }
function absorb(jar, res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) { const [p] = c.split(';'); const i = p.indexOf('='); jar[p.slice(0, i)] = p.slice(i + 1); }
}

async function login() {
  const jar = {};
  const g = await fetch(BASE + '/login', { redirect: 'manual' });
  absorb(jar, g);
  const token = /name="_csrf" value="([^"]+)"/.exec(await g.text())[1];
  const body = new URLSearchParams({ _csrf: token, username: USER, password: PASS }).toString();
  const p = await fetch(BASE + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { cookie: cookieHeader(jar), 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  absorb(jar, p);
  return jar;
}

async function worker(jar, deadline, stats) {
  let i = 0;
  while (Date.now() < deadline) {
    const path = PATHS[i++ % PATHS.length];
    const t0 = Date.now();
    try {
      const res = await fetch(BASE + path, { headers: { cookie: cookieHeader(jar) }, redirect: 'manual' });
      await res.arrayBuffer();
      const dt = Date.now() - t0;
      stats.latencies.push(dt);
      stats.total += 1;
      if (res.status >= 500) stats.errors += 1;
    } catch (e) {
      stats.total += 1; stats.errors += 1;
    }
  }
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

(async () => {
  process.stdout.write(`Load test → ${BASE}  (${CONCURRENCY} concurrent workers, ${DURATION}s)\n`);
  // Authenticate once and drive the shared session from all workers (avoids the
  // login rate-limiter; the target is server request throughput, not logins).
  const jar = await login();

  const stats = { total: 0, errors: 0, latencies: [] };
  const deadline = Date.now() + DURATION * 1000;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(jar, deadline, stats)));
  const elapsed = (Date.now() - t0) / 1000;

  const sorted = stats.latencies.sort((a, b) => a - b);
  const rps = (stats.total / elapsed).toFixed(1);
  console.log('----------------------------------------------');
  console.log(`Requests:      ${stats.total}`);
  console.log(`Errors (5xx):  ${stats.errors}`);
  console.log(`Throughput:    ${rps} req/s`);
  console.log(`Latency p50:   ${pct(sorted, 50)} ms`);
  console.log(`Latency p95:   ${pct(sorted, 95)} ms`);
  console.log(`Latency p99:   ${pct(sorted, 99)} ms`);
  console.log(`Latency max:   ${sorted[sorted.length - 1] || 0} ms`);
  console.log('----------------------------------------------');
  process.exit(stats.errors > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
