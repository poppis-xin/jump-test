# 抖音云测试服务

最小 Node 服务，用于验证 `*.service.douyincloud.run` 域名在抖音内的放行情况。

## 运行

```bash
npm start
```

监听 8000 端口，访问 `/` 返回测试页，`/healthz` 返回 JSON。

## 部署

抖音云 → Git 部署 → 选择本仓库 → 分支 main → Dockerfile 路径 `Dockerfile`。
