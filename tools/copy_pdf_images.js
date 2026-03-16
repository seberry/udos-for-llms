const fs = require('fs');
const pages = [23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 57, 59, 61, 63, 65];

pages.forEach(p => {
  const src = `corpus/bloomington/2026-02-21/city_pdf/phase2_adu_tables/pymupdf_benchmark/images/page_${String(p).padStart(4, '0')}.png`;
  const dst = `public/bloomington/tables/pymupdf_benchmark/images/page_${String(p).padStart(4, '0')}.png`;
  fs.copyFileSync(src, dst);
  console.log(`Copied page_${p}`);
});

console.log(`Copied ${pages.length} PDF images`);