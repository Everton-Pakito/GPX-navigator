// Registra o Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

// Inicializa o mapa
const map = L.map('map').setView([-22.2171, -48.7173], 15);
let gpxLayer, userMarker, gpxPoints = [], currentPosition = null;
let isNavigating = false;

// Adiciona camada de tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Ícone customizado para o usuário
const customIcon = L.icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCA0OCA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMjAiIGZpbGw9IiMzNDk4ZGIiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIyNCIgcj0iMTAiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24]
});

// Função para alternar tela cheia
function toggleFullscreen() {
  const mapElement = document.getElementById('map');
  
  if (isNavigating) {
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
    
    // Adiciona botão de voltar
    addBackButton();
  } else {
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
    
    // Remove botão de voltar
    removeBackButton();
  }
  
  // Força o mapa a se redimensionar
  setTimeout(() => {
    map.invalidateSize();
  }, 100);
}

// Adiciona botão de voltar
function addBackButton() {
  if (document.getElementById('backButton')) return;
  
  const backButton = document.createElement('button');
  backButton.id = 'backButton';
  backButton.innerHTML = '← Voltar';
  backButton.style.position = 'absolute';
  backButton.style.top = '10px';
  backButton.style.left = '10px';
  backButton.style.zIndex = '1001';
  backButton.style.padding = '10px 15px';
  backButton.style.backgroundColor = '#3498db';
  backButton.style.color = 'white';
  backButton.style.border = 'none';
  backButton.style.borderRadius = '5px';
  backButton.style.cursor = 'pointer';
  backButton.style.fontSize = '14px';
  backButton.style.fontFamily = 'sans-serif';
  
  backButton.onclick = () => {
    isNavigating = false;
    toggleFullscreen();
  };
  
  document.body.appendChild(backButton);
}

// Remove botão de voltar
function removeBackButton() {
  const backButton = document.getElementById('backButton');
  if (backButton) {
    backButton.remove();
  }
}

// Rastreamento de GPS
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const latlng = [pos.coords.latitude, pos.coords.longitude];
      currentPosition = latlng;
      
      // Atualiza posição na tela
      const posElement = document.getElementById("position");
      if (posElement) {
        posElement.textContent = "Lat/Lng: " + latlng.map(c => c.toFixed(5)).join(", ");
      }
      
      // Atualiza marcador do usuário
      if (!userMarker) {
        userMarker = L.marker(latlng, { icon: customIcon })
          .addTo(map)
          .bindPopup("Você está aqui");
      } else {
        userMarker.setLatLng(latlng);
      }
      
      // Verifica proximidade apenas se estiver navegando
      if (isNavigating) {
        checkProximity();
      }
    },
    (err) => {
      console.error("Erro de GPS:", err);
      alert("Erro de GPS: " + err.message);
    },
    { 
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
} else {
  alert("Geolocalização não é suportada neste navegador.");
}

// Botão centralizar
document.getElementById("centerMe").onclick = () => {
  if (currentPosition) {
    map.setView(currentPosition, 17);
  } else {
    alert("Posição ainda não disponível.");
  }
};

// Verifica proximidade com pontos da rota
function checkProximity() {
  if (!gpxPoints.length || !currentPosition) return;
  
  gpxPoints.forEach((pt, idx) => {
    const dist = map.distance(currentPosition, [pt.lat, pt.lon]);
    if (dist < 20) {
      speak(`Ponto ${idx + 1} alcançado`);
    }
  });
}

// Função de síntese de voz
function speak(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

// Parser GPX customizado
function parseGPX(gpxText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, "text/xml");
  
  // Verifica se há erros no XML
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Erro ao analisar arquivo GPX: XML inválido");
  }
  
  const tracks = [];
  const waypoints = [];
  
  // Extrai tracks
  const trkElements = xmlDoc.querySelectorAll('trk');
  trkElements.forEach(trk => {
    const trksegs = trk.querySelectorAll('trkseg');
    trksegs.forEach(trkseg => {
      const trkpts = trkseg.querySelectorAll('trkpt');
      const points = [];
      
      trkpts.forEach(trkpt => {
        const lat = parseFloat(trkpt.getAttribute('lat'));
        const lon = parseFloat(trkpt.getAttribute('lon'));
        if (!isNaN(lat) && !isNaN(lon)) {
          points.push([lat, lon]);
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
  
  return { tracks, waypoints };
}

// Carrega arquivo GPX
function loadGPX(filePath) {
  console.log("Tentando carregar GPX:", filePath);
  
  // Remove camada anterior se existir
  if (gpxLayer) {
    map.removeLayer(gpxLayer);
  }
  
  // Verifica se o arquivo existe
  fetch(filePath)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      return response.text();
    })
    .then(gpxText => {
      console.log("Arquivo GPX carregado, analisando...");
      
      // Parse do GPX
      const gpxData = parseGPX(gpxText);
      console.log("GPX analisado:", gpxData);
      
      if (gpxData.tracks.length === 0) {
        throw new Error("Nenhuma track encontrada no arquivo GPX");
      }
      
      // Cria grupo de camadas
      gpxLayer = L.layerGroup();
      gpxPoints = [];
      
      // Adiciona tracks ao mapa
      gpxData.tracks.forEach((track, trackIndex) => {
        if (track.length > 0) {
          // Cria polyline para a track
          const polyline = L.polyline(track, {
            color: '#e74c3c',
            weight: 4,
            opacity: 0.8
          });
          
          gpxLayer.addLayer(polyline);
          
          // Adiciona pontos ao array para verificação de proximidade
          track.forEach(point => {
            gpxPoints.push({ lat: point[0], lon: point[1] });
          });
          
          // Adiciona marcadores de início e fim
          if (track.length > 1) {
            const startMarker = L.marker(track[0], {
              icon: L.icon({
                iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMyN2FlNjAiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IndoaXRlIj4KPHN0eWxlPi5zdDB7ZmlsbDojZmZmZmZmO308L3N0eWxlPgo8cGF0aCBjbGFzcz0ic3QwIiBkPSJNOCw1djE0bDExLTdMOCw1eiIvPgo8L3N2Zz4KPC9zdmc+',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }).bindPopup("Início da rota");
            
            const endMarker = L.marker(track[track.length - 1], {
              icon: L.icon({
                iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiNlNzRjM2MiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IndoaXRlIj4KPHN0eWxlPi5zdDB7ZmlsbDojZmZmZmZmO308L3N0eWxlPgo8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMTksMTNINXYtMkgxOVYxM3oiLz4KPC9zdmc+Cjwvc3ZnPg==',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })
            }).bindPopup("Fim da rota");
            
            gpxLayer.addLayer(startMarker);
            gpxLayer.addLayer(endMarker);
          }
        }
      });
      
      // Adiciona waypoints
      gpxData.waypoints.forEach(wp => {
        const marker = L.marker([wp.lat, wp.lon], {
          icon: L.icon({
            iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiNmMzljMTIiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IndoaXRlIj4KPHN0eWxlPi5zdDB7ZmlsbDojZmZmZmZmO308L3N0eWxlPgo8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMTIsMnYyMGwtNy03VjloN1YyeiIvPgo8L3N2Zz4KPC9zdmc+',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          })
        }).bindPopup(wp.name);
        
        gpxLayer.addLayer(marker);
      });
      
      // Adiciona ao mapa
      gpxLayer.addTo(map);
      
      // Ajusta visualização
      const group = new L.featureGroup(gpxLayer.getLayers());
      map.fitBounds(group.getBounds().pad(0.1));
      
      console.log(`GPX carregado com sucesso: ${gpxPoints.length} pontos`);
      speak("Rota carregada com sucesso.");
    })
    .catch(error => {
      console.error("Erro ao carregar arquivo GPX:", error);
      alert("Erro ao carregar arquivo GPX: " + error.message);
    });
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
    
    // Limpa opções existentes (exceto a primeira)
    while (select.children.length > 1) {
      select.removeChild(select.lastChild);
    }
    
    // Adiciona as rotas
    data.forEach(route => {
      const option = document.createElement('option');
      option.value = route.file;
      option.textContent = route.name;
      select.appendChild(option);
    });
  })
  .catch(error => {
    console.error("Erro ao carregar routes.json:", error);
    alert("Erro ao carregar lista de rotas: " + error.message);
  });

// Botão iniciar navegação
document.getElementById("startNav").onclick = () => {
  const selected = document.getElementById("routeSelect").value;
  
  if (!selected) {
    alert("Selecione uma rota primeiro.");
    return;
  }
  
  console.log("Iniciando navegação com:", selected);
  
  // Carrega a rota
  loadGPX(selected);
  
  // Ativa modo navegação
  isNavigating = true;
  toggleFullscreen();
  
  speak("Iniciando navegação");
};