if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');

const map = L.map('map').setView([-22.2171, -48.7173], 15);
let gpxLayer, userMarker, gpxPoints = [], currentPosition = null;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

const customIcon = L.icon({
  iconUrl: 'icons/usuario.png',
  iconSize: [48, 48],
  iconAnchor: [24, 48],
  popupAnchor: [0, -48]
});

navigator.geolocation.watchPosition(pos => {
  const latlng = [pos.coords.latitude, pos.coords.longitude];
  currentPosition = latlng;
  document.getElementById("position").textContent = "Lat/Lng: " + latlng.map(c => c.toFixed(5)).join(", ");
  if (!userMarker) userMarker = L.marker(latlng, { icon: customIcon }).addTo(map).bindPopup("Você está aqui");
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

function loadGPX(file) {
  if (gpxLayer) map.removeLayer(gpxLayer);
  gpxLayer = new L.GPX(file, { async: true }).on("loaded", e => {
    map.fitBounds(e.target.getBounds());
    speak("Rota carregada com sucesso.");
    gpxPoints = e.target.get_track_points().map(p => ({ lat: p.lat, lon: p.lon }));
  }).addTo(map);
}

fetch('routes.json').then(res => res.json()).then(data => {
  const select = document.getElementById('routeSelect');
  data.forEach(route => {
    const opt = document.createElement('option');
    opt.value = route.file;
    opt.textContent = route.name;
    select.appendChild(opt);
  });
});

document.getElementById("startNav").onclick = () => {
  const selected = document.getElementById("routeSelect").value;
  if (selected) loadGPX(selected);
  else alert("Selecione uma rota.");
};