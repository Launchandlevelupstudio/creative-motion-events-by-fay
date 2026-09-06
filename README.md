# Creative Motion Events — Website Redesign

Single-file preview build of the redesigned Creative Motion Events site (GitHub-ready).

## What's inside
- `index.html` — the entire site (all pages, styles, and scripts in one file for easy preview/upload)
- **Images**: photos are **CSS placeholders** pending real assets (no embedded base64 photos or Google Photos hotlinks). Swap placeholders for hosted image files before launch.

## Pages
Home, Meet Fayola, What We Do, Corporate, Private, Work, Journal (with the first published post: "What Does a $15,000 Gala Design Budget Actually Buy in Washington DC?"), Contact.

## Known items before this goes live
1. **Images**: all photos are gray CSS placeholder blocks that preserve layout. Before launch, replace these with permanently hosted image files (upload real files to the repo / hosting, not links to Google Photos).
2. **Multi-page SEO**: this file uses client-side JavaScript to switch between "pages" on a single URL. For real SEO benefit (especially the Journal article), each page should eventually live at its own crawlable URL with its own `<title>` and `<meta name="description">` — that requires either a static site generator (e.g. Eleventy, Astro) or hosting on a platform that supports multiple pages (Squarespace, Webflow, etc.) rather than this single-file structure.
3. **Contact form**: not yet wired to a backend. On launch, connect it to HoneyBook, Formspree, Netlify Forms, or similar so submissions actually arrive somewhere.
4. **Iris (the AI concierge)**: calls the Anthropic API directly from the browser. This works for demos, but for production you'll want a small backend/proxy so the API key isn't exposed client-side, and to add basic rate-limiting.
5. **Reviews link**: currently points to a Google search results query for the business name. Replace with a direct Google Business Profile / Maps link once available for a cleaner destination.

## Deploying to GitHub Pages (quick option)
1. Create a new GitHub repository.
2. Upload `index.html` to the root of the repo.
3. In the repo settings, enable **GitHub Pages** → Deploy from branch → `main` → `/root`.
4. The site will be live at `https://<username>.github.io/<repo-name>/`.
