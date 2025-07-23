if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

const routeList = document.getElementById('routeList');
const dashboard = document.getElementById('dashboard');
let map = L.map('map').setView([-22.2171, -48.7173], 14);
let gpxLayer, userMarker;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// Ativar localização
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(pos => {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    if (!userMarker) {
      userMarker = L.marker(latlng).addTo(map).bindPopup("Você está aqui");
    } else {
      userMarker.setLatLng(latlng);
    }
  }, err => {
    alert("GPS não disponível: " + err.message);
  });
} else {
  alert("Geolocalização não suportada.");
}

// Carregar rotas do routes.json
fetch('routes.json')
  .then(res => res.json())
  .then(data => {
    data.forEach(route => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${route.name}</strong>: ${route.description}
        <button onclick="loadGPX('${route.file}')">Iniciar</button>`;
      routeList.appendChild(li);
    });
  });

function loadGPX(file) {
  if (gpxLayer) map.removeLayer(gpxLayer);
  gpxLayer = new L.GPX(file, { async: true }).on("loaded", e => {
    map.fitBounds(e.target.getBounds());
    speak("Rota carregada com sucesso");
    showStats(e.target);
  }).addTo(map);
}

function showStats(layer) {
  const name = layer.get_name() || "Rota";
  const distance = (layer.get_distance() / 1000).toFixed(2);
  const elevation = layer.get_elevation_gain().toFixed(1);
  dashboard.innerHTML = `<p><strong>${name}</strong><br>Distância: ${distance} km<br>Subida: ${elevation} m</p>`;
}

function speak(msg) {
  const u = new SpeechSynthesisUtterance(msg);
  u.lang = 'pt-BR';
  speechSynthesis.speak(u);
}