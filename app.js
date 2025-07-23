if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js');
}

const routeList = document.getElementById('routeList');
const upload = document.getElementById('gpxUpload');
const themeToggle = document.getElementById('themeToggle');
const dashboard = document.getElementById('dashboard');
let gpxLayer;

let db;
const request = indexedDB.open("gpxRoutes", 1);
request.onupgradeneeded = function(e) {
  db = e.target.result;
  db.createObjectStore("routes", { keyPath: "name" });
};
request.onsuccess = function(e) {
  db = e.target.result;
  loadSavedRoutes();
};

function saveToDB(fileObj) {
  const tx = db.transaction("routes", "readwrite");
  tx.objectStore("routes").put(fileObj);
  tx.oncomplete = loadSavedRoutes;
}

function loadSavedRoutes() {
  const tx = db.transaction("routes", "readonly");
  const store = tx.objectStore("routes");
  const req = store.getAll();
  req.onsuccess = function() {
    displayRoutes(req.result);
  };
}

function displayRoutes(routes) {
  routeList.innerHTML = '';
  routes.forEach((file, index) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${file.displayName || file.name}</strong>
      <button onclick="loadGPX('${file.name}')">Iniciar</button>
    `;
    routeList.appendChild(li);
  });
}

upload.addEventListener('change', e => {
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = evt => {
      saveToDB({ name: file.name, content: evt.target.result, displayName: file.name });
    };
    reader.readAsText(file);
  });
});

function loadGPX(name) {
  const tx = db.transaction("routes", "readonly");
  const store = tx.objectStore("routes");
  const req = store.get(name);
  req.onsuccess = () => {
    if (gpxLayer) map.removeLayer(gpxLayer);
    gpxLayer = new L.GPX(req.result.content, { async: true }).on("loaded", e => {
      map.fitBounds(e.target.getBounds());
      speak("Rota carregada com sucesso");
      showStats(e.target);
    }).addTo(map);
  };
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

const map = L.map('map').setView([-22.2171, -48.7173], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('dark', themeToggle.checked);
});