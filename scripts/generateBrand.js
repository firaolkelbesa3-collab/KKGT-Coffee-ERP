// One-shot brand asset generator for KKGT Import Export.
// Source: D:/good friday/kkgt logo.jpg
//  - Trims the white border to the logo content.
//  - Emits src/lib/brandLogo.js (base64 PNG for PDF/Excel report headers).
//  - Emits square PWA/favicon icons (logo letterboxed on white).
// Run: node scripts/generateBrand.js
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = 'D:/good friday/kkgt logo.jpg';
const PUBLIC = path.resolve('public');
const BRAND_JS = path.resolve('src/lib/brandLogo.js');

async function main() {
  // 1. Trim the white frame down to the actual logo content.
  const trimmed = await sharp(SRC)
    .flatten({ background: '#ffffff' })
    .trim({ threshold: 12 })
    .toBuffer();
  const meta = await sharp(trimmed).metadata();
  const aspect = +(meta.width / meta.height).toFixed(4);
  console.log(`Trimmed logo: ${meta.width}x${meta.height}  aspect=${aspect}`);

  // 2. Report-header logo: trimmed logo on a white card, padded, ~640px wide.
  //    Kept on white because the report header band is dark green — a white
  //    logo chip reads as intentional and keeps the green letters visible.
  const reportW = 640;
  const reportLogo = await sharp(trimmed)
    .resize({ width: reportW - 48, withoutEnlargement: false })
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' })
    .png()
    .toBuffer();
  const b64 = reportLogo.toString('base64');
  const reportMeta = await sharp(reportLogo).metadata();
  const reportAspect = +(reportMeta.width / reportMeta.height).toFixed(4);

  const brandJs = `// Auto-generated: KKGT Import Export logo as a data URL for embedding
// in PDF (jsPDF.addImage) and Excel (exceljs image) report headers.
// Aspect ratio (width/height) of this image:
export const LOGO_ASPECT = ${reportAspect};
export const LOGO_PNG_DATAURL = "data:image/png;base64,${b64}";
`;
  fs.writeFileSync(BRAND_JS, brandJs);
  console.log(`Wrote ${BRAND_JS}  (${(b64.length / 1024).toFixed(1)} KB base64, aspect=${reportAspect})`);

  // 3. Square icons — logo centered on white with padding.
  async function squareIcon(size, padRatio) {
    const inner = Math.round(size * (1 - padRatio));
    const logo = await sharp(trimmed)
      .resize({ width: inner, height: inner, fit: 'contain', background: '#ffffff' })
      .toBuffer();
    return sharp({
      create: { width: size, height: size, channels: 4, background: '#ffffff' },
    })
      .composite([{ input: logo, gravity: 'center' }])
      .png()
      .toBuffer();
  }

  const targets = [
    ['pwa-192x192.png', 192, 0.12],
    ['pwa-512x512.png', 512, 0.12],
    ['pwa-maskable-512x512.png', 512, 0.26], // extra padding for the circular mask
    ['apple-touch-icon.png', 180, 0.12],
    ['favicon-32.png', 32, 0.06],
  ];
  for (const [name, size, pad] of targets) {
    const buf = await squareIcon(size, pad);
    fs.writeFileSync(path.join(PUBLIC, name), buf);
    console.log(`Wrote public/${name} (${size}x${size})`);
  }

  console.log('\nDone. Report logo aspect to use in layout:', reportAspect);
}

main().catch(e => { console.error(e); process.exit(1); });
