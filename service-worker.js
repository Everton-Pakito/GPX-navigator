const CACHE_NAME = 'gpx-navigator-v2';
const TILES_CACHE_NAME = 'gpx-tiles-cache';

// Arquivos essenciais para funcionar offline
const ESSENTIAL_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './routes.json',
  './gerador.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Instala o service worker
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  
  event.waitUntil(
    Promise.all([
      // Cache dos arquivos essenciais
      caches.open(CACHE_NAME).then(cache => {
        console.log('Service Worker: Cacheando arquivos essenciais');
        return cache.addAll(ESSENTIAL_FILES);
      }),
      // Cria cache para tiles
      caches.open(TILES_CACHE_NAME)
    ]).then(() => {
      console.log('Service Worker: Instalação concluída');
      // Força ativação imediata
      return self.skipWaiting();
    }).catch(error => {
      console.error('Service Worker: Erro na instalação:', error);
    })
  );
});

// Ativa o service worker
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remove caches antigos, exceto o de tiles
          if (cacheName !== CACHE_NAME && cacheName !== TILES_CACHE_NAME) {
            console.log('Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Ativação concluída');
      // Assume controle imediato de todas as páginas
      return self.clients.claim();
    })
  );
});

// Intercepta requisições
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Estratégia para tiles do OpenStreetMap
  if (isTileRequest(url)) {
    event.respondWith(handleTileRequest(event.request));
    return;
  }
  
  // Estratégia para arquivos GPX
  if (url.pathname.endsWith('.gpx')) {
    event.respondWith(handleGpxRequest(event.request));
    return;
  }
  
  // Estratégia geral: Cache first para arquivos estáticos
  event.respondWith(handleGeneralRequest(event.request));
});

// Verifica se é requisição de tile
function isTileRequest(url) {
  return url.hostname.includes('tile.openstreetmap.org') || 
         url.hostname.includes('tile') ||
         (url.pathname.includes('.png') && url.searchParams.has('z'));
}

// Manipula requisições de tiles
async function handleTileRequest(request) {
  try {
    const cache = await caches.open(TILES_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: Tile servido do cache:', request.url);
      return cachedResponse;
    }
    
    // Tenta buscar online
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        // Cacheia para próximas vezes
        await cache.put(request, networkResponse.clone());
        console.log('Service Worker: Tile baixado e cacheado:', request.url);
        return networkResponse;
      }
    } catch (networkError) {
      console.log('Service Worker: Falha na rede para tile:', request.url);
    }
    
    // Retorna tile de placeholder se não conseguir carregar
    return createPlaceholderTile();
    
  } catch (error) {
    console.error('Service Worker: Erro ao processar tile:', error);
    return createPlaceholderTile();
  }
}

// Cria tile de placeholder para modo offline
function createPlaceholderTile() {
  const canvas = new OffscreenCanvas(256, 256);
  const ctx = canvas.getContext('2d');
  
  // Fundo cinza claro
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, 256, 256);
  
  // Texto "Offline"
  ctx.fillStyle = '#999';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Offline', 128, 128);
  
  // Borda
  ctx.strokeStyle = '#ccc';
  ctx.strokeRect(0, 0, 256, 256);
  
  return canvas.convertToBlob().then(blob => {
    return new Response(blob, {
      headers: { 'Content-Type': 'image/png' }
    });
  });
}

// Manipula requisições de arquivos GPX
async function handleGpxRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: GPX servido do cache:', request.url);
      return cachedResponse;
    }
    
    // Tenta buscar online
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cacheia o arquivo GPX
      await cache.put(request, networkResponse.clone());
      console.log('Service Worker: GPX baixado e cacheado:', request.url);
      return networkResponse;
    }
    
    throw new Error('Arquivo GPX não encontrado');
    
  } catch (error) {
    console.error('Service Worker: Erro ao carregar GPX:', error);
    return new Response('Arquivo GPX não disponível offline', { status: 404 });
  }
}

// Manipula requisições gerais
async function handleGeneralRequest(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Cache First: tenta cache primeiro
    if (cachedResponse) {
      console.log('Service Worker: Arquivo servido do cache:', request.url);
      return cachedResponse;
    }
    
    // Se não tem no cache, tenta buscar online
    const networkResponse = await fetch(request);
    
    // Se conseguiu buscar, cacheia para próximas vezes
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
      console.log('Service Worker: Arquivo baixado e cacheado:', request.url);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('Service Worker: Erro na requisição:', error);
    
    // Se é página HTML, retorna página offline
    if (request.headers.get('accept')?.includes('text/html')) {
      return createOfflinePage();
    }
    
    return new Response('Conteúdo não disponível offline', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Cria página offline de emergência
function createOfflinePage() {
  const offlineHTML = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GPX Navigator - Offline</title>
      <style>
        body {
          font-family: sans-serif;
          background: #f9f9f9;
          color: #333;
          text-align: center;
          padding: 50px 20px;
        }
        .offline-container {
          max-width: 400px;
          margin: 0 auto;
        }
        .offline-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }
        .offline-title {
          font-size: 24px;
          margin-bottom: 10px;
          color: #e74c3c;
        }
        .offline-message {
          margin-bottom: 30px;
          color: #666;
        }
        .retry-button {
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 16px;
        }
        .retry-button:hover {
          background: #2980b9;
        }
      </style>
    </head>
    <body>
      <div class="offline-container">
        <div class="offline-icon">📴</div>
        <h1 class="offline-title">Sem Conexão</h1>
        <p class="offline-message">
          Você está offline. Algumas funcionalidades podem estar limitadas.
          Verifique sua conexão com a internet e tente novamente.
        </p>
        <button class="retry-button" onclick="window.location.reload()">
          🔄 Tentar Novamente
        </button>
      </div>
      
      <script>
        // Auto-reload quando voltar online
        window.addEventListener('online', () => {
          window.location.reload();
        });
        
        // Mostra status da conexão
        window.addEventListener('load', () => {
          if (navigator.onLine) {
            document.querySelector('.offline-message').innerHTML = 
              'Conexão restaurada! <a href="./">Voltar ao app</a>';
          }
        });
      </script>
    </body>
    </html>
  `;
  
  return new Response(offlineHTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// Limpa cache antigo periodicamente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAN_CACHE') {
    event.waitUntil(cleanOldCache());
  }
});

async function cleanOldCache() {
  const cache = await caches.open(TILES_CACHE_NAME);
  const requests = await cache.keys();
  
  // Remove tiles mais antigos se cache estiver muito grande
  if (requests.length > 5000) {
    const toDelete = requests.slice(0, 1000);
    await Promise.all(toDelete.map(request => cache.delete(request)));
    console.log('Service Worker: Cache de tiles limpo');
  }
}