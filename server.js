/*
 * 完全隔离的本地站 —— 静态文件 + 自建假后端
 *   node mock.js [--port 8900]
 *
 * 特性：
 *   - 不访问任何外部服务器（无 proxy）
 *   - 所有 /bpm/** 等接口由本文件里的 mock 应答
 *   - 任何账号密码都登录成功
 *   - 每个请求都记录到 mock/requests.log，方便逐个补数据
 *   - 应答数据放在 mock/fixtures.json，改完刷新页面即可生效（每次请求重新读取）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MOCK_DIR = path.join(ROOT, 'mock');
const LOG_FILE = path.join(MOCK_DIR, 'requests.log');
const FIX_FILE = path.join(MOCK_DIR, 'fixtures.json');

const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const PORT = parseInt(process.env.PORT || argOf('--port', '8900'), 10);
let lastUser = 'admin';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.map': 'application/json; charset=utf-8',
};

fs.mkdirSync(MOCK_DIR, { recursive: true });
function log(line) {
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

function loadFixtures() {
  try { return JSON.parse(fs.readFileSync(FIX_FILE, 'utf8')); } catch (e) { return { rules: [] }; }
}

function readBody(req) {
  return new Promise((res) => {
    const b = [];
    req.on('data', (d) => b.push(d));
    req.on('end', () => res(Buffer.concat(b)));
  });
}

function json(res, obj, code) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}

// 按规则匹配：rule.match 为正则字符串，method 可选
function pickRule(fixtures, method, url) {  const rules = fixtures.rules || [];
  for (const r of rules) {
    if (r.method && r.method.toUpperCase() !== method.toUpperCase()) continue;
    let re;
    try { re = new RegExp(r.match); } catch (e) { continue; }
    if (re.test(url)) return r;
  }
  return null;
}

function readUsername(body, bodyStr) {
  let name = 'admin';
  try {
    const s = bodyStr || (body && body.toString('utf8')) || '';
    if (s.trim().startsWith('{')) {
      const j = JSON.parse(s);
      name = j.username || j.userName || j.loginName || name;
    } else {
      const m = /(?:^|&)username=([^&]*)/.exec(s);
      if (m) name = decodeURIComponent(m[1]);
    }
  } catch (e) {}
  return String(name || 'admin');
}

function loadAccounts() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(MOCK_DIR, 'accounts.json'), 'utf8'));
    return Array.isArray(j.accounts) ? j.accounts : [];
  } catch (e) { return []; }
}

// 姓名 / 拼音账号 / userId 任一都能匹配（大小写不敏感）
function resolveAccount(input) {
  const accs = loadAccounts();
  const raw = String(input || '').trim();
  const k = raw.toLowerCase();
  return (
    accs.find((a) => String(a.account || '').toLowerCase() === k) ||
    accs.find((a) => String(a.userRealName || '').toLowerCase() === k) ||
    accs.find((a) => String(a.userName || '').toLowerCase() === k) ||
    accs.find((a) => String(a.userId || '').toLowerCase() === k) ||
    null
  );
}

function buildUser(userNameOrAccount) {
  const acc = typeof userNameOrAccount === 'object' && userNameOrAccount
    ? userNameOrAccount
    : resolveAccount(userNameOrAccount);
  if (acc) {
    return {
      meta: { success: true, statusCode: 200, message: '登录成功（本地模拟）' },
      data: Object.assign({ tokenId: 'mock-token-0001', accessToken: 'mock-token-0001', photo: '' }, acc),
    };
  }
  const name = String(userNameOrAccount || 'admin');
  return {
    meta: { success: true, statusCode: 200, message: '登录成功（本地模拟）' },
    data: {
      userId: '9' + Math.abs(hash(name)).toString().slice(0, 5),
      userName: name,
      userRealName: name,
      orgId: '1',
      orgName: '本地测试公司',
      deptId: '99',
      deptName: '临时访客',
      roleId: '9',
      roleName: '访客',
      roles: 'RS001,RS002',
      tokenId: 'mock-token-0001',
      accessToken: 'mock-token-0001',
      isAdmin: false,
      photo: '',
    },
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url;
  const [pathname, qs] = rawUrl.split('?');
  // 没有扩展名的路径一律当接口处理（本站是 hash 路由，服务端不会收到页面路径）
  const isFile = /\.[a-z0-9]{1,6}$/i.test(pathname);
  const isApi = !isFile && pathname !== '/' && pathname !== '';

  if (isApi) {
    let body = Buffer.alloc(0);
    if (req.method !== 'GET' && req.method !== 'HEAD') body = await readBody(req);
    const bodyStr = body.length ? body.toString('utf8').slice(0, 2000) : '';
    log(`[${new Date().toISOString()}] ${req.method} ${rawUrl}${bodyStr ? '  BODY=' + bodyStr : ''}`);

    const fixtures = loadFixtures();
    const fullUrl = pathname + (qs ? '?' + qs : '');
    const rule = pickRule(fixtures, req.method, fullUrl);

    if (rule) {
      if (rule.status && rule.status >= 400) return json(res, rule.body ?? {}, rule.status);
      let out = rule.body;
      // dynamic=echoUser：把登录表单里填的账号原样当成登录人，实现"任意账号登录"
      if (rule.dynamic === 'echoUser') {
        const name = readUsername(body, bodyStr);
        lastUser = name;
        out = buildUser(name);
      }
      // dynamic=tokenGate：有 token 才算登录态，否则 401 → 前端停在登录页
      if (rule.dynamic === 'tokenGate') {
        const ck = String(req.headers.cookie || '');
        if (/Authorization=/.test(ck)) out = buildUser(lastUser);
        else {
          if (rule.cookie) res.setHeader('Set-Cookie', rule.cookie);
          return json(res, { meta: { success: false, statusCode: 401, message: '未登录（本地模拟）' }, data: null }, 401);
        }
      }
      // dynamic=accounts：把 accounts.json 里的账号当作人员选择器数据源
      if (rule.dynamic === 'accounts') {
        const list = loadAccounts().map((a) => ({
          id: a.userId,
          key: a.userId,
          userId: a.userId,
          userName: a.userName,
          name: a.userName,
          realName: a.userRealName,
          userRealName: a.userRealName,
          orgId: a.orgId,
          orgName: a.orgName,
          deptId: a.deptId,
          deptName: a.deptName,
          roleName: a.roleName,
          isLeaf: true,
          type: 'user',
        }));
        out = { meta: { success: true, statusCode: 200 }, data: { list: list, total: list.length, records: list } };
      }
      if (rule.cookie) res.setHeader('Set-Cookie', rule.cookie);
      return json(res, out ?? {}, 200);
    }
    // 兜底：成功空包，同时带上各种可能的成功字段，保证前端不炸
    return json(res, {
      success: true,
      statusCode: 200,
      code: 200,
      message: 'ok(mock)',
      data: {},
      meta: { success: true, statusCode: 200, message: 'ok(mock)' },
    });
  }

  // 静态文件
  if (pathname === '/' || pathname === '') {
    const f = path.join(ROOT, 'index.html');
    try {
      const buf = fs.readFileSync(f);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(buf);
    } catch (e) { res.writeHead(500); return res.end('index.html missing'); }
  }
  const safe = path.posix.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(ROOT, safe);
  const rel = path.relative(ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      // SPA 回落
      try {
        const buf = fs.readFileSync(path.join(ROOT, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(buf);
      } catch (e) { res.writeHead(404); return res.end('not found'); }
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'public, max-age=60',
    });
    fs.createReadStream(full).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock] http://127.0.0.1:${PORT}  完全离线  日志: mock/requests.log`);
  console.log(`[mock] 登录页 http://127.0.0.1:${PORT}/#/login  （任意账号密码）`);
});
