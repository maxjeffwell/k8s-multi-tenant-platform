import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import '../styles/TopologyViewer.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function TopologyViewer() {
  const [topologyData, setTopologyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const canvasRef = useRef(null);

  const fetchTopologyData = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/grafana/topology/data`);
      setTopologyData(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  const drawTopology = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set up layout
    const { nodes, edges } = topologyData;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    // Position nodes in a circle
    const nodePositions = new Map();
    nodes.forEach((node, index) => {
      const angle = (index * 2 * Math.PI) / nodes.length;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      nodePositions.set(node.id, { x, y, node });
    });

    // Draw edges
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 2;
    edges.forEach((edge) => {
      const source = nodePositions.get(edge.source);
      const target = nodePositions.get(edge.target);

      if (source && target) {
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        const arrowSize = 10;
        ctx.beginPath();
        ctx.moveTo(target.x, target.y);
        ctx.lineTo(
          target.x - arrowSize * Math.cos(angle - Math.PI / 6),
          target.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          target.x - arrowSize * Math.cos(angle + Math.PI / 6),
          target.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = '#6b7280';
        ctx.fill();
      }
    });

    // Draw nodes
    nodePositions.forEach(({ x, y, node }) => {
      const isSelected = selectedNode?.id === node.id;
      const nodeRadius = 40;

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, 2 * Math.PI);

      // Color by namespace - generate consistent colors based on namespace name
      const namespaceColors = [
        { base: '#6366f1', selected: '#4f46e5' }, // indigo
        { base: '#10b981', selected: '#059669' }, // emerald
        { base: '#8b5cf6', selected: '#7c3aed' }, // purple
        { base: '#f59e0b', selected: '#d97706' }, // amber
        { base: '#ec4899', selected: '#db2777' }, // pink
        { base: '#06b6d4', selected: '#0891b2' }, // cyan
      ];
      const namespaceIndex = Array.from(new Set(nodes.map(n => n.subTitle))).indexOf(node.subTitle);
      const colorSet = namespaceColors[namespaceIndex % namespaceColors.length];
      ctx.fillStyle = isSelected ? colorSet.selected : colorSet.base;

      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : '#e5e7eb';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.stroke();

      // Node label (pod name - shortened)
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const shortName = node.title.split('-').slice(0, 2).join('-');
      ctx.fillText(shortName, x, y - 5);

      // Network traffic
      ctx.font = '9px sans-serif';
      ctx.fillText(`${node.mainStat}B/s`, x, y + 8);
    });

    // Store positions for click detection
    canvas.nodePositions = nodePositions;
  }, [topologyData, selectedNode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: fetch data on mount
    fetchTopologyData();
    const interval = setInterval(fetchTopologyData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchTopologyData]);

  useEffect(() => {
    if (topologyData && canvasRef.current) {
      drawTopology();
    }
  }, [topologyData, drawTopology]);

  const handleCanvasClick = (event) => {
    if (!canvasRef.current || !topologyData) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Check if click is on a node
    const nodePositions = canvas.nodePositions;
    if (!nodePositions) return;

    let clickedNode = null;
    nodePositions.forEach(({ x: nodeX, y: nodeY, node }) => {
      const distance = Math.sqrt((x - nodeX) ** 2 + (y - nodeY) ** 2);
      if (distance <= 40) {
        clickedNode = node;
      }
    });

    setSelectedNode(clickedNode);
  };

  if (loading) {
    return (
      <div className="topology-viewer">
        <div className="loading">Loading topology...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="topology-viewer">
        <div className="error">Error loading topology: {error}</div>
      </div>
    );
  }

  return (
    <div className="topology-viewer">
      <div className="topology-header">
        <h3>Service Topology</h3>
        <div className="topology-stats">
          <span className="stat">
            <strong>{topologyData.metadata.total_nodes}</strong> Nodes
          </span>
          <span className="stat">
            <strong>{topologyData.metadata.total_edges}</strong> Connections
          </span>
          <span className="stat">
            <strong>{topologyData.metadata.namespaces.length}</strong> Namespaces
          </span>
        </div>
      </div>

      <div className="topology-content">
        <div className="topology-canvas-container">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onClick={handleCanvasClick}
            style={{ cursor: 'pointer' }}
          />
        </div>

        {selectedNode && (
          <div className="node-details">
            <h4>Node Details</h4>
            <div className="detail-row">
              <span className="label">Pod:</span>
              <span className="value">{selectedNode.title}</span>
            </div>
            <div className="detail-row">
              <span className="label">Namespace:</span>
              <span className="value">{selectedNode.subTitle}</span>
            </div>
            <div className="detail-row">
              <span className="label">Network Traffic:</span>
              <span className="value">{selectedNode.mainStat} B/s</span>
            </div>
            <button
              className="close-btn"
              onClick={() => setSelectedNode(null)}
            >
              Close
            </button>
          </div>
        )}
      </div>

      <div className="topology-legend">
        <h4>Legend</h4>
        <div className="legend-items">
          {topologyData?.metadata?.namespaces?.map((ns, index) => {
            const colors = ['#6366f1', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
            return (
              <div key={ns} className="legend-item">
                <div className="legend-color" style={{ background: colors[index % colors.length] }}></div>
                <span>{ns}</span>
              </div>
            );
          })}
          <div className="legend-item">
            <div className="legend-line"></div>
            <span>Network Connection</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TopologyViewer;
