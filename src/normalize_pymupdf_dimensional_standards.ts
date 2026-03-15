import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface TableBlockRow {
  row_index: number;
  row_text: string;
  columns: string[];
}

interface TableBlock {
  table_id: string;
  table_ref: string;
  table_title: string;
  category: string;
  relevance_score: number;
  page_start: number;
  page_end: number;
  rows: TableBlockRow[];
  chunk_ids: string[];
  section_guess: string | null;
  town_slug: string;
  source_type: string;
  source_url: string;
  source_sha256: string;
  snapshot_date: string;
}

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

function loadTableBlocks(benchmarkPath: string): Map<string, TableBlock> {
  const content = fs.readFileSync(benchmarkPath, 'utf-8');
  const lines = content.trim().split('\n');
  const tables = new Map<string, TableBlock>();
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const table = JSON.parse(line) as TableBlock;
      tables.set(table.table_ref, table);
    } catch (e) {
      console.error(`Error parsing line: ${line.substring(0, 100)}...`);
    }
  }
  
  return tables;
}

function normalizeDimensionalStandardsTable(table: TableBlock): NormalizedTable {
  const normalizedRows: NormalizedRow[] = [];
  let currentLabel = '';
  let currentParameter = '';
  let currentValue = '';
  let collectingNotes = false;
  let notesBuffer: string[] = [];
  
  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const columns = row.columns;
    
    // Skip title row
    if (row.row_text.startsWith('Table') || row.row_text.startsWith('sq. ft.')) {
      continue;
    }
    
    // Detect section headers
    const sectionHeaders = [
      'Lot Dimensions',
      'Building Setbacks',
      'Other Standards',
      'Notes:',
      'Location',
      'Design'
    ];
    
    const isSectionHeader = sectionHeaders.some(header => 
      row.row_text.includes(header)
    );
    
    if (isSectionHeader) {
      continue;
    }
    
    // Detect notes section
    if (row.row_text.startsWith('Notes:')) {
      collectingNotes = true;
      continue;
    }
    
    if (collectingNotes) {
      if (row.row_text.startsWith('[')) {
        notesBuffer.push(row.row_text);
      } else if (row.row_text.trim().length > 0) {
        // Multi-line note
        const lastNote = notesBuffer[notesBuffer.length - 1] || '';
        notesBuffer[notesBuffer.length - 1] = lastNote + ' ' + row.row_text;
      }
      continue;
    }
    
    // Parse standard 3-column rows: Label | Parameter | Value
    if (columns.length === 3) {
      const [label, parameter, value] = columns.map(c => c.trim());
      
      // Skip rows that are clearly section continuations
      if (label === '' && parameter === '' && value === '') {
        continue;
      }
      
      // Skip rows that are just continuations of previous values
      if (label === '' && parameter === '' && currentValue.length > 0) {
        currentValue += ' ' + value;
        // Update the last row
        const lastRow = normalizedRows[normalizedRows.length - 1];
        if (lastRow && !lastRow.is_header) {
          lastRow.value = currentValue.trim();
          lastRow.source_text = row.row_text;
        }
        continue;
      }
      
      // Standard row with label, parameter, value
      if (label !== '') {
        // Letter label (A, B, C, etc.)
        const labelMatch = label.match(/^([A-Z])$/);
        
        if (labelMatch) {
          currentLabel = labelMatch[1];
          currentParameter = parameter;
          currentValue = value;
          
          normalizedRows.push({
            source_row_index: row.row_index,
            label: currentLabel,
            parameter: currentParameter,
            value: currentValue,
            page: table.page_start,
            table_ref: table.table_ref,
            source_text: row.row_text,
            is_header: false
          });
        } else if (parameter && !label.match(/^[A-Z]$/)) {
          // Row without letter label but has parameter
          // This is likely a continuation or special row
          if (parameter !== '') {
            normalizedRows.push({
              source_row_index: row.row_index,
              label: '',
              parameter: parameter,
              value: value,
              page: table.page_start,
              table_ref: table.table_ref,
              source_text: row.row_text,
              is_header: false
            });
          }
        }
      }
    } else if (columns.length === 1) {
      // Single column - might be a continuation or special row
      const text = columns[0].trim();
      if (text.length > 0 && !text.startsWith('[')) {
        // Check if this continues the previous row
        const lastRow = normalizedRows[normalizedRows.length - 1];
        if (lastRow && !lastRow.is_header) {
          // Append to value if it looks like a continuation
          if (text.match(/^\d+\s*(feet|%)|^[A-Z]\s+.*$/)) {
            lastRow.value += ' ' + text;
            lastRow.source_text += ' ' + row.row_text;
          }
        }
      }
    } else if (columns.length === 2) {
      // Handle 2-column rows (e.g., continuation rows)
      const [col1, col2] = columns.map(c => c.trim());
      if (col1 && col2) {
        const lastRow = normalizedRows[normalizedRows.length - 1];
        if (lastRow && !lastRow.is_header) {
          // Append to value if it's a value continuation
          lastRow.value += ' ' + col2;
          lastRow.source_text += ' ' + row.row_text;
        }
      }
    }
  }
  
  // Add notes as a special row
  if (notesBuffer.length > 0) {
    const notesText = notesBuffer.join(' ');
    normalizedRows.push({
      source_row_index: table.rows.length,
      label: 'Notes',
      parameter: '',
      value: notesText,
      page: table.page_start,
      table_ref: table.table_ref,
      source_text: notesText,
      is_header: false,
      is_inferred: false
    });
  }
  
  return {
    table_ref: table.table_ref,
    table_title: table.table_title,
    pages: [table.page_start, table.page_end],
    normalized_at: new Date().toISOString(),
    rows: normalizedRows
  };
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
  const args = process.argv.slice(2);
  let townSlug = 'bloomington';
  let sourceType = 'city_pdf';
  let snapshotDate = '2026-02-21';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--town-slug' && i + 1 < args.length) {
      townSlug = args[i + 1];
    } else if (arg === '--source-type' && i + 1 < args.length) {
      sourceType = args[i + 1];
    } else if (arg === '--date' && i + 1 < args.length) {
      snapshotDate = args[i + 1];
    }
  }
  
  const basePath = `corpus/${townSlug}/${snapshotDate}/${sourceType}/phase2_adu_tables`;
  const benchmarkPath = `${basePath}/table_blocks.jsonl`;
  const outputDir = `${basePath}/normalized`;
  
  console.log(`Loading table blocks from: ${benchmarkPath}`);
  const tables = loadTableBlocks(benchmarkPath);
  console.log(`Loaded ${tables.size} tables`);
  
  // Filter for dimensional standards tables (02-2 through 02-23)
  const dimensionalTables: TableBlock[] = [];
  const targetRefs = [];
  
  for (let i = 2; i <= 23; i++) {
    const ref = `02-${i}`;
    targetRefs.push(ref);
  }
  
  for (const [ref, table] of tables.entries()) {
    if (targetRefs.includes(ref)) {
      dimensionalTables.push(table);
    }
  }
  
  console.log(`Found ${dimensionalTables.length} dimensional standards tables`);
  console.log(`Table refs: ${dimensionalTables.map(t => t.table_ref).join(', ')}`);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process each table
  const results: { ref: string; success: boolean; rows: number }[] = [];
  
  for (const table of dimensionalTables) {
    try {
      console.log(`\nProcessing table: ${table.table_ref}`);
      const normalized = normalizeDimensionalStandardsTable(table);
      console.log(`  Normalized ${normalized.rows.length} rows`);
      
      // Generate HTML
      const html = generateHtml(normalized, townSlug, sourceType, snapshotDate);
      const htmlPath = path.join(outputDir, `table_${table.table_ref}_normalized.html`);
      fs.writeFileSync(htmlPath, html, 'utf-8');
      console.log(`  Generated HTML: ${htmlPath}`);
      
      // Generate JSON
      const jsonPath = path.join(outputDir, `table_${table.table_ref}_normalized.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(normalized, null, 2), 'utf-8');
      console.log(`  Generated JSON: ${jsonPath}`);
      
      // Generate row data (JSONL)
      const jsonlPath = path.join(outputDir, `table_${table.table_ref}_rows.jsonl`);
      const rowLines = normalized.rows.map(row => JSON.stringify(row)).join('\n');
      fs.writeFileSync(jsonlPath, rowLines + '\n', 'utf-8');
      console.log(`  Generated JSONL: ${jsonlPath}`);
      
      results.push({
        ref: table.table_ref,
        success: true,
        rows: normalized.rows.length
      });
    } catch (error) {
      console.error(`Error processing table ${table.table_ref}:`, error);
      results.push({
        ref: table.table_ref,
        success: false,
        rows: 0
      });
    }
  }
  
  // Generate summary report
  const reportPath = path.join(outputDir, 'dimensional_standards_report.json');
  const report = {
    town_slug: townSlug,
    source_type: sourceType,
    snapshot_date: snapshotDate,
    generated_at: new Date().toISOString(),
    total_tables: dimensionalTables.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    tables: results
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n=== Summary ===`);
  console.log(`Total tables processed: ${report.total_tables}`);
  console.log(`Successful: ${report.successful}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`\nReport saved to: ${reportPath}`);
}

main();