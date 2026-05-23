/**
 * TexLive 资源缓存 Service Worker
 * 缓存 LaTeX 编译所需的宏包和字体文件
 */

const CACHE_NAME = 'texlive-cache-v2';
const TEXLIVE_HOSTS = [
  'texlive.texlyre.org',
  'texlive2.texlyre.org',
];

// 不缓存的路径模式
const EXCLUDE_PATTERNS = [
  '/api/',
  '.php',
  '.asp',
];

// 安装时预缓存核心文件（可选）
self.addEventListener('install', (event) => {
  console.log('[TexLive SW] Installing v2...');
  self.skipWaiting();
});

// 激活时清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[TexLive SW] Activating v2...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('texlive-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 只处理 TexLive 服务器的请求
  if (!TEXLIVE_HOSTS.some(host => url.hostname.includes(host))) {
    return;
  }
  
  // 排除不应缓存的路径
  if (EXCLUDE_PATTERNS.some(pattern => url.pathname.includes(pattern))) {
    return;
  }
  
  // 缓存所有 TexLive 资源（宏包、字体等）
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // 命中缓存，直接返回
          // console.log('[TexLive SW] Cache hit:', url.pathname);
          return cachedResponse;
        }
        
        // 未命中缓存，从网络获取并缓存
        return fetch(event.request).then((networkResponse) => {
          // 只缓存成功的响应（200 和 301 重定向）
          if (networkResponse.ok || networkResponse.status === 301) {
            // 克隆响应（因为响应只能使用一次）
            cache.put(event.request, networkResponse.clone());
            // console.log('[TexLive SW] Cached:', url.pathname);
          }
          return networkResponse;
        }).catch((error) => {
          console.error('[TexLive SW] Fetch failed:', url.pathname, error);
          throw error;
        });
      });
    })
  );
});
