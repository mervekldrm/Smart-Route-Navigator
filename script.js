// Haritayı başlat
const map = L.map('map').setView([51.505, -0.09], 13);

// OpenStreetMap katmanı ekle
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// graph-data.json verisini yükle
let graphData;

fetch('graph-data.json')
  .then(response => response.json())
  .then(data => {
    graphData = data;
    addNodesToMap(data);
  })
  .catch(error => {
    console.error('Error loading graph data:', error);
  });

// Düğümleri haritaya ekleme fonksiyonu
function addNodesToMap(data) {
  const coordinates = data.coordinates;
  for (let node in coordinates) {
    const [lat, lng] = coordinates[node];
    L.marker([lat, lng]).addTo(map)
      .bindPopup(`Node: ${node}`)
      .openPopup();
  }
}
