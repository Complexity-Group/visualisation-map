<script setup lang="ts">
/**
 * CaliforniaTrades.vue - Interactive Map Visualisation Component (MapLibre GL JS)
 * 
 * ARCHITECTURE & SYSTEM OVERVIEW:
 * 
 * 1. XLSX Data Fetching & Sheet Parsing (`parseSheetColumns`):
 *    - Fetches live Excel files from Google Sheets via the `dataSource` prop.
 *    - Parses two separate worksheet tabs:
 *      * "Imports": Historical energy/trade sources flowing INTO California.
 *      * "Exports": Historical energy/trade uses flowing OUT OF California.
 *    - Columns represent years (parsed from header rows), and rows contain lists of trade partner regions.
 *    - Builds a unified `TradesData` reactive model containing structured arrays of imports/exports per year.
 * 
 * 2. GeoJSON Feature Resolution & Geopolitical Alias System (`getGeoJsonFeature`):
 *    - Downloads two GeoJSON spatial feature collections on initialization:
 *      * World Countries GeoJSON (`countries.geojson`): Global country boundaries.
 *      * US States GeoJSON (`us-states.geojson`): Detailed US state boundaries.
 *    - Uses a dictionary (`tradePartnerToGeoJson`) and dynamic fallback heuristics to match spreadsheet strings:
 *      * Differentiates US states (e.g., "Hawaii", "United States, Massachussetts", "United States Territory - Oregon") from sovereign countries.
 *      * Resolves historical/colonial port names, archaic spellings, and territory designations (e.g., "China, Canton" -> China, "India, Calcutta" -> India, "Burma" -> Myanmar, "Great Britain" -> United Kingdom).
 *      * Performs multi-pass matching (exact property name/ADMIN match -> substring search) against GeoJSON features.
 * 
 * 3. Map Representation & Import/Export Visual Marking (`updateMapLayers`):
 *    - Groups trade partners by resolved GeoJSON shape to avoid duplicate stacked polygons.
 *    - Applies colorblind-accessible SVG pattern fills and distinct border colors based on trade relationship:
 *      * Import Partner Only: Amber/Gold outline (#d97706) with diagonal stripes fill pattern.
 *      * Export Partner Only: Blue outline (#2563eb) with dots pattern fill.
 *      * Import & Export Partner (Both): Emerald green outline (#059669) with combined stripes+dots fill.
 *      * Anchor Home Region (California): Solid dark yellow fill (#ca8a04, opacity 0.85) marking California as the main trade hub.
 *    - Provides interactive mouseover hover glows, dynamic MapLibre popup cards, and fly-to focus animations.
 * 
 * 4. Full World Map JPEG Screenshot Export Pipeline (`captureScreenshot`):
 *    - Minimum Zoom Camera Set: Sets camera view to full-world zoom covering all continents.
 *    - Mobile Resolution Scaling: Temporarily scales container to desktop dimensions (1200x650px) on mobile viewports.
 *    - Pattern Transform Correction: Applies scaled pattern fills during capture so patterns scale correctly at min zoom.
 *    - UI Element Filtering: Filters out sidebar drawers, tab buttons, controls, and popups prior to capturing screenshot.
 *    - Clean Restoration: Guarantees original camera center, zoom, container dimensions, and pattern transforms are restored in `finally`.
 */

import { ref, onMounted, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import * as maplibregl from 'maplibre-gl';
import { type Map as MapLibreMap, type Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as XLSX from 'xlsx';
import { toJpeg } from 'html-to-image';

// Configure MapLibre Web Worker URL to prevent non-JS MIME type errors on bundled/SPA hosts
maplibregl.config.WORKER_URL = 'https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl-worker.mjs';

const props = defineProps<{
  dataSource: string;
  title: string;
  activeTab: 'sources' | 'uses';
}>();

const emit = defineEmits<{
  (e: 'switchTab', tab: 'sources' | 'uses'): void;
}>();

// Excel data structure
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
  'macau': { type: 'country', name: 'Macao' },
  'macau, sar of china': { type: 'country', name: 'Macao' },

  'bermuda': { type: 'country', name: 'Bermuda' },
  'gibraltar': { type: 'country', name: 'Gibraltar' },
  'saint helena': { type: 'country', name: 'Saint Helena' },
  'st helena': { type: 'country', name: 'Saint Helena' },
  'west bank': { type: 'country', name: 'Palestine' },
  'west bank administered by israel': { type: 'country', name: 'Palestine' },
  'tokelau islands': { type: 'country', name: 'New Zealand' },
  'tokelau': { type: 'country', name: 'New Zealand' },
  'cook islands': { type: 'country', name: 'New Zealand' },
  'cocos (keeling) islands': { type: 'country', name: 'Indian Ocean Ter.' },
  'christmas island': { type: 'country', name: 'Indian Ocean Ter.' },
  'aruba': { type: 'country', name: 'Netherlands' },
  'curacao': { type: 'country', name: 'Netherlands' },
  'sint maarten': { type: 'country', name: 'Netherlands' },
  'cayman islands': { type: 'country', name: 'Cayman Is.' },
  'british virgin islands': { type: 'country', name: 'British Virgin Is.' },
  'turks and caicos islands': { type: 'country', name: 'Turks and Caicos Is.' },
  'anguilla': { type: 'country', name: 'Anguilla' },
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
  'syrian arab republic': { type: 'country', name: 'Syria' },

  // US State/Territory mappings for energy datasets
  'united states - massachussetts': { type: 'state', name: 'Massachusetts' },
  'united states - massachusettes': { type: 'state', name: 'Massachusetts' },
  'united states - virigina': { type: 'state', name: 'Virginia' },
  'united states - boston': { type: 'state', name: 'Massachusetts' },
  'united states - charleston': { type: 'state', name: 'South Carolina' },
  'united states - atlantic states': { type: 'state', name: 'Maryland' },
  'united staes - alabama': { type: 'state', name: 'Alabama' },
  'united states - samoa': { type: 'country', name: 'Samoa' },
  'united states - guam': { type: 'country', name: 'Guam' },
  'united states - american samoa': { type: 'country', name: 'American Samoa' },
  'united states territory - american samoa': { type: 'country', name: 'American Samoa' },
  'united states territory - guam': { type: 'country', name: 'Guam' },
  'united states territory - puerto rico': { type: 'state', name: 'Puerto Rico' }
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
    let baseName = cleanName;
    if (baseName.includes('(')) {
      baseName = baseName.split('(')[0].trim();
    }

    const isUsStateOrTerritory = 
      baseName.startsWith('United States Territory -') ||
      baseName.startsWith('United States -') ||
      baseName.startsWith('United States,') ||
      baseName.startsWith('United Staes -') ||
      baseName === 'Hawaii' ||
      baseName === 'Alaska';

    if (isUsStateOrTerritory) {
      type = 'state';
      geoQuery = baseName
        .replace(/^United States Territory -/, '')
        .replace(/^United States -/, '')
        .replace(/^United States,/, '')
        .replace(/^United Staes -/, '')
        .trim();
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
      const query = geoQuery.toLowerCase();
      // Pass 1: exact matches
      let feature = worldGeoJson.value.features.find((f: any) => {
        const name = (f.properties.NAME || '').toLowerCase();
        const longName = (f.properties.NAME_LONG || '').toLowerCase();
        const admin = (f.properties.ADMIN || '').toLowerCase();
        return name === query || longName === query || admin === query;
      });

      // Pass 2: substring matches
      if (!feature) {
        feature = worldGeoJson.value.features.find((f: any) => {
          const name = (f.properties.NAME || '').toLowerCase();
          const longName = (f.properties.NAME_LONG || '').toLowerCase();
          return query.includes(name) ||
                 query.includes(longName) ||
                 name.includes(query) ||
                 longName.includes(query);
        });
      }
      if (feature) return { type: 'country' as const, feature };
    }
  }

  return null;
};

const mapContainer = ref<HTMLDivElement | null>(null);
const mapObject = shallowRef<MapLibreMap | null>(null);
const isMapReady = ref(false);
let activePopup: Popup | null = null;

const themeMode = ref<'light' | 'dark'>('light');
const isMobileExpanded = ref(false);

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

interface TradesData {
  imports: SheetColumnData[];
  exports: SheetColumnData[];
}

// XLSX Parsing function (loads from the local served public path or remote URL)
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

// Helper to generate seamless colorblind pattern textures for MapLibre
function createPatternImageData(
  type: 'stripes' | 'dots' | 'both',
  theme: 'light' | 'dark',
  isCapture = false
): ImageData {
  const scale = isCapture ? 0.5 : 1.0;
  const size = Math.round(16 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bgColors = {
    stripes: theme === 'dark' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(217, 119, 6, 0.32)',
    dots: theme === 'dark' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(37, 99, 235, 0.32)',
    both: theme === 'dark' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.32)',
  };

  const stripeColor = theme === 'dark' ? '#f59e0b' : '#d97706';
  const dotColor = theme === 'dark' ? '#3b82f6' : '#2563eb';

  // Fill background
  ctx.fillStyle = bgColors[type];
  ctx.fillRect(0, 0, size, size);

  if (type === 'stripes' || type === 'both') {
    ctx.strokeStyle = stripeColor;
    ctx.lineWidth = Math.max(1, Math.round(3 * scale));
    ctx.lineCap = 'square';

    ctx.beginPath();
    // Seamless wrapping diagonal stripes at 45 degrees
    ctx.moveTo(-2, -2);
    ctx.lineTo(size + 2, size + 2);

    ctx.moveTo(-size - 2, -2);
    ctx.lineTo(2, size + 2);

    ctx.moveTo(-2, -size - 2);
    ctx.lineTo(size + 2, 2);

    ctx.moveTo(size - 2, -2);
    ctx.lineTo(size * 2 + 2, size + 2);

    ctx.moveTo(-2, size - 2);
    ctx.lineTo(size + 2, size * 2 + 2);
    ctx.stroke();
  }

  if (type === 'dots') {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, Math.max(1, 2.8 * scale), 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'both') {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(size * 0.75, size * 0.25, Math.max(1, 2.2 * scale), 0, Math.PI * 2);
    ctx.arc(size * 0.25, size * 0.75, Math.max(1, 2.2 * scale), 0, Math.PI * 2);
    ctx.fill();
  }

  return ctx.getImageData(0, 0, size, size);
}

function registerAllPatterns(mapInst: MapLibreMap) {
  const addPattern = (id: string, imgData: ImageData) => {
    if (mapInst.hasImage(id)) {
      mapInst.updateImage(id, imgData);
    } else {
      mapInst.addImage(id, imgData);
    }
  };

  // Normal patterns (16px)
  addPattern('colorblind-stripes', createPatternImageData('stripes', 'dark', false));
  addPattern('colorblind-stripes-light', createPatternImageData('stripes', 'light', false));
  addPattern('colorblind-dots', createPatternImageData('dots', 'dark', false));
  addPattern('colorblind-dots-light', createPatternImageData('dots', 'light', false));
  addPattern('colorblind-both', createPatternImageData('both', 'dark', false));
  addPattern('colorblind-both-light', createPatternImageData('both', 'light', false));

  // Scaled capture patterns (8px for min zoom world capture)
  addPattern('colorblind-stripes-capture', createPatternImageData('stripes', 'dark', true));
  addPattern('colorblind-stripes-capture-light', createPatternImageData('stripes', 'light', true));
  addPattern('colorblind-dots-capture', createPatternImageData('dots', 'dark', true));
  addPattern('colorblind-dots-capture-light', createPatternImageData('dots', 'light', true));
  addPattern('colorblind-both-capture', createPatternImageData('both', 'dark', true));
  addPattern('colorblind-both-capture-light', createPatternImageData('both', 'light', true));
}

function setCapturePatterns(isCapture: boolean) {
  if (!mapObject.value || !isMapReady.value) return;
  const isDark = themeMode.value === 'dark';
  const suffix = isCapture ? '-capture' : '';
  const lightSuffix = isDark ? '' : '-light';

  mapObject.value.setPaintProperty('trades-fill-import', 'fill-pattern', `colorblind-stripes${suffix}${lightSuffix}`);
  mapObject.value.setPaintProperty('trades-fill-export', 'fill-pattern', `colorblind-dots${suffix}${lightSuffix}`);
  mapObject.value.setPaintProperty('trades-fill-both', 'fill-pattern', `colorblind-both${suffix}${lightSuffix}`);
}

// Bounding box helpers for MapLibre GeoJSON coordinates [lng, lat]
function getFeatureBBox(feature: any): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function traverse(coords: any) {
    if (!coords) return;
    if (typeof coords[0] === 'number') {
      const lng = coords[0];
      const lat = coords[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else if (Array.isArray(coords)) {
      coords.forEach(traverse);
    }
  }

  if (feature && feature.geometry && feature.geometry.coordinates) {
    traverse(feature.geometry.coordinates);
  }

  if (minLng === Infinity || minLat === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

function calculateFeatureCollectionBBox(fc: any): [[number, number], [number, number]] | null {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  function traverse(coords: any) {
    if (!coords) return;
    if (typeof coords[0] === 'number') {
      const lng = coords[0];
      const lat = coords[1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    } else if (Array.isArray(coords)) {
      coords.forEach(traverse);
    }
  }

  if (fc && fc.features) {
    fc.features.forEach((f: any) => {
      if (f.geometry && f.geometry.coordinates) {
        traverse(f.geometry.coordinates);
      }
    });
  }

  if (minLng === Infinity || minLat === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

const isCapturing = ref(false);

const captureScreenshot = async () => {
  if (isCapturing.value || !mapContainer.value || !mapObject.value) return;
  isCapturing.value = true;

  // Store user's current camera center and zoom level to restore after export
  const originalCenter = mapObject.value.getCenter();
  const originalZoom = mapObject.value.getZoom();

  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }

  // Switch pattern textures to scaled-down capture variants
  setCapturePatterns(true);

  const targetElement = mapContainer.value;
  const isMobile = window.innerWidth <= 768;
  const originalWidthStyle = targetElement.style.width;
  const originalHeightStyle = targetElement.style.height;

  try {
    // On mobile devices, temporarily use desktop resolution for capturing full map
    if (isMobile) {
      targetElement.style.width = '1200px';
      targetElement.style.height = '650px';
      mapObject.value.resize();
    }

    // 1. Zoom to the lowest zoom level covering the entire world map
    const lowestZoom = mapObject.value.getMinZoom();
    mapObject.value.jumpTo({
      center: [0, 20],
      zoom: lowestZoom
    });
    mapObject.value.fitBounds([[-179.99, -60], [179.99, 85]], {
      padding: 0,
      animate: false
    });

    // Wait for MapLibre tiles and layer rendering to settle
    await new Promise(resolve => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };
      if (mapObject.value!.areTilesLoaded() && mapObject.value!.loaded()) {
        setTimeout(done, 250);
      } else {
        mapObject.value!.once('idle', done);
        setTimeout(done, 2000);
      }
    });

    // 2. Capture screenshot - MapLibre preserveDrawingBuffer enables direct canvas toDataURL
    const canvas = mapObject.value.getCanvas();
    let rawDataUrl: string;
    try {
      rawDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      rawDataUrl = await toJpeg(targetElement, {
        quality: 1,
        pixelRatio: 1,
        cacheBust: false,
        backgroundColor: '#ffffff',
        filter: (node: HTMLElement) => {
          if (node.classList) {
            if (
              node.classList.contains('maplibregl-ctrl') ||
              node.classList.contains('maplibregl-popup') ||
              node.classList.contains('floating-tabs-nav') ||
              node.classList.contains('sidebar') ||
              node.classList.contains('mobile-drawer-handle')
            ) {
              return false;
            }
          }
          return true;
        }
      });
    }

    const sanitizedTitle = props.title ? props.title.replace(/\s+/g, '-') : 'Map-Visualization';
    const fileName = `${sanitizedTitle}-${activeYear.value || 'Map'}.jpg`;

    const link = document.createElement('a');
    link.download = fileName;
    link.href = rawDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
  } finally {
    setCapturePatterns(false);

    // Restore original container element style & camera position
    if (isMobile && targetElement) {
      targetElement.style.width = originalWidthStyle;
      targetElement.style.height = originalHeightStyle;
    }
    if (mapObject.value) {
      mapObject.value.resize();
      if (originalCenter && originalZoom !== undefined) {
        mapObject.value.setCenter(originalCenter);
        mapObject.value.setZoom(originalZoom);
      }
    }
    isCapturing.value = false;
  }
};

// Play/Pause timeline animation
const togglePlay = () => {
  if (isPlaying.value) {
    stopPlay();
  } else {
    // If timeline is already at the final year, restart playback from the beginning
    if (selectedYearIndex.value >= availableYears.value.length - 1) {
      selectedYearIndex.value = 0;
    }

    isPlaying.value = true;
    playInterval = setInterval(() => {
      if (selectedYearIndex.value < availableYears.value.length - 1) {
        selectedYearIndex.value++;
      } else {
        stopPlay();
      }
    }, 500);
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
  if (!mapObject.value) return;

  const res = getGeoJsonFeature(partnerName);
  if (res) {
    const bbox = getFeatureBBox(res.feature);
    if (bbox) {
      mapObject.value.fitBounds(bbox, {
        padding: { top: 80, bottom: 80, left: 80, right: 80 },
        maxZoom: 5,
        duration: 1200
      });

      // Find partner role text
      const partner = combinedPartners.value.find(p => p.name === partnerName);
      const isImport = partner?.isImport ?? false;
      const isExport = partner?.isExport ?? false;

      let tradeRoleText = '';
      if (isImport && isExport) {
        tradeRoleText = 'Import & Export Partner';
      } else if (isImport) {
        tradeRoleText = 'Import Partner';
      } else {
        tradeRoleText = 'Export Partner';
      }

      const popupHtml = `
        <div class="custom-map-popup-card">
          <div class="popup-card-content">
            <h4 class="popup-card-title">${partnerName}</h4>
            <p class="popup-card-description">Historical ${tradeRoleText.toLowerCase()} with California in the year ${activeYear.value}.</p>
            <div class="popup-card-footer">
              <span class="popup-card-tag">${tradeRoleText}</span>
              <span class="popup-card-coords">Region Highlighted</span>
            </div>
          </div>
        </div>
      `;

      let popupLngLat: [number, number];
      const coords = geoCoordinates[partnerName];
      if (coords) {
        popupLngLat = [coords[1], coords[0]];
      } else {
        popupLngLat = [(bbox[0][0] + bbox[1][0]) / 2, (bbox[0][1] + bbox[1][1]) / 2];
      }

      if (activePopup) activePopup.remove();
      activePopup = new maplibregl.Popup({
        closeButton: false,
        className: 'custom-maplibre-popup',
        offset: [0, -10]
      })
        .setLngLat(popupLngLat)
        .setHTML(popupHtml)
        .addTo(mapObject.value);

      return;
    }
  }

  // Fallback to static coordinates if mapping fails or layer is not drawn
  const coords = geoCoordinates[partnerName];
  if (coords && mapObject.value) {
    mapObject.value.flyTo({
      center: [coords[1], coords[0]],
      zoom: 4,
      duration: 1200
    });
  }
};

const isInitialLoad = ref(true);

// Reactive map updates based on selected year/partners
const updateMapLayers = () => {
  if (!mapObject.value || !isMapReady.value || isLoading.value || !worldGeoJson.value || !usStatesGeoJson.value) return;

  // Group partners by their resolved GeoJSON feature to prevent duplicate rendering
  const featureGroupMap = new Map<string, {
    feature: any;
    type: 'country' | 'state';
    partners: Array<{ name: string; isImport: boolean; isExport: boolean }>;
  }>();

  combinedPartners.value.forEach(partner => {
    const res = getGeoJsonFeature(partner.name);
    if (res) {
      const { feature, type } = res;
      if (type === 'state' && feature.properties.name === 'California') {
        return; // California is rendered separately as the primary dark yellow home base anchor
      }
      const key = type === 'state' 
        ? `state:${feature.properties.name}` 
        : `country:${feature.properties.NAME}`;

      if (!featureGroupMap.has(key)) {
        featureGroupMap.set(key, { feature, type, partners: [] });
      }
      featureGroupMap.get(key)!.partners.push(partner);
    }
  });

  const tradeFeatures: any[] = [];

  featureGroupMap.forEach(({ feature, partners }, partnerKey) => {
    const isImport = partners.some(p => p.isImport);
    const isExport = partners.some(p => p.isExport);
    const displayName = partners.map(p => p.name).join(' & ');

    let tradeType: 'both' | 'import' | 'export';
    let tradeRoleText: string;
    let hoverColorLight: string;
    let hoverColorDark: string;

    if (isImport && isExport) {
      tradeType = 'both';
      tradeRoleText = 'Import & Export Partner';
      hoverColorLight = '#047857';
      hoverColorDark = '#34d399';
    } else if (isImport) {
      tradeType = 'import';
      tradeRoleText = 'Import Partner';
      hoverColorLight = '#b45309';
      hoverColorDark = '#fbbf24';
    } else {
      tradeType = 'export';
      tradeRoleText = 'Export Partner';
      hoverColorLight = '#1d4ed8';
      hoverColorDark = '#60a5fa';
    }

    tradeFeatures.push({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        partnerKey,
        displayName,
        tradeType,
        tradeRoleText,
        description: `Historical ${tradeRoleText.toLowerCase()} with California in the year ${activeYear.value}.`,
        coordsText: 'Region Highlighted',
        hoverColorLight,
        hoverColorDark,
        tagStyle: ''
      }
    });
  });

  const tradeSource = mapObject.value.getSource('trades-data') as maplibregl.GeoJSONSource | undefined;
  if (tradeSource) {
    tradeSource.setData({
      type: 'FeatureCollection',
      features: tradeFeatures
    });
  }

  // Render California as home base anchor
  if (usStatesGeoJson.value) {
    const caliFeature = usStatesGeoJson.value.features.find((f: any) => f.properties.name === 'California');
    if (caliFeature) {
      const caliSource = mapObject.value.getSource('california-data') as maplibregl.GeoJSONSource | undefined;
      if (caliSource) {
        caliSource.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: caliFeature.geometry,
            properties: {
              name: 'California',
              displayName: 'California',
              tradeRoleText: 'Home Region',
              description: 'State of California (Primary Trade Hub)',
              tagStyle: 'background: rgba(202, 138, 4, 0.2); color: #854d0e;',
              coordsText: 'Anchor Base'
            }
          }]
        });
      }
    }
  }

  // Fit bounds dynamically ON INITIAL LOAD ONLY to prevent camera jumping when resizing on mobile
  if (tradeFeatures.length > 0 && !isPlaying.value && isInitialLoad.value) {
    isInitialLoad.value = false;
    const allBounds = calculateFeatureCollectionBBox({
      type: 'FeatureCollection',
      features: tradeFeatures
    });
    if (allBounds) {
      mapObject.value.fitBounds(allBounds, {
        padding: 30,
        maxZoom: 4.5,
        animate: false
      });
    }
  }
};

watch(combinedPartners, () => {
  updateMapLayers();
});

watch(isMobileExpanded, () => {
  setTimeout(() => {
    if (mapObject.value) {
      mapObject.value.resize();
    }
  }, 360);
});

onMounted(() => {
  if (!mapContainer.value) return;

  const osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  // Initialize MapLibre GL Map
  const mapInst = new maplibregl.Map({
    container: mapContainer.value,
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [osmTiles],
          tileSize: 256,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxzoom: 19
        }
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [-80.0, 25.0],
    zoom: 2.2,
    minZoom: 1.5,
    maxZoom: 10,
    renderWorldCopies: false,
    maxBounds: [[-179.99, -60], [179.99, 85]],
    canvasContextAttributes: {
      preserveDrawingBuffer: true
    }
  });

  mapObject.value = mapInst;

  mapInst.on('load', () => {
    registerAllPatterns(mapInst);

    // Trade partners GeoJSON source
    mapInst.addSource('trades-data', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // California anchor GeoJSON source
    mapInst.addSource('california-data', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    // California Fill Layer (Solid dark yellow)
    mapInst.addLayer({
      id: 'california-fill',
      type: 'fill',
      source: 'california-data',
      paint: {
        'fill-color': '#ca8a04',
        'fill-opacity': 0.85
      }
    });

    // California Outline Layer
    mapInst.addLayer({
      id: 'california-outline',
      type: 'line',
      source: 'california-data',
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': '#854d0e',
        'line-width': 2
      }
    });

    // California Hover Outline Layer
    mapInst.addLayer({
      id: 'california-outline-hover',
      type: 'line',
      source: 'california-data',
      filter: ['==', ['get', 'name'], ''],
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': '#713f12',
        'line-width': 2.5
      }
    });

    // Trades Fill Layers (Pattern fills based on trade relationship)
    mapInst.addLayer({
      id: 'trades-fill-import',
      type: 'fill',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'import'],
      paint: {
        'fill-pattern': themeMode.value === 'dark' ? 'colorblind-stripes' : 'colorblind-stripes-light',
        'fill-opacity': 1.0
      }
    });

    mapInst.addLayer({
      id: 'trades-fill-export',
      type: 'fill',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'export'],
      paint: {
        'fill-pattern': themeMode.value === 'dark' ? 'colorblind-dots' : 'colorblind-dots-light',
        'fill-opacity': 1.0
      }
    });

    mapInst.addLayer({
      id: 'trades-fill-both',
      type: 'fill',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'both'],
      paint: {
        'fill-pattern': themeMode.value === 'dark' ? 'colorblind-both' : 'colorblind-both-light',
        'fill-opacity': 1.0
      }
    });

    // Trades Outlines
    mapInst.addLayer({
      id: 'trades-outline-import',
      type: 'line',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'import'],
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': themeMode.value === 'dark' ? '#f59e0b' : '#d97706',
        'line-width': 1.5
      }
    });

    mapInst.addLayer({
      id: 'trades-outline-export',
      type: 'line',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'export'],
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': themeMode.value === 'dark' ? '#3b82f6' : '#2563eb',
        'line-width': 1.5
      }
    });

    mapInst.addLayer({
      id: 'trades-outline-both',
      type: 'line',
      source: 'trades-data',
      filter: ['==', ['get', 'tradeType'], 'both'],
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': themeMode.value === 'dark' ? '#10b981' : '#059669',
        'line-width': 1.5
      }
    });

    // Trades Hover Highlight Outline
    mapInst.addLayer({
      id: 'trades-outline-hover',
      type: 'line',
      source: 'trades-data',
      filter: ['==', ['get', 'partnerKey'], ''],
      layout: {
        'line-join': 'round'
      },
      paint: {
        'line-color': themeMode.value === 'dark' ? ['get', 'hoverColorDark'] : ['get', 'hoverColorLight'],
        'line-width': 2.5
      }
    });

    // Interactive Hover Listeners
    const fillLayers = ['trades-fill-import', 'trades-fill-export', 'trades-fill-both'];

    mapInst.on('mousemove', fillLayers, (e: any) => {
      if (e.features && e.features.length > 0) {
        mapInst.getCanvas().style.cursor = 'pointer';
        const partnerKey = e.features[0].properties.partnerKey;
        mapInst.setFilter('trades-outline-hover', ['==', ['get', 'partnerKey'], partnerKey]);
      }
    });

    mapInst.on('mouseleave', fillLayers, () => {
      mapInst.getCanvas().style.cursor = '';
      mapInst.setFilter('trades-outline-hover', ['==', ['get', 'partnerKey'], '']);
    });

    mapInst.on('mousemove', 'california-fill', () => {
      mapInst.getCanvas().style.cursor = 'pointer';
      mapInst.setFilter('california-outline-hover', ['==', ['get', 'name'], 'California']);
    });

    mapInst.on('mouseleave', 'california-fill', () => {
      mapInst.getCanvas().style.cursor = '';
      mapInst.setFilter('california-outline-hover', ['==', ['get', 'name'], '']);
    });

    // Interactive Click Popup Listener
    const interactiveLayers = [...fillLayers, 'california-fill'];

    mapInst.on('click', interactiveLayers, (e: any) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;

      const popupHtml = `
        <div class="custom-map-popup-card">
          <div class="popup-card-content">
            <h4 class="popup-card-title">${props.displayName}</h4>
            <p class="popup-card-description">${props.description}</p>
            <div class="popup-card-footer">
              <span class="popup-card-tag" style="${props.tagStyle || ''}">${props.tradeRoleText}</span>
              <span class="popup-card-coords">${props.coordsText || 'Region Highlighted'}</span>
            </div>
          </div>
        </div>
      `;

      if (activePopup) activePopup.remove();
      activePopup = new maplibregl.Popup({
        closeButton: false,
        className: 'custom-maplibre-popup',
        offset: [0, -10]
      })
        .setLngLat(e.lngLat)
        .setHTML(popupHtml)
        .addTo(mapInst);
    });

    // Close popup when clicking elsewhere on map background
    mapInst.on('click', (e: any) => {
      const hitFeatures = mapInst.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      if (hitFeatures.length === 0 && activePopup) {
        activePopup.remove();
        activePopup = null;
      }
    });

    isMapReady.value = true;
    updateMapLayers();
  });

  // Load spreadsheet database asynchronously
  parseSheetColumns(props.dataSource)
    .then((data) => {
      isLoading.value = false;
      allTradesData.value = data;
      selectedYearIndex.value = 0;
      updateMapLayers();
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
      // Geopolitical correction: move Crimea polygon from Russia (RUS) to Ukraine (UKR)
      const rus = countriesJson.features.find((f: any) => f.properties.ISO_A3 === 'RUS');
      const ukr = countriesJson.features.find((f: any) => f.properties.ISO_A3 === 'UKR');
      if (rus && ukr) {
        let crimeaPolyIndex = -1;
        rus.geometry.coordinates.forEach((poly: any, idx: number) => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const traverse = (c: any) => {
            if (typeof c[0] === 'number') {
              const [x, y] = c;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            } else {
              c.forEach(traverse);
            }
          };
          traverse(poly);
          if (minX >= 32.0 && maxX <= 37.0 && minY >= 44.0 && maxY <= 46.5) {
            crimeaPolyIndex = idx;
          }
        });

        if (crimeaPolyIndex !== -1) {
          const crimeaPoly = rus.geometry.coordinates[crimeaPolyIndex];
          rus.geometry.coordinates.splice(crimeaPolyIndex, 1);
          ukr.geometry.coordinates.push(crimeaPoly);
        }
      }

      // Extract French overseas territories to prevent France from highlighting as Guadeloupe/Martinique etc.
      const fra = countriesJson.features.find((f: any) => f.properties.NAME === 'France');
      if (fra) {
        const extractPolygons = (parentFeature: any, indices: number[], newName: string) => {
          const newCoords: any[] = [];
          const sortedIndices = [...indices].sort((a, b) => b - a);
          sortedIndices.forEach(idx => {
            newCoords.push(parentFeature.geometry.coordinates[idx]);
            parentFeature.geometry.coordinates.splice(idx, 1);
          });
          
          return {
            type: 'Feature' as const,
            properties: {
              ...parentFeature.properties,
              NAME: newName,
              NAME_LONG: newName,
              ADMIN: newName,
              ISO_A3: newName.substring(0, 3).toUpperCase()
            },
            geometry: {
              type: 'MultiPolygon' as const,
              coordinates: newCoords
            }
          };
        };

        countriesJson.features.push(extractPolygons(fra, [5, 6, 7], 'Guadeloupe'));
        countriesJson.features.push(extractPolygons(fra, [4], 'Martinique'));
        countriesJson.features.push(extractPolygons(fra, [3], 'Mayotte'));
        countriesJson.features.push(extractPolygons(fra, [2], 'Reunion'));
        countriesJson.features.push(extractPolygons(fra, [1], 'French Guiana'));
      }

      // Add custom standalone feature for Gibraltar at its actual coordinates south of Spain
      countriesJson.features.push({
        type: 'Feature' as const,
        properties: {
          NAME: 'Gibraltar',
          NAME_LONG: 'Gibraltar',
          ADMIN: 'Gibraltar',
          ISO_A3: 'GIB'
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [-5.37, 36.13],
              [-5.37, 36.16],
              [-5.34, 36.16],
              [-5.34, 36.13],
              [-5.37, 36.13]
            ]
          ]
        }
      });

      // Filter out Antarctica to prevent boundary artifacts across boundaries
      countriesJson.features = countriesJson.features.filter((f: any) => f.properties.NAME !== 'Antarctica' && f.properties.ISO_A3 !== 'ATA');

      worldGeoJson.value = countriesJson;
      usStatesGeoJson.value = statesJson;
      updateMapLayers();
    })
    .catch(err => console.error('Failed to load GeoJSON databases:', err));

  window.addEventListener('resize', handleResize);
});

const handleResize = () => {
  if (mapObject.value) {
    mapObject.value.resize();
  }
};

onBeforeUnmount(() => {
  stopPlay();
  window.removeEventListener('resize', handleResize);
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
  if (mapObject.value) {
    mapObject.value.remove();
    mapObject.value = null;
  }
});
</script>

<template>
  <div class="dashboard" :class="themeMode">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'mobile-expanded': isMobileExpanded }">
      <!-- Mobile Drawer Handle -->
      <div class="mobile-drawer-handle" @click="isMobileExpanded = !isMobileExpanded">
        <span class="handle-bar"></span>
        <span class="handle-text">{{ isMobileExpanded ? 'Tap to Collapse' : 'Tap to View Partners (' + combinedPartners.length + ')' }}</span>
      </div>

      <div class="sidebar-header-section">
        <h2>{{ title }}</h2>
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
            <div class="action-btn-group">
              <button class="play-btn" @click="togglePlay" :class="{ playing: isPlaying }">
                <span v-if="isPlaying">⏸ Pause</span>
                <span v-else>▶ Play</span>
              </button>
              <button class="screenshot-btn" @click="captureScreenshot" :disabled="isCapturing" title="Download JPEG Screenshot of current year">
                <span v-if="isCapturing">⏳ Capturing...</span>
                <span v-else>📸 JPEG</span>
              </button>
            </div>
          </div>
          <div class="slider-container">
            <input type="range" :min="0" :max="availableYears.length - 1" v-model.number="selectedYearIndex"
              class="timeline-slider" @input="stopPlay" />
            <div class="slider-labels" v-if="availableYears.length > 0">
              <span>{{ availableYears[0] }}</span>
              <span v-if="availableYears.length > 2">{{ availableYears[Math.floor((availableYears.length - 1) / 2)] }}</span>
              <span>{{ availableYears[availableYears.length - 1] }}</span>
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
      <!-- Floating Pill Tab Navigation inside Map View for Perfect Center Positioning -->
      <nav class="floating-tabs-nav">
        <button class="tab-pill-btn" :class="{ active: activeTab === 'sources' }" @click="emit('switchTab', 'sources')">
          ⚡ Energy Sources
        </button>
        <button class="tab-pill-btn" :class="{ active: activeTab === 'uses' }" @click="emit('switchTab', 'uses')">
          🏭 Energy Uses
        </button>
      </nav>
      <div ref="mapContainer" class="map-element"></div>
    </main>
  </div>
</template>

<style>
/* MapLibre core layout resets */
.map-element {
  width: 100%;
  height: 100%;
  position: relative;
}

.maplibregl-canvas {
  outline: none;
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