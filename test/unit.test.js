'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const helpers = require('../src/utils/helpers');
const csv = require('../src/utils/csv');
const excel = require('../src/utils/excel');
const perms = require('../src/config/permissions');

test('numberToWords — Indian numbering', () => {
  assert.equal(helpers.numberToWords(0), 'Zero');
  assert.equal(helpers.numberToWords(1042), 'One Thousand Forty Two');
  assert.equal(helpers.numberToWords(51500), 'Fifty One Thousand Five Hundred');
  assert.equal(helpers.numberToWords(100000), 'One Lakh');
  assert.equal(helpers.numberToWords(10000000), 'One Crore');
});

test('money — currency formatting', () => {
  assert.equal(helpers.money(1000, '₹'), '₹1,000.00');
  assert.equal(helpers.money(0, '₹'), '₹0.00');
  assert.match(helpers.money(1234567.5, '₹'), /12,34,567\.50/); // Indian grouping
});

test('slugify / daysBetween / num / clean', () => {
  assert.equal(helpers.slugify('B.Com Sem 1!'), 'b-com-sem-1');
  assert.equal(helpers.daysBetween('2026-01-01', '2026-01-11'), 10);
  assert.equal(helpers.daysBetween('2026-01-11', '2026-01-01'), 0); // clamped
  assert.equal(helpers.num('12.5', 0), 12.5);
  assert.equal(helpers.num('abc', 7), 7);
  assert.equal(helpers.clean('  hi '), 'hi');
  assert.equal(helpers.clean('   '), null);
});

test('password hashing round-trip', () => {
  const hash = helpers.hashPassword('Secret@123');
  assert.ok(hash && hash !== 'Secret@123');
  assert.equal(helpers.verifyPassword('Secret@123', hash), true);
  assert.equal(helpers.verifyPassword('wrong', hash), false);
});

test('csv parse/build round-trip with quoting', () => {
  const headers = ['name', 'note'];
  const rows = [['Aarav, Jr.', 'line1\nline2'], ['Bob "B"', 'ok']];
  const text = csv.build(headers, rows);
  const parsed = csv.parseObjects(text);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'Aarav, Jr.');
  assert.equal(parsed[0].note, 'line1\nline2');
  assert.equal(parsed[1].name, 'Bob "B"');
});

test('excel workbook produces valid multi-sheet SpreadsheetML', () => {
  const xml = excel.workbook([
    { name: 'Students', headers: ['ID', 'Name'], rows: [[1, 'Aarav'], [2, 'Diya']] },
    { name: 'Receipts', headers: ['No', 'Amt'], rows: [['REC-1', 5000]] },
  ]);
  assert.match(xml, /<\?mso-application progid="Excel.Sheet"\?>/);
  assert.match(xml, /ss:Name="Students"/);
  assert.match(xml, /ss:Name="Receipts"/);
  assert.match(xml, /<Data ss:Type="Number">5000<\/Data>/);
  assert.match(xml, /<Data ss:Type="String">Aarav<\/Data>/);
});

test('excel escapes XML-sensitive characters', () => {
  const xml = excel.workbook([{ name: 'S', headers: ['x'], rows: [['a & b < c > "d"']] }]);
  assert.match(xml, /a &amp; b &lt; c &gt; &quot;d&quot;/);
});

test('permissions — super_admin can do everything', () => {
  for (const area of perms.AREAS) {
    assert.equal(perms.roleCan('super_admin', area), true, `view ${area}`);
    assert.equal(perms.roleCanManage('super_admin', area), true, `manage ${area}`);
  }
});

test('permissions — receptionist scope', () => {
  assert.equal(perms.roleCan('receptionist', 'collection'), true);
  assert.equal(perms.roleCanManage('receptionist', 'collection'), true);
  assert.equal(perms.roleCan('receptionist', 'users'), false);
  assert.equal(perms.roleCan('receptionist', 'settings'), false);
  assert.equal(perms.roleCan('receptionist', 'expenses'), false);
});

test('permissions — viewer is read-only', () => {
  assert.equal(perms.roleCan('viewer', 'students'), true);
  assert.equal(perms.roleCanManage('viewer', 'students'), false);
  assert.equal(perms.roleCan('viewer', 'collection'), false); // cannot collect
});

test('permissions — branch scoping flags', () => {
  assert.equal(perms.isBranchScoped('branch_admin'), true);
  assert.equal(perms.isBranchScoped('accountant'), true);
  assert.equal(perms.isBranchScoped('receptionist'), true);
  assert.equal(perms.isBranchScoped('super_admin'), false);
  assert.equal(perms.isBranchScoped('viewer'), false);
});
