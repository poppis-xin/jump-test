// 抖音云落地页服务
// GET /api/        落地页（自动跳微信 + 二维码兜底）
// GET /api/target  返回 weixin:// 跳转链接
// GET /api/healthz 健康检查
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8000;
const APPID = process.env.MINI_APPID || '';
const SECRET = process.env.MINI_SECRET || '';
const PAGE = process.env.MINI_PAGE || 'pages/contact/contact';
const PARAM = process.env.MINI_PARAM || 'qrcode';
const ENV_VERSION = process.env.MINI_ENV || 'release';
const QR_IMAGE = process.env.QR_IMAGE || '';
const TITLE = process.env.LANDING_TITLE || '添加顾问';
const SUB = process.env.LANDING_SUB || '点击下方按钮，在微信中打开';

let tokenCache = { token: '', exp: 0 };
let linkCache = { url: '', exp: 0 };

// Node 16 没有全局 fetch，这里用 https 模块实现
function fetchJson(url, options) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = options && options.body;
    const headers = Object.assign({}, (options && options.headers) || {});
    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: (options && options.method) || 'GET',
        headers: headers,
        timeout: 10000
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          buf += c;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(buf));
          } catch (e) {
            const err = new Error('bad json: ' + buf.slice(0, 200));
            err.status = res.statusCode;
            err.body = buf;
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.exp > now) return tokenCache.token;
  if (!APPID || !SECRET) throw new Error('missing appid/secret');
  const url =
    'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(APPID) +
    '&secret=' +
    encodeURIComponent(SECRET);
  const data = await fetchJson(url);
  if (!data.access_token) throw new Error('token failed: ' + JSON.stringify(data));
  tokenCache = { token: data.access_token, exp: now + (data.expires_in - 300) * 1000 };
  return tokenCache.token;
}

async function buildScheme() {
  const now = Date.now();
  if (linkCache.url && linkCache.exp > now) return linkCache.url;

  const token = await getToken();
  const query = PARAM + '=' + encodeURIComponent(QR_IMAGE);
  const jump = { path: PAGE, query: query };
  if (['release', 'trial', 'develop'].includes(ENV_VERSION)) {
    jump.env_version = ENV_VERSION;
  }
  const data = await fetchJson(
    'https://api.weixin.qq.com/wxa/generatescheme?access_token=' + encodeURIComponent(token),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jump_wxa: jump })
    }
  );
  if (!data.openlink) throw new Error('scheme failed: ' + JSON.stringify(data));
  linkCache = { url: data.openlink, exp: now + 60 * 1000 };
  return linkCache.url;
}

function page(noauto) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${TITLE}</title>
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#222}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:56px 28px 40px;text-align:center}
  .safe{display:flex;align-items:center;gap:6px;font-size:14px;color:#666}
  .safe .dot{width:16px;height:16px;border-radius:50%;background:#2fb344;color:#fff;font-size:11px;line-height:16px;text-align:center;flex:none}
  .spacer{flex:1;min-height:80px}
  .lead{font-size:26px;font-weight:500;letter-spacing:1px;color:#1a1a1a}
  .hand{margin-top:18px;font-size:30px;letter-spacing:8px}
  .btn{margin-top:44px;width:100%;max-width:520px;height:56px;border:0;border-radius:28px;
       background:#4f8cff;color:#fff;font-size:19px;font-weight:500;letter-spacing:1px}
  .btn:active{background:#3d78e8}
  .btn[disabled]{background:#a9c6ff}
  .foot{margin-top:26px;font-size:12px;color:#bbb;line-height:1.7}
  .err{margin-top:14px;font-size:12px;color:#e54d42;word-break:break-all;max-width:520px}
</style>
</head>
<body>
<div class="wrap">
  <div class="safe"><span class="dot">✓</span>本链接已经过SSL安全加密，请放心点击</div>
  <div class="spacer"></div>
  <div class="lead">点击下方按钮立即前往</div>
  <div class="hand">👇👇👇</div>
  <button class="btn" id="btn" onclick="go()">点击立即前往</button>
  <div class="foot">如未跳转，请返回后重新点击</div>
  <div class="err" id="err"></div>
</div>
<script>
var TARGET = '';
var jumped = false;
function go(){
  if(!TARGET){
    var el = document.getElementById('err');
    el.textContent = '正在获取跳转地址…';
    setTimeout(function(){ if(TARGET){ location.href = TARGET } }, 300);
    return;
  }
  jumped = true;
  location.href = TARGET;
}
fetch('/api/target').then(function(r){return r.json()}).then(function(d){
  if(d && d.target){ TARGET = d.target;
    ${noauto ? '' : "setTimeout(function(){ if(!jumped){ try{ jumped=true; location.href = TARGET }catch(e){} } }, 1200);"}
  } else if(d && d.error){ document.getElementById('err').textContent = d.error; }
}).catch(function(e){ document.getElementById('err').textContent = String(e); });
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/api/debug') {
    const out = { appid: APPID ? APPID.slice(0, 6) + '...' : '', secret: SECRET ? 'set' : 'missing' };
    try {
      const tokenUrl =
        'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
        encodeURIComponent(APPID) +
        '&secret=' +
        encodeURIComponent(SECRET);
      const data = await fetchJson(tokenUrl);
      out.token = data.access_token ? 'ok' : 'no-token';
      out.tokenResp = JSON.stringify(data).slice(0, 200);
    } catch (e) {
      out.error = String((e && e.message) || e);
      out.status = e && e.status;
      out.body = e && e.body && String(e.body).slice(0, 200);
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(out));
  }

  if (path === '/api/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, page: PAGE, env: ENV_VERSION }));
  }

  if (path === '/api/target') {
    try {
      const target = await buildScheme();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, target: target }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(
        JSON.stringify({
          ok: false,
          error: String((e && e.message) || e),
          status: e && e.status,
          body: e && e.body && String(e.body).slice(0, 300)
        })
      );
    }
  }

  if (path === '/api/' || path === '/api' || path === '/api/index.html') {
    const noauto = url.searchParams.get('noauto') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page(noauto));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => console.log('listening on', PORT, 'page=', PAGE));
