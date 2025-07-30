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
  iconUrl: 'icons/usuario.png',
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -48]
});

// Função para alternar tela cheia
function toggleFullscreen() {
  const mapElement = document.getElementById('map');
  const appElement = document.getElementById('app');
  
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
    .then(gpxData => {
      // Cria nova camada GPX
      gpxLayer = new L.GPX(gpxData, {
        async: true,
        marker_options: {
          startIconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
          endIconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        }
      });
      
      gpxLayer.on("loaded", function(e) {
        console.log("GPX carregado com sucesso");
        map.fitBounds(e.target.getBounds());
        speak("Rota carregada com sucesso.");
        
        // Extrai pontos da rota
        gpxPoints = [];
        const tracks = e.target.getLayers();
        tracks.forEach(track => {
          if (track.getLatLngs) {
            const latlngs = track.getLatLngs();
            if (Array.isArray(latlngs[0])) {
              // Multi-segment track
              latlngs.forEach(segment => {
                segment.forEach(point => {
                  gpxPoints.push({ lat: point.lat, lon: point.lng });
                });
              });
            } else {
              // Single segment track
              latlngs.forEach(point => {
                gpxPoints.push({ lat: point.lat, lon: point.lng });
              });
            }
          }
        });
        
        console.log(`${gpxPoints.length} pontos extraídos da rota`);
      });
      
      gpxLayer.on("error", function(e) {
        console.error("Erro ao carregar GPX:", e);
        alert("Erro ao processar arquivo GPX");
      });
      
      gpxLayer.addTo(map);
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