// Rasterize scripts/icon.svg into the PNG app icons the PWA manifest needs,
// using the Chromium that ships with this environment. Run: node scripts/gen-icons.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright'
);
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(__dirname, 'icon.svg'), 'utf8');
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const sizes = [
  { size: 192, name: 'icon-192.png', pad: 0 },
  { size: 512, name: 'icon-512.png', pad: 0 },
  // maskable variants keep the artwork inside the safe zone (10% padding)
  { size: 192, name: 'maskable-192.png', pad: 0.1 },
  { size: 512, name: 'maskable-512.png', pad: 0.1 },
  { size: 180, name: 'apple-touch-icon.png', pad: 0 },
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROME ||
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();

for (const { size, name, pad } of sizes) {
  const inner = Math.round(size * (1 - pad * 2));
  const off = Math.round(size * pad);
  const html = `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:#0b0b0c;display:flex;align-items:center;justify-content:center">
      <div style="width:${inner}px;height:${inner}px;margin:${off}px">${svg}</div>
    </div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html);
  await page.locator('svg').first().evaluate((el, s) => {
    el.setAttribute('width', s);
    el.setAttribute('height', s);
  }, inner);
  await page.screenshot({ path: join(outDir, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}

await browser.close();
