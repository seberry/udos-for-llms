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

function loadNormalizedTables(dir: string): Map<string, NormalizedTable> {
  const tables = new Map<string, NormalizedTable>();
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    if (file.match(/^table_\d+-\d+_normalized\.json$/)) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const table = JSON.parse(content) as NormalizedTable;
      tables.set(table.table_ref, table);
    }
  }
  
  return tables;
}

function generateReviewApp(tables: Map<string, NormalizedTable>, outputPath: string, townSlug: string): void {
  // Filter for dimensional standards tables (02-2 through 02-23)
  const dimensionalRefs = new Set<string>();
  for (let i = 2; i <= 23; i++) {
    dimensionalRefs.add(`02-${i}`);
  }
  
  const sortedRefs = Array.from(tables.keys())
    .filter(ref => dimensionalRefs.has(ref))
    .sort();
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dimensional Standards Tables - Bulk Review</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      background: #f5f5f5;
    }
    h1 {
      color: #1a1a1a;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .intro {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .intro h2 {
      color: #1e40af;
      margin-top: 0;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .stat-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-card h3 {
      margin: 0 0 10px 0;
      font-size: 2em;
    }
    .stat-card p {
      margin: 0;
      opacity: 0.9;
    }
    .table-section {
      background: white;
      border-radius: 8px;
      margin-bottom: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .table-header {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .table-header h2 {
      margin: 0;
      font-size: 1.3em;
    }
    .table-header .badge {
      background: rgba(255,255,255,0.2);
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.9em;
    }
    .table-content {
      padding: 20px;
    }
    .metadata {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 10px 15px;
      margin-bottom: 15px;
      font-size: 0.9em;
      color: #4b5563;
    }
    .metadata strong {
      color: #1a1a1a;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 15px 0;
      font-size: 0.95em;
    }
    th, td {
      border: 1px solid #dee2e6;
      padding: 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
      color: #1a1a1a;
      text-transform: uppercase;
      font-size: 0.85em;
      letter-spacing: 0.5px;
    }
    tr:hover {
      background: #f9fafb;
    }
    .label-cell {
      background: #f3f4f6;
      font-weight: 600;
      width: 60px;
      text-align: center;
      font-size: 1.1em;
    }
    .parameter-cell {
      background: #fefce8;
      font-weight: 500;
      width: 280px;
    }
    .value-cell {
      background: #ffffff;
      min-width: 300px;
    }
    .value-cell.issue {
      background: #fee2e2;
      border-left: 3px solid #ef4444;
    }
    .notes-row {
      background: #fffbeb;
      font-style: italic;
      font-size: 0.9em;
    }
    .actions {
      margin-top: 15px;
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
    .btn-secondary {
      background: #6b7280;
      color: white;
    }
    .btn-secondary:hover {
      background: #4b5563;
    }
    .btn-success {
      background: #10b981;
      color: white;
    }
    .btn-success:hover {
      background: #059669;
    }
    .toc {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .toc h2 {
      margin-top: 0;
      color: #1e40af;
    }
    .toc ul {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px;
      list-style: none;
      padding: 0;
    }
    .toc li a {
      display: block;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
      text-decoration: none;
      color: #1a1a1a;
      transition: all 0.2s;
    }
    .toc li a:hover {
      background: #e5e7eb;
      transform: translateX(5px);
    }
    .toc li a .ref {
      font-weight: 600;
      color: #3b82f6;
    }
    .issue-flag {
      color: #ef4444;
      font-weight: 600;
      font-size: 0.85em;
      margin-left: 8px;
    }
    @media print {
      body {
        background: white;
      }
      .toc, .actions, .intro {
        display: none;
      }
      .table-section {
        page-break-inside: avoid;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <h1>Dimensional Standards Tables - Bulk Review</h1>
  
  <div class="intro">
    <h2>Review Instructions</h2>
    <p>This page displays all ${sortedRefs.length} dimensional standards tables (02-2 through 02-23) that were automatically extracted from the Bloomington Zoning Ordinance PDF.</p>
    <p><strong>Please review each table and verify:</strong></p>
    <ul>
      <li>Parameter names are correctly extracted</li>
      <li>Values are accurate and complete</li>
      <li>Notes are properly captured</li>
      <li>No data is missing or corrupted</li>
    </ul>
    <p><strong>Mark issues:</strong> Any cells with parsing issues are highlighted in red. Please note these for correction.</p>
    
    <div class="stats">
      <div class="stat-card">
        <h3>${sortedRefs.length}</h3>
        <p>Total Tables</p>
      </div>
      <div class="stat-card">
        <h3>${Array.from(tables.values()).filter(t => dimensionalRefs.has(t.table_ref)).reduce((sum, t) => sum + t.rows.length, 0)}</h3>
        <p>Total Rows</p>
      </div>
      <div class="stat-card">
        <h3>${sortedRefs.length}</h3>
        <p>Need Review</p>
      </div>
    </div>
  </div>
  
  <div class="toc">
    <h2>Quick Navigation</h2>
    <ul>
`;
  
  for (const ref of sortedRefs) {
    const table = tables.get(ref);
    if (!table) continue;
    const title = table.table_title.split(':')[1]?.trim() || table.table_title;
    html += `      <li>
        <a href="#${ref}">
          <span class="ref">${ref}</span> - ${title}
        </a>
      </li>
`;
  }
  
  html += `    </ul>
  </div>
`;
  
  for (const ref of sortedRefs) {
    const table = tables.get(ref);
    if (!table) continue;
    const hasIssues = detectIssues(table);
    
    html += `  <div class="table-section" id="${ref}">
    <div class="table-header">
      <h2>${table.table_title}</h2>
      <span class="badge">${table.rows.length} rows ${hasIssues ? '⚠️ Issues Detected' : ''}</span>
    </div>
    <div class="table-content">
      <div class="metadata">
        <strong>Table Ref:</strong> ${table.table_ref} | 
        <strong>Pages:</strong> ${table.pages.join(', ')} | 
        <strong>Normalized:</strong> ${new Date(table.normalized_at).toLocaleString()}
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
    
    for (const row of table.rows) {
      const isNote = row.label === 'Notes';
      const hasIssue = detectRowIssue(row);
      const issueClass = hasIssue ? 'issue' : '';
      
      html += `          <tr class="${isNote ? 'notes-row' : ''}">
`;
      
      if (isNote) {
        html += `            <td colspan="3">${row.value}</td>
`;
      } else {
        html += `            <td class="label-cell">${row.label || ''}</td>
            <td class="parameter-cell">${row.parameter || ''}</td>
            <td class="value-cell ${issueClass}">${row.value || ''}${hasIssue ? '<span class="issue-flag">⚠️ Possible parsing issue</span>' : ''}</td>
`;
      }
      
      html += `          </tr>
`;
    }
    
    html += `        </tbody>
      </table>
      
      <div class="actions">
        <button class="btn btn-success" onclick="markApproved('${ref}')">✓ Approve</button>
        <button class="btn btn-secondary" onclick="markNeedsWork('${ref}')">⚠️ Needs Work</button>
        <a href="../../../corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/normalized/table_${ref}_normalized.html" class="btn btn-primary" target="_blank">Open Standalone Version</a>
      </div>
    </div>
  </div>
`;
  }
  
  html += `
  <script>
    const approvedTables = new Set();
    const needsWorkTables = new Set();
    
    function markApproved(ref) {
      approvedTables.add(ref);
      needsWorkTables.delete(ref);
      updateButtonStates(ref);
      updateSummary();
    }
    
    function markNeedsWork(ref) {
      needsWorkTables.add(ref);
      approvedTables.delete(ref);
      updateButtonStates(ref);
      updateSummary();
    }
    
    function updateButtonStates(ref) {
      const section = document.getElementById(ref);
      const btns = section.querySelectorAll('.btn-success, .btn-secondary');
      btns.forEach(btn => {
        btn.style.opacity = '0.5';
      });
      
      if (approvedTables.has(ref)) {
        section.querySelector('.btn-success').style.opacity = '1';
      } else if (needsWorkTables.has(ref)) {
        section.querySelector('.btn-secondary').style.opacity = '1';
      }
    }
    
    function updateSummary() {
      console.log('Approved:', approvedTables.size, 'Needs Work:', needsWorkTables.size);
    }
    
    // Detect potential issues in data
    function detectIssues(table) {
      for (const row of table.rows) {
        if (row.label === 'Notes') continue;
        if (row.value.includes('\\n') || row.value.length > 300) {
          return true;
        }
      }
      return false;
    }
  </script>
</body>
</html>`;
  
  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(`Generated bulk review app: ${outputPath}`);
}

function detectIssues(table: NormalizedTable): boolean {
  for (const row of table.rows) {
    if (row.label === 'Notes') continue;
    if (detectRowIssue(row)) {
      return true;
    }
  }
  return false;
}

function detectRowIssue(row: NormalizedRow): boolean {
  if (row.label === 'Notes') return false;
  // Detect issues: very long values, unusual patterns
  if (row.value.length > 300) return true;
  if (row.value.includes('\n')) return true;
  if (row.value.includes('feet 15 feet') || row.value.includes('% 50%')) return true;
  return false;
}

function main() {
  const townSlug = 'bloomington';
  const sourceType = 'city_pdf';
  const snapshotDate = '2026-02-21';
  
  const basePath = `corpus/${townSlug}/${snapshotDate}/${sourceType}/phase2_adu_tables`;
  const normalizedDir = `${basePath}/normalized`;
  const outputPath = `${basePath}/dimensional_standards_review.html`;
  
  console.log(`Loading normalized tables from: ${normalizedDir}`);
  const tables = loadNormalizedTables(normalizedDir);
  console.log(`Loaded ${tables.size} tables`);
  
  generateReviewApp(tables, outputPath, townSlug);
}

main();