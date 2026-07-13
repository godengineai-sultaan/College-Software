'use strict';

/**
 * Small, dependency-free helpers used across controllers and views.
 */

const bcrypt = require('bcryptjs');

const helpers = {
  /** Hash a plain-text password. */
  hashPassword(plain) {
    return bcrypt.hashSync(String(plain), 10);
  },

  /** Compare a plain-text password against a stored hash. */
  verifyPassword(plain, hash) {
    if (!hash) return false;
    return bcrypt.compareSync(String(plain), hash);
  },

  /** Format a number as currency using the institution's symbol. */
  money(amount, symbol = '₹') {
    const n = Number(amount || 0);
    return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /** Human-friendly date (e.g. 13 Jul 2026). Returns '—' when empty. */
  formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  /** Date + time. */
  formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  },

  /** Today's date as YYYY-MM-DD (for <input type=date> defaults). */
  today() {
    return new Date().toISOString().slice(0, 10);
  },

  /** Title-case a role/status string for display. */
  titleCase(str) {
    if (!str) return '';
    return String(str).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  },

  /** Turn arbitrary text into a URL/id-safe slug. */
  slugify(str) {
    return String(str || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  /**
   * Build pagination metadata from a request.
   * Returns { page, perPage, offset } clamped to sensible bounds.
   */
  paginate(query, perPage = 15) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.perPage, 10) || perPage));
    return { page, perPage: limit, offset: (page - 1) * limit };
  },

  /** Total number of pages for a row count. */
  pageCount(total, perPage) {
    return Math.max(1, Math.ceil((total || 0) / perPage));
  },

  /** Generate a document number like INV-2026-000123. */
  docNumber(prefix, seq, year = new Date().getFullYear()) {
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  },

  /** Coerce a value to a number or return a fallback. */
  num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },

  /** Trim a string; return null when empty (so blanks become NULL in the DB). */
  clean(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s === '' ? null : s;
  },

  /**
   * Convert a number to words using the Indian numbering system
   * (Lakh / Crore) — used on printed receipts. e.g. 1042 -> "One Thousand
   * Forty Two". Adopted from the reference project's approach.
   */
  numberToWords(amount) {
    const n = Math.floor(Math.abs(Number(amount) || 0));
    if (n === 0) return 'Zero';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (num) => {
      if (num < 20) return ones[num];
      return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    };
    const three = (num) => {
      const h = Math.floor(num / 100);
      const rest = num % 100;
      return (h ? ones[h] + ' Hundred' + (rest ? ' ' : '') : '') + (rest ? two(rest) : '');
    };
    let words = '';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const hundred = n % 1000;
    if (crore) words += three(crore) + ' Crore ';
    if (lakh) words += three(lakh) + ' Lakh ';
    if (thousand) words += three(thousand) + ' Thousand ';
    if (hundred) words += three(hundred);
    return words.trim().replace(/\s+/g, ' ');
  },

  /** Days between two dates (b - a) as a positive integer, else 0. */
  daysBetween(a, b) {
    const da = new Date(a);
    const db2 = new Date(b);
    if (isNaN(da) || isNaN(db2)) return 0;
    return Math.max(0, Math.floor((db2 - da) / 86400000));
  },
};

module.exports = helpers;
