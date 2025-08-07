// Registra o Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

// Inicializa o mapa
const map = L.map('map').setView([-22.2171, -48.7173], 15);
let gpxLayer, userMarker, gpxPoints = [], currentPosition = null;
let isNavigating = false;
let routePoints = [];
let currentWaypointIndex = 0;
let offlineTileLayer = null;
let downloadedTiles = new Set();

// Cache de tiles offline
const TILE_CACHE_NAME = 'gpx-tiles-cache';
const TILE_ZOOM_LEVELS = [10, 11, 12, 13, 14, 15, 16, 17]; // Níveis de zoom para cache

// Adiciona camada de tiles online/offline
function createTileLayer() {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18
  });
}

const tileLayer = createTileLayer();
tileLayer.addTo(map);

// Ícone customizado para o usuário com direção
const createUserIcon = (heading = 0) => {
  const rotation = heading || 0;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${rotation} 24 24)">
          <circle cx="24" cy="24" r="20" fill="#3498db" stroke="white" stroke-width="2"/>
          <polygon points="24,10 30,30 24,26 18,30" fill="white"/>
        </g>
      </svg>
    `)}`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24]
  });
};

// Força orientação horizontal e tela cheia
async function enableNavigationMode() {
  try {
    // Tenta forçar orientação landscape
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape').catch(e => console.log('Orientação não suportada:', e));
    }
    
    // Modo tela cheia
    const element = document.documentElement;
    if (element.requestFullscreen) {
      await element.requestFullscreen().catch(e => console.log('Tela cheia não suportada:', e));
    } else if (element.webkitRequestFullscreen) {
      await element.webkitRequestFullscreen().catch(e => console.log('Webkit tela cheia não suportada:', e));
    }
    
  } catch (error) {
    console.log('Erro ao ativar modo navegação:', error);
  }
}

// Desabilita modo navegação
async function disableNavigationMode() {
  try {
    // Libera orientação
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
    
    // Sai da tela cheia
    if (document.exitFullscreen) {
      await document.exitFullscreen().catch(e => console.log('Erro ao sair da tela cheia:', e));
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen().catch(e => console.log('Erro webkit ao sair da tela cheia:', e));
    }
    
  } catch (error) {
    console.log('Erro ao desativar modo navegação:', error);
  }
}

// Função para alternar tela cheia
async function toggleFullscreen() {
  const mapElement = document.getElementById('map');
  
  if (isNavigating) {
    // Ativa modo navegação
    await enableNavigationMode();
    
    // Modo navegação - tela cheia
    mapElement.style.height = '100vh';
    mapElement.style.position = 'fixed';
    mapElement.style.top = '0';
    mapElement.style.left = '0';
    mapElement.style.width = '100vw';
    mapElement.style.zIndex = '1000';
    
    // Esconde outros elementos
    const controls = document.querySelectorAll('#app > *:not(#map)');
    controls.forEach(el => el.style.display = 'none');
    
    // Adiciona controles de navegação
    addNavigationControls();
    
  } else {
    // Desativa modo navegação
    await disableNavigationMode();
    
    // Modo normal
    mapElement.style.height = '400px';
    mapElement.style.position = 'relative';
    mapElement.style.top = 'auto';
    mapElement.style.left = 'auto';
    mapElement.style.width = 'auto';
    mapElement.style.zIndex = 'auto';
    
    // Mostra outros elementos
    const controls = document.querySelectorAll('#app > *:not(#map)');
    controls.forEach(el => el.style.display = '');
    
    // Remove controles de navegação
    removeNavigationControls();
  }
  
  // Força o mapa a se redimensionar
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

// Adiciona controles de navegação
function addNavigationControls() {
  if (document.getElementById('navControls')) return;
  
  const navControls = document.createElement('div');
  navControls.id = 'navControls';
  navControls.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    z-index: 1001;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 10px;
  `;
  
  // Botão voltar
  const backButton = document.createElement('button');
  backButton.innerHTML = '← Voltar';
  backButton.style.cssText = `
    padding: 12px 18px;
    background-color: #e74c3c;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  backButton.onclick = stopNavigation;
  
  // Painel de informações
  const infoPanel = document.createElement('div');
  infoPanel.id = 'navInfo';
  infoPanel.style.cssText = `
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px 15px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    max-width: 300px;
  `;
  infoPanel.innerHTML = `
    <div id="currentDistance">Distância: Calculando...</div>
    <div id="nextWaypoint">Próximo ponto: Calculando...</div>
    <div id="currentSpeed">Velocidade: -- km/h</div>
  `;
  
  // Botões de controle
  const controlButtons = document.createElement('div');
  controlButtons.style.cssText = `
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  `;
  
  // Botão centralizar
  const centerButton = document.createElement('button');
  centerButton.innerHTML = '📍 Centro';
  centerButton.style.cssText = backButton.style.cssText.replace('#e74c3c', '#3498db');
  centerButton.onclick = () => {
    if (currentPosition) {
      map.setView(currentPosition, 17);
    }
  };
  
  // Botão silenciar
  const muteButton = document.createElement('button');
  muteButton.innerHTML = '🔊 Som';
  muteButton.id = 'muteButton';
  muteButton.style.cssText = backButton.style.cssText.replace('#e74c3c', '#27ae60');
  muteButton.onclick = toggleMute;
  
  controlButtons.appendChild(centerButton);
  controlButtons.appendChild(muteButton);
  
  navControls.appendChild(backButton);
  navControls.appendChild(infoPanel);
  navControls.appendChild(controlButtons);
  
  document.body.appendChild(navControls);
}

// Remove controles de navegação
function removeNavigationControls() {
  const navControls = document.getElementById('navControls');
  if (navControls) {
    navControls.remove();
  }
}

// Variável para controle de áudio
let isMuted = false;

// Toggle mute
function toggleMute() {
  isMuted = !isMuted;
  const button = document.getElementById('muteButton');
  if (button) {
    button.innerHTML = isMuted ? '🔇 Mudo' : '🔊 Som';
    button.style.backgroundColor = isMuted ? '#e74c3c' : '#27ae60';
  }
  speak(isMuted ? 'Áudio desabilitado' : 'Áudio habilitado');
}

// Para navegação
function stopNavigation() {
  isNavigating = false;
  currentWaypointIndex = 0;
  toggleFullscreen();
  speak('Navegação finalizada');
}

// Download de tiles para área específica
async function downloadTilesForBounds(bounds, onProgress) {
  const cache = await caches.open(TILE_CACHE_NAME);
  let totalTiles = 0;
  let downloadedCount = 0;
  
  // Calcula total de tiles
  TILE_ZOOM_LEVELS.forEach(zoom => {
    const tileBounds = getTileBounds(bounds, zoom);
    totalTiles += (tileBounds.maxX - tileBounds.minX + 1) * (tileBounds.maxY - tileBounds.minY + 1);
  });
  
  speak(`Baixando ${totalTiles} tiles do mapa para uso offline`);
  
  for (const zoom of TILE_ZOOM_LEVELS) {
    const tileBounds = getTileBounds(bounds, zoom);
    
    for (let x = tileBounds.minX; x <= tileBounds.maxX; x++) {
      for (let y = tileBounds.minY; y <= tileBounds.maxY; y++) {
        const tileUrl = `https://a.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
        
        try {
          const response = await fetch(tileUrl);
          if (response.ok) {
            await cache.put(tileUrl, response.clone());
            downloadedTiles.add(tileUrl);
          }
        } catch (error) {
          console.warn('Erro ao baixar tile:', tileUrl, error);
        }
        
        downloadedCount++;
        if (onProgress) {
          onProgress(downloadedCount, totalTiles);
        }
        
        // Pequena pausa para não sobrecarregar
        if (downloadedCount % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }
  }
  
  speak(`Download concluído: ${downloadedCount} tiles baixados`);
}

// Calcula bounds dos tiles
function getTileBounds(bounds, zoom) {
  const nw = map.project(bounds.getNorthWest(), zoom).divideBy(256).floor();
  const se = map.project(bounds.getSouthEast(), zoom).divideBy(256).floor();
  
  return {
    minX: Math.max(0, nw.x),
    minY: Math.max(0, nw.y),
    maxX: se.x,
    maxY: se.y
  };
}

// Rastreamento de GPS aprimorado
let lastPosition = null;
let lastHeading = 0;

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      const accuracy = pos.coords.accuracy;
      const speed = pos.coords.speed || 0;
      const heading = pos.coords.heading || calculateHeading(lastPosition, latlng);
      
      currentPosition = latlng;
      lastHeading = heading;
      
      // Atualiza posição na tela
      const posElement = document.getElementById("position");
      if (posElement) {
        posElement.textContent = `Lat/Lng: ${latlng.map(c => c.toFixed(5)).join(", ")} | Precisão: ${accuracy.toFixed(0)}m`;
      }
      
      // Atualiza informações de navegação
      if (isNavigating) {
        updateNavigationInfo(speed, heading);
      }
      
      // Atualiza marcador do usuário com direção
      const userIcon = createUserIcon(heading);
      if (!userMarker) {
        userMarker = L.marker(latlng, { icon: userIcon })
          .addTo(map)
          .bindPopup("Você está aqui");
      } else {
        userMarker.setLatLng(latlng);
        userMarker.setIcon(userIcon);
      }
      
      // Verifica proximidade apenas se estiver navegando
      if (isNavigating) {
        checkProximityAdvanced();
        
        // Auto-centraliza durante navegação
        map.setView(latlng, Math.max(map.getZoom(), 16));
      }
      
      lastPosition = latlng;
    },
    (err) => {
      console.error("Erro de GPS:", err);
      speak("Erro no GPS. Verifique as permissões de localização.");
    },
    { 
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 1000
    }
  );
} else {
  alert("Geolocalização não é suportada neste navegador.");
}

// Calcula direção entre dois pontos
function calculateHeading(from, to) {
  if (!from || !to) return 0;
  
  const lat1 = from[0] * Math.PI / 180;
  const lat2 = to[0] * Math.PI / 180;
  const deltaLng = (to[1] - from[1]) * Math.PI / 180;
  
  const x = Math.sin(deltaLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  
  const heading = Math.atan2(x, y) * 180 / Math.PI;
  return (heading + 360) % 360;
}

// Atualiza informações de navegação
function updateNavigationInfo(speed, heading) {
  const speedKmh = (speed || 0) * 3.6; // converte m/s para km/h
  
  // Atualiza velocidade
  const speedElement = document.getElementById('currentSpeed');
  if (speedElement) {
    speedElement.textContent = `Velocidade: ${speedKmh.toFixed(0)} km/h`;
  }
  
  if (routePoints.length > 0 && currentPosition) {
    // Encontra próximo waypoint
    let nextPoint = routePoints[currentWaypointIndex];
    if (nextPoint) {
      const distance = map.distance(currentPosition, [nextPoint.lat, nextPoint.lng]);
      
      // Atualiza distância
      const distanceElement = document.getElementById('currentDistance');
      if (distanceElement) {
        if (distance < 1000) {
          distanceElement.textContent = `Distância: ${distance.toFixed(0)}m`;
        } else {
          distanceElement.textContent = `Distância: ${(distance/1000).toFixed(1)}km`;
        }
      }
      
      // Atualiza próximo waypoint
      const waypointElement = document.getElementById('nextWaypoint');
      if (waypointElement) {
        waypointElement.textContent = `Ponto ${currentWaypointIndex + 1} de ${routePoints.length}`;
      }
    }
  }
}

// Botão centralizar
document.getElementById("centerMe").onclick = () => {
  if (currentPosition) {
    map.setView(currentPosition, 17);
  } else {
    alert("Posição ainda não disponível.");
  }
};

// Verificação avançada de proximidade
function checkProximityAdvanced() {
  if (!routePoints.length || !currentPosition) return;
  
  const currentPoint = routePoints[currentWaypointIndex];
  if (!currentPoint) return;
  
  const distance = map.distance(currentPosition, [currentPoint.lat, currentPoint.lng]);
  
  // Avisos de aproximação
  if (distance < 100 && !currentPoint.warned100) {
    speak(`Em 100 metros, ponto ${currentWaypointIndex + 1}`);
    currentPoint.warned100 = true;
  } else if (distance < 50 && !currentPoint.warned50) {
    speak(`Em 50 metros, ponto ${currentWaypointIndex + 1}`);
    currentPoint.warned50 = true;
  } else if (distance < 20) {
    speak(`Ponto ${currentWaypointIndex + 1} alcançado`);
    currentWaypointIndex++;
    
    // Verifica se chegou ao destino
    if (currentWaypointIndex >= routePoints.length) {
      speak("Destino alcançado! Navegação concluída.");
      stopNavigation();
    } else {
      const remaining = routePoints.length - currentWaypointIndex;
      speak(`Próximo: ponto ${currentWaypointIndex + 1}. Restam ${remaining} pontos.`);
    }
  }
}

// Função de síntese de voz aprimorada
function speak(text) {
  if (isMuted || !('speechSynthesis' in window)) return;
  
  // Cancela falas anteriores
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'pt-BR';
  utterance.rate = 0.9;
  utterance.volume = 0.8;
  utterance.pitch = 1.0;
  
  speechSynthesis.speak(utterance);
}

// Parser GPX aprimorado
function parseGPX(gpxText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, "text/xml");
  
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Erro ao analisar arquivo GPX: XML inválido");
  }
  
  const tracks = [];
  const waypoints = [];
  const routeData = [];
  
  // Extrai tracks
  const trkElements = xmlDoc.querySelectorAll('trk');
  trkElements.forEach(trk => {
    const trksegs = trk.querySelectorAll('trkseg');
    trksegs.forEach(trkseg => {
      const trkpts = trkseg.querySelectorAll('trkpt');
      const points = [];
      
      trkpts.forEach((trkpt, index) => {
        const lat = parseFloat(trkpt.getAttribute('lat'));
        const lon = parseFloat(trkpt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          points.push([lat, lon]);
          routeData.push({ lat, lng: lon, index, warned50: false, warned100: false });
        }
      });
      
      if (points.length > 0) {
        tracks.push(points);
      }
    });
  });
  
  // Extrai waypoints
  const wptElements = xmlDoc.querySelectorAll('wpt');
  wptElements.forEach(wpt => {
    const lat = parseFloat(wpt.getAttribute('lat'));
    const lon = parseFloat(wpt.getAttribute('lon'));
    const name = wpt.querySelector('name')?.textContent || 'Waypoint';
    
    if (!isNaN(lat) && !isNaN(lon)) {
      waypoints.push({ lat, lon, name });
    }
  });
  
  return { tracks, waypoints, routeData };
}

// Carrega arquivo GPX com download offline
async function loadGPX(filePath) {
  console.log("Tentando carregar GPX:", filePath);
  
  // Remove camada anterior se existir
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
  }
  
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    
    const gpxText = await response.text();
    console.log("Arquivo GPX carregado, analisando...");
    
    const gpxData = parseGPX(gpxText);
    console.log("GPX analisado:", gpxData);
    
    if (gpxData.tracks.length === 0) {
      throw new Error("Nenhuma track encontrada no arquivo GPX");
    }
    
    // Define pontos da rota para navegação
    routePoints = gpxData.routeData;
    currentWaypointIndex = 0;
    
    // Cria grupo de camadas
    gpxLayer = L.layerGroup();
    gpxPoints = [];
    
    // Adiciona tracks ao mapa
    gpxData.tracks.forEach((track, trackIndex) => {
      if (track.length > 0) {
        const polyline = L.polyline(track, {
          color: '#e74c3c',
          weight: 5,
          opacity: 0.8
        });
        
        gpxLayer.addLayer(polyline);
        
        // Adiciona pontos para verificação de proximidade
        track.forEach(point => {
          gpxPoints.push({ lat: point[0], lon: point[1] });
        });
        
        // Marcadores de início e fim
        if (track.length > 1) {
          const startMarker = L.marker(track[0], {
            icon: L.icon({
              iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiMyN2FlNjAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8cG9seWdvbiBwb2ludHM9IjE2LDggMjIsMjAgMTYsMTggMTAsMjAiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })
          }).bindPopup("🏁 Início da rota");
          
          const endMarker = L.marker(track[track.length - 1], {
            icon: L.icon({
              iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiNlNzRjM2MiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8cmVjdCB4PSI4IiB5PSIxNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjQiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            })
          }).bindPopup("🎯 Fim da rota");
          
          gpxLayer.addLayer(startMarker);
          gpxLayer.addLayer(endMarker);
        }
      }
    });
    
    // Adiciona waypoints
    gpxData.waypoints.forEach(wp => {
      const marker = L.marker([wp.lat, wp.lon], {
        icon: L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTQiIGZpbGw9IiNmMzljMTIiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8cG9seWdvbiBwb2ludHM9IjE2LDYgMjAsMjAgMTYsMTYgMTIsMjAiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        })
      }).bindPopup(`📍 ${wp.name}`);
      
      gpxLayer.addLayer(marker);
    });
    
    // Adiciona ao mapa
    gpxLayer.addTo(map);
    
    // Ajusta visualização
    const group = new L.featureGroup(gpxLayer.getLayers());
    const bounds = group.getBounds().pad(0.2);
    map.fitBounds(bounds);
    
    console.log(`GPX carregado: ${routePoints.length} pontos de navegação`);
    speak(`Rota carregada com ${routePoints.length} pontos`);
    
    // Download tiles offline para a área da rota
    if (isNavigating) {
      const progressDiv = document.createElement('div');
      progressDiv.id = 'downloadProgress';
      progressDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        text-align: center;
      `;
      progressDiv.innerHTML = '<div>Preparando mapa offline...</div><div id="progressText">0%</div>';
      document.body.appendChild(progressDiv);
      
      await downloadTilesForBounds(bounds, (current, total) => {
        const percent = Math.round((current / total) * 100);
        document.getElementById('progressText').textContent = `${percent}% (${current}/${total})`;
      });
      
      progressDiv.remove();
    }
    
  } catch (error) {
    console.error("Erro ao carregar GPX:", error);
    speak("Erro ao carregar rota: " + error.message);
    throw error;
  }
}

// Carrega lista de rotas
fetch('routes.json')
  .then(res => {
    if (!res.ok) {
      throw new Error('Arquivo routes.json não encontrado');
    }
    return res.json();
  })
  .then(data => {
    console.log("Rotas carregadas:", data);
    const select = document.getElementById('routeSelect');
    
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }
    
    data.forEach(route => {
      const option = document.createElement('option');
      option.value = route.file;
      option.textContent = route.name;
      select.appendChild(option);
    });
  })
  .catch(error => {
    console.error("Erro ao carregar routes.json:", error);
    speak("Erro ao carregar lista de rotas");
  });

// Botão iniciar navegação
document.getElementById("startNav").onclick = async () => {
  const selected = document.getElementById("routeSelect").value;
  
  if (!selected) {
    alert("Selecione uma rota primeiro.");
    return;
  }
  
  console.log("Iniciando navegação com:", selected);
  speak("Iniciando navegação. Preparando mapa offline...");
  
  try {
    // Ativa modo navegação
    isNavigating = true;
    await toggleFullscreen();
    
    // Carrega a rota com download offline
    await loadGPX(selected);
    
    speak("Navegação iniciada. Siga as instruções de voz.");
    
  } catch (error) {
    isNavigating = false;
    speak("Erro ao iniciar navegação: " + error.message);
    await toggleFullscreen(); // Volta ao modo normal
    console.error("Erro na navegação:", error);
  }
};