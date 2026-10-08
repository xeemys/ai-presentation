#!/usr/bin/env node
// Экспорт html/<slug>/index.html -> pdf/<slug>.pdf через headless Chromium.
// Использование: node scripts/export-pdf.mjs <slug>

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const slug = process.argv[2];
if (!slug) {
  console.error('Использование: node scripts/export-pdf.mjs <slug>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const htmlPath = path.join(root, 'html', slug, 'index.html');
const pdfPath = path.join(root, 'pdf', `${slug}.pdf`);

if (!fs.existsSync(htmlPath)) {
  console.error(`Не найден файл: ${htmlPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(pdfPath), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
// Браузер грузит начертание шрифта лениво — только когда текст с этим весом
// виден на экране. Слайды кроме активного скрыты, поэтому веса, которых нет
// на первом слайде, не успевают загрузиться и в PDF печатаются системным
// шрифтом. Грузим все объявленные начертания принудительно.
await page.evaluate(async () => {
  await Promise.all([...document.fonts].map((f) => f.load()));
  await document.fonts.ready;
});
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: pdfPath,
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();

console.log(`Сохранено: ${pdfPath}`);
