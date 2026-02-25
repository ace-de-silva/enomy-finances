/* visibility-debug.js
   Temporary debugging helper — load the script by adding ?debug=1 to the URL.
   It scans common interactive elements and forces higher-contrast styles where
   the computed foreground/background contrast is low, making barely-visible
   buttons/text visible for inspection. Remove this file once debugging is done.
*/
(function(){
  function parseRGB(str){
    const m = str.match(/rgba?\(([^)]+)\)/);
    if(!m) return [255,255,255,1];
    const parts = m[1].split(',').map(s=>s.trim()).map(Number);
    return [parts[0]||0, parts[1]||0, parts[2]||0, parts[3]===undefined?1:parts[3]];
  }
  function lum([r,g,b]){
    const srgb = [r,g,b].map(v=>{ v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
  }
  function contrast(c1,c2){
    const l1 = lum(c1); const l2 = lum(c2); const hi = Math.max(l1,l2), lo = Math.min(l1,l2);
    return (hi+0.05)/(lo+0.05);
  }
  function findEffectiveBg(el){
    let cur = el;
    while(cur && cur !== document.documentElement){
      const bg = getComputedStyle(cur).backgroundColor;
      if(bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      cur = cur.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || 'rgb(255,255,255)';
  }
  function ensureVisible(el){
    try{
      const cs = getComputedStyle(el);
      const fg = parseRGB(cs.color || 'rgb(0,0,0)');
      const bg = parseRGB(findEffectiveBg(el));
      if(contrast(fg,bg) < 3){
        el.classList.add('dbg-visible');
        // apply gentle, reversible inline overrides for inspection
        el.style.setProperty('background-color','#ffffff','important');
        el.style.setProperty('color','#000000','important');
        el.style.setProperty('opacity','1','important');
        el.style.setProperty('border-color','#000000','important');
        el.style.setProperty('outline','3px solid rgba(255,0,0,0.5)','important');
      }
    }catch(e){ /* ignore */ }
  }
  function run(){
    const selector = 'button, .btn, a.btn, input[type=button], input[type=submit], .link-btn, .service-card__title, .service-card__desc, .hero__subtitle, .navbar__link, .footer__links a';
    const els = Array.from(document.querySelectorAll(selector));
    els.forEach(ensureVisible);
    console.log('visibility-debug: checked', els.length, 'elements');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
