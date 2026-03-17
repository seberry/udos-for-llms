import * as fs from 'fs';
import * as path from 'path';

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

function generateHtml(normalizedTable: NormalizedTable, townSlug: string, sourceType: string, snapshotDate: string): string {
  const { table_ref, table_title, pages, rows, normalized_at } = normalizedTable;
  
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
  
  <script>
    // Add click-to-copy functionality
    document.querySelectorAll('td').forEach(cell => {
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
  const townSlug = 'bloomington';
  const sourceType = 'city_pdf';
  const snapshotDate = '2026-02-21';
  
  const jsonFiles = fs.readdirSync(basePath)
    .filter(f => f.match(/^table_02-\d+_normalized\.json$/))
    .sort();
  
  console.log(`Found ${jsonFiles.length} normalized JSON files`);
  
  let processed = 0;
  let errors = 0;
  
  for (const jsonFile of jsonFiles) {
    try {
      const jsonPath = path.join(basePath, jsonFile);
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const normalized = JSON.parse(content) as NormalizedTable;
      
      const html = generateHtml(normalized, townSlug, sourceType, snapshotDate);
      
      const htmlFile = jsonFile.replace('.json', '.html');
      const htmlPath = path.join(basePath, htmlFile);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      
      console.log(`✓ Generated ${htmlFile} (${normalized.rows.length} rows)`);
      processed++;
    } catch (error) {
      console.error(`✗ Error processing ${jsonFile}: ${error}`);
      errors++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Processed: ${processed} files`);
  console.log(`Errors: ${errors}`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

main();