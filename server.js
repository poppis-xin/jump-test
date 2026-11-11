// 抖音云最小测试服务（零依赖）
// 目的：拿到 xxx.service.douyincloud.run 域名后，验证该域名在抖音内打开是否弹风险提示
const http = require('http');

const PORT = process.env.PORT || 8000;

function page(ua) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>抖音云测试页</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#333}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
  .logo{width:72px;height:72px;border-radius:18px;background:#161823;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px}
  h1{font-size:20px;margin:20px 0 8px;font-weight:600}
  .ok{color:#07c160;font-size:15px;margin:6px 0 20px}
  .meta{font-size:12px;color:#999;line-height:1.8;word-break:break-all;padding:0 20px}
  .box{margin-top:24px;background:#fff;border-radius:12px;padding:16px 20px;font-size:13px;color:#666;max-width:520px;line-height:1.8}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">云</div>
  <h1>抖音云测试页</h1>
  <div class="ok">页面已成功加载</div>
  <div class="box">
    如果你能看到这一页，且<b>没有先出现「即将访问第三方网址」的风险提示</b>，
    说明 <code>service.douyincloud.run</code> 域名在抖音内是被放行的。
  </div>
  <div class="meta">
    时间：${now}<br>
    主机：${process.env.HOSTNAME || '-'}<br>
    UA：${(ua || '').slice(0, 120)}
  </div>
</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ts: Date.now() }));
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page(req.headers['user-agent'] || ''));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('listening on', PORT);
});
