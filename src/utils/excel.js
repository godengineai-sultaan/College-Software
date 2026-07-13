'use strict';

/**
 * Dependency-free multi-sheet Excel export using SpreadsheetML 2003 (XML).
 * Produces a single .xls file that opens in Excel/LibreOffice with real,
 * separately-named worksheets — enough for the "6-sheet consolidated Excel"
 * export without any third-party library.
 */

function xmlEscape(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function cell(value) {
  const isNum = typeof value === 'number' && Number.isFinite(value);
  if (isNum) return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function headerCell(value) {
  return `<Cell ss:StyleID="hdr"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function worksheet({ name, headers = [], rows = [] }) {
  const safeName = String(name || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
  const head = headers.length ? `<Row>${headers.map(headerCell).join('')}</Row>` : '';
  const body = rows.map((r) => `<Row>${(Array.isArray(r) ? r : []).map(cell).join('')}</Row>`).join('');
  return `<Worksheet ss:Name="${xmlEscape(safeName)}"><Table>${head}${body}</Table></Worksheet>`;
}

/** Build a workbook string from an array of { name, headers, rows }. */
function workbook(sheets) {
  const body = (sheets || []).map(worksheet).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#4F46E5" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
 </Styles>
 ${body}
</Workbook>`;
}

module.exports = { workbook, worksheet, xmlEscape };
