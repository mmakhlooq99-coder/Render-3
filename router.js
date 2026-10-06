// Tiny router: method + path pattern (with :params) -> handler(req, res, ctx)
class Router {
  constructor() {
    this.routes = []; // {method, pattern: RegExp, keys: [], handler}
  }

  add(method, path, handler) {
    const keys = [];
    const regexStr = path
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const pattern = new RegExp('^' + regexStr + '$');
    this.routes.push({ method, pattern, keys, handler });
  }

  get(path, handler) { this.add('GET', path, handler); }
  post(path, handler) { this.add('POST', path, handler); }
  put(path, handler) { this.add('PUT', path, handler); }
  del(path, handler) { this.add('DELETE', path, handler); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(pathname);
      if (!m) continue;
      const params = {};
      route.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
      return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = { Router };
