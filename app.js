if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');

const map = L.map('map').setView([-22.2171, -48.7173], 15);
let gpxLayer, userMarker, gpxPoints = [], currentPosition = null;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

navigator.geolocation.watchPosition(pos => {
  const latlng = [pos.coords.latitude, pos.coords.longitude];
  currentPosition = latlng;
  document.getElementById("position").textContent = "Lat/Lng: " + latlng.map(c => c.toFixed(5)).join(", ");
  if (!userMarker) userMarker = L.marker(latlng).addTo(map).bindPopup("Você está aqui");
  else userMarker.setLatLng(latlng);
  checkProximity();
}, err => alert("Erro de GPS: " + err.message), { enableHighAccuracy: true });

document.getElementById("centerMe").onclick = () => {
  if (currentPosition) map.setView(currentPosition, 17);
};

function checkProximity() {
  if (!gpxPoints.length || !currentPosition) return;
  gpxPoints.forEach((pt, idx) => {
    const dist = map.distance(currentPosition, [pt.lat, pt.lon]);
    if (dist < 20) speak(`Ponto ${idx + 1} alcançado`);
  });
}

function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR';
  speechSynthesis.speak(u);
}

fetch('routes.json').then(res => res.json()).then(data => {
  const list = document.getElementById('routeList');
  data.forEach(route => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${route.name}</strong>: ${route.description}
      <button onclick="loadGPX('${route.file}')">Iniciar</button>`;
    list.appendChild(li);
  });
});

function loadGPX(file) {
  if (gpxLayer) map.removeLayer(gpxLayer);
  gpxLayer = new L.GPX(file, { async: true }).on("loaded", e => {
    map.fitBounds(e.target.getBounds());
    speak("Rota carregada com sucesso.");
    gpxPoints = e.target.get_track_points().map(p => ({ lat: p.lat, lon: p.lon }));
  }).addTo(map);
}