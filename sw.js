/* 假装后端的 Service Worker
 * 作用：在浏览器里拦截原站的接口请求，直接返回构造好的 JSON。
 * 这样纯静态托管（GitHub Pages）也能登录、能看到菜单。
 * 原站前端文件一个字节都没有改。
 */
'use strict';

var BASE = new URL('./', self.location).pathname; // 例如 /leave-flow-mirror/
var STATE_CACHE = 'mock-state-v1';
var STATE_KEY = new URL('__mock_user__', self.location).href;

var ACCOUNTS = [
  { userId: '1001', userName: '本地管理员', account: 'admin', userRealName: '本地管理员',
    orgId: '1', orgName: '本地测试学校', deptId: '10', deptName: '信息中心',
    roleId: '1', roleName: '管理员', roles: 'RS001,RS002', isAdmin: true, photo: '' },
  { userId: '2001', userName: '李永熙', account: 'liyongxi', userRealName: '李永熙',
    orgId: '1', orgName: '本地测试学校', deptId: '20', deptName: '教务处',
    roleId: '2', roleName: '老师', roles: 'RS001,RS002', isAdmin: false, photo: '' },
  { userId: '3001', userName: '曾志贤', account: 'zengzhixian', userRealName: '曾志贤',
    orgId: '1', orgName: '本地测试学校', deptId: '30', deptName: '计算机学院 2024级1班',
    roleId: '3', roleName: '学生', roles: 'RS001,RS002', isAdmin: false, photo: '' },
  { userId: '3002', userName: '谢哮', account: 'xiexiao', userRealName: '谢哮',
    orgId: '1', orgName: '本地测试学校', deptId: '30', deptName: '计算机学院 2024级1班',
    roleId: '3', roleName: '学生', roles: 'RS001,RS002', isAdmin: false, photo: '' }
];

function meta(ok, msg) {
  return { success: ok !== false, statusCode: ok === false ? 500 : 200, message: msg || 'ok' };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
function resolveAccount(input) {
  var raw = String(input || '').trim().toLowerCase();
  for (var i = 0; i < ACCOUNTS.length; i++) {
    var a = ACCOUNTS[i];
    if ((a.account || '').toLowerCase() === raw) return a;
  }
  for (var j = 0; j < ACCOUNTS.length; j++) {
    var b = ACCOUNTS[j];
    if ((b.userRealName || '').toLowerCase() === raw || (b.userName || '').toLowerCase() === raw) return b;
  }
  for (var k = 0; k < ACCOUNTS.length; k++) {
    if (ACCOUNTS[k].userId.toLowerCase() === raw) return ACCOUNTS[k];
  }
  return null;
}
function buildUser(nameOrAcc) {
  var acc = typeof nameOrAcc === 'object' && nameOrAcc ? nameOrAcc : resolveAccount(nameOrAcc);
  if (acc) {
    var u = {};
    for (var k in acc) if (Object.prototype.hasOwnProperty.call(acc, k)) u[k] = acc[k];
    u.tokenId = 'mock-token-0001';
    u.accessToken = 'mock-token-0001';
    return { meta: meta(true, '登录成功（本地模拟）'), data: u };
  }
  var name = String(nameOrAcc || 'admin');
  return {
    meta: meta(true, '登录成功（本地模拟）'),
    data: {
      userId: '9' + (Math.abs(hash(name)) + '').slice(0, 5),
      userName: name, userRealName: name,
      orgId: '1', orgName: '本地测试公司', deptId: '99', deptName: '临时访客',
      roleId: '9', roleName: '访客', roles: 'RS001,RS002',
      tokenId: 'mock-token-0001', accessToken: 'mock-token-0001',
      isAdmin: false, photo: ''
    }
  };
}
function hash(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/* 登录态存在 Cache 里，Service Worker 被回收也不会丢 */
function saveUser(u) {
  return caches.open(STATE_CACHE).then(function (c) {
    return c.put(STATE_KEY, new Response(JSON.stringify(u), { headers: { 'Content-Type': 'application/json' } }));
  });
}
function loadUser() {
  return caches.open(STATE_CACHE).then(function (c) {
    return c.match(STATE_KEY);
  }).then(function (r) {
    return r ? r.json() : null;
  }).catch(function () { return null; });
}

function readUsername(request) {
  return request.text().then(function (s) {
    var name = 'admin';
    try {
      if (s && s.trim().charAt(0) === '{') {
        var j = JSON.parse(s);
        name = j.username || j.userName || j.loginName || name;
      } else {
        var m = /(?:^|&)username=([^&]*)/.exec(s || '');
        if (m) name = decodeURIComponent(m[1]);
      }
    } catch (e) {}
    return String(name || 'admin');
  }).catch(function () { return 'admin'; });
}

function relPath(pathname) {
  if (pathname.indexOf(BASE) === 0) return '/' + pathname.slice(BASE.length);
  return pathname;
}
function isApi(rel) {
  if (rel === '/' || rel === '') return false;
  return !/\.[a-z0-9]{1,6}$/i.test(rel);
}

function router(request) {
  var url = new URL(request.url);
  var rel = relPath(url.pathname);
  var qs = url.search;
  var full = rel + qs;
  var M = request.method;

  if (/^\/ng\/captcha\/status/.test(full)) return json({ meta: meta(), data: false });

  if (/^\/login/.test(full) && M === 'POST') {
    return readUsername(request).then(function (name) {
      var u = buildUser(name);
      return saveUser(u.data).then(function () { return json(u); });
    });
  }

  if (/^\/tryLoginUserInfo/.test(full)) {
    return loadUser().then(function (u) {
      if (!u) return json({ meta: meta(false, '未登录（本地模拟）'), data: null }, 401);
      return json({ meta: meta(), data: u });
    });
  }

  if (/^\/logout/.test(full)) {
    return caches.open(STATE_CACHE).then(function (c) { return c.delete(STATE_KEY); }).then(function () {
      return json({ meta: meta(), data: {} });
    });
  }

  if (/^\/bpm\/rest\/platform\/setting/.test(full)) {
    if (/configId=SystemLogo,browserLogo,SystemName,showAIAssistant/.test(qs)) {
      return json({ meta: meta(), data: { SystemName: '本地测试系统', SystemLogo: '', browserLogo: '', showAIAssistant: 'false' } });
    }
    if (/configId=systemColor/.test(qs)) return json({ meta: meta(), data: { configValue: '#1890ff' } });
    if (/configId=SystemName/.test(qs)) return json({ meta: meta(), data: { configValue: '本地测试系统' } });
    return json({ meta: meta(), data: { configValue: '' } });
  }

  if (/^\/bpm\/rest\/common\/execute/.test(full)) {
    if (/wf_num=T_S001_005/.test(qs)) return json({ meta: meta(), data: [] });
    return json({ meta: meta(), data: {} });
  }

  if (/^\/bpm\/rest\/common\/aes\/transport/.test(full)) return json({ meta: meta(), data: {} });

  if (/^\/bpm\/rest\/setting\/roles/.test(full)) return json({ meta: meta(), data: { roles: 'RS001,RS002' } });

  if (/^\/bpm\/rest\/apps/.test(full)) return json({ meta: meta(), data: { list: [], total: 0 } });

  if (/^\/bpm\/rest\/analy[sz]e\/department\/list/.test(full)) {
    return json({ meta: meta(), data: {
      records: [
        { id: '20', name: '教务处', deptName: '教务处' },
        { id: '30', name: '计算机学院 2024级1班', deptName: '计算机学院 2024级1班' }
      ], total: 2, pageNum: 1, pageSize: 10
    } });
  }

  if (/^\/bpm\/rest\/analyse\/process\/top\/info/.test(full)) return json({ meta: meta(), data: [] });
  if (/^\/bpm\/rest\/analyse\/processes\/type\/statistics/.test(full)) return json({ meta: meta(), data: [] });
  if (/^\/bpm\/rest\/analyse\/home\/statistics/.test(full)) {
    return json({ meta: meta(), data: {
      transactionApplyCount: 0, handledCount: 0, completionRate: '0%', avgElapsedTime: 0,
      shortestProcessName: '-', longestProcessName: '-', processTypeList: [], processList: []
    } });
  }

  if (/^\/bpm\/rest\/org\/users\/selector/.test(full) || /^\/bpm\/rest\/users\/selector/.test(full)) {
    var list = ACCOUNTS.map(function (a) {
      return { id: a.userId, key: a.userId, userId: a.userId, userName: a.userName, name: a.userName,
        realName: a.userRealName, userRealName: a.userRealName, orgId: a.orgId, orgName: a.orgName,
        deptId: a.deptId, deptName: a.deptName, roleName: a.roleName, isLeaf: true, type: 'user' };
    });
    return json({ meta: meta(), data: { list: list, total: list.length, records: list } });
  }

  if (/^\/bpm\/rest\/org\/departments/.test(full)) {
    return json({ meta: meta(), data: [{
      id: '1', key: '1', deptId: '1', name: '本地测试学校', deptName: '本地测试学校',
      children: [
        { id: '20', key: '20', deptId: '20', name: '教务处', deptName: '教务处' },
        { id: '30', key: '30', deptId: '30', name: '计算机学院 2024级1班', deptName: '计算机学院 2024级1班' }
      ]
    }] });
  }

  // 兜底：成功空包，保证前端不炸
  return json({ success: true, statusCode: 200, code: 200, message: 'ok(mock)', data: {}, meta: meta() });
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET' && e.request.method !== 'POST' && e.request.method !== 'HEAD') return;
  var rel = relPath(url.pathname);
  if (!isApi(rel)) return; // 静态文件走网络
  // 注意：router 多数分支返回的是 Response 对象而不是 Promise，
  // 必须先 Promise.resolve 再 .catch，否则 .catch 不存在会抛错，
  // 导致 respondWith 没被调用、请求漏到网络上去。
  e.respondWith(Promise.resolve().then(function () {
    return router(e.request);
  }).catch(function (err) {
    return json({ meta: meta(false, 'mock error: ' + err.message), data: null }, 500);
  }));
});
