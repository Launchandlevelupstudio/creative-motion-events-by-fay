# Portfolio image SEO — naming & alt-text guide

Use this for every Creative Motion Events Work album (covers + gallery shots). Goal: Google Images + page relevance without keyword stuffing.

## Rules (always)

1. **Descriptive filename before upload** — never `IMG_3074.jpg` or bare `01.jpg`.
2. **Alt text matches the photo** — say what is actually in the frame.
3. **Page context** — keep the image on an album page with clear title, location, and event type.
4. **Crawlable URLs** — prefer indexable album paths (see URL targets below). Don’t hide portfolio images behind login or blocked assets.
5. **Sharp but optimized** — high quality, max edge ~1600px, JPEG ~80–88; avoid multi‑MB originals on the live site.
6. **Don’t clone the same keywords on every image** — vary wording; stay accurate.

---

## Filename pattern

```
{client-or-event-slug}-{moment-or-shot}-{location-slug}.jpg
```

- lowercase, hyphenated
- include brand/event + place when known
- optional shot cue: `entrance`, `ribbon-cutting`, `tablescape`, `lounge`, `branding`

### Album prefixes (current portfolio)

| Album | Prefix |
|--------|--------|
| Able Health Services Grand Opening | `able-health-services-grand-opening-hanover-md-` |
| PNC Bank Grand Opening | `pnc-bank-grand-opening-maryland-` |
| Jazmine & Jaleesa Engagement Dinner | `jazmine-jaleesa-engagement-dinner-maryland-` |
| Titi Bridal Shower | `titi-bridal-shower-maryland-` |

### Examples

**Able Health**

- `able-health-services-grand-opening-hanover-md-entrance.jpg`
- `able-health-services-grand-opening-hanover-md-ribbon-cutting.jpg`
- `able-health-services-grand-opening-hanover-md-event-decor.jpg`
- `able-health-services-grand-opening-hanover-md-branded-balloon-installation.jpg`

**Jazmine & Jaleesa**

- `jazmine-jaleesa-engagement-dinner-maryland-tablescape.jpg`
- `jazmine-jaleesa-engagement-dinner-maryland-place-setting.jpg`

**Titi**

- `titi-bridal-shower-maryland-tablescape.jpg`
- `titi-bridal-shower-maryland-miss-to-mrs-backdrop.jpg`

**Numbered gallery fallback** (when you can’t name every moment yet)

- `able-health-services-grand-opening-hanover-md-gallery-01.jpg`
- `able-health-services-grand-opening-hanover-md-gallery-02.jpg`

Still better than `01.jpg`. Prefer real moment names when you know them.

---

## Alt-text pattern

```
{What’s in the photo}, {event type} for {client/couple}, {city/region} — Creative Motion Events
```

Keep it one natural sentence. Swap details so images aren’t identical.

### Templates by album

**Able Health Services — Grand Opening (Hanover, MD)**

- Cover: `Able Health Services grand opening entrance with ribbon and branded balloon décor in Hanover, Maryland by Creative Motion Events`
- Variant: `Ribbon cutting and event design for the Able Health Services grand opening in Hanover, Maryland`
- Variant: `Branded lounge and lobby styling at the Able Health Services grand opening in Hanover, Maryland`

**PNC Bank — Grand Opening (Maryland)**

- Cover: `PNC Bank grand opening exterior and entry event design in Maryland by Creative Motion Events`
- Variant: `Corporate grand opening décor and branding for PNC Bank in Maryland`

**Jazmine & Jaleesa — Engagement Dinner**

- Cover: `Elegant engagement dinner tablescape designed by Creative Motion Events in Maryland`
- Variant: `Long banquet tablescape with florals and place settings for Jazmine and Jaleesa’s engagement dinner in Maryland`

**Titi — Bridal Shower**

- Cover: `Luxury bridal shower tablescape and floral event design by Creative Motion Events in Maryland`
- Variant: `Miss to Mrs bridal shower backdrop and seating design by Creative Motion Events in Maryland`

### Work landing / category covers

- Corporate tile: describe Able entry / corporate moment actually shown  
- Private tile: describe the tablescape actually shown  
- Don’t reuse Able alt text on a bridal photo

---

## Album page context (copy checklist)

Each album page should clearly state:

- Event name (exact client spelling, e.g. **Able Health Services**)
- Event type (grand opening, engagement dinner, bridal shower, gala…)
- Location (city/state when known)
- Designer credit: Creative Motion Events / Fayola Whyte-Manco as appropriate

---

## Target URL structure (phase 2)

Prefer crawlable paths over hash-only SPA routes:

```
/work/corporate/grand-openings/able-health-services
/work/corporate/grand-openings/pnc-bank
/work/corporate/galas/{event-slug}
/work/private/engagements/jazmine-jaleesa
/work/private/bridal-showers/titi
```

Until those paths exist, still ship good filenames + alt text on the current album views.

---

## Quick QA before publish

- [ ] Filename is descriptive (no `IMG_` / bare numbers only)
- [ ] Alt describes *this* photo
- [ ] Album title + location appear near the gallery
- [ ] Image is compressed for web
- [ ] Cover + category tiles use the strongest matching shot

---

*Creative Motion Events — for Website Editor / Dan. Update this doc when new album types are added.*
