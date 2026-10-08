#!/usr/bin/env node
// Делает html/<slug>/index.html самодостаточным: встраивает shared/css/deck.css,
// shared/js/deck.js и локальные assets/* как base64 — презентацию можно открыть
// или переслать одним файлом, без остального репозитория.
// Использование: node scripts/inline-deck.mjs <slug>

import fs from 'node:fs';
import path from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Использование: node scripts/inline-deck.mjs <slug>');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const deckDir = path.join(root, 'html', slug);
const htmlPath = path.join(deckDir, 'index.html');

if (!fs.existsSync(htmlPath)) {
  console.error(`Не найден файл: ${htmlPath}`);
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
let changed = 0;

// Старые шаблоны/презентации могли подключать Inter с Google Fonts —
// теперь шрифт свой (shared/fonts/inter/), эти теги больше не нужны и
// только создают лишнюю сетевую зависимость.
const googleFontsRe = /\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?|\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n?|\s*<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]*" rel="stylesheet">\n?/g;
if (googleFontsRe.test(html)) {
  html = html.replace(googleFontsRe, '\n');
  changed++;
}

// Важно: сначала JS, потом CSS. Комментарий-документация в начале deck.css
// сам содержит примеры тегов <link>/<script> — если инлайнить CSS первым,
// regex для <script> находит этот пример внутри уже вставленного CSS
// раньше настоящего тега <script> в конце файла и портит разметку.
const jsSrcRe = /<script src="[^"]*shared\/js\/deck\.js"\s*defer><\/script>/;
if (jsSrcRe.test(html)) {
  const js = fs.readFileSync(path.join(root, 'shared', 'js', 'deck.js'), 'utf8');
  html = html.replace(jsSrcRe, `<script>\n${js}\n</script>`);
  changed++;
}

// Якорь на начало строки (без отступа) — реальный тег в шаблоне всегда с
// колонки 0. deck.css в своём собственном комментарии-документации приводит
// этот же тег как пример, но с отступом в 4 пробела — без ^ якоря regex
// находил тот пример внутри уже встроенного CSS вместо настоящего тега
// (или вместо него при повторном запуске) и портил разметку.
const cssLinkRe = /^<link rel="stylesheet" href="[^"]*shared\/css\/deck\.css"\s*\/?>$/m;
// Файл мог уже быть встроен раньше — тогда вместо <link> там <style>...</style>
// с уже вставленным (возможно устаревшим) deck.css. --refresh-css позволяет
// пересобрать этот блок из текущего shared/css/deck.css, не трогая остальное
// (JS и assets уже встроены и не изменились). Якорь на первую строку
// собственного комментария deck.css — однозначно определяет РЕАЛЬНЫЙ
// <style>, а не любое случайное вхождение "<style>" в тексте.
const styleBlockRe = /<style>\n\/\*\n  Дизайн-система для презентаций[\s\S]*?\n<\/style>/;
const shouldRefreshCss = process.argv.includes('--refresh-css');
const hasCssLink = cssLinkRe.test(html);
const hasInlinedStyle = styleBlockRe.test(html);
if (hasCssLink || (shouldRefreshCss && hasInlinedStyle)) {
  let css = fs.readFileSync(path.join(root, 'shared', 'css', 'deck.css'), 'utf8');
  // встраиваем сами файлы шрифтов как base64 — относительный url() из
  // deck.css резолвился бы не туда, если просто вставить текст CSS в
  // <style> внутри html/<slug>/index.html (другая база для относительных путей)
  css = css.replace(/url\('\.\.\/fonts\/inter\/([^']+\.woff2)'\)/g, (m, filename) => {
    const fontPath = path.join(root, 'shared', 'fonts', 'inter', filename);
    const data = fs.readFileSync(fontPath).toString('base64');
    return `url('data:font/woff2;base64,${data}')`;
  });
  html = hasCssLink
    ? html.replace(cssLinkRe, `<style>\n${css}\n</style>`)
    : html.replace(styleBlockRe, `<style>\n${css}\n</style>`);
  changed++;
}

// Прочие стили из shared/css (например theme-dark.css) — тоже встраиваем,
// иначе одиночный index.html без репозитория потеряет тему.
const extraCssLinkRe = /^<link rel="stylesheet" href="[^"]*shared\/css\/([\w-]+)\.css"\s*\/?>$/gm;
html = html.replace(extraCssLinkRe, (match, name) => {
  const cssPath = path.join(root, 'shared', 'css', `${name}.css`);
  if (!fs.existsSync(cssPath)) return match;
  changed++;
  return `<style>\n${fs.readFileSync(cssPath, 'utf8')}\n</style>`;
});

const mimeByExt = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp' };
html = html.replace(/src="assets\/([^"]+)"/g, (match, filename) => {
  const assetPath = path.join(deckDir, 'assets', filename);
  if (!fs.existsSync(assetPath)) {
    console.warn(`Ассет не найден, оставляю как есть: ${assetPath}`);
    return match;
  }
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = mimeByExt[ext] || 'application/octet-stream';
  const data = fs.readFileSync(assetPath).toString('base64');
  changed++;
  return `src="data:${mime};base64,${data}"`;
});

// Фоновые картинки слайдов подключаются как CSS url('assets/...') в inline
// style, не через <img src>, поэтому отдельный проход тем же принципом.
html = html.replace(/url\('assets\/([^']+)'\)/g, (match, filename) => {
  const assetPath = path.join(deckDir, 'assets', filename);
  if (!fs.existsSync(assetPath)) {
    console.warn(`Ассет не найден, оставляю как есть: ${assetPath}`);
    return match;
  }
  const ext = path.extname(filename).slice(1).toLowerCase();
  const mime = mimeByExt[ext] || 'application/octet-stream';
  const data = fs.readFileSync(assetPath).toString('base64');
  changed++;
  return `url('data:${mime};base64,${data}')`;
});

if (changed === 0) {
  console.log('Уже самодостаточен — заменять нечего.');
  process.exit(0);
}

fs.writeFileSync(htmlPath, html);
console.log(`Готово: ${htmlPath} теперь самодостаточен (${changed} встраиваний).`);
