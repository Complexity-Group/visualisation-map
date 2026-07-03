<script setup lang="ts">
import { ref, onMounted, shallowRef } from 'vue';
import { map, divIcon, tileLayer, marker, polygon, type Map as LeafletMap, type Layer } from 'leaflet';

// Types
interface LocationItem {
  id: number;
  name: string;
  coords: [number, number];
  zoom: number;
  iconSvg: string;
  popupText: string;
  leafletInstance?: any;
}

const mapContainer = ref<HTMLDivElement | null>(null);
const mapObject = shallowRef<LeafletMap | null>(null);
const currentTileLayer = shallowRef<Layer | null>(null);
const activeLocationId = ref<number | null>(null);
const themeMode = ref<'dark' | 'light'>('dark');

// SVG Icons
const mapPinIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
`;

const areaIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>
`;

const locations = ref<LocationItem[]>([
  {
    id: 0,
    name: 'California 0 (Long Beach)',
    coords: [33.782581, -118.189319],
    zoom: 14,
    iconSvg: mapPinIcon,
    popupText: 'California 0 - Standard Pin'
  },
  {
    id: 1,
    name: 'California 1 (Custom Icon)',
    coords: [33.774109, -118.189319],
    zoom: 14,
    iconSvg: mapPinIcon,
    popupText: 'California 1 - Custom SVG Pin'
  },
  {
    id: 2,
    name: 'South Bay Area Zone',
    coords: [33.83355, -118.25283], // center of the polygon
    zoom: 15,
    iconSvg: areaIcon,
    popupText: 'Something has happened here'
  }
]);

const lightTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const setTileLayer = (mode: 'dark' | 'light') => {
  if (!mapObject.value) return;

  if (currentTileLayer.value) {
    mapObject.value.removeLayer(currentTileLayer.value);
  }

  const url = mode === 'dark' ? darkTiles : lightTiles;
  const attribution = mode === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  currentTileLayer.value = tileLayer(url, {
    maxZoom: 19,
    attribution,
  }).addTo(mapObject.value);
};

const toggleTheme = () => {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
  setTileLayer(themeMode.value);
};

const selectLocation = (loc: LocationItem) => {
  activeLocationId.value = loc.id;
  if (mapObject.value) {
    mapObject.value.flyTo(loc.coords, loc.zoom, {
      duration: 1.5,
      easeLinearity: 0.25
    });

    if (loc.leafletInstance) {
      setTimeout(() => {
        loc.leafletInstance.openPopup();
      }, 1500);
    }
  }
};

onMounted(() => {
  if (!mapContainer.value) return;

  // Initialize Map directly on DOM ref, avoiding ID search
  const mapInst = map(mapContainer.value).setView([36.7783, -119.4179], 6);
  mapObject.value = mapInst;

  // Set tile layer
  setTileLayer(themeMode.value);

  // Default Leaflet Marker
  const marker0 = marker(locations.value[0].coords)
    .addTo(mapInst)
    .bindPopup(locations.value[0].popupText);
  locations.value[0].leafletInstance = marker0;

  // Custom DivIcon Marker
  const customSvgIcon = divIcon({
    className: 'custom-svg-marker',
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));">
        <path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  const marker1 = marker(locations.value[1].coords, { icon: customSvgIcon })
    .addTo(mapInst)
    .bindPopup(locations.value[1].popupText);
  locations.value[1].leafletInstance = marker1;

  // Polygon Area Zone
  const poly = polygon([
    [33.835408, -118.257158],
    [33.835408, -118.248478],
    [33.831701, -118.248489],
    [33.831701, -118.257179],
  ], {
    color: '#3b82f6',
    fillColor: '#3b82f6',
    fillOpacity: 0.25,
    weight: 2
  }).addTo(mapInst).bindPopup(locations.value[2].popupText);

  locations.value[2].leafletInstance = poly;

  // Open initial popup on mount
  poly.openPopup();
});
</script>

<template>
  <div class="dashboard" :class="themeMode">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="logo-icon">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon>
            <line x1="9" y1="3" x2="9" y2="18"></line>
            <line x1="15" y1="6" x2="15" y2="21"></line>
          </svg>
          <h1>GeoVisual</h1>
        </div>
        <p class="subtitle">Interactive Mapping Console</p>
      </div>

      <!-- Theme Toggle Button -->
      <div class="sidebar-section">
        <button class="theme-btn" @click="toggleTheme">
          <span v-if="themeMode === 'dark'">☀️ Switch to Light Mode</span>
          <span v-else>🌙 Switch to Dark Mode</span>
        </button>
      </div>

      <!-- Interactive Location List -->
      <div class="sidebar-section">
        <h3>Locations & Zones</h3>
        <div class="location-list">
          <button v-for="loc in locations" :key="loc.id" class="location-card"
            :class="{ active: activeLocationId === loc.id }" @click="selectLocation(loc)">
            <div class="location-info">
              <span class="icon" v-html="loc.iconSvg"></span>
              <div class="card-details">
                <h4 class="loc-title">{{ loc.name }}</h4>
                <p class="loc-coords">{{ loc.coords[0].toFixed(4) }}, {{ loc.coords[1].toFixed(4) }}</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Stats Box -->
      <div class="sidebar-section quick-stats">
        <h3>Region Analytics</h3>
        <div class="stat-grid">
          <div class="stat-box">
            <span class="stat-val">3</span>
            <span class="stat-label">Features</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">2</span>
            <span class="stat-label">Markers</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">1</span>
            <span class="stat-label">Area Zone</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Map View -->
    <main class="map-view">
      <div ref="mapContainer" class="map-element"></div>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  font-family: 'Outfit', 'Inter', system-ui, -apple-system, sans-serif;
  transition: background-color 0.3s ease;
}

.dashboard.dark {
  background-color: #0b0f19;
  color: #f8fafc;
}

.dashboard.light {
  background-color: #f1f5f9;
  color: #0f172a;
}

/* Sidebar Styling */
.sidebar {
  width: 360px;
  display: flex;
  flex-direction: column;
  padding: 24px;
  z-index: 1000;
  box-shadow: 8px 0 24px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
  flex-shrink: 0;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.dark .sidebar {
  background: rgba(11, 15, 25, 0.85);
  backdrop-filter: blur(20px) saturate(140%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.light .sidebar {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(140%);
  border-right: 1px solid rgba(0, 0, 0, 0.08);
}

.sidebar-header {
  margin-bottom: 24px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  color: #3b82f6;
  filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.4));
}

.logo h1 {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.5px;
}

.dark .logo h1 {
  background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.light .logo h1 {
  color: #0f172a;
}

.subtitle {
  font-size: 13px;
  margin: 4px 0 0 0;
}

.dark .subtitle {
  color: #64748b;
}

.light .subtitle {
  color: #475569;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-section h3 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 12px;
  font-weight: 600;
}

.dark .sidebar-section h3 {
  color: #475569;
}

.light .sidebar-section h3 {
  color: #94a3b8;
}

/* Theme Button */
.theme-btn {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.dark .theme-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.dark .theme-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
}

.light .theme-btn {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  color: #0f172a;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.light .theme-btn:hover {
  background: #f8fafc;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);
}

/* Location Cards */
.location-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.location-card {
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  width: 100%;
  box-sizing: border-box;
}

.dark .location-card {
  background: rgba(30, 41, 59, 0.35);
  border-color: rgba(255, 255, 255, 0.03);
  color: #cbd5e1;
}

.dark .location-card:hover {
  background: rgba(30, 41, 59, 0.7);
  border-color: rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
}

.dark .location-card.active {
  background: rgba(59, 130, 246, 0.1);
  border-color: #3b82f6;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.1);
}

.light .location-card {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.04);
  color: #334155;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.light .location-card:hover {
  background: #f8fafc;
  border-color: rgba(59, 130, 246, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
}

.light .location-card.active {
  background: rgba(59, 130, 246, 0.05);
  border-color: #3b82f6;
  color: #1e3a8a;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.08);
}

.location-info {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.card-details {
  flex-grow: 1;
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.dark .icon {
  background: rgba(59, 130, 246, 0.12);
  color: #60a5fa;
}

.light .icon {
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
}

.location-card:hover .icon {
  background: #3b82f6;
  color: #ffffff;
}

.loc-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 2px 0;
}

.loc-coords {
  font-size: 11px;
  font-family: monospace;
  margin: 0;
}

.dark .loc-coords {
  color: #64748b;
}

.light .loc-coords {
  color: #94a3b8;
}

.location-card.active .loc-coords {
  color: #3b82f6;
}

/* Stats Styling */
.quick-stats .stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat-box {
  border-radius: 10px;
  padding: 10px 6px;
  text-align: center;
  transition: background-color 0.3s ease;
}

.dark .stat-box {
  background: rgba(30, 41, 59, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.light .stat-box {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.stat-val {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #3b82f6;
}

.stat-label {
  display: block;
  font-size: 9px;
  text-transform: uppercase;
  margin-top: 4px;
  font-weight: 550;
}

.dark .stat-label {
  color: #475569;
}

.light .stat-label {
  color: #94a3b8;
}

/* Map Container */
.map-view {
  flex-grow: 1;
  height: 100%;
  position: relative;
}

.map-element {
  width: 100%;
  height: 100%;
}
</style>
