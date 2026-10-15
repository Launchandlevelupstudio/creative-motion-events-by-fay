/**
 * Add srcset/sizes and loading to content images that have WebP variants.
 * The img src stays the original file. Lightbox data-src is left alone.
 */
const fs = require('fs');
const path = require('path');

const HERO_SRC = '/images/home/fayola-whyte-manco-creative-director.jpg';

function buildVariantIndex(root) {
  const images = path.join(root, 'images');
  const map = new Map();
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) {
        const rel = path.relative(images, abs);
        const top = rel.split(path.sep)[0];
        if (top === 'brand' || top === 'social' || top === 'badges') continue;
        walk(abs);
        continue;
      }
      const match = name.match(/^(.*)-(\d+)\.webp$/);
      if (!match) continue;
      const base = match[1];
      const width = Number(match[2]);
      let original = null;
      const exts = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'];
      for (let i = 0; i < exts.length; i++) {
        if (fs.existsSync(path.join(dir, base + exts[i]))) {
          original = base + exts[i];
          break;
        }
      }
      if (!original) continue;
      const dirWeb = '/' + path.relative(root, dir).split(path.sep).join('/');
      const src = dirWeb + '/' + original;
      if (!map.has(src)) map.set(src, []);
      map.get(src).push({ w: width, url: dirWeb + '/' + name });
    }
  }
  walk(images);
  map.forEach(function (list) {
    list.sort(function (a, b) { return a.w - b.w; });
  });
  return map;
}

function sizesFor(classText) {
  if (/\balbum-cell\b/.test(classText)) return '(min-width: 820px) 340px, 46vw';
  if (/\balbum-hero\b/.test(classText)) return '(min-width: 820px) 1072px, 100vw';
  if (/\bwork-fig\b|\btile\b/.test(classText)) return '(min-width: 800px) 520px, 100vw';
  if (/\bpost-hero\b|\bwhat-hero\b|\bcorp-hero\b|\bpartner-banner\b|\bcorp-featured\b|\bcorp-teaser\b/.test(classText)) {
    return '(min-width: 900px) 1040px, 100vw';
  }
  if (/\bhero\b/.test(classText)) return '(min-width: 860px) 50vw, 100vw';
  if (/\bportrait\b|\btall\b/.test(classText)) return '(min-width: 800px) 480px, 92vw';
  if (/\bpost-inline\b/.test(classText)) return '(min-width: 800px) 720px, 92vw';
  return '(min-width: 800px) 720px, 92vw';
}

function contextClasses(html, offset) {
  const start = Math.max(0, offset - 2200);
  const window = html.slice(start, offset);
  const classes = [];
  const re = /class="([^"]*)"/g;
  let match;
  while ((match = re.exec(window))) classes.push(match[1]);
  return classes.join(' ');
}

function upsertAttr(tag, name, value) {
  const re = new RegExp('\\b' + name + '="[^"]*"');
  if (re.test(tag)) return tag.replace(re, name + '="' + value + '"');
  return tag.replace(/<img\b/i, '<img ' + name + '="' + value + '"');
}

function applySrcset(tag, variants, classText) {
  const srcset = variants.map(function (v) { return v.url + ' ' + v.w + 'w'; }).join(', ');
  let next = upsertAttr(tag, 'srcset', srcset);
  next = upsertAttr(next, 'sizes', sizesFor(classText));
  return next;
}

function applyLoading(tag, lazy) {
  return upsertAttr(tag, 'loading', lazy ? 'lazy' : 'eager');
}

function externalizeHero(html) {
  if (!html.includes('data:image/jpeg;base64,')) return html;
  return html.replace(/src="data:image\/jpeg;base64,[^"]+"/, 'src="' + HERO_SRC + '"');
}

function activePageBounds(html) {
  const token = /<\/?section\b[^>]*>/gi;
  const stack = [];
  let match;
  while ((match = token.exec(html))) {
    const tag = match[0];
    if (!tag.startsWith('</')) {
      const cls = (tag.match(/\bclass="([^"]*)"/) || ['', ''])[1];
      const words = cls.split(/\s+/);
      const isPage = words.indexOf('page') !== -1;
      const isOn = words.indexOf('on') !== -1;
      stack.push({ isPage: isPage, isOn: isOn, start: match.index + tag.length });
    } else {
      const open = stack.pop();
      if (open && open.isPage && open.isOn) {
        return { start: open.start, end: match.index };
      }
    }
  }
  return null;
}

function rewritePageHtml(html, index) {
  html = externalizeHero(html);
  const bounds = activePageBounds(html);
  let firstImg = -1;
  if (bounds) {
    const re = /<img\b/gi;
    let match;
    while ((match = re.exec(html))) {
      if (match.index >= bounds.start && match.index < bounds.end) {
        firstImg = match.index;
        break;
      }
    }
  }
  return html.replace(/<img\b[^>]*>/gi, function (tag, offset) {
    const src = (tag.match(/\bsrc="([^"]*)"/) || [])[1] || '';
    let next = tag;
    const variants = src && index.get(src);
    if (variants && variants.length) {
      next = applySrcset(next, variants, contextClasses(html, offset));
    }
    if (bounds && offset >= bounds.start && offset < bounds.end && !/\bid="lbImg"/.test(tag) && src) {
      next = applyLoading(next, offset !== firstImg);
    }
    return next;
  });
}

function lazyNonHeroImages(html) {
  let skippedHeaderLogo = false;
  return html.replace(/<img\b[^>]*>/gi, function (tag) {
    if (/\bclass="[^"]*\bhero\b/.test(tag) || /\bid="lbImg"/.test(tag)) return tag;
    if (!skippedHeaderLogo) {
      skippedHeaderLogo = true;
      return tag;
    }
    return applyLoading(tag, true);
  });
}

function polishEventsByFay(html) {
  if (!html.includes('.hero-image{max-width:100%')) {
    html = html.replace('.hero-image{', '.hero-image{max-width:100%;');
  }
  return html;
}

module.exports = {
  HERO_SRC: HERO_SRC,
  buildVariantIndex: buildVariantIndex,
  rewritePageHtml: rewritePageHtml,
  lazyNonHeroImages: lazyNonHeroImages,
  polishEventsByFay: polishEventsByFay
};
