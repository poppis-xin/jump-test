// 抖音云落地页（接入现有 jump 服务的反向代理版）
//
// 抖音云只负责两件事：
//   1. 用平台域名渲染落地页（免风险提示）
//   2. 把链接解析转发给现有 Python 服务（ld-console）
//
// 路由：
//   GET /api/j/<code>        落地页（code 来自路径）
//   GET /api/                落地页（默认 code）
//   GET /api/target?code=xx  代理现有服务的 /j/t/<code>
//   GET /api/healthz         健康检查
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8000;
const UPSTREAM = process.env.UPSTREAM || 'https://hssy.site';
const DEFAULT_CODE = process.env.DEFAULT_CODE || 'ddos1j5';
const TITLE = process.env.LANDING_TITLE || '点击咨询';

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { Accept: 'application/json' },
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
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function page(code, noauto) {
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
var CODE = ${JSON.stringify(code)};
var TARGET = '';
function go(){
  if(!TARGET){
    document.getElementById('err').textContent = '正在获取跳转地址…';
    return;
  }
  location.href = TARGET;
}
fetch('/api/target?code=' + encodeURIComponent(CODE))
  .then(function(r){return r.json()})
  .then(function(d){
    if(d && d.target){
      TARGET = d.target;
      ${noauto ? '' : "setTimeout(function(){ try{ location.href = TARGET }catch(e){} }, 1200);"}
    } else if(d && d.error){
      document.getElementById('err').textContent = d.error;
    } else {
      document.getElementById('err').textContent = JSON.stringify(d);
    }
  })
  .catch(function(e){ document.getElementById('err').textContent = String(e); });
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/api/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, upstream: UPSTREAM, code: DEFAULT_CODE }));
  }

  if (path === '/api/target') {
    const code = (url.searchParams.get('code') || DEFAULT_CODE).trim();
    try {
      const data = await requestJson(UPSTREAM + '/j/t/' + encodeURIComponent(code));
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
    }
  }

  // /api/j/<code>
  const m = path.match(/^\/api\/j\/([^/]+)\/?$/);
  if (m) {
    const code = decodeURIComponent(m[1]);
    const noauto = url.searchParams.get('noauto') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page(code, noauto));
  }

  if (path === '/api/' || path === '/api' || path === '/api/index.html') {
    const code = (url.searchParams.get('code') || DEFAULT_CODE).trim();
    const noauto = url.searchParams.get('noauto') === '1';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(page(code, noauto));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => console.log('listening on', PORT, 'upstream=', UPSTREAM));
