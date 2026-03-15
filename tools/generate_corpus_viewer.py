#!/usr/bin/env python3
"""
HTML Viewer Generator for Bloomington Municipal Code Corpus
Generates a clean, readable HTML page from chunks_chapter20.jsonl
"""

import json
import re
from pathlib import Path
from typing import List, Dict

# Configuration
INPUT_FILE = "corpus/bloomington/2026-02-21/municode/phase1/chunks_chapter20.jsonl"
OUTPUT_FILE = "cities/bloomington/corpus_viewer.html"
TITLE = "Bloomington Unified Development Ordinance - Chapter 20"

def detect_heading(line: str) -> bool:
    """
    Detect if a line looks like a section heading.
    Matches patterns like:
    - "20.02.020 Residential zoning districts."
    - "20.02.060 Overlay districts."
    - "Chapter 20.02 ZONING DISTRICTS"
    """
    # Section number patterns like "20.XX.XXX" or "Chapter 20.XX"
    section_pattern = r'^(20\.\d{2}\.\d{3}|Chapter 20\.\d{2})\s+'
    if re.match(section_pattern, line.strip()):
        return True
    return False

def generate_html(chunks: List[Dict]) -> str:
    """
    Generate HTML from chunks with basic formatting and heading detection.
    """
    html_parts = []
    
    # HTML Header
    html_header = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{TITLE}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.7;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
            color: #333;
            background-color: #fff;
        }}
        h1 {{
            color: #2c5282;
            border-bottom: 3px solid #2c5282;
            padding-bottom: 0.5rem;
            margin-top: 2rem;
        }}
        h2 {{
            color: #3d5a80;
            margin-top: 2rem;
            margin-bottom: 1rem;
            font-size: 1.8rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid #e0e0e0;
        }}
        p {{
            margin-bottom: 1rem;
        }}
        .chunk-separator {{
            border-top: 2px solid #e0e0e0;
            margin: 3rem 0;
        }}
        .section-heading {{
            background-color: #f8f9fa;
            padding: 1rem;
            border-left: 4px solid #2c5282;
            margin: 1.5rem 0;
            font-weight: 600;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
            font-size: 0.9rem;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 0.5rem;
            text-align: left;
            vertical-align: top;
        }}
        th {{
            background-color: #f2f2f2;
            font-weight: 600;
        }}
        pre {{
            background-color: #f8f8fa;
            padding: 1rem;
            overflow-x: auto;
            border-radius: 4px;
            font-size: 0.85rem;
        }}
        @media (max-width: 768px) {{
            body {{
                padding: 1rem;
            }}
            h1 {{
                font-size: 1.5rem;
            }}
            h2 {{
                font-size: 1.4rem;
            }}
        }}
    </style>
</head>
<body>
    <h1>{TITLE}</h1>
"""
    html_parts.append(html_header)
    
    # Process chunks in order
    for chunk in chunks:
        text = chunk.get('text', '').strip()
        
        if not text:
            continue
        
        # Clean up text while preserving structure
        paragraphs = []
        lines = text.split('\n')
        
        current_paragraph = []
        
        for line in lines:
            line = line.strip()
            
            # Skip empty lines between paragraphs
            if not line:
                if current_paragraph:
                    paragraphs.append(' '.join(current_paragraph))
                    current_paragraph = []
                continue
            
            # Check if this line is a heading
            if detect_heading(line):
                # Flush current paragraph if exists
                if current_paragraph:
                    paragraphs.append(' '.join(current_paragraph))
                    current_paragraph = []
                
                # Add as heading paragraph
                paragraphs.append(f"<div class='section-heading'>{line}</div>")
                current_paragraph = []
            else:
                current_paragraph.append(line)
        
        # Don't forget the last paragraph
        if current_paragraph:
            paragraphs.append(' '.join(current_paragraph))
        
        # Add chunk separator (except for first chunk)
        if html_parts[-1] != html_header:
            html_parts.append('<div class="chunk-separator"></div>')
        
        # Convert paragraphs to HTML
        for para in paragraphs:
            if para.startswith('<div class=\'section-heading\'>'):
                # It's a heading div, add as-is
                html_parts.append(para)
            else:
                # Convert to paragraph
                html_parts.append(f'<p>{para}</p>')
    
    # HTML Footer
    html_footer = """
</body>
</html>"""
    html_parts.append(html_footer)
    
    return '\n'.join(html_parts)

def main():
    print(f"Loading chunks from {INPUT_FILE}...")
    
    # Load JSONL file
    chunks = []
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    chunks.append(json.loads(line))
        print(f"Loaded {len(chunks)} chunks")
    except FileNotFoundError:
        print(f"Error: File not found: {INPUT_FILE}")
        return
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        return
    
    # Sort chunks by chunk_id to maintain order
    chunks.sort(key=lambda x: x.get('chunk_id', ''))
    
    print("Generating HTML...")
    html_content = generate_html(chunks)
    
    # Create output directory if needed
    output_path = Path(OUTPUT_FILE)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write HTML file
    print(f"Writing to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print("Done! HTML viewer created successfully.")
    print(f"Open: {OUTPUT_FILE.absolute()}")

if __name__ == "__main__":
    main()