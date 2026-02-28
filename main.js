// =================== 全局：环境检测 & 复制工具（适配 Telegram + Tonutils Proxy） ===================
const UA = navigator.userAgent || '';
const IS_TG = /Telegram/i.test(UA) || !!window.TelegramWebviewProxy || !!(window.Telegram && window.Telegram.WebApp);
const IS_TON_PROXY = /tonutils|magic\.org/i.test(location.hostname);
const IS_ANDROID = /Android/i.test(UA);

// 全局提示（避免作用域问题）
function showToast(msg = '已复制到剪贴板', ms = 1400) {
  const el = document.getElementById('copyToast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// 兼容旧环境的复制实现（execCommand）
function legacyExecCopy(text) {
  return new Promise((resolve) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '8px';
      ta.style.left = '8px';
      ta.style.opacity = '0';
      ta.style.zIndex = 9999;
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      resolve(!!ok);
    } catch (e) {
      resolve(false);
    }
  });
}

// 最终兜底：弹出“长按复制”的覆盖层
function longPressCopyOverlay(text) {
  const mask = document.createElement('div');
  mask.style.cssText =
    'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
  const card = document.createElement('div');
  card.style.cssText =
    'max-width:520px;width:92%;background:#111;color:#fff;border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,.12)';

  card.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px">复制内容（长按选择）</div>
    <div id="copySelect" contenteditable="true"
         style="user-select:text;-webkit-user-select:text;background:#0b0b0b;border:1px solid rgba(255,255,255,.12);
                padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all">${text}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button id="copyBtnLegacy" style="padding:8px 12px;border-radius:10px;border:1px solid #d4af37;background:transparent;color:#d4af37">尝试复制</button>
      <button id="copyClose" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff">关闭</button>
    </div>`;

  mask.appendChild(card);
  document.body.appendChild(mask);

  const selBox = card.querySelector('#copySelect');
  const tryBtn = card.querySelector('#copyBtnLegacy');
  const closeBtn = card.querySelector('#copyClose');

  // 自动全选，便于长按
  const range = document.createRange();
  range.selectNodeContents(selBox);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  tryBtn.addEventListener('click', async () => {
    const ok = await legacyExecCopy(selBox.innerText || text);
    showToast(ok ? '已复制：' + text : '复制失败');
    if (ok) document.body.removeChild(mask);
  });
  closeBtn.addEventListener('click', () => document.body.removeChild(mask));
}

// 最强兼容 copy：Clipboard API → execCommand(copy 事件) → 可见 input → 覆盖层
async function copyText(txt) {
  const toast = (ok, msgOk = `已复制：${txt}`, msgFail = '复制失败') =>
    showToast(ok ? msgOk : msgFail);

  // Telegram + Tonutils Proxy 下大概率被拒，直接跳过 Clipboard API
  const avoidClipboardAPI = IS_TG && IS_TON_PROXY;

  // 1) 标准 Clipboard API
  if (!avoidClipboardAPI && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(txt);
      toast(true);
      return;
    } catch (e) {
      // 继续降级
    }
  }

  // 2) execCommand('copy') + 监听 copy 事件注入数据
  try {
    const ok = await new Promise((resolve) => {
      let handled = false;
      const handler = (e) => {
        handled = true;
        try {
          e.clipboardData.setData('text/plain', txt);
          e.preventDefault();
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      };
      document.addEventListener('copy', handler, true);
      const success = document.execCommand('copy'); // 触发 copy 事件
      document.removeEventListener('copy', handler, true);
      if (!handled) resolve(!!success);
    });
    if (ok) {
      toast(true);
      return;
    }
  } catch (e) {
    // 继续降级
  }

  // 3) 可见 input 选中复制（部分 WebView 要求元素可见且聚焦）
  try {
    const input = document.createElement('input');
    input.value = txt;
    input.setAttribute('readonly', '');
    Object.assign(input.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      width: '1px',
      height: '1px',
      opacity: '0',
      zIndex: 9999
    });
    document.body.appendChild(input);
    input.focus({ preventScroll: true });
    input.select();
    input.setSelectionRange(0, input.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    if (ok) {
      toast(true);
      return;
    }
  } catch (e) {
    // 继续降级
  }

  // 4) 覆盖层（长按复制）
  toast(false, '', '长按文本手动复制');
  longPressCopyOverlay(txt);
}

// click + pointerup 双监听，提升 Android 命中率
function attachCopyHandler(el, text) {
  if (!el) return;
  let locked = false;
  const handler = async () => {
    if (locked) return;
    locked = true;
    await copyText(text);
    setTimeout(() => (locked = false), 300);
  };
  el.addEventListener('click', handler, { passive: true });
  el.addEventListener('pointerup', handler, { passive: true });
}

// =================== 页面主逻辑：渲染 feed、日期同年隐藏年份 ===================
(async function () {
  const FEED = document.getElementById('feed');
  const DOMAIN = '51888.ton';

  // ===== SVG 图标（currentColor，可用 CSS 着色）=====
  const ICONS = {
    eye: `
      <svg class="ico-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M2.25 12s3.75-6.75 9.75-6.75 9.75 6.75 9.75 6.75-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="12" cy="12" r="3.25" stroke="currentColor" stroke-width="1.6"/>
      </svg>`.trim(),
    // ❤️ 心形（填充），SVG 格式
    heart: `
      <svg class="ico-svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="currentColor" d="M12.001 20.66c-.26 0-.52-.095-.72-.286l-6.94-6.553a5.5 5.5 0 0 1 .12-8.064c2.134-1.95 5.39-1.62 7.24.512.078.09.153.185.223.282.07-.097.145-.192.224-.282 1.85-2.132 5.106-2.462 7.24-.512a5.5 5.5 0 0 1 .12 8.064l-6.94 6.553c-.2.191-.46.286-.72.286z"/>
      </svg>`.trim()
  };

  // 解析日期/同年隐藏年份
  function toDate(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' || /^\d+$/.test(String(v))) {
      const n = Number(v);
      const ms = n < 1e12 ? n * 1000 : n; // 小于 1e12 认为是秒
      const d1 = new Date(ms);
      return isNaN(d1.getTime()) ? null : d1;
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDateLabel(v) {
    const d = toDate(v);
    if (!d) return typeof v === 'string' ? v : '';
    const thisYear = new Date().getFullYear();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return y === thisYear ? `${m}月${day}日` : `${y}年${m}月${day}日`;
  }
  function dayKey(v) {
    const d = toDate(v);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // 读取 posts.json
  let posts = [];
  try {
    const res = await fetch('posts.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    posts = await res.json();
    if (!Array.isArray(posts)) throw new Error('posts.json 必须是数组');
  } catch (err) {
    if (FEED) FEED.innerHTML = '<div style="padding:18px;color:#a00">读取 posts.json 失败：' + err.message + '</div>';
    return;
  }

  // 排序：id DESC；id 相同按 date DESC
  posts.sort((a, b) => {
    const ai = Number(a.id) || 0, bi = Number(b.id) || 0;
    if (ai !== bi) return bi - ai;
    const da = toDate(a.date)?.getTime() ?? 0;
    const db = toDate(b.date)?.getTime() ?? 0;
    return db - da;
  });

  function formatViews(n) {
    if (!n) return '0';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  // 渲染（按天分组：date-chip）
  let lastDayKey = '';

  for (const p of posts) {
    // 日期分隔胶囊
    const k = dayKey(p.date);
    if (FEED && k && k !== lastDayKey) {
      const chip = document.createElement('div');
      chip.className = 'date-chip';
      chip.innerHTML = `<span>${fmtDateLabel(p.date)}</span>`;
      FEED.appendChild(chip);
      lastDayKey = k;
    }

    const postEl = document.createElement('article');
    postEl.className = 'post';

    // 媒体
    const mediaWrap = document.createElement('div');
    mediaWrap.className = 'media-wrap';

    if (p.media && p.media.src) {
      if (p.media.type === 'video') {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.src = p.media.src;
        v.alt = p.media.alt || '';
        v.oncontextmenu = (e) => e.preventDefault();
        v.setAttribute('controlsList', 'nodownload');
        mediaWrap.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = p.media.src;
        img.alt = p.media.alt || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        img.oncontextmenu = (e) => e.preventDefault();

        const targetHref =
          (p.media && (p.media.href || p.media.link || p.media.url)) || p.link || p.url;
        if (targetHref) {
          const a = document.createElement('a');
          a.href = targetHref;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.appendChild(img);
          mediaWrap.appendChild(a);
        } else {
          mediaWrap.appendChild(img);
        }
      }
    }
    postEl.appendChild(mediaWrap);

    // 内容
    const content = document.createElement('div');
    content.className = 'content';

    if (p.title) {
      const h = document.createElement('h3');
      h.className = 'post-title';
      h.textContent = p.title;
      content.appendChild(h);
    }

    if (p.textHtml) {
      const d = document.createElement('div');
      d.className = 'post-sub post-text';
      d.innerHTML = p.textHtml;
      content.appendChild(d);
    } else if (p.text) {
      const d = document.createElement('div');
      d.className = 'post-sub post-text';
      d.textContent = p.text;
      content.appendChild(d);
    }

    // 按钮网格
    if (Array.isArray(p.buttons) && p.buttons.length) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const b of p.buttons) {
        const a = document.createElement('a');
        a.href = b.href || '#';
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        a.innerHTML =
          '<span class="btn-label">' + (b.label || '') + '</span><span class="btn-arrow">↗</span>';
        grid.appendChild(a);
      }
      if (p.buttons.length % 2 === 1) {
        const last = grid.lastElementChild;
        last.style.justifySelf = 'center';
        last.style.maxWidth = '70%';
      }
      content.appendChild(grid);
    }

    postEl.appendChild(content);

    // ===== Meta =====
    const meta = document.createElement('div');
    meta.className = 'meta';

    // 左侧：❤️（SVG）复制域名
    const left = document.createElement('div');
    left.className = 'left';
    const heartBtn = document.createElement('button');
    heartBtn.className = 'icon-btn';
    heartBtn.type = 'button';
    heartBtn.setAttribute('aria-label', '复制域名');
    heartBtn.innerHTML = ICONS.heart;     // SVG 格式的 ❤️
    heartBtn.style.color = 'var(--gold)'; // 若你有金色变量，会自动金色；没有也不影响功能
    attachCopyHandler(heartBtn, DOMAIN);
    left.appendChild(heartBtn);
    meta.appendChild(left);

// 右侧：👀 浏览量 + 时间
const right = document.createElement('div');
right.className = 'right';

const stats = document.createElement('span');
stats.innerHTML = `
  <span class="views">
    <span class="ico" aria-hidden="true" style="color:#D4AF37">${ICONS.eye}</span>
    ${formatViews(p.views || 0)}
  </span>
  ${p.time ? ` <span class="dot" aria-hidden="true">·</span> <span>${p.time}</span>` : ''}
`;
right.appendChild(stats);
meta.appendChild(right);

    postEl.appendChild(meta);

    if (FEED) FEED.appendChild(postEl);
  }

  // 页面上“复制域名”主按钮（如果有）
  attachCopyHandler(document.getElementById('copyDomain'), DOMAIN);

  // 仅对媒体区域禁右键菜单
  document.addEventListener('contextmenu', (e) => {
    if (e.target && (e.target.tagName === 'IMG' || e.target.closest('.media-wrap')))
      e.preventDefault();
  });
})();

// 全局禁右键（如不需要，删除本段）
document.addEventListener('contextmenu', function (e) {
  e.preventDefault();
});

// 禁止拖拽图片到浏览器
document.addEventListener('dragstart', function (e) {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
  }
});
