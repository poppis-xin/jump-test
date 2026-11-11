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
  body{margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#222}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;text-align:center}
  .logo{width:76px;height:76px;border-radius:20px;background:#07c160;display:flex;align-items:center;justify-content:center;font-size:36px;color:#fff;font-weight:600}
  h1{font-size:22px;margin:22px 0 8px;font-weight:600}
  .sub{font-size:14px;color:#888;margin-bottom:28px}
  .btn{width:100%;max-width:340px;height:52px;border:0;border-radius:26px;background:#07c160;color:#fff;font-size:17px;font-weight:600}
  .btn:active{background:#06ad56}
  .btn[disabled]{background:#a8e6c1}
  .qr{margin-top:28px;width:220px;height:220px;background:#fff;border-radius:14px;padding:10px}
  .qr img{width:100%;height:100%;object-fit:contain}
  .tip{margin-top:18px;font-size:13px;color:#999;line-height:1.7}
  .err{margin-top:18px;font-size:13px;color:#e54d42;line-height:1.7;word-break:break-all}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">微</div>
  <h1>${TITLE}</h1>
  <div class="sub">${SUB}</div>
  <button class="btn" id="btn" onclick="go()">打开微信</button>
  ${QR_IMAGE ? `<div class="qr"><img id="qrimg" src="${QR_IMAGE}" alt="二维码"></div>` : ''}
  <div class="tip">若按钮无反应，请长按上方二维码识别</div>
  <div class="err" id="err"></div>
</div>
<script>
var TARGET = '';
function go(){
  if(!TARGET){ location.href='/api/target'; return; }
  location.href = TARGET;
}
fetch('/api/target').then(function(r){return r.json()}).then(function(d){
  if(d && d.target){ TARGET = d.target;
    if(${noauto ? 'false' : 'true'}){ setTimeout(function(){ try{ location.href = TARGET }catch(e){} }, 500); }
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
