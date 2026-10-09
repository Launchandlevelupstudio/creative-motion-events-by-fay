/* path router: real URLs, instant in-site navigation, old hashes redirect */
if('scrollRestoration' in window.history){window.history.scrollRestoration='manual'}
const ROUTES=__ROUTES_JSON__;
const PAGE_META=__META_JSON__;
const ORIGIN='https://creativemotionevents.com';
const pages=Object.keys(ROUTES);
const PATH_TO_PAGE={};
pages.forEach(function(id){PATH_TO_PAGE[ROUTES[id]]=id});
function scrollToTop(){
  window.scrollTo(0,0);
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
  const hdr=document.querySelector('header');
  if(hdr){try{hdr.scrollIntoView({block:'start',behavior:'auto'})}catch(e){}}
}
const siteNav=document.getElementById('siteNav'),menuToggle=document.getElementById('menuToggle');
function closeMenu(){
  if(!siteNav)return;
  siteNav.classList.remove('open');
  if(menuToggle)menuToggle.setAttribute('aria-expanded','false');
}
function toggleMenu(){
  if(!siteNav)return;
  const open=siteNav.classList.toggle('open');
  if(menuToggle)menuToggle.setAttribute('aria-expanded',open?'true':'false');
}
if(menuToggle){menuToggle.addEventListener('click',function(e){e.stopPropagation();toggleMenu()})}
function normalizePath(pathname){
  let p=pathname||'/';
  try{p=decodeURI(p)}catch(e){}
  if(p.endsWith('/index.html')) p=p.slice(0,-'/index.html'.length);
  else if(p.endsWith('index.html')) p=p.slice(0,-'index.html'.length);
  if(!p||p==='/') return '/';
  if(p.charAt(0)!=='/') p='/'+p;
  if(p.charAt(p.length-1)!=='/') p+='/';
  return p;
}
function hashPage(){
  const raw=(location.hash||'').replace(/^#/,'').split(/[?&]/)[0];
  if(!raw) return null;
  if(raw==='home') return 'home';
  if(raw==='inquire') return 'annual-partnership';
  if(pages.indexOf(raw)!==-1) return raw;
  return null;
}
function setMeta(attr,key,value){
  if(!value) return;
  const el=document.querySelector('meta['+attr+'="'+key+'"]');
  if(el) el.setAttribute('content',value);
}
function show(p){
  if(p==='inquire') p='annual-partnership';
  if(pages.indexOf(p)===-1) p='home';
  pages.forEach(function(x){
    const el=document.getElementById('p-'+x);
    if(el) el.classList.toggle('on',x===p);
  });
  document.querySelectorAll('nav a').forEach(function(a){
    const key=a.dataset.go;
    const on=!!key && (key===p || ((p==='work'||p.indexOf('work-')===0||p.indexOf('album-')===0)&&key==='work'));
    a.classList.toggle('on',on);
  });
  closeMenu();
  const meta=PAGE_META[p];
  if(meta){
    document.title=meta.title;
    setMeta('name','description',meta.description);
    setMeta('property','og:title',meta.title);
    setMeta('property','og:description',meta.description);
    setMeta('property','og:url',ORIGIN+ROUTES[p]);
    setMeta('property','og:type',meta.ogType||'website');
    if(meta.image){
      setMeta('property','og:image',meta.image);
      setMeta('name','twitter:image',meta.image);
    }
    if(meta.imageAlt) setMeta('property','og:image:alt',meta.imageAlt);
    setMeta('name','twitter:title',meta.title);
    setMeta('name','twitter:description',meta.description);
    const c=document.querySelector('link[rel="canonical"]');
    if(c) c.setAttribute('href',ORIGIN+ROUTES[p]);
  }
  return p;
}
function go(p, opts){
  opts=opts||{};
  p=show(p);
  let url=ROUTES[p];
  if(opts.keepThanks) url+='?partnership=thanks';
  if(opts.hash) url+=opts.hash;
  try{
    const here=location.pathname+location.search+location.hash;
    if(here!==url){
      const same=normalizePath(location.pathname)===ROUTES[p] && !location.hash && !opts.keepThanks && !opts.hash;
      if(opts.replace||same) history.replaceState({page:p},'',url);
      else history.pushState({page:p},'',url);
    }
  }catch(e){}
  if(!opts.noscroll){
    scrollToTop();
    requestAnimationFrame(scrollToTop);
  }
}
document.addEventListener('click',function(e){
  const a=e.target.closest('[data-go]');
  if(!a) return;
  if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
  e.preventDefault();
  go(a.dataset.go);
});
window.addEventListener('popstate',function(){
  const p=hashPage()||PATH_TO_PAGE[normalizePath(location.pathname)]||'home';
  show(p);
  if(new URLSearchParams(location.search).get('partnership')==='thanks'){
    const inquire=document.getElementById('inquire');
    if(inquire){
      inquire.classList.add('is-thanks');
      inquire.scrollIntoView({block:'start',behavior:'auto'});
    }
    return;
  }
  scrollToTop();
});
window.addEventListener('hashchange',function(){
  const p=hashPage();
  if(!p) return;
  const raw=(location.hash||'').replace(/^#/,'').split(/[?&]/)[0];
  go(p,{replace:true,hash:raw==='inquire'?'#inquire':''});
});
const partnershipThanks=new URLSearchParams(location.search).get('partnership')==='thanks';
const inquireHash=(location.hash||'').replace(/^#/,'').split(/[?&]/)[0]==='inquire';
let start=hashPage()||PATH_TO_PAGE[normalizePath(location.pathname)]||'home';
if(partnershipThanks) start='annual-partnership';
go(start,{replace:true,hash:inquireHash?'#inquire':'',keepThanks:partnershipThanks,noscroll:partnershipThanks});
if(partnershipThanks){
  const inquire=document.getElementById('inquire');
  if(inquire) inquire.classList.add('is-thanks');
  setTimeout(function(){if(inquire) inquire.scrollIntoView({block:'start'})},80);
}
document.addEventListener('click',function(e){
  const s=e.target.closest('[data-scroll]');
  if(!s) return;
  const el=document.getElementById(s.getAttribute('data-scroll'));
  if(!el) return;
  e.preventDefault();
  el.scrollIntoView({behavior:'smooth',block:'start'});
});
(function(){
  const form=document.getElementById('partnershipInquiry');
  if(!form) return;
  const next=document.getElementById('partnership-next');
  const reply=document.getElementById('partnership-replyto');
  const email=document.getElementById('partnership-email');
  const CANONICAL='https://creativemotionevents.com/annual-design-partnership/?partnership=thanks';
  function nextUrl(){
    try{
      const host=location.hostname;
      if(host==='creativemotionevents.com'||host==='www.creativemotionevents.com'){
        return location.origin+'/annual-design-partnership/?partnership=thanks';
      }
    }catch(err){}
    return CANONICAL;
  }
  if(next) next.value=nextUrl();
  form.addEventListener('submit',function(){
    if(next) next.value=nextUrl();
    if(reply&&email) reply.value=email.value;
    const btn=form.querySelector('button[type="submit"]');
    if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');}
  });
})();
function settleScroll(){
  if(partnershipThanks){
    const inquire=document.getElementById('inquire');
    if(inquire) inquire.scrollIntoView({block:'start',behavior:'auto'});
    return;
  }
  scrollToTop();
}
window.addEventListener('load',settleScroll);
document.addEventListener('DOMContentLoaded',settleScroll);
/* GA events. Page views are intentionally not sent here.
   The head snippet's gtag('config') records the initial page_view.
   Later pushState/popstate changes are recorded once by GA4 enhanced
   measurement (history changes). A manual page_view would double-count. */
document.addEventListener('click',function(e){
  if(typeof gtag!=='function') return;
  const el=e.target.closest('a,button');
  if(!el) return;
  const href=el.getAttribute('href')||'';
  if(el.tagName==='A' && (href.indexOf('mailto:')===0 || href.indexOf('tel:')===0)){
    gtag('event','contact_click',{method:href.indexOf('mailto:')===0?'email':'phone',link_url:href});
  }
  const label=el.getAttribute('data-cta');
  if(label) gtag('event','cta_click',{label:label});
});
document.addEventListener('submit',function(e){
  if(typeof gtag!=='function') return;
  const form=e.target;
  if(!form || form.id!=='partnershipInquiry') return;
  gtag('event','generate_lead',{form_name:'annual-design-partnership'});
});
