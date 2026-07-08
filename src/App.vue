<script setup lang="ts">
import { ref, onMounted, shallowRef, computed } from 'vue';
import { map, divIcon, tileLayer, marker, polygon, type Map as LeafletMap, type Layer } from 'leaflet';

// Types
interface LocationItem {
  id: number;
  name: string;
  coords: [number, number];
  zoom: number;
  iconSvg: string;
  popupText: string;
  image?: string;
  type: 'point' | 'zone';
  polygonCoords?: [number, number][];
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

const interestZoneIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>
`;

const locations = ref<LocationItem[]>([
  {
    id: 0,
    name: 'Interest Point 0',
    coords: [33.782581, -118.189319],
    zoom: 14,
    iconSvg: mapPinIcon,
    popupText: 'Located in the port region of Long Beach, this coordinates hub tracks regional freight and harbor shipping telemetry.',
    image: '/images/skyline.png',
    type: 'point'
  },
  {
    id: 1,
    name: 'Interest Point 1',
    coords: [33.774109, -118.189319],
    zoom: 14,
    iconSvg: mapPinIcon,
    popupText: 'A specialized monitoring checkpoint styled with custom SVG visual interest points, tracking coastal waves and marine traffic.',
    image: '/images/coast.png',
    type: 'point'
  },
  {
    id: 2,
    name: 'South Bay Interest Zone',
    coords: [33.83355, -118.25283],
    zoom: 15,
    iconSvg: interestZoneIcon,
    popupText: 'A high-alert industrial and tech perimeter containing active sensors for regional geovisual tracking.',
    image: '/images/tech_zone.png',
    type: 'zone',
    polygonCoords: [
      [33.835408, -118.257158],
      [33.835408, -118.248478],
      [33.831701, -118.248489],
      [33.831701, -118.257179]
    ]
  },
  {
    id: 3,
    name: 'Golden Gate Bridge Interest Point',
    coords: [37.8199, -122.4783],
    zoom: 14,
    iconSvg: mapPinIcon,
    popupText: 'The iconic Golden Gate Bridge checkpoint, monitoring northern entry traffic into the San Francisco Bay area.',
    type: 'point'
  },
  {
    id: 4,
    name: 'Yosemite Valley Interest Point',
    coords: [37.7456, -119.5332],
    zoom: 13,
    iconSvg: mapPinIcon,
    popupText: 'Sierra Nevada monitoring station, tracking natural environmental indicators and valley telemetry.',
    type: 'point'
  },
  {
    id: 5,
    name: 'Death Valley (Badwater Basin) Interest Point',
    coords: [36.2503, -116.8258],
    zoom: 12,
    iconSvg: mapPinIcon,
    popupText: 'A specialized deep-desert sensory point measuring extreme temperature and heat index indices.',
    type: 'point'
  },
  {
    id: 6,
    name: 'Silicon Valley Tech-Interest Zone',
    coords: [37.3875, -122.0575],
    zoom: 11,
    iconSvg: interestZoneIcon,
    popupText: 'A sprawling technological zone mapping campuses and regional computing telemetry.',
    type: 'zone',
    polygonCoords: [
      [37.4200, -122.1000],
      [37.4200, -122.0000],
      [37.3500, -122.0000],
      [37.3500, -122.1000]
    ]
  },
  {
    id: 7,
    name: 'Lake Tahoe Basin Interest Zone',
    coords: [39.0968, -120.0324],
    zoom: 11,
    iconSvg: interestZoneIcon,
    popupText: 'Alpine fresh water reservoir zone tracking seasonal water levels and lake surface temperature data.',
    type: 'zone',
    polygonCoords: [
      [39.2000, -120.1500],
      [39.2000, -119.9500],
      [39.0000, -119.9500],
      [39.0000, -120.1500]
    ]
  }
]);

// Computed stats
const pointCount = computed(() => locations.value.filter(loc => loc.type === 'point').length);
const zoneCount = computed(() => locations.value.filter(loc => loc.type === 'zone').length);

const lightTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const darkTiles = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

const setTileLayer = (mode: 'dark' | 'light') => {
  if (!mapObject.value) return;

  if (currentTileLayer.value) {
    mapObject.value.removeLayer(currentTileLayer.value);
  }

  const url = mode === 'dark' ? darkTiles : lightTiles;
  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

  // Define California region bounds (covering all points and zones with padding)
  const californiaBounds: [[number, number], [number, number]] = [
    [20.92, -128.43], // Southwest corner
    [46.62, -107.18]  // Northeast corner
  ];

  // Initialize Map with bounds and zoom limits
  const mapInst = map(mapContainer.value, {
    maxBounds: californiaBounds,
    maxBoundsViscosity: 1.0, // Make bounds rigid (cannot pan past boundary)
    minZoom: 5.5,            // Prevent zooming out past California view
    maxZoom: 18
  }).setView([36.7783, -119.4179], 6);
  mapObject.value = mapInst;

  // Set tile layer
  setTileLayer(themeMode.value);

  // Helper to generate a rich HTML template for Leaflet Popups
  const generatePopupContent = (title: string, text: string, imageSrc?: string, coords?: [number, number]) => {
    return `
      <div class="custom-map-popup-card">
        ${imageSrc ? `
          <div class="popup-card-image-container">
            <img src="${imageSrc}" alt="${title}" class="popup-card-image" />
          </div>
        ` : ''}
        <div class="popup-card-content">
          <h4 class="popup-card-title">${title}</h4>
          <p class="popup-card-description">${text}</p>
          <div class="popup-card-footer">
            <span class="popup-card-tag">Telemetry Node</span>
            ${coords ? `<span class="popup-card-coords">${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  };

  const bindCustomPopup = (layer: any, title: string, text: string, imageSrc?: string, coords?: [number, number]) => {
    layer.bindPopup(generatePopupContent(title, text, imageSrc, coords), {
      className: 'custom-leaflet-popup',
      closeButton: false,
      offset: [0, -8],
      maxWidth: 280
    });
  };

  // Sync sidebar active state on popup open
  mapInst.on('popupopen', (e: any) => {
    const popupLayer = e.popup._source;
    if (popupLayer) {
      const found = locations.value.find(loc => loc.leafletInstance === popupLayer);
      if (found) {
        activeLocationId.value = found.id;
      }
    }
  });

  // Custom DivIcon Interest Point
  const customSvgIcon = divIcon({
    className: 'custom-svg-interest-point',
    html: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));">
        <path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });

  // Dynamically loop and render all locations on the Leaflet map
  locations.value.forEach((loc) => {
    let layer: any;

    if (loc.type === 'zone' && loc.polygonCoords) {
      // Render Zone (polygon)
      layer = polygon(loc.polygonCoords, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.25,
        weight: 2
      }).addTo(mapInst);
    } else {
      // Render Point (marker)
      if (loc.id === 1) {
        // Special custom icon for California 1
        layer = marker(loc.coords, { icon: customSvgIcon }).addTo(mapInst);
      } else {
        layer = marker(loc.coords).addTo(mapInst);
      }
    }

    // Bind custom HTML popup
    bindCustomPopup(layer, loc.name, loc.popupText, loc.image, loc.coords);
    loc.leafletInstance = layer;
  });

  // Open initial popup on mount (Yosemite Valley is a nice central choice)
  if (locations.value[4].leafletInstance) {
    locations.value[4].leafletInstance.openPopup();
    activeLocationId.value = 4;
  }
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
          <h1>California map visualisation</h1>
        </div>
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
        <h3>Locations & Interest Zones</h3>
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
            <span class="stat-val">{{ locations.length }}</span>
            <span class="stat-label">Features</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">{{ pointCount }}</span>
            <span class="stat-label">Interest Points</span>
          </div>
          <div class="stat-box">
            <span class="stat-val">{{ zoneCount }}</span>
            <span class="stat-label">Interest Zones</span>
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

<style>
@import "./App.css";
</style>
