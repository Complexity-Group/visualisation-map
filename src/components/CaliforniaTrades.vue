<script setup lang="ts">
import { ref, onMounted, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { map, tileLayer, geoJSON, featureGroup, type Map as LeafletMap, type Layer } from 'leaflet';
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


const worldGeoJson = ref<any>(null);
const usStatesGeoJson = ref<any>(null);

const tradePartnerToGeoJson: Record<string, { type: 'country' | 'state'; name: string }> = {
  'hawaii': { type: 'state', name: 'Hawaii' },
  'united states, massachussetts': { type: 'state', name: 'Massachusetts' },
  'united states, colorado': { type: 'state', name: 'Colorado' },
  'united states, new york': { type: 'state', name: 'New York' },
  'united states, illinois': { type: 'state', name: 'Illinois' },
  'united states, pennsylvania': { type: 'state', name: 'Pennsylvania' },
  'united states, oregon': { type: 'state', name: 'Oregon' },
  'united states, nevada': { type: 'state', name: 'Nevada' },
  'united states, minnesota': { type: 'state', name: 'Minnesota' },
  'united states, utah': { type: 'state', name: 'Utah' },

  'korea, south': { type: 'country', name: 'South Korea' },
  'korea, north': { type: 'country', name: 'North Korea' },
  'china, canton': { type: 'country', name: 'China' },
  'india, calcutta': { type: 'country', name: 'India' },
  'lima, peru': { type: 'country', name: 'Peru' },
  'mexico, mazatlán': { type: 'country', name: 'Mexico' },
  'philippines, manila': { type: 'country', name: 'Philippines' },
  'united kingdom': { type: 'country', name: 'United Kingdom' },
  'great britain': { type: 'country', name: 'United Kingdom' },

  'cote d\'ivoire': { type: 'country', name: 'Côte d\'Ivoire' },
  'burma (myanmar)': { type: 'country', name: 'Myanmar' },
  'burma': { type: 'country', name: 'Myanmar' },
  'eswatini': { type: 'country', name: 'Swaziland' },
  'macau': { type: 'country', name: 'China' },
  'macau, sar of china': { type: 'country', name: 'China' },
  'reunion': { type: 'country', name: 'France' },
  'french guiana': { type: 'country', name: 'France' },
  'martinique': { type: 'country', name: 'France' },
  'guadeloupe': { type: 'country', name: 'France' },
  'mayotte': { type: 'country', name: 'France' },
  'bermuda': { type: 'country', name: 'United Kingdom' },
  'gibraltar': { type: 'country', name: 'United Kingdom' },
  'saint helena': { type: 'country', name: 'United Kingdom' },
  'st helena': { type: 'country', name: 'United Kingdom' },
  'west bank': { type: 'country', name: 'Palestine' },
  'west bank administered by israel': { type: 'country', name: 'Palestine' },
  'tokelau islands': { type: 'country', name: 'New Zealand' },
  'tokelau': { type: 'country', name: 'New Zealand' },
  'cook islands': { type: 'country', name: 'New Zealand' },
  'cocos (keeling) islands': { type: 'country', name: 'Australia' },
  'christmas island': { type: 'country', name: 'Australia' },
  'aruba': { type: 'country', name: 'Netherlands' },
  'curacao': { type: 'country', name: 'Netherlands' },
  'sint maarten': { type: 'country', name: 'Netherlands' },
  'cayman islands': { type: 'country', name: 'United Kingdom' },
  'british virgin islands': { type: 'country', name: 'United Kingdom' },
  'turks and caicos islands': { type: 'country', name: 'United Kingdom' },
  'anguilla': { type: 'country', name: 'United Kingdom' },
  'cabo verde': { type: 'country', name: 'Cabo Verde' },
  'cape verde': { type: 'country', name: 'Cabo Verde' },
  'st. lucia': { type: 'country', name: 'Saint Lucia' },
  'st lucia': { type: 'country', name: 'Saint Lucia' },
  'st. vincent and the grenadines': { type: 'country', name: 'Saint Vincent and the Grenadines' },
  'st vincent and the grenadines': { type: 'country', name: 'Saint Vincent and the Grenadines' },
  'st. kitts and nevis': { type: 'country', name: 'Saint Kitts and Nevis' },
  'st kitts and nevis': { type: 'country', name: 'Saint Kitts and Nevis' },
  'tuvalu': { type: 'country', name: 'Fiji' },

  'netherlands antilles (through apr 2011)': { type: 'country', name: 'Netherlands' },
  'netherlands antilles': { type: 'country', name: 'Netherlands' },
  'serbia and montenegro (aug 2003 - dec 2006)': { type: 'country', name: 'Serbia' },
  'micronesia (federated states of)': { type: 'country', name: 'Micronesia' },
  'syrian arab republic': { type: 'country', name: 'Syria' }
};

const getGeoJsonFeature = (partnerName: string) => {
  const cleanName = partnerName.trim();
  const lowerName = cleanName.toLowerCase().replace(/\s+/g, ' ');

  const mapping = tradePartnerToGeoJson[lowerName];

  let type: 'country' | 'state';
  let geoQuery: string;

  if (mapping) {
    type = mapping.type;
    geoQuery = mapping.name;
  } else {
    // Default dynamic rules
    let baseName = cleanName;
    if (baseName.includes('(')) {
      baseName = baseName.split('(')[0].trim();
    }

    if (baseName.startsWith('United States,') || baseName === 'Hawaii') {
      type = 'state';
      geoQuery = baseName === 'Hawaii' ? 'Hawaii' : baseName.replace('United States,', '').trim();
    } else {
      type = 'country';
      geoQuery = baseName;
      if (geoQuery.includes(',')) {
        geoQuery = geoQuery.split(',')[0].trim();
      }
    }
  }

  if (type === 'state') {
    if (geoQuery.toLowerCase().includes('massachus')) {
      geoQuery = 'Massachusetts';
    }
    if (usStatesGeoJson.value) {
      const feature = usStatesGeoJson.value.features.find((f: any) =>
        f.properties.name.toLowerCase() === geoQuery.toLowerCase() ||
        geoQuery.toLowerCase().includes(f.properties.name.toLowerCase()) ||
        f.properties.name.toLowerCase().includes(geoQuery.toLowerCase())
      );
      if (feature) return { type: 'state' as const, feature };
    }
  } else {
    if (worldGeoJson.value) {
      const feature = worldGeoJson.value.features.find((f: any) => {
        const name = (f.properties.NAME || '').toLowerCase();
        const longName = (f.properties.NAME_LONG || '').toLowerCase();
        const admin = (f.properties.ADMIN || '').toLowerCase();
        const query = geoQuery.toLowerCase();

        return name === query ||
          longName === query ||
          admin === query ||
          query.includes(name) ||
          query.includes(longName) ||
          name.includes(query) ||
          longName.includes(query);
      });
      if (feature) return { type: 'country' as const, feature };
    }
  }

  return null;
};

const mapContainer = ref<HTMLDivElement | null>(null);
const mapObject = shallowRef<LeafletMap | null>(null);
const currentTileLayer = shallowRef<Layer | null>(null);

const themeMode = ref<'dark' | 'light'>('dark');

const toggleTheme = () => {
  themeMode.value = themeMode.value === 'dark' ? 'light' : 'dark';
  setTileLayer(themeMode.value);
};

const allTradesData = ref<TradesData | null>(null);

const availableYears = computed(() => {
  if (!allTradesData.value) return [];
  const importYears = allTradesData.value.imports.map(d => d.year!);
  const exportYears = allTradesData.value.exports.map(d => d.year!);
  const union = Array.from(new Set([...importYears, ...exportYears]));
  return union.sort((a, b) => a - b);
});

const selectedYearIndex = ref(0);
const isLoading = ref(true);
const isPlaying = ref(false);
let playInterval: ReturnType<typeof setInterval> | null = null;

// Use shallowRef to prevent Vue from proxying Leaflet Layer instances
const mapLayers = shallowRef<Layer[]>([]);

interface TradesData {
  imports: SheetColumnData[];
  exports: SheetColumnData[];
}

// XLSX Parsing function (loads from the local served public path)
async function parseSheetColumns(assetPath: string = 'https://raw.githubusercontent.com/Complexity-Group/visualisation-map/main/public/data/data.xlsx'): Promise<TradesData> {
  const response = await fetch(assetPath);
  if (!response.ok) {
    throw new Error(`HTTP error fetching ${assetPath}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer: ArrayBuffer = await response.arrayBuffer();

  const workbook: XLSX.WorkBook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
  });

  const parseSheet = (sheetName: string): SheetColumnData[] => {
    const sheet: XLSX.WorkSheet | undefined = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) {
      return [];
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const result: SheetColumnData[] = [];

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const col = new SheetColumnData();

      const headerAddress = XLSX.utils.encode_cell({ r: range.s.r, c: C });
      const headerCell = sheet[headerAddress];

      if (headerCell !== undefined && headerCell.v !== undefined) {
        const yearValue = Number(headerCell.v);
        col.year = !Number.isNaN(yearValue) ? yearValue : undefined;
      }

      const countryList: string[] = [];
      for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[cellAddress];

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
  };

  return {
    imports: parseSheet('Imports'),
    exports: parseSheet('Exports')
  };
}

// Compute active year and partners based on timeline slider index
const activeYear = computed(() => availableYears.value[selectedYearIndex.value] || null);

const activeImports = computed(() => {
  if (!activeYear.value || !allTradesData.value) return [];
  const found = allTradesData.value.imports.find(c => c.year === activeYear.value);
  return found?.countries || [];
});

const activeExports = computed(() => {
  if (!activeYear.value || !allTradesData.value) return [];
  const found = allTradesData.value.exports.find(c => c.year === activeYear.value);
  return found?.countries || [];
});

const combinedPartners = computed(() => {
  const list: Array<{ name: string; isImport: boolean; isExport: boolean }> = [];
  const uniqueNames = Array.from(new Set([...activeImports.value, ...activeExports.value]));

  uniqueNames.forEach(name => {
    list.push({
      name,
      isImport: activeImports.value.includes(name),
      isExport: activeExports.value.includes(name)
    });
  });

  return list.sort((a, b) => a.name.localeCompare(b.name));
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
  const res = getGeoJsonFeature(partnerName);
  if (res && mapObject.value) {
    // Find matching Leaflet layers for this feature
    const matchingLayers = mapLayers.value.filter((l: any) => {
      // Direct feature match
      if (l.feature === res.feature) return true;
      // Group/GeoJSON layer match
      if (l.getLayers) {
        return l.getLayers().some((sub: any) => sub.feature === res.feature);
      }
      return false;
    });

    if (matchingLayers.length > 0) {
      const group = featureGroup(matchingLayers);
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        mapObject.value.flyToBounds(bounds, {
          padding: [80, 80],
          maxZoom: 5,
          duration: 1.2
        });

        // Open popup of the first matching layer
        matchingLayers[0].openPopup();
        return;
      }
    }
  }

  // Fallback to static coordinates if mapping fails or layer is not drawn
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
  if (!mapObject.value || isLoading.value || !worldGeoJson.value || !usStatesGeoJson.value) return;
  clearLayers();

  const newLayers: Layer[] = [];

  // Helper to set hover glow
  const setupHover = (geoLayer: any, hoverColor: string, baseColor: string) => {
    geoLayer.on({
      mouseover: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          color: hoverColor,
          weight: 2.5
        });
      },
      mouseout: (e: any) => {
        const layer = e.target;
        layer.setStyle({
          color: baseColor,
          weight: 1.5
        });
      }
    });
  };

  // Draw trade connections and highlight country/state shapes
  combinedPartners.value.forEach(partner => {
    // Find and highlight country/state shape on the map using our resolving helper
    const res = getGeoJsonFeature(partner.name);
    if (res) {
      const { feature } = res;
      let tradeRoleText = '';
      if (partner.isImport && partner.isExport) {
        tradeRoleText = 'Import & Export Partner';
      } else if (partner.isImport) {
        tradeRoleText = 'Import Partner';
      } else {
        tradeRoleText = 'Export Partner';
      }

      const popupHtml = `
        <div class="custom-map-popup-card">
          <div class="popup-card-content">
            <h4 class="popup-card-title">${partner.name}</h4>
            <p class="popup-card-description">Historical ${tradeRoleText.toLowerCase()} with California in the year ${activeYear.value}.</p>
            <div class="popup-card-footer">
              <span class="popup-card-tag">${tradeRoleText}</span>
              <span class="popup-card-coords">Region Highlighted</span>
            </div>
          </div>
        </div>
      `;

      // If Import (or both): Add Stripe Layer
      if (partner.isImport) {
        const impLayer = geoJSON(feature, {
          style: {
            color: themeMode.value === 'dark' ? '#f59e0b' : '#d97706',
            weight: 1.5,
            fillColor: themeMode.value === 'dark' ? 'url(#colorblind-stripes)' : 'url(#colorblind-stripes-light)',
            fillOpacity: 1.0,
            lineJoin: 'round'
          }
        }).addTo(mapObject.value!);

        impLayer.bindPopup(popupHtml, {
          closeButton: false,
          className: 'custom-leaflet-popup',
          offset: [0, -10]
        });
        setupHover(impLayer, themeMode.value === 'dark' ? '#fbbf24' : '#b45309', themeMode.value === 'dark' ? '#f59e0b' : '#d97706');
        newLayers.push(impLayer);
      }

      // If Export (or both): Add Dot Layer
      if (partner.isExport) {
        const expLayer = geoJSON(feature, {
          style: {
            color: themeMode.value === 'dark' ? '#3b82f6' : '#2563eb',
            weight: 1.5,
            fillColor: themeMode.value === 'dark' ? 'url(#colorblind-dots)' : 'url(#colorblind-dots-light)',
            fillOpacity: 1.0,
            lineJoin: 'round'
          }
        }).addTo(mapObject.value!);

        expLayer.bindPopup(popupHtml, {
          closeButton: false,
          className: 'custom-leaflet-popup',
          offset: [0, -10]
        });
        setupHover(expLayer, themeMode.value === 'dark' ? '#60a5fa' : '#1d4ed8', themeMode.value === 'dark' ? '#3b82f6' : '#2563eb');
        newLayers.push(expLayer);
      }
    }
  });

  mapLayers.value = newLayers;

  // Fit bounds dynamically to show all highlighted shapes
  if (newLayers.length > 0) {
    const group = featureGroup(newLayers);
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      mapObject.value.flyToBounds(bounds, {
        padding: [50, 50],
        maxZoom: 4.5,
        animate: true,
        duration: 1.0
      });
    }
  }
};

watch(combinedPartners, () => {
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
      allTradesData.value = data;
      selectedYearIndex.value = 0;
    })
    .catch((err) => {
      console.error('Failed to parse trades data:', err);
      isLoading.value = false;
    });

  // Load world countries and US states GeoJSON databases in parallel
  Promise.all([
    fetch('https://raw.githubusercontent.com/Complexity-Group/visualisation-map/main/public/data/countries.geojson').then(res => res.json()),
    fetch('https://raw.githubusercontent.com/Complexity-Group/visualisation-map/main/public/data/us-states.geojson').then(res => res.json())
  ])
    .then(([countriesJson, statesJson]) => {
      worldGeoJson.value = countriesJson;
      usStatesGeoJson.value = statesJson;
      updateMapLayers();
    })
    .catch(err => console.error('Failed to load GeoJSON databases:', err));
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
        <!-- Dark Mode Diagonal Stripe Pattern (Import) -->
        <pattern id="colorblind-stripes" width="12" height="12" patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(245, 158, 11, 0.15)" />
          <line x1="0" y1="0" x2="0" y2="12" stroke="#f59e0b" stroke-width="3" />
        </pattern>

        <!-- Light Mode Diagonal Stripe Pattern (Import) -->
        <pattern id="colorblind-stripes-light" width="12" height="12" patternTransform="rotate(45 0 0)"
          patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(217, 119, 6, 0.12)" />
          <line x1="0" y1="0" x2="0" y2="12" stroke="#d97706" stroke-width="3" />
        </pattern>

        <!-- Dark Mode Dot Pattern (Export) -->
        <pattern id="colorblind-dots" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(59, 130, 246, 0.15)" />
          <circle cx="6" cy="6" r="2.5" fill="#3b82f6" />
        </pattern>

        <!-- Light Mode Dot Pattern (Export) -->
        <pattern id="colorblind-dots-light" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="rgba(37, 99, 235, 0.12)" />
          <circle cx="6" cy="6" r="2.5" fill="#2563eb" />
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
            <button v-for="partner in combinedPartners" :key="partner.name" class="location-card partner-card"
              @click="focusOnLocation(partner.name)">
              <div class="location-info">
                <span class="icon">⚓</span>
                <div class="card-details">
                  <div class="partner-title-row">
                    <h4 class="loc-title">{{ partner.name }}</h4>
                    <div class="trade-badges">
                      <span v-if="partner.isImport && partner.isExport" class="badge both-badge">Both</span>
                      <template v-else>
                        <span v-if="partner.isImport" class="badge import-badge">Imp</span>
                        <span v-if="partner.isExport" class="badge export-badge">Exp</span>
                      </template>
                    </div>
                  </div>
                  <p class="loc-coords" v-if="geoCoordinates[partner.name]">
                    {{ geoCoordinates[partner.name][0].toFixed(2) }}°, {{ geoCoordinates[partner.name][1].toFixed(2) }}°
                  </p>
                </div>
              </div>
            </button>
            <div v-if="combinedPartners.length === 0" class="no-data-msg">
              No registered trade partners found for this year.
            </div>
          </div>
        </div>

        <!-- Stats Box -->
        <div class="sidebar-section quick-stats">
          <h3>Connections Analytics</h3>
          <div class="stat-grid">
            <div class="stat-box">
              <span class="stat-val">{{ combinedPartners.length }}</span>
              <span class="stat-label">Total Partners</span>
            </div>
            <div class="stat-box">
              <span class="stat-val">{{ activeImports.length }}</span>
              <span class="stat-label">Imports</span>
            </div>
            <div class="stat-box">
              <span class="stat-val">{{ activeExports.length }}</span>
              <span class="stat-label">Exports</span>
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

/* Badge Styles for Imports/Exports List */
.partner-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.trade-badges {
  display: flex;
  gap: 4px;
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.import-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.export-badge {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.both-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
</style>