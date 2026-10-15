#!/usr/bin/env node
/**
 * Write resized WebP copies of gallery and hero images.
 * Originals stay in place. Widths are 480, 960, and 1600 when the
 * source is larger than that width; nothing is upscaled.
 *
 *   node scripts/build-images.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'images');
const WIDTHS = [480, 960, 1600];
const SKIP_TOP = new Set(['brand', 'social', 'badges']);
const HERO_SRC = '/images/home/fayola-whyte-manco-creative-director.jpg';
const QUALITY = 84;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function isSourceImage(abs) {
  if (!/\.(jpe?g|png)$/i.test(abs)) return false;
  const rel = path.relative(IMAGES, abs);
  const top = rel.split(path.sep)[0];
  if (SKIP_TOP.has(top)) return false;
  return true;
}

function extractEmbeddedHero() {
  const candidates = [
    path.join(__dirname, 'site.html'),
    path.join(ROOT, 'index.html')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const match = html.match(/src="data:image\/jpeg;base64,([^"]+)"/);
    if (!match) continue;
    const buf = Buffer.from(match[1], 'base64');
    const dest = path.join(ROOT, HERO_SRC.replace(/^\//, ''));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(buf)) {
      fs.writeFileSync(dest, buf);
      console.log('Wrote ' + HERO_SRC + ' (' + buf.length + ' bytes) from embedded hero');
    }
    return dest;
  }
  return null;
}

function variantPath(abs, width) {
  const ext = path.extname(abs);
  return abs.slice(0, -ext.length) + '-' + width + '.webp';
}

function orientedWidth(meta) {
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (meta.orientation >= 5) return height || width;
  return width;
}

async function buildOne(abs) {
  const meta = await sharp(abs).metadata();
  const originalWidth = orientedWidth(meta);
  if (!originalWidth) throw new Error('no width for ' + abs);
  const targets = WIDTHS.filter(function (w) { return w < originalWidth; });
  const max = Math.min(originalWidth, 1600);
  if (targets.indexOf(max) === -1) targets.push(max);
  targets.sort(function (a, b) { return a - b; });
  const sourceMtime = fs.statSync(abs).mtimeMs;
  let wrote = 0;
  for (let i = 0; i < targets.length; i++) {
    const width = targets[i];
    const dest = variantPath(abs, width);
    if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= sourceMtime && fs.statSync(dest).size > 0) {
      continue;
    }
    const info = await sharp(abs)
      .rotate()
      .resize({ width: width, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 4 })
      .toFile(dest + '.tmp');
    const actual = info.width || width;
    const finalDest = variantPath(abs, actual);
    if (finalDest !== dest && fs.existsSync(finalDest)) fs.unlinkSync(finalDest);
    fs.renameSync(dest + '.tmp', finalDest);
    wrote++;
  }
  return wrote;
}

async function pool(items, limit, fn) {
  let cursor = 0;
  const workers = [];
  const n = Math.min(limit, items.length || 1);
  for (let i = 0; i < n; i++) {
    workers.push((async function () {
      while (cursor < items.length) {
        const index = cursor++;
        await fn(items[index], index);
      }
    })());
  }
  await Promise.all(workers);
}

async function build() {
  extractEmbeddedHero();
  const files = walk(IMAGES, []).filter(isSourceImage);
  let wrote = 0;
  let done = 0;
  await pool(files, 4, async function (abs) {
    wrote += await buildOne(abs);
    done++;
    if (done % 100 === 0 || done === files.length) {
      console.log('variants ' + done + '/' + files.length + ' (' + wrote + ' files written)');
    }
  });
  console.log('Image variants ready for ' + files.length + ' originals, ' + wrote + ' new WebP files');
  return { originals: files.length, written: wrote };
}

if (require.main === module) {
  build().catch(function (err) {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { build, HERO_SRC, WIDTHS };
