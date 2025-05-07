let map;
let graphData;
let startNode = null;
let endNode = null;
let pathLine = null;

map = L.map('map').setView([39.9208, 32.8541], 6); // Türkiye merkezi (Ankara)

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Routing kontrolü için OpenStreetMap kullanın (API anahtarı gerektirmez)
let routingControl = L.Routing.control({
  waypoints: [],
  lineOptions: {
    styles: [{color: 'blue', opacity: 0.7, weight: 6}]
  },
  router: new L.Routing.OSRMv1({
    serviceUrl: 'https://router.project-osrm.org/route/v1'
  }),
  createMarker: function() { return null; }
}).addTo(map);

// Keşfedilmiş mesafe değerlerini önbelleğe alan bir nesne
const distanceCache = {};

// OpenStreetMap API ile iki nokta arasındaki gerçek yol mesafesini hesapla
async function getRouteDistance(fromLat, fromLng, toLat, toLng, transportMode = 'driving') {
  // Önbellekte varsa, onu kullan
  const cacheKey = `${fromLat},${fromLng}-${toLat},${toLng}-${transportMode}`;
  if (distanceCache[cacheKey]) {
    return distanceCache[cacheKey];
  }
  
  try {
    // transportMode'u OSRM formatına çevir
    let osrmMode = transportMode;
    if (transportMode === 'car') osrmMode = 'driving';
    if (transportMode === 'pedestrian') osrmMode = 'foot';
    if (transportMode === 'bicycle') osrmMode = 'bike';
    
    const response = await fetch(`https://router.project-osrm.org/route/v1/${osrmMode}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`);
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // Mesafeyi metre cinsinden al
      const distance = data.routes[0].distance;
      const duration = data.routes[0].duration; // Süreyi saniye cinsinden al
      
      // Önbelleğe kaydet
      distanceCache[cacheKey] = {
        distance: distance,
        duration: duration
      };
      
      return distanceCache[cacheKey];
    } else {
      console.error('Rota bulunamadı:', data);
      // Hata durumunda kuş uçuşu mesafeyi kullan
      const airDistance = calculateDistance(fromLat, fromLng, toLat, toLng);
      
      // Farklı ulaşım modları için yaklaşık hızlar
      let speed = 13.9; // Araba için varsayılan 50 km/h (~13.9 m/s)
      if (transportMode === 'pedestrian') speed = 1.4; // Yürüme hızı ~5 km/h (1.4 m/s)
      if (transportMode === 'bicycle') speed = 4.2; // Bisiklet hızı ~15 km/h (4.2 m/s)
      
      return { 
        distance: airDistance, 
        duration: airDistance / speed 
      };
    }
  } catch (error) {
    console.error('Rota sorgusu hatası:', error);
    // Hata durumunda kuş uçuşu mesafeyi kullan
    const airDistance = calculateDistance(fromLat, fromLng, toLat, toLng);
    
    // Farklı ulaşım modları için yaklaşık hızlar
    let speed = 13.9; // Araba için varsayılan 50 km/h
    if (transportMode === 'pedestrian') speed = 1.4; // Yürüme hızı ~5 km/h
    if (transportMode === 'bicycle') speed = 4.2; // Bisiklet hızı ~15 km/h
    
    return { 
      distance: airDistance, 
      duration: airDistance / speed 
    };
  }
}

// graph-data.json yüklendikten hemen sonra çağrılacak fonksiyon
function makeGraphUndirected(graph) {
  const undirectedEdges = {};
  
  // Tüm nodelar için boş bir kenar listesi oluştur
  graph.nodes.forEach(node => {
    undirectedEdges[node] = [];
  });
  
  // Grafı güncelle
  graph.edges = undirectedEdges;
  return graph;
}

// fetch kısmını güncelle
fetch('graph-data.json')
  .then(response => response.json())
  .then(data => {
    // Grafı yönsüz hale getir
    graphData = makeGraphUndirected(data);
    addMarkers();
    drawGraphEdges();
  })
  .catch(error => console.error('Graph data loading error:', error));

function addMarkers() {
  const coords = graphData.coordinates;
  for (const node in coords) {
    const [lat, lng] = coords[node];
    const marker = L.marker([lat, lng]).addTo(map)
      .bindPopup(`Node: ${node}`);

    marker.on('click', function () {
      selectNode(node);
    });
  }
}

function drawGraphEdges() {
  // Bu fonksiyonu boş bırakarak başlangıçta kenarları çizmeyi engelliyoruz
  
  // Alternatif olarak, sadece belirli bir mesafeden küçük olanları çizebilirsiniz:
  /*
  const edges = graphData.edges;
  const coords = graphData.coordinates;

  for (const fromNode in edges) {
    edges[fromNode].forEach(edge => {
      const toNode = edge.node;
      // Sadece belirli bir ağırlıktan (örn. 100000) düşük olanları çiz
      if (edge.weight < 100000) {
        const fromCoord = coords[fromNode];
        const toCoord = coords[toNode];

        if (fromCoord && toCoord) {
          L.polyline([fromCoord, toCoord], {
            color: 'blue',
            weight: 2,
            opacity: 0.6
          }).addTo(map);
        }
      }
    });
  }
  */
}

function selectNode(node) {
  if (!startNode) {
    startNode = node;
    document.getElementById('start-node').textContent = startNode;
    alert(`Start node selected: ${startNode}`);
  } else if (!endNode) {
    endNode = node;
    document.getElementById('end-node').textContent = endNode;
    alert(`End node selected: ${endNode}`);
    calculateAndDrawPath();
  } else {
    alert('Start and End already selected. Please reset.');
  }
}

// Kullanıcı bir başlangıç ve bitiş noktası seçtiğinde gerçek rota mesafesini hesaplayan fonksiyon
async function calculateRealRouteDistance(startNode, endNode) {
  if (!startNode || !endNode) return null;
  
  const startCoord = graphData.coordinates[startNode];
  const endCoord = graphData.coordinates[endNode];
  
  if (!startCoord || !endCoord) return null;
  
  // Ulaşım modunu al
  let transportMode = 'car';
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) {
    transportMode = modeSelect.value;
  }
  
  // Gerçek rota mesafesini hesapla - ulaşım modunu geçir
  const routeInfo = await getRouteDistance(
    startCoord[0], startCoord[1], 
    endCoord[0], endCoord[1], 
    transportMode
  );
  
  // Eğer kenarlar daha önce oluşturulmadıysa, oluştur
  let edgeExists = graphData.edges[startNode].some(edge => edge.node === endNode);
  
  if (!edgeExists) {
    // Kenarı ekle
    graphData.edges[startNode].push({
      node: endNode,
      weight: routeInfo.distance
    });
    
    // Ters kenarı da ekle
    edgeExists = graphData.edges[endNode].some(edge => edge.node === startNode);
    if (!edgeExists) {
      graphData.edges[endNode].push({
        node: startNode,
        weight: routeInfo.distance
      });
    }
  }
  
  return routeInfo;
}

// calculateAndDrawPath fonksiyonunda değişiklikler
async function calculateAndDrawPath() {
  if (!startNode || !endNode) {
    alert('Lütfen başlangıç ve bitiş noktası seçin.');
    return;
  }
  
  // Yükleniyor göstergesi
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-indicator';
  loadingDiv.style.position = 'fixed';
  loadingDiv.style.top = '50%';
  loadingDiv.style.left = '50%';
  loadingDiv.style.transform = 'translate(-50%, -50%)';
  loadingDiv.style.backgroundColor = 'white';
  loadingDiv.style.padding = '20px';
  loadingDiv.style.borderRadius = '5px';
  loadingDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
  loadingDiv.style.zIndex = '1000';
  loadingDiv.innerHTML = '<h3>Rota hesaplanıyor...</h3>';
  document.body.appendChild(loadingDiv);
  
  try {
    // Ulaşım modunu al
    let transportMode = 'car';
    let profile = 'car';
    
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
      transportMode = modeSelect.value;
      switch (transportMode) {
        case 'pedestrian':
          profile = 'foot';
          break;
        case 'bicycle':
          profile = 'bike';
          break;
        default:
          profile = 'car';
      }
    }
    
    // Gerçek rota mesafesini hesapla - ulaşım modunu geçir
    const routeInfo = await calculateRealRouteDistance(startNode, endNode);
    
    // Dijkstra ile en kısa yolu hesapla
    const result = dijkstra(graphData, startNode, endNode);
    
    if (!result.path.length) {
      alert('Yol bulunamadı.');
      document.body.removeChild(loadingDiv);
      return;
    }
    
    // Yol noktalarını al
    const waypoints = result.path.map(node => {
      const [lat, lng] = graphData.coordinates[node];
      return L.latLng(lat, lng);
    });
    
    // Mevcut yolu temizle
    if (routingControl) {
      map.removeControl(routingControl);
    }
    
    // Yeni rota kontrolü oluştur
    routingControl = L.Routing.control({
      waypoints: waypoints,
      lineOptions: {
        styles: [{color: 'red', opacity: 0.8, weight: 4}]
      },
      router: new L.Routing.OSRMv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: profile
      }),
      createMarker: function() { return null; }
    }).addTo(map);
    
    // Path bilgisini güncelle
    const pathText = result.path.join(' → ');
    document.getElementById('path-nodes').innerHTML = `<strong>Path:</strong> ${pathText}`;
    
    // Bilgi panelini güncelle
    if (routeInfo) {
      // Sadece mesafeyi km cinsinden göster
      document.getElementById('distance').textContent = `${(routeInfo.distance/1000).toFixed(2)} km`;
    }
  } finally {
    // Yükleniyor göstergesini kaldır
    document.body.removeChild(loadingDiv);
  }
}

function resetSelection() {
  startNode = null;
  endNode = null;
  document.getElementById('start-node').textContent = "None";
  document.getElementById('end-node').textContent = "None";
  document.getElementById('distance').textContent = "0";
  
  // Süre bilgisini sıfırla
  if (document.getElementById('time')) {
    document.getElementById('time').textContent = "0";
  }
  
  document.getElementById('path-nodes').innerHTML = "<strong>Path:</strong>";

  // Mevcut rotayı temizle
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
  }
}

function dijkstra(graph, startNode, endNode) {
  // Mesafe tablosu
  const distances = {};
  // Önceki düğümler tablosu (yolu geri izlemek için)
  const previous = {};
  // Ziyaret edilmemiş düğümler
  const unvisited = new Set();

  // Başlangıç değerlerini ayarla
  Object.keys(graph.coordinates).forEach(node => {
    distances[node] = Infinity;
    previous[node] = null;
    unvisited.add(node);
  });
  distances[startNode] = 0;

  // Tüm düğümler ziyaret edilene kadar
  while (unvisited.size > 0) {
    // En küçük mesafeye sahip ziyaret edilmemiş düğümü bul
    let currentNode = null;
    let minDistance = Infinity;
    
    for (const node of unvisited) {
      if (distances[node] < minDistance) {
        currentNode = node;
        minDistance = distances[node];
      }
    }

    // Hedef düğüme ulaşıldıysa veya daha ileri gidilemiyorsa döngüden çık
    if (currentNode === endNode || minDistance === Infinity) {
      break;
    }

    // Mevcut düğümü ziyaret edilmiş olarak işaretle
    unvisited.delete(currentNode);

    // Komşuları kontrol et
    if (graph.edges[currentNode]) {
      for (const edge of graph.edges[currentNode]) {
        const neighbor = edge.node;
        const weight = edge.weight || 1; // Ağırlık yoksa 1 varsay
        
        // Yeni mesafeyi hesapla
        const distanceThroughCurrent = distances[currentNode] + weight;
        
        // Eğer yeni mesafe daha kısaysa güncelle
        if (distanceThroughCurrent < distances[neighbor]) {
          distances[neighbor] = distanceThroughCurrent;
          previous[neighbor] = currentNode;
        }
      }
    }
  }

  // Yolu oluştur
  const path = [];
  let current = endNode;
  
  // Yol bulunamadıysa boş dizi döndür
  if (previous[endNode] === null && startNode !== endNode) {
    return { path: [], distance: 0 };
  }
  
  // Son düğümden başlayarak geriye doğru yolu izle
  while (current) {
    path.unshift(current);
    current = previous[current];
  }

  return {
    path: path,
    distance: distances[endNode]
  };
}

// Haritaya sağ tıklama ile node ekleme özelliği
map.on('contextmenu', function(e) {
  const latlng = e.latlng;
  
  // Yeni node adını kullanıcıdan al
  const nodeName = prompt("Yeni node adı girin:");
  
  if (nodeName && nodeName.trim() !== "") {
    addNewNode(nodeName.trim(), [latlng.lat, latlng.lng]);
  }
});

// Yeni node eklemek için fonksiyon
function addNewNode(nodeName, coordinates) {
  // Eğer bu isimde bir node zaten varsa, kullanıcıya bildir
  if (graphData.coordinates[nodeName]) {
    alert(`"${nodeName}" adında bir node zaten mevcut.`);
    return;
  }
  
  // Yeni node'u graphData'ya ekle
  if (!graphData.nodes.includes(nodeName)) {
    graphData.nodes.push(nodeName);
  }
  
  // Koordinatları ekle
  graphData.coordinates[nodeName] = coordinates;
  
  // Boş kenar listesi oluştur
  if (!graphData.edges[nodeName]) {
    graphData.edges[nodeName] = [];
  }
  
  // Haritaya marker ekle
  const [lat, lng] = coordinates;
  const marker = L.marker([lat, lng]).addTo(map)
    .bindPopup(`Node: ${nodeName}`);
  
  marker.on('click', function() {
    selectNode(nodeName);
  });
  
  alert(`"${nodeName}" node'u başarıyla eklendi.`);
}

// Kenar eklemek için fonksiyon (iki node arasında bağlantı)
function addEdge(fromNode, toNode) {
  // Node'ların var olduğunu kontrol et
  if (!graphData.coordinates[fromNode] || !graphData.coordinates[toNode]) {
    alert("Bir veya her iki node bulunamadı.");
    return;
  }
  
  // İki node arasındaki mesafeyi hesapla
  const fromCoord = graphData.coordinates[fromNode];
  const toCoord = graphData.coordinates[toNode];
  
  // Haversine formülü ile iki nokta arasındaki mesafeyi hesapla (metre cinsinden)
  const weight = calculateDistance(fromCoord[0], fromCoord[1], toCoord[0], toCoord[1]);
  
  // Kenarı ekle
  const edgeExists = graphData.edges[fromNode].some(edge => edge.node === toNode);
  
  if (!edgeExists) {
    graphData.edges[fromNode].push({ node: toNode, weight });
    
    // Grafı yönsüz olarak düşünüyorsak, ters kenarı da ekle
    const reverseEdgeExists = graphData.edges[toNode].some(edge => edge.node === fromNode);
    
    if (!reverseEdgeExists) {
      if (!graphData.edges[toNode]) {
        graphData.edges[toNode] = [];
      }
      graphData.edges[toNode].push({ node: fromNode, weight });
    }
    
    // Grafiği güncelle
    drawGraphEdges();
    
    alert(`${fromNode} ve ${toNode} arasında bağlantı eklendi. Mesafe: ${(weight/1000).toFixed(2)} km`);
    return true;
  } else {
    alert("Bu kenar zaten mevcut.");
    return false;
  }
}

// İki nokta arasındaki mesafeyi hesapla (Haversine formülü, metre cinsinden)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Dünya yarıçapı, metre cinsinden
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon1 - lon2) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
           Math.cos(φ1) * Math.cos(φ2) *
           Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const distance = R * c;
  return Math.round(distance); // Metre cinsinden yuvarlanmış değer
}

// Verileri JSON olarak kaydet ve indir
function saveGraphData() {
  const jsonData = JSON.stringify(graphData, null, 2);
  
  // LocalStorage'a kaydet (geçici çözüm)
  localStorage.setItem('graphData', jsonData);
  console.log('Veri localStorage\'a kaydedildi');
  
  // Kullanıcıya indirme seçeneği sun
  const blob = new Blob([jsonData], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  
  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = 'graph-data.json';
  
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  
  URL.revokeObjectURL(url);
}

// Verileri JSON olarak proje içine kaydet
async function saveGraphDataToProject() {
  try {
    // JSON verisini oluştur
    const jsonData = JSON.stringify(graphData, null, 2);
    
    // FileSystem API desteğini kontrol et
    if ('showSaveFilePicker' in window) {
      // Dosya sistemine erişim için kullanıcıdan izin iste
      const options = {
        suggestedName: 'graph-data.json',
        types: [{
          description: 'JSON Files',
          accept: {'application/json': ['.json']}
        }],
        // Kaydedilecek dizin için başlangıç noktasını belirle
        startIn: 'documents'
      };
      
      try {
        // Kullanıcıdan dosyanın nereye kaydedileceğini seçmesini iste
        const fileHandle = await window.showSaveFilePicker(options);
        
        // Yazılabilir bir akış oluştur
        const writable = await fileHandle.createWritable();
        
        // Veriyi yaz
        await writable.write(jsonData);
        
        // Akışı kapat ve kaydet
        await writable.close();
        
        alert('Grafik verisi başarıyla kaydedildi!');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Dosya kaydetme hatası:', err);
          alert('Dosya kaydedilirken bir hata oluştu: ' + err.message);
        } else {
          console.log('Kullanıcı kaydetme işlemini iptal etti.');
        }
      }
    } else {
      // FileSystem API desteklenmiyor, alternatif çözüm sun
      alert('Tarayıcınız doğrudan dosya kaydetmeyi desteklemiyor. Grafik verisi indirilecek.');
      
      // İndirme seçeneğini sun
      const blob = new Blob([jsonData], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = 'graph-data.json';
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      URL.revokeObjectURL(url);
    }
    
    // Yedek olarak LocalStorage'a da kaydet
    localStorage.setItem('graphData', jsonData);
    
  } catch (error) {
    console.error('Veri kaydetme hatası:', error);
    alert('Bir hata oluştu: ' + error.message);
  }
}

// Dosya yükleme fonksiyonu
function loadGraphDataFromFile() {
  const fileInput = document.getElementById('load-graph-file');
  
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const loadedData = JSON.parse(e.target.result);
        // Yüklenen verileri doğrula
        if (loadedData.nodes && loadedData.edges && loadedData.coordinates) {
          graphData = loadedData;
          
          // Haritayı temizle ve yeniden çiz
          map.eachLayer(function(layer) {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
              map.removeLayer(layer);
            }
          });
          
          addMarkers();
          drawGraphEdges();
          
          alert('Grafik verisi başarıyla yüklendi!');
        } else {
          alert('Geçersiz grafik verisi formatı!');
        }
      } catch (error) {
        alert('Dosya ayrıştırılırken hata oluştu: ' + error.message);
      }
    };
    reader.readAsText(file);
  });
  
  fileInput.click();
}

// Node silme fonksiyonu
function deleteNode(nodeName) {
  if (!graphData.coordinates[nodeName]) {
    alert(`"${nodeName}" adında bir node bulunamadı.`);
    return;
  }
  
  // Node'u nodes listesinden kaldır
  const nodeIndex = graphData.nodes.indexOf(nodeName);
  if (nodeIndex > -1) {
    graphData.nodes.splice(nodeIndex, 1);
  }
  
  // Node'un koordinatlarını kaldır
  delete graphData.coordinates[nodeName];
  
  // Node'un kenarlarını kaldır
  delete graphData.edges[nodeName];
  
  // Diğer nodeların bu node'a olan bağlantılarını kaldır
  for (const node in graphData.edges) {
    graphData.edges[node] = graphData.edges[node].filter(edge => edge.node !== nodeName);
  }
  
  // Haritayı temizle ve yeniden çiz
  map.eachLayer(function(layer) {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      map.removeLayer(layer);
    }
  });
  
  addMarkers();
  drawGraphEdges();
  
  alert(`"${nodeName}" node'u başarıyla silindi.`);
}

// Arayüze node yönetim menüsü ekleyelim
const nodeManagementUI = `
<div id="node-management">
  <h3>Node Yönetimi</h3>
  <div>
    <button id="delete-node-btn">Node Sil</button>
    <button id="save-graph-btn">Grafik Verisini Kaydet</button>
    <button id="load-graph-btn">Grafik Verisi Yükle</button>
    <input type="file" id="load-graph-file" accept=".json" style="display: none;">
  </div>
  <p><small>Not: Haritaya sağ tıklayarak yeni node ekleyebilirsiniz.</small></p>
</div>
`;

// HTML'e node yönetim menüsünü ekle
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('info').insertAdjacentHTML('beforeend', nodeManagementUI);
  
  // Butonlara event listener'lar ekle
  document.getElementById('delete-node-btn').addEventListener('click', function() {
    const nodeName = prompt("Silinecek node adı:");
    if (nodeName) {
      deleteNode(nodeName);
    }
  });
  
  document.getElementById('save-graph-btn').addEventListener('click', function() {
    saveGraphDataToProject();
  });
  
  document.getElementById('load-graph-btn').addEventListener('click', function() {
    loadGraphDataFromFile();
  });

  // Ulaşım modu değiştiğinde rotayı güncelle
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) {
    modeSelect.addEventListener('change', function() {
      if (startNode && endNode) {
        calculateAndDrawPath();
      }
    });
  }
});