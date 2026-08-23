import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'scripts/shot-empty.png' });

// Inject real images into the hidden file input.
const files = ['public/icons/icon-512.png', 'public/icons/maskable-512.png', 'public/icons/icon-192.png'];
await page.setInputFiles('input[type=file]', files);
await page.waitForTimeout(1200);

const thumbs = await page.locator('main img').count();
console.log('thumbnails rendered:', thumbs);

// Rate the first frame 5 stars, pick it, add a red label via keyboard.
await page.keyboard.press('5');
await page.keyboard.press('p');
await page.keyboard.press('6');
await page.waitForTimeout(300);
const starBadge = await page.locator('main').getByText('5', { exact: false }).count();

// Switch views
await page.keyboard.press('e'); await page.waitForTimeout(300);
await page.screenshot({ path: 'scripts/shot-loupe.png' });
await page.keyboard.press('c'); await page.waitForTimeout(300);
await page.keyboard.press('g'); await page.waitForTimeout(300);
await page.screenshot({ path: 'scripts/shot-grid.png' });
await page.keyboard.press('s'); await page.waitForTimeout(300);
await page.screenshot({ path: 'scripts/shot-sheet.png' });

// Light theme screenshot
await page.keyboard.press('g'); await page.waitForTimeout(200);
await page.locator('button[title="Toggle theme"]').click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'scripts/shot-light.png' });

console.log('console/page errors:', errors.length ? JSON.stringify(errors, null, 2) : 'none');
console.log('RESULT:', thumbs >= 3 && errors.length === 0 ? 'PASS' : 'CHECK');
await browser.close();
