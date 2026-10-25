#!/usr/bin/env node
/**
 * Generate one folder/index.html per site route from the full template.
 * GitHub Pages (legacy, branch root) serves the committed files. Re-run
 * after editing shared markup:
 *
 *   node scripts/build-pages.js
 *
 * scripts/site.html is the full single-page template (every section).
 * The first build copies it from index.html. Later builds read site.html,
 * because index.html is rewritten as the homepage only. Each public page
 * keeps the shared head, nav, footer, chat, and lightbox, plus the one
 * section that page shows. site.html is publicly reachable on GitHub Pages,
 * so it carries a noindex meta. That meta is stripped before any route,
 * landing page, or other generated file is written. 404.html keeps the
 * noindex meta from main. The noindex check allowlists 404.html and
 * scripts/site.html. Analytics markup sits
 * outside the replaced SEO
 * block and is refreshed as one block on each build.
 *
 * Landing pages in ./landing-pages.js are generated from this same shell
 * (head, analytics, canonical, Open Graph, JSON-LD). Their sections are
 * injected only into those new files. They are not added to `routes`, so
 * the shared shell, nav, footer, and existing route files stay unchanged.
 */
const fs = require('fs');
const path = require('path');
const { pruneToPage } = require('./prune-pages');
const {
  buildVariantIndex,
  rewritePageHtml,
  lazyNonHeroImages,
  polishEventsByFay
} = require('./responsive-images');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://creativemotionevents.com';
const LASTMOD = '2026-10-09';
const BRAND_IMAGE = ORIGIN + '/images/brand/og-home-creative-motion-fayola-whyte-manco.jpg';
const BRAND_ALT = 'Creative Motion Event Design & Production, Fayola Whyte-Manco';
const LOGO = ORIGIN + '/images/brand/cm-logo-horizontal.png';

function abs(p) { return ORIGIN + p; }
function img(p) { return ORIGIN + p; }

const routes = [
  {
    id: 'home',
    path: '/',
    title: 'Corporate Event Design & Production DC, MD & VA | Creative Motion',
    description: 'Corporate event design & production in DC, Maryland & Northern Virginia. Galas, grand openings, brand activations.',
    crumbs: []
  },
  {
    id: 'who',
    path: '/meet-fayola/',
    title: 'Fayola Whyte-Manco, Owner & Creative Director | Creative Motion',
    description: 'Fayola Whyte-Manco is Owner & Creative Director of Creative Motion Events, designing corporate events across DC, Maryland and Virginia since 2017.',
    crumbs: [['Home', '/'], ['Meet Fayola', '/meet-fayola/']],
    image: img('/images/fayola-meet.jpg'),
    imageAlt: 'Fayola Whyte-Manco, Owner & Creative Director of Creative Motion Events'
  },
  {
    id: 'what',
    path: '/what-we-do/',
    title: 'Corporate Event Design & Production Services | Creative Motion',
    description: 'Corporate event design & production: creative direction, branded stages, florals, signage and on-site vendor direction for galas, openings and conferences.',
    image: img('/images/what-we-do/on-site-direction-pointing-edited.jpg'),
    imageAlt: 'A team lead in a black blazer pointing and giving direction, with a staff member\'s back and a Creative Motion Events shirt in the foreground of a bright event space',
    crumbs: [['Home', '/'], ['What We Do', '/what-we-do/']]
  },
  {
    id: 'corporate',
    path: '/corporate-events/',
    title: 'Corporate Event Design & Production in DC, MD & Northern VA',
    description: 'Galas, grand openings and conferences designed and produced by Fayola Whyte-Manco across DC, Maryland & Northern Virginia.',
    image: img('/images/pmi-wdc-2026/pmi-wdc-conference-general-session-jw-marriott-reston-ballroom.jpg'),
    imageAlt: 'PMI Washington DC Chapter general session at JW Marriott Reston Station: panel on white lounge seating before a branded stage, guests at navy-draped round tables with floral centerpieces',
    corporateService: true,
    crumbs: [['Home', '/'], ['Corporate Events', '/corporate-events/']]
  },
  {
    id: 'annual-partnership',
    path: '/annual-design-partnership/',
    title: 'Annual Design Partnership for Organizations | Creative Motion',
    description: 'One creative partner for organizations hosting three or more events a year. Each event is scoped on its own.',
    image: img('/images/corporate/pmi-wdc-floral-centerpiece-branded-plinth.jpg'),
    imageAlt: 'Blue hydrangeas and orange roses in a gold pedestal bowl on a white plinth branded Project Management Institute Washington, DC Chapter',
    crumbs: [['Home', '/'], ['Annual Design Partnership', '/annual-design-partnership/']]
  },
  {
    id: 'private',
    path: '/private-celebrations/',
    title: 'Private Celebrations in DC, MD & VA | Creative Motion Events',
    description: 'Milestone birthdays, anniversaries, engagement dinners, intimate dinners, and destination celebrations, designed with elegance and produced with calm.',
    image: img('/images/private/private-engagement-celebration-she-said-oui-tablescape.jpg'),
    imageAlt: 'Engagement celebration table with a black-and-white striped runner, hot-pink napkins, gold-beaded chargers, and a She Said Oui arch — Creative Motion Events',
    crumbs: [['Home', '/'], ['Private Celebrations', '/private-celebrations/']]
  },
  {
    id: 'work',
    path: '/work/',
    title: 'Event Portfolio: Galas & Grand Openings | Creative Motion',
    description: 'Corporate galas, grand openings, and private celebrations designed and produced by Creative Motion Events across Washington DC, Maryland, and Virginia.',
    image: img('/images/pmi-wdc-2026/pmi-wdc-awards-gala-jw-marriott-reston-ballroom-n129.jpg'),
    imageAlt: 'Finished ballroom for the PMI Washington DC Chapter Awards Gala at JW Marriott Reston Station',
    crumbs: [['Home', '/'], ['Work', '/work/']]
  },
  {
    id: 'work-corporate',
    path: '/work/corporate-events/',
    title: 'Corporate Event Portfolio: DC, MD & VA | Creative Motion',
    description: 'Galas, awards nights, grand openings, and brand moments designed by Creative Motion Events for organizations in Washington DC, Maryland, and Virginia.',
    image: img('/images/pmi-wdc-2026/pmi-wdc-awards-gala-jw-marriott-reston-ballroom-n129.jpg'),
    imageAlt: 'Finished ballroom for the PMI Washington DC Chapter Awards Gala at JW Marriott Reston Station',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/']]
  },
  {
    id: 'work-corporate-galas',
    path: '/work/corporate-events/galas/',
    title: 'Gala & Awards Event Design in the DMV | Creative Motion Events',
    description: 'Awards nights and celebration galas designed and produced by Creative Motion Events, including the PMI Washington DC Chapter Awards Gala at JW Marriott Reston Station.',
    image: img('/images/pmi-wdc-2026/pmi-wdc-awards-gala-jw-marriott-reston-ballroom-n129.jpg'),
    imageAlt: 'Finished ballroom for the PMI Washington DC Chapter Awards Gala at JW Marriott Reston Station',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/'], ['Galas', '/work/corporate-events/galas/']]
  },
  {
    id: 'work-corporate-grand-openings',
    path: '/work/corporate-events/grand-openings/',
    title: 'Grand Opening Event Design in DC, MD & VA | Creative Motion',
    description: 'Grand openings and brand moments by Creative Motion Events, including Able Health Services in Hanover, Maryland, and PNC Bank in Wheaton, Maryland.',
    image: img('/images/albums/pnc-grand-opening/pnc-bank-grand-opening-maryland-cover.jpg'),
    imageAlt: 'PNC Bank grand opening exterior and entry event design in Wheaton, Maryland by Creative Motion Events',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/'], ['Grand Openings', '/work/corporate-events/grand-openings/']]
  },
  {
    id: 'work-private',
    path: '/work/private-celebrations/',
    title: 'Private Celebration Portfolio | Creative Motion Events',
    description: 'Engagement dinners, bridal showers, and intimate celebrations designed by Creative Motion Events.',
    image: img('/images/albums/jazmine-jaleesa-engagement/jazmine-jaleesa-engagement-dinner-maryland-cover.jpg'),
    imageAlt: 'Elegant engagement dinner tablescape designed by Creative Motion Events in Maryland',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Private Celebrations', '/work/private-celebrations/']]
  },
  {
    id: 'work-private-engagements',
    path: '/work/private-celebrations/engagements/',
    title: 'Engagement Dinner Design in Maryland | Creative Motion Events',
    description: 'Engagement dinners and intimate celebrations designed by Creative Motion Events, including Jazmine and Jaleesa’s engagement dinner.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Private Celebrations', '/work/private-celebrations/'], ['Engagements', '/work/private-celebrations/engagements/']]
  },
  {
    id: 'work-private-bridal',
    path: '/work/private-celebrations/bridal-showers/',
    title: 'Bridal Shower Design in Maryland | Creative Motion Events',
    description: 'Bridal showers designed by Creative Motion Events in Maryland, including Titi’s bridal shower.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Private Celebrations', '/work/private-celebrations/'], ['Bridal Showers', '/work/private-celebrations/bridal-showers/']]
  },
  {
    id: 'album-titi-bridal-shower',
    path: '/work/private-celebrations/bridal-showers/titi-bridal-shower/',
    title: 'Titi’s Bridal Shower in Maryland | Creative Motion Events',
    description: 'A luxury bridal shower in Maryland designed by Creative Motion Events, with a tablescape, florals, and a Miss to Mrs backdrop.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Private Celebrations', '/work/private-celebrations/'], ['Bridal Showers', '/work/private-celebrations/bridal-showers/'], ['Titi’s Bridal Shower', '/work/private-celebrations/bridal-showers/titi-bridal-shower/']],
    image: img('/images/albums/titi-bridal-shower/titi-bridal-shower-maryland-cover.jpg'),
    imageAlt: 'Bridal shower'
  },
  {
    id: 'album-jazmine-jaleesa-engagement',
    path: '/work/private-celebrations/engagements/jazmine-jaleesa-engagement-dinner/',
    title: 'Jazmine & Jaleesa’s Engagement Dinner in Maryland | Creative Motion Events',
    description: 'An engagement dinner in Maryland, with a long shared table, designed by Creative Motion Events.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Private Celebrations', '/work/private-celebrations/'], ['Engagements', '/work/private-celebrations/engagements/'], ['Jazmine & Jaleesa’s Engagement Dinner', '/work/private-celebrations/engagements/jazmine-jaleesa-engagement-dinner/']],
    image: img('/images/albums/jazmine-jaleesa-engagement/jazmine-jaleesa-engagement-dinner-maryland-cover.jpg'),
    imageAlt: 'Elegant engagement dinner tablescape designed by Creative Motion Events in Maryland'
  },
  {
    id: 'album-pnc-grand-opening',
    path: '/work/corporate-events/grand-openings/pnc-bank-grand-opening/',
    title: 'PNC Bank Grand Opening in Wheaton | Creative Motion',
    description: 'Grand opening event design for PNC Bank in Wheaton, Maryland, by Creative Motion Events.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/'], ['Grand Openings', '/work/corporate-events/grand-openings/'], ['PNC Bank Grand Opening', '/work/corporate-events/grand-openings/pnc-bank-grand-opening/']],
    image: img('/images/albums/pnc-grand-opening/pnc-bank-grand-opening-maryland-cover.jpg'),
    imageAlt: 'PNC Bank grand opening exterior and entry event design in Wheaton, Maryland by Creative Motion Events'
  },
  {
    id: 'album-able-health-grand-opening',
    path: '/work/corporate-events/grand-openings/able-health-services-grand-opening/',
    title: 'Able Health Services Grand Opening, Hanover | Creative Motion',
    description: 'Ribbon cutting, red carpet, and branded balloon design for the Able Health Services grand opening in Hanover, Maryland. Photography by Danielle Clark.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/'], ['Grand Openings', '/work/corporate-events/grand-openings/'], ['Able Health Services Grand Opening', '/work/corporate-events/grand-openings/able-health-services-grand-opening/']],
    image: img('/images/albums/able-health-grand-opening/able-health-services-grand-opening-hanover-md-cover.jpg'),
    imageAlt: 'Able Health Services grand opening — red carpet, ribbon cutting, and branded balloon columns in Hanover, Maryland by Creative Motion Events'
  },
  {
    id: 'album-pmi-wdc-awards-gala',
    path: '/work/corporate-events/galas/pmi-washington-dc-chapter-awards-gala/',
    title: 'PMI Washington DC Chapter Awards Gala | Creative Motion',
    description: 'Awards gala and conference design for the PMI Washington DC Chapter at JW Marriott Reston Station, October 2026. Photography by Danielle Clark.',
    crumbs: [['Home', '/'], ['Work', '/work/'], ['Corporate Events', '/work/corporate-events/'], ['Galas', '/work/corporate-events/galas/'], ['PMI Washington DC Chapter Awards Gala', '/work/corporate-events/galas/pmi-washington-dc-chapter-awards-gala/']],
    image: img('/images/pmi-wdc-2026/pmi-wdc-awards-gala-jw-marriott-reston-ballroom-n129.jpg'),
    imageAlt: 'Finished ballroom with navy tables, orchid centerpieces and the lit 2026 PMIWDC Conference stage for the PMI Washington DC Chapter Awards Gala, JW Marriott Reston Station, Virginia'
  },
  {
    id: 'journal',
    path: '/journal/',
    title: 'Journal | Event Design Notes for Washington DC, Maryland & Virginia',
    description: 'Notes from Creative Motion Events on appreciation events, event direction, and dinner design for organizations and hosts across the DMV.',
    crumbs: [['Home', '/'], ['Journal', '/journal/']]
  },
  {
    id: 'post-employee-appreciation',
    path: '/journal/employee-appreciation-events-in-the-dmv/',
    title: 'Employee Appreciation Events in the DMV | Creative Motion Events',
    description: 'How I design appreciation nights and team celebrations for employers and associations across DC, Maryland, and Virginia.',
    crumbs: [['Home', '/'], ['Journal', '/journal/'], ['Employee Appreciation Events in the DMV', '/journal/employee-appreciation-events-in-the-dmv/']],
    ogType: 'article',
    image: img('/images/journal/pmi-wdc-conference-stage-screen-wide.jpg'),
    imageAlt: 'The 2026 PMIWDC Conference stage, its wide screen glowing magenta and blue between red-lit curtains, at the PMI Washington DC Chapter Awards Gala',
    posting: {
      headline: 'Employee Appreciation Events in the DMV: Why the Room Is the Thank-You',
      description: 'How a DMV event designer plans employee appreciation events: setting the mood, lighting and wayfinding, one gathering point, and planning early.',
      articleSection: 'Perspective',
      keywords: 'employee appreciation events DMV, appreciation event design Washington DC, corporate team celebration Maryland',
      datePublished: '2026-10-01'
    }
  },
  {
    id: 'post-sponsor-recognition',
    path: '/journal/what-an-event-director-actually-does/',
    title: 'What an Event Director Actually Does | Creative Motion Events',
    description: 'Event design, vendor management, production, and event-day direction for corporate events, galas, and grand openings in Maryland, DC, and Northern Virginia.',
    crumbs: [['Home', '/'], ['Journal', '/journal/'], ['What an Event Director Actually Does', '/journal/what-an-event-director-actually-does/']],
    ogType: 'article',
    image: img('/images/journal/pmi-wdc-event-director-fayola-directing-setup.jpg'),
    imageAlt: 'Fayola Whyte-Manco, Creative Motion Events event director, directing setup in front of the PMIWDC 2026 Annual Conference banner at the PMI Washington DC Chapter Awards Gala',
    posting: {
      headline: 'More Than Décor: What an Event Director Actually Does',
      description: 'What does an event director actually do? Creative Motion Events shares how event design, vendor management, production, setup and event-day direction come together for polished corporate events in Maryland, DC and Northern Virginia.',
      articleSection: 'Corporate',
      keywords: 'event director, corporate event design DMV, event production Maryland DC Northern Virginia',
      datePublished: '2026-10-01'
    }
  },
  {
    id: 'post-hiring-designer',
    path: '/journal/the-long-table/',
    title: 'The Long Table: Dinner Design in the DMV | Creative Motion Events',
    description: 'Why a long shared table changes leadership, donor, client, and celebration dinners, and how Creative Motion Events designs one in the DMV.',
    crumbs: [['Home', '/'], ['Journal', '/journal/'], ['The Long Table', '/journal/the-long-table/']],
    ogType: 'article',
    image: img('/images/albums/jazmine-jaleesa-engagement/jazmine-jaleesa-engagement-dinner-maryland-gallery-186.jpg'),
    imageAlt: 'Guests seated along a long white-draped table under a sheer white tent, with baby\'s breath florals, gold-rimmed place settings and glassware down the center',
    posting: {
      headline: 'The Long Table: How One Shared Table Changes a Dinner',
      description: 'Why a DMV event designer recommends long-table seating for leadership, donor, client and celebration dinners, and how to design one well.',
      articleSection: 'Design notes',
      keywords: 'long table dinner design, leadership dinner seating DMV, donor dinner event design',
      datePublished: '2026-10-01'
    }
  },
  {
    id: 'contact',
    path: '/contact/',
    title: 'Request a Proposal | Creative Motion Events',
    description: 'Request a proposal from Fayola Whyte-Manco. Email hello@creativemotionevents.com or call 301-337-7256.',
    crumbs: [['Home', '/'], ['Contact', '/contact/']]
  }
];

const PATH_BY_ID = {};
routes.forEach(function (r) { PATH_BY_ID[r.id] = r.path; });

const landingRoutes = require('./landing-pages');
let variantIndex = new Map();

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonScript(obj) {
  const json = JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">\n' + json + '\n</script>';
}

function businessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': ORIGIN + '/#business',
    name: 'Creative Motion Events',
    alternateName: 'Creative Motion Events by Fay',
    legalName: 'Creative Motion Events by Fay LLC',
    url: ORIGIN + '/',
    logo: LOGO,
    image: BRAND_IMAGE,
    email: 'hello@creativemotionevents.com',
    telephone: '+1-301-337-7256',
    foundingDate: '2017',
    slogan: 'Events with intention',
    description: 'Creative Motion Events is a corporate event design & production studio led by Fayola Whyte-Manco, Owner & Creative Director. Galas, grand openings, brand activations and conferences across Washington DC, Maryland and Northern Virginia, plus select private celebrations.',
    knowsAbout: [
      'corporate event design & production',
      'on-site vendor direction',
      'grand openings',
      'galas',
      'conferences',
      'brand activations'
    ],
    founder: {
      '@type': 'Person',
      '@id': ORIGIN + '/meet-fayola/#fayola-whyte-manco',
      name: 'Fayola Whyte-Manco',
      jobTitle: 'Owner & Creative Director',
      url: ORIGIN + '/meet-fayola/',
      sameAs: ['https://www.linkedin.com/in/fayola-whyte-manco-184a5bb9']
    },
    areaServed: [
      { '@type': 'City', name: 'Washington', containedInPlace: { '@type': 'AdministrativeArea', name: 'District of Columbia' } },
      { '@type': 'State', name: 'Maryland' },
      { '@type': 'State', name: 'Virginia' },
      { '@type': 'AdministrativeArea', name: 'Northern Virginia' },
      { '@type': 'City', name: 'Hanover', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Wheaton', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Reston', containedInPlace: { '@type': 'State', name: 'Virginia' } },
      { '@type': 'City', name: 'Bethesda', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Rockville', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Frederick', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Tysons', containedInPlace: { '@type': 'State', name: 'Virginia' } },
      { '@type': 'City', name: 'Arlington', containedInPlace: { '@type': 'State', name: 'Virginia' } }
    ],
    sameAs: [
      'https://www.instagram.com/creative_motion_events',
      'https://www.facebook.com/@creativemotionevents',
      'https://www.tiktok.com/@creativemotionevents',
      'https://www.linkedin.com/in/fayola-whyte-manco-184a5bb9',
      'https://share.google/4a3MVaYvzguSOtZ5O'
    ]
  };
}

function breadcrumbSchema(route) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: route.crumbs.map(function (c, i) {
      return {
        '@type': 'ListItem',
        position: i + 1,
        name: c[0],
        item: abs(c[1])
      };
    })
  };
}

function postingSchema(route) {
  const post = route.posting;
  const image = route.image || BRAND_IMAGE;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.headline,
    description: post.description,
    image: image,
    author: {
      '@type': 'Person',
      name: 'Fayola Whyte-Manco',
      jobTitle: 'Owner & Creative Director',
      url: ORIGIN + '/meet-fayola/'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Creative Motion Events by Fay LLC',
      logo: { '@type': 'ImageObject', url: LOGO }
    },
    datePublished: post.datePublished,
    dateModified: LASTMOD,
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(route.path) },
    url: abs(route.path),
    articleSection: post.articleSection,
    keywords: post.keywords
  };
}


function corporateServiceSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': ORIGIN + '/corporate-events/#service',
    name: 'Corporate Event Design & Production',
    serviceType: 'Corporate event design and production',
    url: ORIGIN + '/corporate-events/',
    provider: { '@id': ORIGIN + '/#business' },
    areaServed: [
      { '@type': 'City', name: 'Washington', containedInPlace: { '@type': 'AdministrativeArea', name: 'District of Columbia' } },
      { '@type': 'City', name: 'Bethesda', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Rockville', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Frederick', containedInPlace: { '@type': 'State', name: 'Maryland' } },
      { '@type': 'City', name: 'Reston', containedInPlace: { '@type': 'State', name: 'Virginia' } },
      { '@type': 'City', name: 'Tysons', containedInPlace: { '@type': 'State', name: 'Virginia' } },
      { '@type': 'City', name: 'Arlington', containedInPlace: { '@type': 'State', name: 'Virginia' } }
    ]
  };
}

function seoBlock(route) {
  const image = route.image || BRAND_IMAGE;
  const imageAlt = route.imageAlt || BRAND_ALT;
  const ogType = route.ogType || 'website';
  const lines = [
    '<!-- SEO_HEAD_START -->',
    '<title>' + esc(route.title) + '</title>',
    '<meta name="description" content="' + esc(route.description) + '">',
    '<link rel="canonical" href="' + esc(abs(route.path)) + '">',
    '<meta property="og:site_name" content="Creative Motion Events">',
    '<meta property="og:type" content="' + esc(ogType) + '">',
    '<meta property="og:url" content="' + esc(abs(route.path)) + '">',
    '<meta property="og:title" content="' + esc(route.title) + '">',
    '<meta property="og:description" content="' + esc(route.description) + '">',
    '<meta property="og:image" content="' + esc(image) + '">',
    '<meta property="og:image:alt" content="' + esc(imageAlt) + '">'
  ];
  if (image === BRAND_IMAGE) {
    lines.push('<meta property="og:image:width" content="1200">');
    lines.push('<meta property="og:image:height" content="630">');
  }
  lines.push('<meta name="twitter:card" content="summary_large_image">');
  lines.push('<meta name="twitter:title" content="' + esc(route.title) + '">');
  lines.push('<meta name="twitter:description" content="' + esc(route.description) + '">');
  lines.push('<meta name="twitter:image" content="' + esc(image) + '">');
  lines.push(jsonScript(businessSchema()));
  if (route.crumbs.length) lines.push(jsonScript(breadcrumbSchema(route)));
  if (route.posting) lines.push(jsonScript(postingSchema(route)));
  if (route.corporateService) lines.push(jsonScript(corporateServiceSchema()));
  lines.push('<!-- SEO_HEAD_END -->');
  return lines.join('\n');
}

function rootify(html) {
  html = html.replace(/(^|[^/A-Za-z0-9_])images\//g, '$1/images/');
  html = html.replace(/href="(favicon\.ico|favicon-32\.png|apple-touch-icon\.png|events-by-fay\.html)"/g, 'href="/$1"');
  return html;
}

function rewriteRouteHrefs(html) {
  return html.replace(/href="#([A-Za-z0-9-]+)"/g, function (m, id) {
    if (id === 'home') return 'href="/"';
    if (id === 'inquire') return 'href="/annual-design-partnership/#inquire"';
    if (PATH_BY_ID[id]) return 'href="' + PATH_BY_ID[id] + '"';
    return m;
  });
}

function fillSocialAlts(html) {
  const alt = {
    'instagram.png': 'Creative Motion Events on Instagram',
    'facebook.png': 'Creative Motion Events on Facebook',
    'tiktok.png': 'Creative Motion Events on TikTok',
    'linkedin.png': 'Fayola Whyte-Manco on LinkedIn',
    'google-reviews.png': 'Creative Motion Events on Google'
  };
  return html.replace(/<img src="(\/?images\/social\/([^"]+))" alt=""([^>]*)>/g, function (m, src, file, rest) {
    if (!alt[file]) return m;
    const rooted = src.charAt(0) === '/' ? src : '/' + src;
    return '<img src="' + rooted + '" alt="' + alt[file] + '"' + rest + '>';
  });
}

function tagCtas(html) {
  const swaps = [
    ['<a class="cta" href="/contact/" data-go="contact">', '<a class="cta" href="/contact/" data-go="contact" data-cta="Let\'s Create Together">'],
    ['<a class="btn btn-solid" href="/contact/" data-go="contact">Request Proposal', '<a class="btn btn-solid" href="/contact/" data-go="contact" data-cta="Request Proposal">Request Proposal'],
    ['<a class="btn btn-solid" href="/annual-design-partnership/#inquire" data-scroll="inquire">', '<a class="btn btn-solid" href="/annual-design-partnership/#inquire" data-scroll="inquire" data-cta="Discuss Your Event Calendar">'],
    ['<a class="btn btn-solid" href="/contact/" data-go="contact">Begin an Inquiry</a>', '<a class="btn btn-solid" href="/contact/" data-go="contact" data-cta="Begin an Inquiry">Begin an Inquiry</a>'],
    ['<a class="btn btn-solid" href="/contact/" data-go="contact">Begin an inquiry</a>', '<a class="btn btn-solid" href="/contact/" data-go="contact" data-cta="Begin an inquiry">Begin an inquiry</a>'],
    ['<button class="chip">Book a consultation</button>', '<button class="chip" data-cta="Book a consultation">Book a consultation</button>']
  ];
  swaps.forEach(function (pair) {
    if (!html.includes(pair[1])) html = html.split(pair[0]).join(pair[1]);
  });
  return html;
}

const GA_SNIPPET = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-N3WFGBRV3Y"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'G-N3WFGBRV3Y\');</script>';
const CLARITY_SNIPPET = `<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "yuylgu79i3");
</script>`;
const PAGEVIEW_NOTE = '<!-- Page views: gtag config sends one page_view for the loaded URL. In-site pushState and popstate route changes are recorded once by GA4 enhanced measurement (Page changes based on browser history events), which is on by default. This site does not also send a manual page_view, so those navigations are not double-counted. A short script above the snippet canonicalizes legacy hash URLs before gtag runs, and the router skips history.replaceState when the URL is already canonical, so the initial load is a single page_view. -->';

function canonicalizerScript() {
  return '<script>(function(){\n'
    + 'var ROUTES=' + JSON.stringify(PATH_BY_ID) + ';\n'
    + 'function norm(pathname){\n'
    + 'var p=pathname||"/";\n'
    + 'if(p.endsWith("/index.html"))p=p.slice(0,-11);\n'
    + 'else if(p.endsWith("index.html"))p=p.slice(0,-10);\n'
    + 'if(!p)p="/";\n'
    + 'if(p.charAt(0)!=="/")p="/"+p;\n'
    + 'if(p!=="/"&&p.charAt(p.length-1)!=="/")p+="/";\n'
    + 'return p;\n'
    + '}\n'
    + 'var raw=(location.hash||"").replace(/^#/,"").split(/[?&]/)[0];\n'
    + 'var thanks=false;\n'
    + 'try{thanks=new URLSearchParams(location.search).get("partnership")==="thanks";}catch(e){}\n'
    + 'var id=null;\n'
    + 'if(thanks)id="annual-partnership";\n'
    + 'else if(raw==="home")id="home";\n'
    + 'else if(raw==="inquire"&&norm(location.pathname)!=="/contact/")id="annual-partnership";\n'
    + 'else if(raw&&Object.prototype.hasOwnProperty.call(ROUTES,raw))id=raw;\n'
    + 'var next;\n'
    + 'if(id){\n'
    + 'var search=thanks?"?partnership=thanks":"";\n'
    + 'var hash=!thanks&&raw==="inquire"?"#inquire":"";\n'
    + 'next=ROUTES[id]+search+hash;\n'
    + '}else{\n'
    + 'var cleaned=norm(location.pathname);\n'
    + 'var known=false;\n'
    + 'for(var k in ROUTES){if(ROUTES[k]===cleaned)known=true;}\n'
    + 'if(!known)return;\n'
    + 'next=cleaned+location.search+location.hash;\n'
    + '}\n'
    + 'if((location.pathname+location.search+location.hash)!==next){\n'
    + 'var destPath=norm((next.split("#")[0]||"").split("?")[0]);\n'
    + 'if(norm(location.pathname)!==destPath){\n'
    + 'window.__CME_REDIRECTING=true;\n'
    + 'window["ga-disable-G-N3WFGBRV3Y"]=true;\n'
    + 'location.replace(next);\n'
    + 'return;\n'
    + '}\n'
    + 'try{history.replaceState({page:id||""},"",next);}catch(e){}\n'
    + '}\n'
    + '})();</script>';
}

function analyticsBlock(opts) {
  const lines = ['<!-- ANALYTICS_PLACEHOLDER -->'];
  if (opts && opts.canonicalizer) lines.push(canonicalizerScript());
  lines.push(GA_SNIPPET);
  lines.push(PAGEVIEW_NOTE);
  lines.push(CLARITY_SNIPPET);
  lines.push('<!-- ANALYTICS_END -->');
  return lines.join('\n');
}

function installAnalytics(html, opts) {
  const block = analyticsBlock(opts);
  if (html.includes('<!-- ANALYTICS_PLACEHOLDER -->') && html.includes('<!-- ANALYTICS_END -->')) {
    return html.replace(/<!-- ANALYTICS_PLACEHOLDER -->[\s\S]*?<!-- ANALYTICS_END -->/, block);
  }
  if (html.includes('<!-- ANALYTICS_PLACEHOLDER -->')) {
    return html.replace('<!-- ANALYTICS_PLACEHOLDER -->', block);
  }
  return html.replace('</head>', block + '\n</head>');
}

function installRouter(html) {
  const router = fs.readFileSync(path.join(__dirname, 'router.template.js'), 'utf8')
    .replace('__ROUTES_JSON__', JSON.stringify(PATH_BY_ID))
    .replace('__META_JSON__', JSON.stringify(Object.fromEntries(routes.map(function (r) {
      return [r.id, {
        title: r.title,
        description: r.description,
        ogType: r.ogType || 'website',
        image: r.image || BRAND_IMAGE,
        imageAlt: r.imageAlt || BRAND_ALT
      }];
    }))));
  const wrapped = '/* ROUTER_START */\n' + router.trim() + '\n/* ROUTER_END */';
  const start = '/* ROUTER_START */';
  const end = '/* ROUTER_END */';
  if (html.includes(start) && html.includes(end)) {
    return html.replace(new RegExp(start.replace(/[/*]/g, '\\$&') + '[\\s\\S]*?' + end.replace(/[/*]/g, '\\$&')), wrapped);
  }
  const oldStart = '/* hash router: one small landing page, menu opens each page */';
  const oldEnd = '/* work browse:';
  const i = html.indexOf(oldStart);
  const j = html.indexOf(oldEnd);
  if (i < 0 || j < 0 || j < i) throw new Error('Could not find the hash router block to replace');
  return html.slice(0, i) + wrapped + '\n\n' + html.slice(j);
}

function applyShared(html) {
  html = rootify(html);
  html = rewriteRouteHrefs(html);
  html = fillSocialAlts(html);
  if (!html.includes('h1.hline{')) {
    html = html.replace(
      '.hline{display:flex;align-items:center;gap:2.2cqw;font-size:max(1.9cqw,.6rem);letter-spacing:.36em;text-transform:uppercase;color:var(--gold);font-weight:400}',
      '.hline{display:flex;align-items:center;gap:2.2cqw;font-size:max(1.9cqw,.6rem);letter-spacing:.36em;text-transform:uppercase;color:var(--gold);font-weight:400}\nh1.hline{font-family:var(--sans);font-weight:400;line-height:inherit;margin:0}'
    );
  }
  html = html.replace(
    'value="https://creativemotionevents.com/?partnership=thanks#annual-partnership"',
    'value="https://creativemotionevents.com/annual-design-partnership/?partnership=thanks"'
  );
  html = html.replace('<img id="lbImg" alt="">', '<img id="lbImg" alt="Enlarged event photo">');
  html = html.replace(
    "function open(src){if(!src)return;img.src=src;lb.classList.add('open');document.body.style.overflow='hidden'}",
    "function open(src, alt){if(!src)return;img.src=src;img.alt=alt||'Enlarged event photo';lb.classList.add('open');document.body.style.overflow='hidden'}"
  );
  html = html.replace(
    "if(t){e.preventDefault();open(t.dataset.src||(t.querySelector('img')&&t.querySelector('img').src))}",
    "if(t){e.preventDefault();const im=t.querySelector('img');open(t.dataset.src||(im&&im.src),(im&&im.alt)||t.getAttribute('aria-label')||'Enlarged event photo')}"
  );
  html = tagCtas(html);
  html = installAnalytics(html, { canonicalizer: true });
  const headEnd = html.indexOf('</head>');
  if (headEnd < 0) throw new Error('missing </head>');
  const body = html.slice(headEnd).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '');
  html = html.slice(0, headEnd) + body;
  html = installRouter(html);
  return html;
}

function setHead(html, route) {
  const block = seoBlock(route);
  if (html.includes('<!-- SEO_HEAD_START -->')) {
    return html.replace(/<!-- SEO_HEAD_START -->[\s\S]*?<!-- SEO_HEAD_END -->/, block);
  }
  return html.replace(/<title>[\s\S]*?<meta name="twitter:image" content="[^"]*">/, block);
}

function setActive(html, id) {
  return html.replace(/<section class="page(?: on)?([^"]*)" id="(p-[^"]+)"/g, function (m, rest, pid) {
    const on = pid === 'p-' + id ? ' on' : '';
    return '<section class="page' + on + rest + '" id="' + pid + '"';
  });
}

function render(template, route) {
  let html = setHead(template, route);
  html = setActive(html, route.id);
  const ons = html.match(/<section class="page on/g) || [];
  if (ons.length !== 1) throw new Error(route.id + ' has ' + ons.length + ' active sections');
  if (!html.includes('id="p-' + route.id + '"')) throw new Error('missing section ' + route.id);
  html = pruneToPage(html, route.id);
  html = rewritePageHtml(html, variantIndex);
  return html;
}

function visibleWords(html) {
  const text = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').filter(Boolean).length : 0;
}

function pageMetaMap(list) {
  return Object.fromEntries(list.map(function (r) {
    return [r.id, {
      title: r.title,
      description: r.description,
      ogType: r.ogType || 'website',
      image: r.image || BRAND_IMAGE,
      imageAlt: r.imageAlt || BRAND_ALT
    }];
  }));
}

function extendRouter(html, extra) {
  const all = routes.concat(extra);
  const pathById = {};
  all.forEach(function (r) { pathById[r.id] = r.path; });
  const start = html.indexOf('const ROUTES=');
  const end = html.indexOf(';\nconst ORIGIN=', start);
  if (start < 0 || end < 0) throw new Error('could not extend the landing-page router');
  const block = 'const ROUTES=' + JSON.stringify(pathById) + ';\nconst PAGE_META=' + JSON.stringify(pageMetaMap(all));
  return html.slice(0, start) + block + html.slice(end);
}

const CONTACT_ANCHOR = '<!-- ============ CONTACT ============ -->';

function injectLandingSections(html) {
  if (!html.includes(CONTACT_ANCHOR)) throw new Error('contact anchor missing');
  const block = landingRoutes.map(function (r) { return r.section; }).join('\n\n');
  return html.replace(CONTACT_ANCHOR, block + '\n\n' + CONTACT_ANCHOR);
}

function renderLanding(template, route) {
  let html = injectLandingSections(template);
  html = extendRouter(html, landingRoutes);
  html = setHead(html, route);
  html = setActive(html, route.id);
  const ons = html.match(/<section class="page on/g) || [];
  if (ons.length !== 1) throw new Error(route.id + ' has ' + ons.length + ' active sections');
  if (!html.includes('id="p-' + route.id + '"')) throw new Error('missing section ' + route.id);
  if (/noindex/i.test(html.slice(0, html.indexOf('</head>')))) throw new Error(route.id + ' is noindex');
  html = pruneToPage(html, route.id);
  html = rewritePageHtml(html, variantIndex);
  return html;
}

function writeSitemap() {
  const entries = routes.map(function (r) {
    return { path: r.path, lastmod: LASTMOD };
  }).concat(landingRoutes.map(function (r) {
    return { path: r.path, lastmod: r.lastmod || LASTMOD };
  })).concat([{ path: '/events-by-fay.html', lastmod: LASTMOD }]);
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
  ];
  entries.forEach(function (entry) {
    body.push('  <url>');
    body.push('    <loc>' + abs(entry.path) + '</loc>');
    body.push('    <lastmod>' + entry.lastmod + '</lastmod>');
    body.push('  </url>');
  });
  body.push('</urlset>');
  body.push('');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), body.join('\n'));
}

function updateEventsByFay() {
  const file = path.join(ROOT, 'events-by-fay.html');
  let html = fs.readFileSync(file, 'utf8');
  const map = [
    ['href="index.html#home"', 'href="/"'],
    ['href="index.html#who"', 'href="/meet-fayola/"'],
    ['href="index.html#what"', 'href="/what-we-do/"'],
    ['href="index.html#corporate"', 'href="/corporate-events/"'],
    ['href="index.html#annual-partnership"', 'href="/annual-design-partnership/"'],
    ['href="index.html#private"', 'href="/private-celebrations/"'],
    ['href="index.html#work"', 'href="/work/"'],
    ['href="index.html#journal"', 'href="/journal/"'],
    ['href="index.html#contact"', 'href="/contact/"'],
    ['href="events-by-fay.html"', 'href="/events-by-fay.html"']
  ];
  map.forEach(function (pair) { html = html.split(pair[0]).join(pair[1]); });
  html = rootify(html);
  html = fillSocialAlts(html);
  const oldNext = `  var FALLBACK_NEXT='https://creativemotionevents.com/events-by-fay.html?waitlist=thanks';
  function waitlistNextUrl(){
    try{
      if(location.protocol==='http:'||location.protocol==='https:'){
        return location.origin+location.pathname+'?waitlist=thanks';
      }
    }catch(err){}
    return FALLBACK_NEXT;
  }`;
  const newNext = `  var CANONICAL_NEXT='https://creativemotionevents.com/events-by-fay.html?waitlist=thanks';
  function waitlistNextUrl(){
    try{
      var host=location.hostname;
      if(host==='creativemotionevents.com'||host==='www.creativemotionevents.com'){
        return location.origin+location.pathname+'?waitlist=thanks';
      }
    }catch(err){}
    return CANONICAL_NEXT;
  }`;
  if (html.includes(oldNext)) html = html.replace(oldNext, newNext);
  else if (!html.includes('CANONICAL_NEXT')) throw new Error('events-by-fay waitlist next helper not found');
  html = html.replace(/<button([^>]*data-open-waitlist[^>]*)>([\s\S]*?)<\/button>/g, function (m, attrs, inner) {
    if (/data-cta=/.test(attrs)) return m;
    const label = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/\s*[→↗]\s*$/, '').trim();
    return '<button' + attrs + ' data-cta="' + label.replace(/"/g, '&quot;') + '">' + inner + '</button>';
  });
  html = installAnalytics(html, { canonicalizer: false });
  html = polishEventsByFay(html);
  html = rewritePageHtml(html, variantIndex);
  html = lazyNonHeroImages(html);
  if (!html.includes('events-by-fay-waitlist')) {
    html = html.replace('</body>', `<script>
document.addEventListener('click',function(e){
  if(typeof gtag!=='function') return;
  var el=e.target.closest('a,button');
  if(!el) return;
  var href=el.getAttribute('href')||'';
  if(el.tagName==='A' && (href.indexOf('mailto:')===0 || href.indexOf('tel:')===0)){
    gtag('event','contact_click',{method:href.indexOf('mailto:')===0?'email':'phone',link_url:href});
  }
  var label=el.getAttribute('data-cta');
  if(label) gtag('event','cta_click',{label:label});
});
document.addEventListener('submit',function(e){
  if(typeof gtag!=='function') return;
  if(!e.target || e.target.id!=='waitlist-form') return;
  gtag('event','generate_lead',{form_name:'events-by-fay-waitlist'});
});
</script>
</body>`);
  }
  fs.writeFileSync(file, html);
}

// Legacy URLs from the previous site that still appear in search results.
// Each gets a small redirect stub at <from>/index.html. GitHub Pages
// answers /about with a 301 to /about/, so one file covers both forms.
// These are deliberately not routes: they stay out of sitemap.xml and the router.
const LEGACY_REDIRECTS = [
  { from: '/about/', to: '/meet-fayola/', label: 'Meet Fayola' },
  { from: '/services/', to: '/what-we-do/', label: 'What We Do' },
  { from: '/reviews/', to: '/work/#testimonials', label: 'Our Work' },
  { from: '/events-by-fay/', to: '/events-by-fay.html', label: 'Events by Fay' }
];

function redirectStub(r) {
  const url = abs(r.to);
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    '<title>' + esc(r.label) + ' | Creative Motion Events</title>',
    '<meta http-equiv="refresh" content="0; url=' + esc(r.to) + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    '<script>location.replace(' + JSON.stringify(r.to) + ' + location.search + location.hash);</script>',
    '<style>',
    'html,body{margin:0;min-height:100%;background:#161311;color:#FAF9F6}',
    'body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box;font-family:"Jost",-apple-system,"Segoe UI",sans-serif;font-weight:300;text-align:center;line-height:1.7}',
    'a{color:#A38443;text-decoration:none;border-bottom:1px solid #A38443;letter-spacing:.12em;text-transform:uppercase;font-size:.8rem}',
    'a:hover,a:focus-visible{color:#FAF9F6;border-color:#FAF9F6}',
    '</style>',
    '</head>',
    '<body>',
    '<p>This page has moved. <a href="' + esc(r.to) + '">Continue to ' + esc(r.label) + '</a></p>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function writeRedirectStubs() {
  LEGACY_REDIRECTS.forEach(function (r) {
    const targetPath = r.to.split('#')[0];
    if (routes.some(function (route) { return route.path === r.from; })) throw new Error('legacy redirect collides with route ' + r.from);
    const knownTarget = targetPath === '/events-by-fay.html' || routes.some(function (route) { return route.path === targetPath; });
    if (!knownTarget) throw new Error('legacy redirect target is not a route ' + r.to);
    const dir = path.join(ROOT, r.from);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), redirectStub(r));
  });
}

const TEMPLATE_NOINDEX = '<meta name="robots" content="noindex, nofollow">';

function ensureTemplateNoindex(html) {
  if (html.includes(TEMPLATE_NOINDEX)) return html;
  return html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + TEMPLATE_NOINDEX);
}

function stripTemplateNoindex(html) {
  return html.replace(/<meta name="robots" content="noindex, nofollow">\n?/g, '');
}

const NOINDEX_ALLOWLIST = [
  path.join(ROOT, '404.html'),
  path.join(__dirname, 'site.html')
];

function assertPublishedPagesAreIndexable() {
  const template = fs.readFileSync(path.join(__dirname, 'site.html'), 'utf8');
  if (!template.includes(TEMPLATE_NOINDEX)) throw new Error('scripts/site.html is missing noindex');
  const notFound = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  if (!notFound.includes('<meta name="robots" content="noindex">')) throw new Error('404.html is missing noindex');
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git' || name === 'images') continue;
      const abs = path.join(dir, name);
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.endsWith('.html')) continue;
      if (NOINDEX_ALLOWLIST.indexOf(abs) !== -1) continue;
      const html = fs.readFileSync(abs, 'utf8');
      if (/noindex/i.test(html)) {
        if (/http-equiv="refresh"/i.test(html)) continue;
        throw new Error('generated page contains noindex: ' + path.relative(ROOT, abs));
      }
    }
  }
  walk(ROOT);
}

function readTemplate() {
  const source = path.join(__dirname, 'site.html');
  if (fs.existsSync(source)) {
    const html = fs.readFileSync(source, 'utf8');
    if (!html.includes('id="p-home"') || !html.includes('id="p-album-pnc-grand-opening"') || !html.includes('id="p-contact"')) {
      throw new Error('scripts/site.html is missing page sections; refusing to build from the pruned homepage');
    }
    return html;
  }
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!home.includes('id="p-album-pnc-grand-opening"')) {
    throw new Error('index.html has no album sections and scripts/site.html is missing');
  }
  return home;
}

function pageStats(html) {
  const imgs = html.match(/<img\b/gi) || [];
  const srcset = html.match(/\bsrcset="/gi) || [];
  return { bytes: Buffer.byteLength(html), imgs: imgs.length, srcset: srcset.length };
}

async function main() {
  await require('./build-images').build();
  variantIndex = buildVariantIndex(ROOT);
  if (!variantIndex.size) throw new Error('no image variants were indexed');
  const seen = {};
  routes.forEach(function (r) {
    if (seen[r.path]) throw new Error('duplicate path ' + r.path);
    seen[r.path] = true;
    if (r.title.length > 70) console.warn('long title (' + r.title.length + '): ' + r.path);
    if (r.description.length > 170) console.warn('long description (' + r.description.length + '): ' + r.path);
  });
  let template = readTemplate();
  template = applyShared(template);
  template = setActive(template, '__none__');
  template = ensureTemplateNoindex(template);
  fs.writeFileSync(path.join(__dirname, 'site.html'), template);
  const shell = stripTemplateNoindex(template);
  if (/noindex/i.test(shell.slice(0, shell.indexOf('</head>')))) throw new Error('page shell still contains noindex');
  const report = [];
  routes.forEach(function (route) {
    if (!shell.includes('id="p-' + route.id + '"')) throw new Error('template missing #p-' + route.id);
    const html = render(shell, route);
    const stats = pageStats(html);
    report.push({ path: route.path, bytes: stats.bytes, imgs: stats.imgs, srcset: stats.srcset });
    if (route.path === '/') {
      fs.writeFileSync(path.join(ROOT, 'index.html'), html);
      return;
    }
    const dir = path.join(ROOT, route.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  });
  const landingSeen = {};
  landingRoutes.forEach(function (route) {
    if (landingSeen[route.path] || PATH_BY_ID[route.id] || routes.some(function (r) { return r.path === route.path; })) {
      throw new Error('landing route collides with an existing route ' + route.path);
    }
    landingSeen[route.path] = true;
    if (route.title.length >= 60) throw new Error('landing title must be under 60 characters (' + route.title.length + '): ' + route.path);
    if (route.description.length > 170) throw new Error('landing description too long (' + route.description.length + '): ' + route.path);
    const words = visibleWords(route.section);
    if (words < 500 || words > 800) throw new Error(route.path + ' has ' + words + ' words (need 500-800)');
    if (!route.section.includes('<h1>') || !route.section.includes('<h2>')) throw new Error(route.path + ' needs an H1 and H2s');
    if ((route.section.match(/<h1>/g) || []).length !== 1) throw new Error(route.path + ' must have one H1');
    if (/\$\d/.test(route.section)) throw new Error(route.path + ' includes a price');
    if (shell.includes('id="p-' + route.id + '"')) throw new Error('landing section leaked into the shared shell: ' + route.id);
    const html = renderLanding(shell, route);
    const stats = pageStats(html);
    report.push({ path: route.path, bytes: stats.bytes, imgs: stats.imgs, srcset: stats.srcset });
    if (html.includes('rel="nofollow"') && route.section.includes('nofollow')) throw new Error(route.path + ' nofollows its own links');
    const dir = path.join(ROOT, route.path);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
  });
  writeSitemap();
  writeRedirectStubs();
  updateEventsByFay();
  const fayPath = path.join(ROOT, 'events-by-fay.html');
  const fayHtml = fs.readFileSync(fayPath, 'utf8');
  const fayStats = pageStats(fayHtml);
  report.push({ path: '/events-by-fay.html', bytes: fayStats.bytes, imgs: fayStats.imgs, srcset: fayStats.srcset });
  if (!fayHtml.includes('.hero-image{max-width:100%')) throw new Error('events-by-fay hero max-width missing');
  const notFoundPath = path.join(ROOT, '404.html');
  fs.writeFileSync(notFoundPath, installAnalytics(fs.readFileSync(notFoundPath, 'utf8'), { canonicalizer: false }));
  assertPublishedPagesAreIndexable();
  console.log('Wrote ' + routes.length + ' routes and ' + landingRoutes.length + ' landing pages');
  console.log('path\tbytes\timgs\tsrcset');
  report.forEach(function (row) {
    console.log(row.path + '\t' + row.bytes + '\t' + row.imgs + '\t' + row.srcset);
  });
  routes.forEach(function (r) { console.log(r.path + '\t' + r.title); });
  landingRoutes.forEach(function (r) {
    console.log(r.path + '\t' + r.title + '\t' + visibleWords(r.section) + ' words');
  });
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
