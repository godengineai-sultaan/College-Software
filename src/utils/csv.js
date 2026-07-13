'use strict';

/**
 * Tiny, dependency-free CSV read/write. Handles quoted fields, embedded commas,
 * quotes and newlines. Used for bulk student import and data export.
 */

/** Parse CSV text into an array of row-arrays. */
function parse(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const s = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  // last field/row
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // drop trailing empty row
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** Parse CSV into array of objects using the first row as headers. */
function parseObjects(text) {
  const rows = parse(text);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (r[i] !== undefined ? r[i] : '').trim(); });
    return obj;
  });
}

/** Escape a single CSV field. */
function esc(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Build CSV text from headers (array) and rows (array of arrays or objects).
 * Adds a UTF-8 BOM so Excel opens ₹ / accents correctly.
 */
function build(headers, rows, { bom = true } = {}) {
  const lines = [];
  lines.push(headers.map(esc).join(','));
  for (const r of rows) {
    if (Array.isArray(r)) lines.push(r.map(esc).join(','));
    else lines.push(headers.map((h) => esc(r[h])).join(','));
  }
  return (bom ? '﻿' : '') + lines.join('\r\n');
}

module.exports = { parse, parseObjects, build, esc };
