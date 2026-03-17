import * as fs from 'fs';
import * as path from 'path';
import { resolveFromCwd } from './utils/fs.js';

interface NormalizedRow {
  source_row_index: number;
  label: string;
  parameter: string;
  value: string;
  notes?: string;
  is_inferred?: boolean;
  is_header?: boolean;
  page: number;
  table_ref: string;
  source_text: string;
}

interface NormalizedTable {
  table_ref: string;
  table_title: string;
  pages: number[];
  normalized_at: string;
  rows: NormalizedRow[];
}

function extractOcrTableHtml(ocrPath: string): string | null {
  if (!fs.existsSync(ocrPath)) {
    return null;
  }
  
  const ocrContent = fs.readFileSync(ocrPath, 'utf-8');
  
  // Extract the table HTML - look for <table border="1">
  const tableMatch = ocrContent.match(/<table[^>]*>[\s\S]*?<\/table>/);
  if (!tableMatch) {
    return null;
  }
  
  const tableHtml = tableMatch[0];
  
  // Extract title
  const titleMatch = ocrContent.match(/Table \d+-(\d+):[^\n]+/);
  const title = titleMatch ? titleMatch[0] : 'OCR Table';
  
  // Extract notes
  const notesMatch = ocrContent.match(/Notes:([\s\S]*?)(?=<div[^>]*>Figure|$)/);
  const notes = notesMatch ? notesMatch[1].trim() : null;
  
  return `
    <div class="ocr-section">
      <div class="section-header">
        <h2>OCR-Rendered Table (Default View)</h2>
        <button class="toggle-btn" onclick="toggleView('structured')">View Structured Data</button>
      </div>
      <div id="ocr-view" class="view-section active">
        <div class="ocr-table-container">
          <h3>${title}</h3>
          <div class="ocr-table-wrapper">
            ${tableHtml}
          </div>
          ${notes ? `<div class="ocr-notes"><strong>Notes:</strong>${notes}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function generateHtml(normalizedTable: NormalizedTable, townSlug: string, sourceType: string, snapshotDate: string, ocrDir: string): string {
  const { table_ref, table_title, pages, rows, normalized_at } = normalizedTable;
  
  // Check for OCR file - use provided ocrDir (files have "table_" prefix)
  const ocrPath = path.join(ocrDir, `table_${table_ref}.md`);
  const ocrHtml = extractOcrTableHtml(ocrPath);
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${table_title} (Normalized)</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    .metadata {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .metadata p {
      margin: 5px 0;
      color: #4b5563;
    }
    
    /* OCR Section Styles */
    .ocr-section {
      background: #ffffff;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    .section-header h2 {
      margin: 0;
      color: #1e40af;
      font-size: 1.3em;
    }
    .toggle-btn {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }
    .toggle-btn:hover {
      background: #2563eb;
    }
    .view-section {
      display: none;
    }
    .view-section.active {
      display: block;
    }
    .ocr-table-container {
      background: #f8fafc;
      border-radius: 6px;
      padding: 15px;
    }
    .ocr-table-container h3 {
      margin-top: 0;
      color: #1e40af;
      font-size: 1.1em;
    }
    .ocr-table-wrapper {
      overflow-x: auto;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: white;
    }
    .ocr-table-wrapper table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .ocr-table-wrapper table td {
      border: 1px solid #94a3b8;
      padding: 10px;
      vertical-align: top;
    }
    .ocr-table-wrapper table td[colspan="3"] {
      background: #f1f5f9;
      font-weight: 600;
      text-align: center;
    }
    .ocr-notes {
      margin-top: 15px;
      padding: 12px;
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
      border-radius: 2px;
      font-size: 0.9em;
      white-space: pre-wrap;
    }
    
    /* Structured Data Section */
    .structured-section {
      background: #ffffff;
      border: 2px solid #10b981;
      border-radius: 8px;
      padding: 20px;
    }
    .structured-section .section-header h2 {
      color: #065f46;
    }
    .structured-section .toggle-btn {
      background: #10b981;
    }
    .structured-section .toggle-btn:hover {
      background: #059669;
    }
    
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    th, td {
      border: 1px solid #dee2e6;
      padding: 12px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #1a1a1a;
      text-transform: uppercase;
      font-size: 14px;
    }
    tr:hover {
      background: #f9fafb;
    }
    .label-cell {
      background: #f3f4f6;
      font-weight: 600;
      width: 80px;
      text-align: center;
    }
    .parameter-cell {
      background: #fefce8;
      font-weight: 500;
      width: 300px;
    }
    .value-cell {
      background: #ffffff;
    }
    .inferred {
      background: #fef3c7;
      border-left: 3px solid #f59e0b;
    }
    .note-row {
      background: #fffbeb;
      font-style: italic;
    }
    .header-row {
      background: #e0e7ff;
    }
    .citation {
      font-size: 11px;
      color: #6b7280;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <h1>${table_title}</h1>
  
  <div class="metadata">
    <p><strong>Table Ref:</strong> ${table_ref}</p>
    <p><strong>Pages:</strong> ${pages.join(', ')}</p>
    <p><strong>Normalized:</strong> ${normalized_at}</p>
    <p><strong>Source:</strong> ${sourceType} ${snapshotDate}</p>
  </div>
  
  ${ocrHtml ? ocrHtml : ''}
  
  <div class="structured-section">
    <div class="section-header">
      <h2>Structured Data (JSON-Derived)</h2>
      ${ocrHtml ? '<button class="toggle-btn" onclick="toggleView(\'ocr\')">View OCR Table</button>' : ''}
    </div>
    <div id="structured-view" class="view-section ${!ocrHtml ? 'active' : ''}">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
`;
  
  for (const row of rows) {
    const isInferred = row.is_inferred ? 'inferred' : '';
    const isNote = row.label === 'Notes' ? 'note-row' : '';
    
    html += `      <tr class="${isNote} ${isInferred}">
`;
    
    if (row.label === 'Notes') {
      html += `        <td colspan="3">${row.value}</td>
`;
    } else {
      html += `        <td class="label-cell">${row.label || ''}</td>
        <td class="parameter-cell">${row.parameter || ''}</td>
        <td class="value-cell">${row.value || ''}</td>
`;
    }
    
    html += `      </tr>
`;
  }
  
  html += `    </tbody>
      </table>
    </div>
  </div>
  
  <script>
    function toggleView(view) {
      const ocrView = document.getElementById('ocr-view');
      const structuredView = document.getElementById('structured-view');
      
      if (view === 'structured') {
        ocrView.classList.remove('active');
        structuredView.classList.add('active');
      } else {
        ocrView.classList.add('active');
        structuredView.classList.remove('active');
      }
    }
    
    // Add click-to-copy functionality for structured table
    document.querySelectorAll('#structured-view td').forEach(cell => {
      cell.style.cursor = 'pointer';
      cell.title = 'Click to copy';
      cell.addEventListener('click', () => {
        navigator.clipboard.writeText(cell.textContent);
        cell.style.background = '#d1fae5';
        setTimeout(() => {
          cell.style.background = '';
        }, 200);
      });
    });
  </script>
</body>
</html>`;
  
  return html;
}

function main() {
  const basePath = 'corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized';
  const ocrDir = 'corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/external_ocr';
  const townSlug = 'bloomington';
  const sourceType = 'city_pdf';
  const snapshotDate = '2026-02-21';
  
  const jsonFiles = fs.readdirSync(basePath)
    .filter(f => f.match(/^table_02-\d+_normalized\.json$/))
    .sort();
  
  console.log(`Found ${jsonFiles.length} normalized JSON files`);
  
  let processed = 0;
  let errors = 0;
  let withOcr = 0;
  
  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = path.join(basePath, jsonFile);
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const normalized = JSON.parse(content) as NormalizedTable;
      
      const html = generateHtml(normalized, townSlug, sourceType, snapshotDate, ocrDir);
      
      const htmlFile = jsonFile.replace('.json', '.html');
      const htmlPath = path.join(basePath, htmlFile);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      
      const tableRef = normalized.table_ref;
      const ocrPath = path.join(ocrDir, `table_${tableRef}.md`);
      const ocrExists = fs.existsSync(ocrPath);
      if (ocrExists) withOcr++;
      
      console.log(`✓ Generated ${htmlFile} (${normalized.rows.length} rows)${ocrExists ? ' [with OCR]' : ''}`);
      processed++;
    } catch (error) {
      console.error(`✗ Error processing ${jsonFile}: ${error}`);
      errors++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed} files`);
  console.log(`With OCR: ${withOcr} files`);
  console.log(`Errors: ${errors}`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

main();