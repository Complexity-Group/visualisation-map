<script setup lang="ts">
import { ref, onMounted, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { map, tileLayer, latLngBounds, geoJSON, type Map as LeafletMap, type Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';

// Types
class SheetColumnData {
  year: number | undefined;
  countries: string[] | undefined;
}

const geoCoordinates: Record<string, [number, number]> = {
  'Spain': [40.4637, -3.7492],
  'Mexico': [23.6345, -102.5528],
  'Chile': [-35.6751, -71.5430],
  'China, Canton': [23.1291, 113.2644],
  'France': [46.2276, 2.2137],
  'Hawaii': [19.8968, -155.5828],
  'Germany': [51.1657, 10.4515],
  'India, Calcutta': [22.5726, 88.3639],
  'Lima, Peru': [-12.0464, -77.0428],
  'United States, Massachussetts': [42.4072, -71.3824],
  'Ireland': [53.4129, -8.2439],
  'Mexico, Mazatlán': [23.2494, -106.4111],
  'Italy': [41.8719, 12.5674],
  'Philippines, Manila': [14.5995, 120.9842],
  'Russia': [61.5240, 105.3188],
  'United Kingdom': [55.3781, -3.4360],
  'United States, Colorado': [39.5501, -105.7821],
  'United States, New York': [40.7128, -74.0060],
  'United States, Illinois': [40.6331, -89.3985],
  'United States, Pennsylvania': [41.2033, -77.1945],
  'United States, Oregon': [43.8041, -120.5542],
  'United States, Nevada': [38.8026, -116.4194],
  'United States, Minnesota': [46.7296, -94.6859],
  'United States, Utah': [39.3210, -111.0937]
};

const californiaCoords: [number, number] = [37.7749, -122.4194]; // San Francisco center

const worldGeoJson = ref<any>(null);

const tradePartnerToCountryName: Record<string, string> = {
  'Spain': 'Spain',
  'Mexico': 'Mexico',
  'Chile': 'Chile',
  'China, Canton': 'China',
  'France': 'France',
  'Hawaii': 'United States of America',
  'Germany': 'Germany',
  'India, Calcutta': 'India',
  'Lima, Peru': 'Peru',
  'United States, Massachussetts': 'United States of America',
  'Ireland': 'Ireland',
  'Mexico, Mazatlán': 'Mexico',
  'Italy': 'Italy',
  'Philippines, Manila': 'Philippines',
  'Russia': 'Russia',
  'United Kingdom': 'United Kingdom',
  'United States, Colorado': 'United States of America',
  'United States, New York': 'United States of America',
  'United States, Illinois': 'United States of America',
  'United States, Pennsylvania': 'United States of America',
  'United States, Oregon': 'United States of America',
  'United States, Nevada': 'United States of America',
  'United States, Minnesota': 'United States of America',
  'United States, Utah': 'United States of America'
};

const mapContainer = ref<HTMLDivElement | null>(null);
const mapObject = shallowRef<LeafletMap | null>(null);
const currentTileLayer = shallowRef<Layer | null>(null);

const themeMode = ref<'dark' | 'light'>('dark');

const toggleTheme = () => {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
  setTileLayer(themeMode.value);
};

const parsedColumns = ref<SheetColumnData[]>([]);
const availableYears = ref<number[]>([]);
const selectedYearIndex = ref(0);
const isLoading = ref(true);
const isPlaying = ref(false);
let playInterval: ReturnType<typeof setInterval> | null = null;

// Use shallowRef to prevent Vue from proxying Leaflet Layer instances
const mapLayers = shallowRef<Layer[]>([]);

// XLSX Parsing function (loads from the local served public path)
async function parseSheetColumns(assetPath: string = 'https://raw.githubusercontent.com/Complexity-Group/visualisation-map/main/public/data/data.xlsx'): Promise<SheetColumnData[]> {
  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`HTTP error fetching ${assetPath}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer: ArrayBuffer = await response.arrayBuffer();

  const workbook: XLSX.WorkBook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });

  const mainSheet: XLSX.WorkSheet | undefined = workbook.Sheets['Sheet1'];

  if (!mainSheet || !mainSheet['!ref']) {
    return [];
  }

  const range = XLSX.utils.decode_range(mainSheet['!ref']);
  const result: SheetColumnData[] = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const col = new SheetColumnData();

    const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
    const headerCell = mainSheet[headerAddress];

    if (headerCell !== undefined && headerCell.v !== undefined) {
      const yearValue = Number(headerCell.v);
      col.year = !Number.isNaN(yearValue) ? yearValue : undefined;
    }

    const countryList: string[] = [];
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = mainSheet[cellAddress];

      if (cell !== undefined && cell.v !== undefined && cell.v !== null) {
        const value = String(cell.v).trim();
        if (value.length > 0) {
          countryList.push(value);
        }
      }
    }

    col.countries = countryList.length > 0 ? countryList : undefined;
    if (col.year) {
      result.push(col);
    }
  }

  return result;
}

// Compute active year and partners based on timeline slider index
const activeYear = computed(() => availableYears.value[selectedYearIndex.value] || null);
const activePartners = computed(() => {
  if (!activeYear.value) return [];
  const found = parsedColumns.value.find(c => c.year === activeYear.value);
  return found?.countries || [];
});

const domesticCount = computed(() => {
  return activePartners.value.filter(p => p.toLowerCase().includes('united states')).length;
});

const internationalCount = computed(() => {
  return activePartners.value.length - domesticCount.value;
});

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
    maxZoom: 18,
    attribution,
  }).addTo(mapObject.value);
};

// React to global theme change
watch(themeMode, (mode) => {
  setTileLayer(mode);
});

// Play/Pause timeline animation
const togglePlay = () => {
  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    playInterval = setInterval(() => {
      if (selectedYearIndex.value < availableYears.value.length - 1) {
        selectedYearIndex.value++;
      } else {
        selectedYearIndex.value = 0; // loop back
      }
    }, 1800);
  } else {
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
  }
};

const stopPlay = () => {
  isPlaying.value = false;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
};

const focusOnLocation = (partnerName: string) => {
  const coords = geoCoordinates[partnerName];
  if (coords && mapObject.value) {
    mapObject.value.flyTo(coords, 4, {
      duration: 1.2
    });
  }
};

const clearLayers = () => {
  if (mapObject.value) {
    mapLayers.value.forEach(layer => {
      mapObject.value!.removeLayer(layer);
    });
    mapLayers.value = [];
  }
};

// Reactive map updates based on selected year/partners
const updateMapLayers = () => {
  if (!mapObject.value || isLoading.value || !worldGeoJson.value) return;
  clearLayers();

  const newLayers: Layer[] = [];
  const boundsList: [number, number][] = [californiaCoords];

  // Draw trade connections and highlight country shapes
  activePartners.value.forEach(partner => {
    const coords = geoCoordinates[partner];
    if (coords) {
      boundsList.push(coords);

      // Find and highlight country shape on the map instead of placing a marker
      const countryName = tradePartnerToCountryName[partner];
      if (countryName && worldGeoJson.value) {
        const countryFeature = worldGeoJson.value.features.find((f: any) =>
          f.properties.NAME === countryName ||
          f.properties.NAME_LONG === countryName ||
          f.properties.ADMIN === countryName
        );

        if (countryFeature) {
          const geoLayer = geoJSON(countryFeature, {
            style: {
              color: themeMode.value === 'dark' ? '#f59e0b' : '#d97706',
              weight: 1.5,
              fillColor: themeMode.value === 'dark' ? 'url(#colorblind-stripes)' : 'url(#colorblind-stripes-light)',
              fillOpacity: 1.0,
              lineJoin: 'round'
            }
          }).addTo(mapObject.value!);

          // Interactive hover glow styling
          geoLayer.on({
            mouseover: (e) => {
              const layer = e.target;
              layer.setStyle({
                color: themeMode.value === 'dark' ? '#fbbf24' : '#b45309',
                weight: 2.5
              });
            },
            mouseout: (e) => {
              const layer = e.target;
              layer.setStyle({
                color: themeMode.value === 'dark' ? '#f59e0b' : '#d97706',
                weight: 1.5
              });
            }
          });

          // Bind details popup directly to country boundary
          geoLayer.bindPopup(`
            <div class="custom-map-popup-card">
              <div class="popup-card-content">
                <h4 class="popup-card-title">${partner}</h4>
                <p class="popup-card-description">Historical trade connection with California in the year ${activeYear.value}.</p>
                <div class="popup-card-footer">
                  <span class="popup-card-tag">Trade Country</span>
                  <span class="popup-card-coords">Region Highlighted</span>
                </div>
              </div>
            </div>
          `, {
            closeButton: false,
            className: 'custom-leaflet-popup',
            offset: [0, -10]
          });

          newLayers.push(geoLayer);
        }
      }
    }
  });

  mapLayers.value = newLayers;

  // Fit bounds to show all active trade lines nicely
  if (boundsList.length > 1) {
    const bounds = latLngBounds(boundsList);
    mapObject.value.flyToBounds(bounds, {
      padding: [40, 40],
      maxZoom: 4.5,
      animate: true,
      duration: 1.0
    });
  }
};

watch(activePartners, () => {
  updateMapLayers();
});

onMounted(() => {
  if (!mapContainer.value) return;

  // Initialize Map focused on the world for trade routes immediately on mount
  const mapInst = map(mapContainer.value, {
    minZoom: 1.8,
    maxZoom: 10,
    worldCopyJump: false
  }).setView([25.0, -80.0], 2);
  mapObject.value = mapInst;

  setTileLayer(themeMode.value);

  // Load spreadsheet database asynchronously
  parseSheetColumns()
    .then((data) => {
      // Set isLoading to false BEFORE setting data, so watcher is not blocked
      isLoading.value = false;
      parsedColumns.value = data;
      availableYears.value = data.map(d => d.year!).sort((a, b) => a - b);
      selectedYearIndex.value = 0;
    })
    .catch((err) => {
      console.error('Failed to parse trades data:', err);
      isLoading.value = false;
    });

  // Load world countries GeoJSON database
  fetch('https://raw.githubusercontent.com/Complexity-Group/visualisation-map/refs/heads/main/public/data/countries.geojson')
    .then(res => res.json())
    .then(json => {
      worldGeoJson.value = json;
      updateMapLayers();
    })
    .catch(err => console.error('Failed to load countries GeoJSON:', err));
});

onBeforeUnmount(() => {
  stopPlay();
  if (mapObject.value) {
    mapObject.value.remove();
    mapObject.value = null;
  }
});
</script>

<template>
  <div class="dashboard" :class="themeMode">
    <!-- Hidden SVG pattern definitions for colorblind accessibility -->
    <svg width="0" height="0" style="position: absolute; pointer-events: none;">
      <defs>
        <!-- Dark Mode Diagonal Stripe Pattern -->
        <pattern id="colorblind-stripes" width="12" height="12" patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(245, 158, 11, 0.15)" />
          <line x1="0" y1="0" x2="0" y2="12" stroke="#f59e0b" stroke-width="3" />
        </pattern>

        <!-- Light Mode Diagonal Stripe Pattern -->
        <pattern id="colorblind-stripes-light" width="12" height="12" patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(217, 119, 6, 0.12)" />
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d97706" stroke-width="3" />
        </pattern>
      </defs>
    </svg>
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header-section">
        <h2>California Trades</h2>
        <p class="subtitle">Historical maritime trading connections (1822 - 1900)</p>
      </div>

      <!-- Theme Toggle Button -->
      <div class="sidebar-section">
        <button class="theme-btn" @click="toggleTheme">
          <span v-if="themeMode === 'dark'">☀️ Switch to Light Mode</span>
          <span v-else>🌙 Switch to Dark Mode</span>
        </button>
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="sidebar-section loading-panel">
        <p>Loading spreadsheet database...</p>
      </div>

      <template v-else>
        <!-- Timeline Controls -->
        <div class="sidebar-section timeline-panel">
          <div class="timeline-header">
            <h3>Year: <span class="highlight-year">{{ activeYear }}</span></h3>
            <button class="play-btn" @click="togglePlay" :class="{ playing: isPlaying }">
              <span v-if="isPlaying">⏸ Pause Autoplay</span>
              <span v-else>▶ Play Timeline</span>
            </button>
          </div>
          <div class="slider-container">
            <input type="range" :min="0" :max="availableYears.length - 1" v-model.number="selectedYearIndex"
              class="timeline-slider" @input="stopPlay" />
            <div class="slider-labels">
              <span>1822</span>
              <span>1860</span>
              <span>1900</span>
            </div>
          </div>
        </div>

        <!-- Interactive Trade Partners List -->
        <div class="sidebar-section">
          <h3>Trading Partners</h3>
          <div class="location-list">
            <button v-for="partner in activePartners" :key="partner" class="location-card partner-card"
              @click="focusOnLocation(partner)">
              <div class="location-info">
                <span class="icon">⚓</span>
                <div class="card-details">
                  <h4 class="loc-title">{{ partner }}</h4>
                  <p class="loc-coords" v-if="geoCoordinates[partner]">
                    {{ geoCoordinates[partner][0].toFixed(2) }}°, {{ geoCoordinates[partner][1].toFixed(2) }}°
                  </p>
                </div>
              </div>
            </button>
            <div v-if="activePartners.length === 0" class="no-data-msg">
              No registered trade partners found for this year.
            </div>
          </div>
        </div>

        <!-- Stats Box -->
        <div class="sidebar-section quick-stats">
          <h3>Connections Analytics</h3>
          <div class="stat-grid">
            <div class="stat-box">
              <span class="stat-val">{{ activePartners.length }}</span>
              <span class="stat-label">Total Partners</span>
            </div>
            <div class="stat-box">
              <span class="stat-val">{{ domesticCount }}</span>
              <span class="stat-label">Domestic (US)</span>
            </div>
            <div class="stat-box">
              <span class="stat-val">{{ internationalCount }}</span>
              <span class="stat-label">International</span>
            </div>
          </div>
        </div>
      </template>
    </aside>

    <!-- Map View -->
    <main class="map-view">
      <div ref="mapContainer" class="map-element"></div>
    </main>
  </div>
</template>

<style>
/* Leaflet core layout resets */
.map-element {
  width: 100%;
  height: 100%;
}

.leaflet-container img {
  max-width: none !important;
  max-height: none !important;
}

/* Remove Leaflet default L.divIcon border & background */
.cali-anchor-icon,
.partner-trade-icon {
  background: transparent !important;
  border: none !important;
}

/* Specific timeline slider styling */
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.highlight-year {
  font-size: 22px;
  font-weight: 800;
  color: #f59e0b;
}

.play-btn {
  background: #f59e0b;
  color: #0f172a;
  border: none;
  font-size: 11px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.play-btn.playing {
  background: #ef4444;
  color: white;
}

.slider-container {
  padding: 8px 4px;
}

.timeline-slider {
  width: 100%;
  accent-color: #f59e0b;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #64748b;
  margin-top: 4px;
}

.partner-card .icon {
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.no-data-msg {
  text-align: center;
  font-size: 12px;
  color: #64748b;
  padding: 24px 0;
}
</style>