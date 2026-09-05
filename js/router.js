const routes = [];
let viewEl = null;
let notFoundHandler = () => '<div class="empty-state">Not found.</div>';

export function registerRoute(pattern, handler) {
  // pattern: '/', '/calculators', '/calculators/:id', '/log/:id' etc.
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}$`);
  routes.push({ regex, paramNames, handler });
}

export function setNotFound(handler) {
  notFoundHandler = handler;
}

function currentPath() {
  const hash = location.hash.replace(/^#/, '');
  return hash === '' ? '/' : hash;
}

function updateActiveTab(path) {
  const links = document.querySelectorAll('.tab-link');
  links.forEach((a) => {
    const route = a.dataset.route;
    const isActive = route === '/' ? path === '/' : path.startsWith(route);
    a.classList.toggle('active', isActive);
  });
}

async function render() {
  const path = currentPath();
  updateActiveTab(path);

  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
      viewEl.scrollTop = 0;
      const result = await route.handler(params);
      if (typeof result === 'string') viewEl.innerHTML = result;
      return;
    }
  }
  viewEl.innerHTML = await notFoundHandler();
}

export function navigate(path) {
  location.hash = path;
}

export function getView() {
  return viewEl;
}

export function initRouter(mountEl) {
  viewEl = mountEl;
  window.addEventListener('hashchange', render);
  render();
}
