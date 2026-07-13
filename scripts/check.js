'use strict';

/**
 * Lightweight, dependency-free "lint": verifies the whole codebase is loadable
 * before tests run.
 *   1. `node --check` (syntax) on every .js file
 *   2. EJS compile on every view (catches template syntax errors)
 *   3. require() every route module (catches bad imports / wiring)
 *
 * Run with: npm run check
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ejs = require('ejs');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function walk(dir, filter) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walk(p, filter));
    else if (filter(p)) out.push(p);
  }
  return out;
}

// 1) Syntax check every JS file.
const jsFiles = [
  ...walk(path.join(ROOT, 'src'), (p) => p.endsWith('.js')),
  ...walk(path.join(ROOT, 'scripts'), (p) => p.endsWith('.js')),
  ...walk(path.join(ROOT, 'test'), (p) => p.endsWith('.js')),
  path.join(ROOT, 'server.js'),
];
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failures += 1;
    console.error('✗ syntax:', path.relative(ROOT, f));
    console.error('  ' + String(e.stderr || e.message).split('\n').slice(0, 3).join('\n  '));
  }
}
console.log(`• syntax: checked ${jsFiles.length} JS files`);

// 2) Compile every EJS view.
const views = walk(path.join(ROOT, 'src', 'views'), (p) => p.endsWith('.ejs'));
for (const f of views) {
  try {
    ejs.compile(fs.readFileSync(f, 'utf8'), { filename: f });
  } catch (e) {
    failures += 1;
    console.error('✗ view:', path.relative(ROOT, f), '→', e.message.split('\n')[0]);
  }
}
console.log(`• views: compiled ${views.length} EJS templates`);

// 3) Load every route module (exercises the require graph).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const routesDir = path.join(ROOT, 'src', 'routes');
const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));
for (const f of routeFiles) {
  try {
    require(path.join(routesDir, f));
  } catch (e) {
    failures += 1;
    console.error('✗ route load:', f, '→', e.message.split('\n')[0]);
  }
}
console.log(`• routes: loaded ${routeFiles.length} route modules`);

if (failures) {
  console.error(`\n✗ check failed with ${failures} problem(s).`);
  process.exit(1);
}
console.log('\n✓ check passed.');
