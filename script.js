let map;
let graphData;
let startNode = null;
let endNode = null;
let pathLine = null;

map = L.map('map').setView([51.505, -0.09], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// graph-data.json yüklendikten hemen sonra çağrılacak bir fonksiyon
function makeGraphUndirected(graph) {
  const undirectedEdges = {};
  
  // Mevcut kenarları kopyala
  for (const fromNode in graph.edges) {
    if (!undirectedEdges[fromNode]) {
      undirectedEdges[fromNode] = [];
    }
    
    // Her bir kenarı ekle
    graph.edges[fromNode].forEach(edge => {
      undirectedEdges[fromNode].push(edge);
      
      // Ters kenarı da ekle
      if (!undirectedEdges[edge.node]) {
        undirectedEdges[edge.node] = [];
      }
      
      // Eğer aynı kenar zaten yoksa ekle
      const reverseEdgeExists = undirectedEdges[edge.node].some(
        e => e.node === fromNode && e.weight === edge.weight
      );
      
      if (!reverseEdgeExists) {
        undirectedEdges[edge.node].push({
          node: fromNode,
          weight: edge.weight || 1
        });
      }
    });
  }
  
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
  const edges = graphData.edges;
  const coords = graphData.coordinates;
  const colors = ['red', 'blue', 'green', 'purple', 'orange', 'darkcyan', 'magenta', 'gold'];
  let colorIndex = 0;

  for (const fromNode in edges) {
    edges[fromNode].forEach(edge => {
      const toNode = edge.node;

      const fromCoord = coords[fromNode];
      const toCoord = coords[toNode];

      if (fromCoord && toCoord) {
        L.polyline([fromCoord, toCoord], {
          color: colors[colorIndex % colors.length],
          weight: 3,
          opacity: 0.8
        }).addTo(map);

        colorIndex++;
      }
    });
  }
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

function calculateAndDrawPath() {
  const result = dijkstra(graphData, startNode, endNode);

  if (!result.path.length) {
    alert('No path found.');
    return;
  }

  const distanceKm = (result.distance / 1000).toFixed(2); // Metreyi kilometreye çeviriyoruz
  document.getElementById('distance').textContent = `${distanceKm} km`;
  
  // Güzergahı yazdır
  const pathText = result.path.join(' → ');
  document.getElementById('path-nodes').innerHTML = `Path: ${pathText}`;

  const latlngs = result.path.map(node => {
    const [lat, lng] = graphData.coordinates[node];
    return [lat, lng];
  });

  if (pathLine) {
    map.removeLayer(pathLine);
  }

  pathLine = L.polyline(latlngs, { color: 'blue', weight: 4 }).addTo(map);
}

function resetSelection() {
  startNode = null;
  endNode = null;
  document.getElementById('start-node').textContent = "None";
  document.getElementById('end-node').textContent = "None";
  document.getElementById('distance').textContent = "0";
  document.getElementById('path-nodes').innerHTML = "Path: ";

  if (pathLine) {
    map.removeLayer(pathLine);
    pathLine = null;
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
