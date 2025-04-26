function dijkstra(graph, startNode, endNode) {
    const distances = {};
    const previous = {};
    const queue = new Set(graph.nodes);
  
    // Başlangıç düğümleri ve mesafeleri ayarla
    graph.nodes.forEach(node => {
      distances[node] = Infinity;
      previous[node] = null;
    });
    distances[startNode] = 0;
  
    while (queue.size > 0) {
      // En küçük mesafeye sahip düğümü bul
      let currentNode = null;
      queue.forEach(node => {
        if (currentNode === null || distances[node] < distances[currentNode]) {
          currentNode = node;
        }
      });
  
      // Eğer hedef düğüme ulaşıldıysa, çık
      if (currentNode === endNode) break;
  
      queue.delete(currentNode);
  
      const neighbors = graph.edges[currentNode] || [];
      neighbors.forEach(neighbor => {
        const alt = distances[currentNode] + neighbor.weight;
        if (alt < distances[neighbor.node]) {
          distances[neighbor.node] = alt;
          previous[neighbor.node] = currentNode;
        }
      });
    }
  
    // En kısa yolu ve toplam mesafeyi oluştur
    const path = [];
    let current = endNode;
    while (current !== null) {
      path.unshift(current);
      current = previous[current];
    }
  
    return {
      path,
      distance: distances[endNode]
    };
  }
  