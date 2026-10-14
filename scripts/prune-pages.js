/**
 * Drop every <section class="page"> except the one this URL actually shows.
 * Nested sections that are not pages (partner blocks, corporate teasers)
 * stay inside the kept page.
 */
function pruneToPage(html, id) {
  const token = /<\/?section\b[^>]*>/gi;
  const stack = [];
  const ranges = [];
  let match;
  while ((match = token.exec(html))) {
    const tag = match[0];
    if (!tag.startsWith('</')) {
      const cls = (tag.match(/\bclass="([^"]*)"/) || ['', ''])[1];
      const sid = (tag.match(/\bid="([^"]*)"/) || ['', ''])[1];
      const words = cls.split(/\s+/);
      stack.push({
        isPage: words.indexOf('page') !== -1,
        sid: sid,
        start: match.index
      });
    } else {
      const open = stack.pop();
      if (!open) throw new Error('unbalanced </section> while pruning ' + id);
      if (open.isPage) {
        ranges.push({
          sid: open.sid,
          start: open.start,
          end: match.index + tag.length,
          keep: open.sid === 'p-' + id
        });
      }
    }
  }
  if (stack.length) {
    throw new Error('unclosed <section> while pruning ' + id);
  }
  const kept = ranges.filter(function (range) { return range.keep; });
  if (kept.length !== 1) {
    throw new Error(id + ' would keep ' + kept.length + ' page sections');
  }
  const drop = ranges.filter(function (range) { return !range.keep; }).sort(function (a, b) {
    return b.start - a.start;
  });
  let out = html;
  drop.forEach(function (range) {
    let end = range.end;
    if (out.charAt(end) === '\n') end++;
    out = out.slice(0, range.start) + out.slice(end);
  });
  out = out.replace(/<!-- ============ [^=]+ ============ -->\n?/g, '');
  if (!out.includes('id="p-' + id + '"')) throw new Error('pruned away #' + id);
  const ons = out.match(/<section class="page on\b/g) || [];
  if (ons.length !== 1) throw new Error(id + ' has ' + ons.length + ' active sections after prune');
  const pages = out.match(/<section class="page\b/g) || [];
  if (pages.length !== 1) throw new Error(id + ' still has ' + pages.length + ' page sections');
  return out;
}

module.exports = { pruneToPage: pruneToPage };
