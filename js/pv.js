/* ほりほり工場：説明ページ・日誌などの「見られた数」と「どこから来たか」を、うらがわに1回だけ知らせる（2026-11-28）
   送る物：ページの名前・来た所の分類（google・x など）・閲覧者の番号（このブラウザの中だけの乱数）・言葉・スマホかPCか。
   名前・入力・個人の情報は送らない。管理モード・?dev・horihori.kinomeno.com 以外では送らない。 */
(function () {
  'use strict';
  try {
    if (location.hostname !== 'horihori.kinomeno.com') return;
    if (/[?&](dev|kn_notrack)\b/.test(location.search)) return;
    try { if (localStorage.getItem('dfAdminMode') === '1') return; } catch (e) { }
    var URA = 'https://horihori-ura-57e41c.kinomeno.workers.dev';
    var p = location.pathname.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
    var page = p || 'top';
    var rid = function () { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); };
    var vid = ''; try { vid = localStorage.getItem('digfactory.vid') || ''; if (!/^[0-9a-f]{16}$/.test(vid)) { vid = rid(); localStorage.setItem('digfactory.vid', vid); } } catch (e) { vid = rid(); }
    var ref = '', host = '';
    try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { host = ''; }
    if (host !== location.hostname) {   // 外から入って来た時だけ
      ref = !host ? 'direct' : /(^|\.)google\./.test(host) ? 'google' : /(^|\.)yahoo\./.test(host) ? 'yahoo' : /(^|\.)bing\.com$/.test(host) ? 'bing' : /duckduckgo\.com$/.test(host) ? 'ddg'
        : /(^|\.)(x\.com|twitter\.com|t\.co)$/.test(host) ? 'x' : /(^|\.)note\.com$/.test(host) ? 'note' : /(^|\.)reddit\.com$/.test(host) ? 'reddit' : /(^|\.)kinomeno\.com$/.test(host) ? 'kinomeno'
        : /(chatgpt\.com|openai\.com)$/.test(host) ? 'chatgpt' : /perplexity\.ai$/.test(host) ? 'perplexity' : /crazygames\./.test(host) ? 'crazygames' : /poki\./.test(host) ? 'poki' : /itch\.io$/.test(host) ? 'itch' : 'other';
    }
    var ev = [{ k: 'pv', t: page, n: 0, mo: 0, lv: 0, br: 0 }];
    if (ref) ev.push({ k: 'rf', t: ref, n: 0, mo: 0, lv: 0, br: 0 });
    var body = JSON.stringify({ a: 'horihori', v: vid, s: rid(), l: (document.documentElement.lang === 'en' ? 'en' : 'kanji'), d: (matchMedia('(pointer: coarse)').matches ? 'sp' : 'pc'), ev: ev });
    fetch(URA + '/e', { method: 'POST', body: body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' }).catch(function () { });
  } catch (e) { /* 記録の失敗は、ページの表示に影響させない */ }
})();
