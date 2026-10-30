# leave-flow-mirror

原站（BPM / 低代码表单平台 v3.4.0）前端的**逐字节镜像**，配合一层浏览器内的模拟接口，可直接跑在 GitHub Pages 上。

- 页面文件 `index.html` / `assets/**`：**未做任何修改**，与线上抓取件 md5 一致
- 新增的只有三样东西，都在站点外面：`sw.js`（Service Worker 假后端）、`gate.html`（安装 Service Worker 的入口）、`server.js`（可选，用 Node 跑同一套逻辑）

## 访问

**首次请从入口页进**（它会先装好模拟环境再跳转）：

```
https://8con8.github.io/leave-flow-mirror/gate.html
```

装好之后，直接开 `https://8con8.github.io/leave-flow-mirror/` 也能正常登录（Service Worker 已经常驻）。

用 `file://` 双击打开不行，Service Worker 需要 https 或 localhost。

## 账号

| 姓名 | 账号 | 角色 |
|---|---|---|
| 李永熙 | `liyongxi` | 老师 |
| 曾志贤 | `zengzhixian` | 学生 |
| 谢哮 | `xiexiao` | 学生 |
| 本地管理员 | `admin` | 管理员 |

密码任意。登录框填**姓名**、**拼音**或**编号**都能匹配；表里没有的名字按访客放行。

## 为什么需要 Service Worker

原站前端会向后端要数据：`POST /login`、`GET /bpm/rest/setting/roles`、`GET /bpm/rest/platform/setting` 等。GitHub Pages 只有静态文件，这些请求会 404，页面就停在"加载中"。

`sw.js` 在浏览器里截住这些请求，按原站的数据结构直接回 JSON（响应的 `meta.success` / `meta.statusCode` 形状是照着前端代码逆出来的）。所以：

- 前端源码不动
- 不需要服务器
- 纯静态托管也能登录、能看菜单

## 本地跑

```bash
# 方式一：纯静态（验证 Pages 行为）
python -m http.server 8091
# 打开 http://127.0.0.1:8091/gate.html

# 方式二：Node 版（不开 Service Worker 也能用）
node server.js
# 打开 http://127.0.0.1:8090/
```

## 目录

```
index.html     原站入口（未改）
assets/        原站静态资源（未改，343 个文件）
gate.html      入口页：注册 Service Worker 后跳转
sw.js          假后端：拦截接口请求并返回构造好的 JSON
server.js      同一套逻辑的 Node 实现（可不用）
```

## 说明

镜像仅用于界面研究与离线演示，接口数据全部是构造的，与任何真实系统无关。
