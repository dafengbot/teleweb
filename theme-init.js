// theme-init.js - minimal theme init + toggle behavior
(function(){
  const KEY = 'site_theme_v2'; // 'dark' | 'light'
  const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  let saved = null;
  try{ saved = localStorage.getItem(KEY); }catch(_){}
  const wantDark = saved ? saved === 'dark' : prefers;
  document.documentElement.classList.toggle('dark', wantDark);

  function ready(fn){ if(document.readyState!='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(()=>{
    const btn = document.getElementById('themeToggle');
    if(!btn) return;
    const reflect = ()=>{ const dark = document.documentElement.classList.contains('dark'); btn.textContent = dark ? '☀️' : '🌙'; btn.setAttribute('aria-pressed', String(dark)); };
    reflect();
    btn.addEventListener('click', ()=>{
      const next = !document.documentElement.classList.contains('dark');
      document.documentElement.classList.toggle('dark', next);
      try{ localStorage.setItem(KEY, next ? 'dark' : 'light'); }catch(_){}
      reflect();
    });
  });
})();