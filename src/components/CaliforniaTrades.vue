<script setup lang="ts">
/**
 * CaliforniaTrades.vue - Interactive Map Visualisation Component
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
 *      * World Countries GeoJSON (`custom.geo.json`): Global country boundaries.
 *      * US States GeoJSON (`us-states.json`): Detailed US state boundaries.
 *    - Uses a dictionary (`tradePartnerToGeoJson`) and dynamic fallback heuristics to match spreadsheet strings:
 *      * Differentiates US states (e.g., "Hawaii", "United States, Massachussetts", "United States Territory - Oregon") from sovereign countries.
 *      * Resolves historical/colonial port names, archaic spellings, and territory designations (e.g., "China, Canton" -> China, "India, Calcutta" -> India, "Burma" -> Myanmar, "Great Britain" -> United Kingdom).
 *      * Performs multi-pass matching (exact property name/ADMIN match -> substring search) against GeoJSON features.
 * 
 * 3. Map Representation & Import/Export Visual Marking (`updateMapLayers`):
 *    - Groups trade partners by resolved GeoJSON shape to avoid duplicate stacked polygons.
 *    - Applies colorblind-accessible SVG pattern fills and distinct border colors based on trade relationship:
 *      * Import Partner Only: Vibrant orange outline (#ea580c/#f97316) with SVG orange diagonal stripes fill (`url(#colorblind-stripes)`).
 *      * Export Partner Only: Emerald green outline (#059669/#10b981) with SVG green dots pattern fill (`url(#colorblind-dots)`).
 *      * Import & Export Partner (Both): Emerald green outline (#059669/#10b981) with combined SVG orange stripes + green dots fill (`url(#colorblind-both)`).
 *      * Anchor Home Region (California): Solid dark yellow fill (#ca8a04, opacity 0.85) marking California as the main trade hub.
 *    - Provides interactive mouseover hover glows, dynamic Leaflet popup cards, and fly-to focus animations.
 * 
 * 4. Full World Map JPEG Screenshot Export Pipeline (`captureScreenshot` & Leaflet.BigImage):
 *    - Uses Leaflet.BigImage plugin (https://github.com/pasichnykvasyl/Leaflet.BigImage) for direct, high-performance canvas tile rendering.
 *    - CustomBigImageControl subclass:
 *      * Extracts all rings for MultiPolygons (e.g. USA, Canada, Japan, UK) to render all islands and regions.
 *      * Creates CanvasPatterns matching the SVG colorblind patterns (stripes, dots, combined) with transparent backgrounds.
 *      * Exports crisp high-quality JPEG images with CORS-enabled tile layers.
 *    - Minimum Zoom Camera Framing: Temporarily sets camera view to full-world zoom (`map.getMinZoom()`) covering all continents.
 *    - Mobile Resolution Scaling: Temporarily scales container to desktop dimensions (1200x650px) on mobile viewports.
 *    - Clean Restoration: Guarantees original camera center, zoom, and container dimensions are restored in `finally`.
 */

import { ref, onMounted, shallowRef, computed, watch, onBeforeUnmount } from 'vue';
import { map, tileLayer, geoJSON, featureGroup, Point, Bounds, TileLayer, Marker, Circle, Path, type Map as LeafletMap, type Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import { BigImageControl, type BigImageControlOptions } from 'leaflet.BigImage';
import 'leaflet.BigImage/dist/Leaflet.BigImage.min.css';


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

  // New US State/Territory mappings for energy datasets
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
    // Default dynamic rules
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
const mapObject = shallowRef<LeafletMap | null>(null);
const currentTileLayer = shallowRef<Layer | null>(null);

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


const osmTiles = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const setTileLayer = () => {
  if (!mapObject.value) return;

  if (currentTileLayer.value) {
    mapObject.value.removeLayer(currentTileLayer.value);
  }

  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  currentTileLayer.value = tileLayer(osmTiles, {
    maxZoom: 18,
    attribution,
    crossOrigin: 'anonymous',
    bounds: [[-85.0511287798, -180], [85.0511287798, 180]],
    noWrap: true
  }).addTo(mapObject.value);
};

// Helper to extract all coordinate rings from a single Polygon or MultiPolygon
function extractRings(latlngs: any): any[][] {
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];
  if (latlngs[0] && typeof latlngs[0].lat === 'number') {
    return [latlngs];
  }
  const rings: any[][] = [];
  for (const item of latlngs) {
    rings.push(...extractRings(item));
  }
  return rings;
}

// Helper to create a scaled-down canvas pattern matching the SVG colorblind patterns (finer orange lines, smaller green dots)
function getCanvasPattern(
  ctx: CanvasRenderingContext2D,
  type: 'stripes' | 'dots' | 'both',
  lineColor: string = '#ea580c',
  dotColor: string = '#059669'
): CanvasPattern | string {
  const pCanvas = document.createElement('canvas');
  if (type === 'stripes') {
    pCanvas.width = 12;
    pCanvas.height = 12;
    const pctx = pCanvas.getContext('2d');
    if (!pctx) return lineColor;
    pctx.fillStyle = lineColor;
    pctx.globalAlpha = 0.10;
    pctx.fillRect(0, 0, 12, 12);
    pctx.globalAlpha = 0.85;
    pctx.strokeStyle = lineColor; // Orange lines
    pctx.lineWidth = 1.6; // Scaled down line thickness
    pctx.beginPath();
    pctx.moveTo(0, 0); pctx.lineTo(12, 12);
    pctx.moveTo(-3, 9); pctx.lineTo(3, 15);
    pctx.moveTo(9, -3); pctx.lineTo(15, 3);
    pctx.stroke();
    return ctx.createPattern(pCanvas, 'repeat') || lineColor;
  } else if (type === 'dots') {
    pCanvas.width = 12;
    pCanvas.height = 12;
    const pctx = pCanvas.getContext('2d');
    if (!pctx) return dotColor;
    pctx.fillStyle = dotColor;
    pctx.globalAlpha = 0.10;
    pctx.fillRect(0, 0, 12, 12);
    pctx.globalAlpha = 0.85;
    pctx.fillStyle = dotColor; // Green dots
    pctx.beginPath();
    pctx.arc(6, 6, 1.6, 0, Math.PI * 2); // Scaled down dot radius
    pctx.fill();
    return ctx.createPattern(pCanvas, 'repeat') || dotColor;
  } else if (type === 'both') {
    // Both: Smaller orange diagonal lines + smaller green dots
    pCanvas.width = 12;
    pCanvas.height = 12;
    const pctx = pCanvas.getContext('2d');
    if (!pctx) return lineColor;

    // Subtle background tint
    pctx.fillStyle = lineColor;
    pctx.globalAlpha = 0.07;
    pctx.fillRect(0, 0, 12, 12);

    // 1. Scaled down orange lines
    pctx.globalAlpha = 0.85;
    pctx.strokeStyle = lineColor; // Orange (#ea580c)
    pctx.lineWidth = 1.6;
    pctx.beginPath();
    pctx.moveTo(0, 0); pctx.lineTo(12, 12);
    pctx.moveTo(-3, 9); pctx.lineTo(3, 15);
    pctx.moveTo(9, -3); pctx.lineTo(15, 3);
    pctx.stroke();

    // 2. Scaled down green dots
    pctx.fillStyle = dotColor; // Green (#059669)
    pctx.globalAlpha = 0.90;
    pctx.beginPath();
    pctx.arc(3, 9, 1.5, 0, Math.PI * 2);
    pctx.arc(9, 3, 1.5, 0, Math.PI * 2);
    pctx.fill();

    return ctx.createPattern(pCanvas, 'repeat') || lineColor;
  }
  return lineColor;
}

// Check if an image or ImageBitmap is fully loaded and ready to draw
function isImageDrawable(img: any): boolean {
  if (!img) return false;
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) {
    return img.width > 0 && img.height > 0;
  }
  if (img instanceof HTMLImageElement) {
    return img.complete && img.naturalWidth > 0;
  }
  return true;
}

// Helper to construct exact tile URL for given coordinates without relying on layer._tileZoom
function getTileUrlForCoords(layer: any, x: number, y: number, z: number): string {
  const template = layer?._url || osmTiles;
  const subdomains = layer?.options?.subdomains || ['a', 'b', 'c'];
  const s = Array.isArray(subdomains) && subdomains.length > 0
    ? subdomains[Math.abs(x + y) % subdomains.length]
    : (typeof subdomains === 'string' && subdomains.length > 0 ? subdomains[0] : 'a');
  return template
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '');
}

// Helper to load tile image reliably with CORS anonymous and multiple fallback strategies
async function loadTileImage(url: string): Promise<HTMLImageElement | ImageBitmap | null> {
  // Strategy 1: HTMLImageElement with crossOrigin = 'anonymous'
  const imgPromise = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, 6000);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };

    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };

    img.src = url;
  });

  const resultImg = await imgPromise;
  if (resultImg && isImageDrawable(resultImg)) {
    return resultImg;
  }

  // Strategy 2: fetch with CORS -> Blob -> ImageBitmap or Object URL
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      if (typeof createImageBitmap === 'function') {
        return await createImageBitmap(blob);
      }
      const objectUrl = URL.createObjectURL(blob);
      return await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = objectUrl;
      });
    }
  } catch (e) {
    console.warn('[BigImage] Tile fetch fallback failed for:', url, e);
  }

  return null;
}

let activeBlobUrl: string | null = null;

// Custom Leaflet.BigImage subclass enhanced with MultiPolygon support & colorblind pattern rendering
class CustomBigImageControl extends BigImageControl {
  constructor(options?: BigImageControlOptions) {
    super({
      position: 'topright',
      title: 'Export Map as Image',
      downloadTitle: 'Download JPEG',
      exportFormat: 'jpeg',
      maxScale: 3,
      minScale: 1,
      ...options
    });
  }

  // Override onAdd to completely hide default on-map export button while keeping control functional
  onAdd(map: any) {
    const container = super.onAdd ? super.onAdd(map) : document.createElement('div');
    if (container) {
      container.style.display = 'none';
      container.style.visibility = 'hidden';
      container.style.pointerEvents = 'none';
      container.style.width = '0px';
      container.style.height = '0px';
    }
    return container;
  }

  // Override parameter panel creation to fix Leaflet.BigImage webp selection bug
  _buildParametersPanel() {
    super._buildParametersPanel();
    if ((this as any)._formatSelect) {
      (this as any)._formatSelect.value = 'jpeg';
    }
  }

  // Handle mobile resolution scaling if user clicks download directly on BigImage panel
  async _handleDownload() {
    const isMobile = window.innerWidth <= 768;
    const targetElement = (this as any)._map?.getContainer();
    const originalWidthStyle = targetElement?.style.width || '';
    const originalHeightStyle = targetElement?.style.height || '';

    if (isMobile && targetElement) {
      targetElement.style.width = '1200px';
      targetElement.style.height = '650px';
      (this as any)._map?.invalidateSize({ animate: false });
    }

    try {
      await super._handleDownload();
    } finally {
      if (isMobile && targetElement) {
        targetElement.style.width = originalWidthStyle;
        targetElement.style.height = originalHeightStyle;
        (this as any)._map?.invalidateSize({ animate: false });
      }
    }
  }


  // Extract all rings across single or multi-part polygons
  _processPath(layer: any) {
    if (layer._mRadius || !layer._latlngs) return;

    const exportZoom = (this as any).zoom || 2;
    const rawLatLngs = layer.getLatLngs ? layer.getLatLngs() : layer._latlngs;
    const allRings = extractRings(rawLatLngs);

    const ringsParts: Point[][] = [];
    let hasVisiblePoints = false;

    allRings.forEach(ring => {
      const ringParts: Point[] = [];
      ring.forEach(latLng => {
        // Project at the exact zoom level (exportZoom = 2) matching tiles
        const pt = (this as any)._map.project(latLng, exportZoom);
        const pixelPoint = new Point(
          pt.x - (this as any).bounds.min.x,
          pt.y - (this as any).bounds.min.y
        );
        ringParts.push(pixelPoint);
        if (pixelPoint.x >= 0 && pixelPoint.y >= 0 && pixelPoint.x <= 1024 && pixelPoint.y <= 768) {
          hasVisiblePoints = true;
        }
      });
      if (ringParts.length > 0) {
        ringsParts.push(ringParts);
      }
    });

    if (hasVisiblePoints && ringsParts.length > 0) {
      (this as any).paths[layer._leaflet_id] = {
        ringsParts,
        closed: layer.options.fill,
        options: layer.options
      };
    }
  }

  // Draw all polygon rings cleanly
  _drawPath(pathData: any) {
    const { ringsParts, parts, closed, options } = pathData;
    const ctx = (this as any).ctx as CanvasRenderingContext2D;
    const rings: Point[][] = ringsParts || (parts ? [parts] : []);

    ctx.beginPath();
    rings.forEach(ring => {
      ring.forEach((point, index) => {
        ctx[index === 0 ? 'moveTo' : 'lineTo'](point.x, point.y);
      });
      if (closed) ctx.closePath();
    });

    this._applyPathStyle(options);
  }

  // Apply fill patterns & stroke to Canvas 2D without corrupting canvas or obscuring tiles
  _applyPathStyle(options: any) {
    const ctx = (this as any).ctx as CanvasRenderingContext2D;

    if (options.fill) {
      ctx.globalAlpha = options.fillOpacity ?? 0.85;
      let fillStyle = options.fillColor || options.color || '#3388ff';

      if (typeof fillStyle === 'string' && fillStyle.startsWith('url(')) {
        if (fillStyle.includes('stripes')) {
          fillStyle = getCanvasPattern(ctx, 'stripes', '#ea580c');
        } else if (fillStyle.includes('dots')) {
          fillStyle = getCanvasPattern(ctx, 'dots', '#ea580c', '#059669');
        } else if (fillStyle.includes('both')) {
          // Combined: Orange lines + Green dots
          fillStyle = getCanvasPattern(ctx, 'both', '#ea580c', '#059669');
        } else {
          fillStyle = options.color || '#ea580c';
        }
        ctx.globalAlpha = 0.92;
      }

      ctx.fillStyle = fillStyle;
      ctx.fill(options.fillRule || 'evenodd');
    }

    if (options.stroke !== false && (options.weight ?? 3) !== 0) {
      if (ctx.setLineDash) {
        ctx.setLineDash(options.dashArray || []);
      }
      ctx.globalAlpha = options.opacity ?? 1;
      ctx.lineWidth = options.weight ?? 3;
      ctx.strokeStyle = options.color || '#3388ff';
      ctx.lineCap = options.lineCap || 'round';
      ctx.lineJoin = options.lineJoin || 'round';
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  // Robust layer processor ensuring TileLayer, Markers, Paths, and Circles are properly collected
  async _processLayers() {
    const layerPromises: Promise<void>[] = [];
    let tileLayerFound = false;

    (this as any)._map.eachLayer((layer: any) => {
      // Check if this layer is a tile layer
      if (layer instanceof TileLayer || layer._url || typeof layer.getTileUrl === 'function') {
        tileLayerFound = true;
        layerPromises.push(this._processTileLayer(layer));
      } else if (layer instanceof Marker || layer._icon) {
        layerPromises.push((this as any)._processMarker(layer));
      } else if (layer instanceof Circle || (layer._radius && !layer._latlngs)) {
        (this as any)._processCircle(layer);
      } else if (layer instanceof Path || layer._latlngs) {
        this._processPath(layer);
      }
    });

    // Fallback: If no tile layer was found in eachLayer, explicitly process currentTileLayer or default OSM
    if (!tileLayerFound) {
      const fallbackLayer = currentTileLayer.value || {
        _leaflet_id: 'default-osm',
        _url: osmTiles,
        options: { opacity: 1 }
      };
      layerPromises.push(this._processTileLayer(fallbackLayer));
    }

    await Promise.allSettled(layerPromises);
  }

  // Load all 12 global world tiles at zoom 2 covering -180° to +180° and +85° to -64°
  async _processTileLayer(layer: any) {
    const layerId = layer._leaflet_id || 'osm-base-layer';
    (this as any).tilesImgs[layerId] = {};
    const tileSize = 256;
    const zoom = 2;

    const tilePromises: Promise<void>[] = [];

    // 4 columns (X: 0..3), 3 rows (Y: 0..2) = 1024x768 pixels covering all inhabited continents
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 4; i++) {
        const tilePos = new Point(i * tileSize, j * tileSize);
        tilePromises.push(this._loadDirectTile(layer, layerId, i, j, zoom, tilePos, tileSize));
      }
    }

    await Promise.allSettled(tilePromises);
  }

  // Load tile with CORS anonymous and multiple fallback strategies
  async _loadDirectTile(layer: any, layerId: string | number, x: number, y: number, z: number, tilePos: Point, tileSize: number): Promise<void> {
    const imgKey = `${tilePos.x}:${tilePos.y}`;
    const url = getTileUrlForCoords(layer, x, y, z);

    const img = await loadTileImage(url);
    if (img) {
      if (!(this as any).tilesImgs[layerId]) {
        (this as any).tilesImgs[layerId] = {};
      }
      (this as any).tilesImgs[layerId][imgKey] = {
        img,
        x: tilePos.x,
        y: tilePos.y,
        opacity: layer?.options?.opacity ?? 1,
        tileSize
      };
    } else {
      console.warn(`[BigImage] Failed to load tile at (${x}, ${y}, z=${z}) from ${url}`);
    }
  }

  // Render tiles safely onto the canvas
  _renderTiles() {
    const ctx = (this as any).ctx as CanvasRenderingContext2D;
    const tilesImgs = (this as any).tilesImgs;
    if (!tilesImgs) return;

    Object.values(tilesImgs).forEach((layerTiles: any) => {
      if (!layerTiles) return;
      Object.values(layerTiles).forEach((tile: any) => {
        if (tile && isImageDrawable(tile.img)) {
          ctx.globalAlpha = tile.opacity ?? 1;
          try {
            ctx.drawImage(tile.img, tile.x, tile.y, tile.tileSize, tile.tileSize);
          } catch (e) {
            console.warn('[BigImage] Skipping unrenderable tile:', e);
          }
        }
      });
    });
    ctx.globalAlpha = 1;
  }

  async _renderToCanvas() {
    const ctx = (this as any).ctx as CanvasRenderingContext2D;
    // 1. Natural ocean blue background in case of sub-pixel edges
    ctx.fillStyle = '#aad3df';
    ctx.fillRect(0, 0, 1024, 768);

    // 2. Base OpenStreetMap tiles (terrain, landmasses, country borders, labels)
    this._renderTiles();

    // 3. Trade partner polygons & pattern fills
    this._renderPaths();

    // 4. Markers and circles
    (this as any)._renderMarkers?.();
    (this as any)._renderCircles?.();

    // 5. Draw trade pattern legend onto exported canvas
    this._renderLegend(ctx);
  }

  // Draw clean trade pattern legend onto canvas export
  _renderLegend(ctx: CanvasRenderingContext2D) {
    const boxX = 20;
    const boxY = 560;
    const boxW = 230;
    const boxH = 188;
    const r = 8;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(boxX, boxY, boxW, boxH, r);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Header Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('Trade Pattern Legend', boxX + 12, boxY + 22);

    const items = [
      {
        type: 'stripes',
        label: 'Energy Sources (Imports)',
        sub: 'Orange Diagonal Lines',
        stroke: '#ea580c'
      },
      {
        type: 'dots',
        label: 'Energy Uses (Exports)',
        sub: 'Green Dots',
        stroke: '#059669'
      },
      {
        type: 'both',
        label: 'Both (Import & Export)',
        sub: 'Orange Lines + Green Dots',
        stroke: '#059669'
      },
      {
        type: 'cali',
        label: 'California',
        sub: 'Main Trade Hub',
        fill: '#ca8a04',
        stroke: '#854d0e'
      }
    ];

    let itemY = boxY + 36;
    items.forEach(item => {
      const swX = boxX + 12;
      const swY = itemY;
      const swSize = 22;

      ctx.save();
      if (item.type === 'cali') {
        ctx.fillStyle = item.fill!;
        ctx.fillRect(swX, swY, swSize, swSize);
      } else {
        const pat = getCanvasPattern(ctx, item.type as any, '#ea580c', '#059669');
        ctx.fillStyle = pat;
        ctx.fillRect(swX, swY, swSize, swSize);
      }
      ctx.strokeStyle = item.stroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(swX, swY, swSize, swSize);
      ctx.restore();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillText(item.label, swX + swSize + 10, swY + 11);

      ctx.fillStyle = '#64748b';
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.fillText(item.sub, swX + swSize + 10, swY + 21);

      itemY += 36;
    });

    ctx.restore();
  }

  // Await blob generation and download completion before resolving
  _downloadCanvas(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Strictly enforce jpeg export format
      const selectedFormat = (this as any)._formatSelect?.value?.toLowerCase();
      const format = selectedFormat === 'png' ? 'png' : 'jpeg';
      const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
      const quality = 0.95;

      const triggerDownload = (downloadUrl: string, fileName: string) => {
        const link = document.createElement('a');
        link.download = fileName;
        link.href = downloadUrl;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) {
            link.parentNode.removeChild(link);
          }
        }, 500);
      };

      const rawFileName = (this as any).options.fileName || 'Map-Visualization';
      const sanitized = rawFileName.replace(/\.(jpeg|jpg|png|webp)$/i, '');
      const ext = format === 'jpeg' ? 'jpeg' : format;
      const fullFileName = `${sanitized}.${ext}`;

      (this as any).canvas.toBlob((blob: Blob | null) => {
        let downloadUrl = '';
        if (blob) {
          if (activeBlobUrl) {
            URL.revokeObjectURL(activeBlobUrl);
          }
          activeBlobUrl = URL.createObjectURL(blob);
          downloadUrl = activeBlobUrl;
        } else {
          try {
            downloadUrl = (this as any).canvas.toDataURL(mimeType, quality);
          } catch (e) {
            console.error('Failed to generate canvas image:', e);
            resolve();
            return;
          }
        }

        const isIframe = typeof window !== 'undefined' && window.self !== window.top;

        // Post message to parent window if embedded in an iframe
        if (isIframe && typeof window !== 'undefined' && window.parent) {
          try {
            let dataUrl = '';
            try {
              dataUrl = (this as any).canvas.toDataURL(mimeType, quality);
            } catch (e) {
              dataUrl = downloadUrl;
            }
            window.parent.postMessage({
              type: 'MAP_EXPORT_DOWNLOAD',
              action: 'download',
              fileName: fullFileName,
              dataUrl,
              format
            }, '*');
          } catch (e) {
            // ignore postMessage error
          }
        }

        // Directly trigger the automatic download in the browser
        triggerDownload(downloadUrl, fullFileName);
        resolve();
      }, mimeType, quality);
    });
  }

  // Promise-based full-world uncropped generation and download
  async _generateAndDownloadImage(scale: number): Promise<void> {
    (this as any).tilesImgs = {};
    (this as any).markers = {};
    (this as any).paths = {};
    (this as any).circles = {};

    const exportZoom = 2;
    (this as any).zoom = exportZoom;

    // Full uncropped world bounds:
    // 1024x768 covers -180° to +180° longitude and +85° to -64° latitude
    const baseWidth = 1024;
    const baseHeight = 768;
    const actualScale = Math.max(1, scale || 1);

    (this as any).bounds = new Bounds(
      new Point(0, 0),
      new Point(baseWidth, baseHeight)
    );

    const canvas = document.createElement('canvas');
    canvas.width = baseWidth * actualScale;
    canvas.height = baseHeight * actualScale;
    (this as any).canvas = canvas;
    const ctx = canvas.getContext('2d');
    (this as any).ctx = ctx;

    if (actualScale > 1 && ctx) {
      ctx.scale(actualScale, actualScale);
    }

    await (this as any)._processLayers();
    await this._renderToCanvas();

    await this._downloadCanvas();
  }
}

const isCapturing = ref(false);
const isLegendCollapsed = ref(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
const bigImageControlInstance = shallowRef<CustomBigImageControl | null>(null);

const captureScreenshot = async () => {
  if (isCapturing.value || !bigImageControlInstance.value) return;
  isCapturing.value = true;

  try {
    const sanitizedTitle = props.title ? props.title.replace(/\s+/g, '-') : 'Map-Visualization';
    const fileName = `${sanitizedTitle}-${activeYear.value || 'Map'}`;
    bigImageControlInstance.value.options.fileName = fileName;
    bigImageControlInstance.value.options.exportFormat = 'jpeg';
    if ((bigImageControlInstance.value as any)._formatSelect) {
      (bigImageControlInstance.value as any)._formatSelect.value = 'jpeg';
    }

    // Export full world JPEG directly using Leaflet.BigImage plugin
    await bigImageControlInstance.value._generateAndDownloadImage(1);
  } catch (err) {
    console.error('Failed to capture screenshot via Leaflet.BigImage:', err);
  } finally {
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
        stopPlay(); // Remain at the end instead of resetting back to the beginning
      }
    }, 200);
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
        return; // California is rendered as the primary dark yellow home base anchor
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

  // Render a single layer for each unique geographic shape
  featureGroupMap.forEach(({ feature, partners }) => {
    const isImport = partners.some(p => p.isImport);
    const isExport = partners.some(p => p.isExport);

    // Merge names for popup card header
    const displayName = partners.map(p => p.name).join(' & ');

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
          <h4 class="popup-card-title">${displayName}</h4>
          <p class="popup-card-description">Historical ${tradeRoleText.toLowerCase()} with California in the year ${activeYear.value}.</p>
          <div class="popup-card-footer">
            <span class="popup-card-tag">${tradeRoleText}</span>
            <span class="popup-card-coords">Region Highlighted</span>
          </div>
        </div>
      </div>
    `;

    if (isImport && isExport) {
      const bothLayer = geoJSON(feature, {
        style: {
          color: themeMode.value === 'dark' ? '#10b981' : '#059669',
          weight: 1.5,
          fillColor: themeMode.value === 'dark' ? 'url(#colorblind-both)' : 'url(#colorblind-both-light)',
          fillOpacity: 1.0,
          lineJoin: 'round'
        }
      }).addTo(mapObject.value!);

      bothLayer.bindPopup(popupHtml, {
        closeButton: false,
        className: 'custom-leaflet-popup',
        offset: [0, -10]
      });
      setupHover(bothLayer, themeMode.value === 'dark' ? '#34d399' : '#047857', themeMode.value === 'dark' ? '#10b981' : '#059669');
      newLayers.push(bothLayer);
    } else if (isImport) {
      const impLayer = geoJSON(feature, {
        style: {
          color: themeMode.value === 'dark' ? '#f97316' : '#ea580c',
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
      setupHover(impLayer, themeMode.value === 'dark' ? '#fb923c' : '#c2410c', themeMode.value === 'dark' ? '#f97316' : '#ea580c');
      newLayers.push(impLayer);
    } else if (isExport) {
      const expLayer = geoJSON(feature, {
        style: {
          color: themeMode.value === 'dark' ? '#10b981' : '#059669',
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
      setupHover(expLayer, themeMode.value === 'dark' ? '#34d399' : '#047857', themeMode.value === 'dark' ? '#10b981' : '#059669');
      newLayers.push(expLayer);
    }
  });

  // Always render California as a solid dark yellow anchor state
  if (usStatesGeoJson.value) {
    const caliFeature = usStatesGeoJson.value.features.find((f: any) => f.properties.name === 'California');
    if (caliFeature) {
      const caliLayer = geoJSON(caliFeature, {
        style: {
          color: '#854d0e',
          weight: 2,
          fillColor: '#ca8a04',
          fillOpacity: 0.85,
          lineJoin: 'round'
        }
      }).addTo(mapObject.value!);

      const caliPopupHtml = `
        <div class="custom-map-popup-card">
          <div class="popup-card-content">
            <h4 class="popup-card-title">California</h4>
            <p class="popup-card-description">State of California (Primary Trade Hub)</p>
            <div class="popup-card-footer">
              <span class="popup-card-tag" style="background: rgba(202, 138, 4, 0.2); color: #854d0e;">Home Region</span>
              <span class="popup-card-coords">Anchor Base</span>
            </div>
          </div>
        </div>
      `;

      caliLayer.bindPopup(caliPopupHtml, {
        closeButton: false,
        className: 'custom-leaflet-popup',
        offset: [0, -10]
      });

      caliLayer.on({
        mouseover: (e: any) => {
          e.target.setStyle({ color: '#713f12', weight: 2.5, fillOpacity: 0.95 });
        },
        mouseout: (e: any) => {
          e.target.setStyle({ color: '#854d0e', weight: 2, fillOpacity: 0.85 });
        }
      });

      newLayers.push(caliLayer);
    }
  }

  mapLayers.value = newLayers;

  // Fit bounds dynamically ON INITIAL LOAD ONLY to prevent camera jumping when resizing on mobile
  if (newLayers.length > 0 && !isPlaying.value && isInitialLoad.value) {
    isInitialLoad.value = false;
    const group = featureGroup(newLayers);
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      mapObject.value.fitBounds(bounds, {
        padding: [30, 30],
        maxZoom: 4.5,
        animate: false
      });
    }
  }
};

const isInitialLoad = ref(true);

watch(combinedPartners, () => {
  updateMapLayers();
});

watch(isMobileExpanded, () => {
  setTimeout(() => {
    if (mapObject.value) {
      mapObject.value.invalidateSize({ animate: false });
    }
  }, 360);
});

onMounted(() => {
  if (!mapContainer.value) return;

  // Initialize Map focused on single world instance excluding Antarctica
  const mapInst = map(mapContainer.value, {
    minZoom: 2.2,
    maxZoom: 10,
    worldCopyJump: false,
    maxBounds: [[-60, -180], [85, 180]],
    maxBoundsViscosity: 1.0
  }).setView([25.0, -80.0], 2.2);
  mapObject.value = mapInst;

  setTileLayer();

  // Load spreadsheet database asynchronously
  parseSheetColumns(props.dataSource)
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

        // Extract sub-polygons in descending order to avoid index shifting:
        // Guadeloupe: indices 5, 6, 7
        // Martinique: index 4
        // Mayotte: index 3
        // Réunion: index 2
        // French Guiana: index 1
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

      // Filter out Antarctica to prevent giant boundary stroke box artifacts across 0°, ±180°, and -85°
      countriesJson.features = countriesJson.features.filter((f: any) => f.properties.NAME !== 'Antarctica' && f.properties.ISO_A3 !== 'ATA');

      worldGeoJson.value = countriesJson;
      usStatesGeoJson.value = statesJson;
      updateMapLayers();
    })
    .catch(err => console.error('Failed to load GeoJSON databases:', err));

  // Add Leaflet.BigImage export control to the map
  const bigImage = new CustomBigImageControl({
    position: 'topright',
    title: 'Export Map as Image',
    downloadTitle: 'Download JPEG',
    exportFormat: 'jpeg',
    fileName: `${props.title ? props.title.replace(/\s+/g, '-') : 'Map-Visualization'}-${activeYear.value || 'Map'}`,
    maxScale: 3,
    minScale: 1
  });
  bigImageControlInstance.value = bigImage;
  mapInst.addControl(bigImage);

  window.addEventListener('resize', handleResize);
});

watch([() => props.title, activeYear], () => {
  if (bigImageControlInstance.value) {
    const sanitizedTitle = props.title ? props.title.replace(/\s+/g, '-') : 'Map-Visualization';
    bigImageControlInstance.value.options.fileName = `${sanitizedTitle}-${activeYear.value || 'Map'}`;
  }
}, { immediate: true });

const handleResize = () => {
  if (mapObject.value) {
    mapObject.value.invalidateSize({ animate: false });
  }
};

onBeforeUnmount(() => {
  stopPlay();
  window.removeEventListener('resize', handleResize);
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
  if (bigImageControlInstance.value && mapObject.value) {
    mapObject.value.removeControl(bigImageControlInstance.value);
    bigImageControlInstance.value = null;
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

      <!-- Mobile Backdrop when legend is expanded on mobile -->
      <div v-if="!isLegendCollapsed" class="mobile-legend-backdrop" @click="isLegendCollapsed = true"></div>

      <!-- Floating Map Legend Card -->
      <div class="map-legend-card" :class="{ 'collapsed': isLegendCollapsed }">
        <div class="legend-header" @click="isLegendCollapsed = !isLegendCollapsed">
          <div class="legend-title-group">
            <span class="legend-icon">🗺️</span>
            <span class="legend-title">Trade Legend</span>
          </div>
          <button class="legend-toggle-btn" type="button" :title="isLegendCollapsed ? 'Expand Legend' : 'Collapse Legend'">
            {{ isLegendCollapsed ? '▼' : '▲' }}
          </button>
        </div>

        <div v-show="!isLegendCollapsed" class="legend-body">
          <!-- Import / Energy Sources -->
          <div class="legend-item">
            <svg class="legend-swatch" width="22" height="22">
              <rect width="22" height="22" rx="4"
                :fill="themeMode === 'dark' ? 'url(#colorblind-stripes)' : 'url(#colorblind-stripes-light)'"
                :stroke="themeMode === 'dark' ? '#f97316' : '#ea580c'" stroke-width="1.5" />
            </svg>
            <div class="legend-text">
              <span class="legend-label">Energy Sources (Imports)</span>
              <span class="legend-sub">Orange Diagonal Lines</span>
            </div>
          </div>

          <!-- Export / Energy Uses -->
          <div class="legend-item">
            <svg class="legend-swatch" width="22" height="22">
              <rect width="22" height="22" rx="4"
                :fill="themeMode === 'dark' ? 'url(#colorblind-dots)' : 'url(#colorblind-dots-light)'"
                :stroke="themeMode === 'dark' ? '#10b981' : '#059669'" stroke-width="1.5" />
            </svg>
            <div class="legend-text">
              <span class="legend-label">Energy Uses (Exports)</span>
              <span class="legend-sub">Green Dots</span>
            </div>
          </div>

          <!-- Both Import & Export -->
          <div class="legend-item">
            <svg class="legend-swatch" width="22" height="22">
              <rect width="22" height="22" rx="4"
                :fill="themeMode === 'dark' ? 'url(#colorblind-both)' : 'url(#colorblind-both-light)'"
                :stroke="themeMode === 'dark' ? '#10b981' : '#059669'" stroke-width="1.5" />
            </svg>
            <div class="legend-text">
              <span class="legend-label">Both (Import & Export)</span>
              <span class="legend-sub">Orange Lines + Green Dots</span>
            </div>
          </div>

          <!-- California Anchor -->
          <div class="legend-item">
            <div class="legend-swatch solid-cali-swatch"></div>
            <div class="legend-text">
              <span class="legend-label">California</span>
              <span class="legend-sub">Main Trade Hub</span>
            </div>
          </div>
        </div>
      </div>

      <div ref="mapContainer" class="map-element">
        <!-- Hidden SVG pattern definitions inside map container for screenshot capture compatibility -->
        <svg width="0" height="0" style="position: absolute; pointer-events: none; z-index: -1;">
          <defs>
            <!-- Dark Mode Diagonal Stripe Pattern (Import - Orange Lines) -->
            <pattern id="colorblind-stripes" width="9" height="9" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(249, 115, 22, 0.20)" />
              <line x1="0" y1="0" x2="0" y2="9" stroke="#f97316" stroke-width="1.6" />
            </pattern>

            <!-- Light Mode Diagonal Stripe Pattern (Import - Orange Lines) -->
            <pattern id="colorblind-stripes-light" width="9" height="9" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(234, 88, 12, 0.16)" />
              <line x1="0" y1="0" x2="0" y2="9" stroke="#ea580c" stroke-width="1.6" />
            </pattern>

            <!-- Dark Mode Dot Pattern (Export - Green Dots) -->
            <pattern id="colorblind-dots" width="9" height="9" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(16, 185, 129, 0.20)" />
              <circle cx="4.5" cy="4.5" r="1.5" fill="#10b981" />
            </pattern>

            <!-- Light Mode Dot Pattern (Export - Green Dots) -->
            <pattern id="colorblind-dots-light" width="9" height="9" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(5, 150, 105, 0.16)" />
              <circle cx="4.5" cy="4.5" r="1.5" fill="#059669" />
            </pattern>

            <!-- Dark Mode Both Pattern (Import + Export: Orange Lines + Green Dots) -->
            <pattern id="colorblind-both" width="9" height="9" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(249, 115, 22, 0.08)" />
              <line x1="0" y1="0" x2="0" y2="9" stroke="#f97316" stroke-width="1.6" />
              <circle cx="4.5" cy="4.5" r="1.5" fill="#10b981" />
            </pattern>

            <!-- Light Mode Both Pattern (Import + Export: Orange Lines + Green Dots) -->
            <pattern id="colorblind-both-light" width="9" height="9" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="rgba(234, 88, 12, 0.07)" />
              <line x1="0" y1="0" x2="0" y2="9" stroke="#ea580c" stroke-width="1.6" />
              <circle cx="4.5" cy="4.5" r="1.5" fill="#059669" />
            </pattern>
          </defs>
        </svg>
      </div>
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
  background: rgba(234, 88, 12, 0.15);
  color: #ea580c;
  border: 1px solid rgba(234, 88, 12, 0.3);
}

.export-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.both-badge {
  background: linear-gradient(135deg, rgba(234, 88, 12, 0.18) 0%, rgba(16, 185, 129, 0.18) 100%);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

/* Floating Map Legend Card Styles */
.map-legend-card {
  position: absolute;
  bottom: 24px;
  left: 24px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  width: 236px;
  overflow: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: auto;
}

.dark .map-legend-card {
  background: rgba(15, 23, 42, 0.92);
  border-color: rgba(255, 255, 255, 0.12);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
}

.legend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: rgba(0, 0, 0, 0.02);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  transition: background 0.2s ease;
}

.legend-header:hover {
  background: rgba(0, 0, 0, 0.05);
}

.dark .legend-header {
  background: rgba(255, 255, 255, 0.03);
  border-bottom-color: rgba(255, 255, 255, 0.06);
}

.dark .legend-header:hover {
  background: rgba(255, 255, 255, 0.06);
}

.legend-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-icon {
  font-size: 13px;
}

.legend-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #0f172a;
}

.dark .legend-title {
  color: #f8fafc;
}

.legend-toggle-btn {
  background: transparent;
  border: none;
  font-size: 10px;
  color: #64748b;
  cursor: pointer;
  padding: 2px 4px;
}

.legend-body {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.legend-swatch {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.solid-cali-swatch {
  background: #ca8a04;
  border: 1.5px solid #854d0e;
}

.legend-text {
  display: flex;
  flex-direction: column;
}

.legend-label {
  font-size: 11px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.2;
}

.dark .legend-label {
  color: #f1f5f9;
}

.legend-sub {
  font-size: 10px;
  color: #64748b;
  line-height: 1.2;
}

.dark .legend-sub {
  color: #94a3b8;
}

.mobile-legend-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .mobile-legend-backdrop {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2150;
    background: rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(2px);
  }

  /* Fixed to top-left on mobile, positioned neatly below the Leaflet zoom (+/-) buttons */
  .map-legend-card {
    position: fixed;
    top: 94px;
    bottom: auto;
    left: 12px;
    width: auto;
    min-width: 108px;
    max-width: 260px;
    z-index: 2200; /* Above bottom sheet drawer (z: 2000) and backdrop (z: 2150) */
    border-radius: 20px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
  }

  .map-legend-card.collapsed .legend-header {
    padding: 6px 12px;
    border-bottom: none;
    background: transparent;
  }

  .map-legend-card.collapsed .legend-title {
    font-size: 11px;
  }

  .map-legend-card:not(.collapsed) {
    border-radius: 14px;
    width: 240px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  }

  .map-legend-card:not(.collapsed) .legend-header {
    padding: 8px 12px;
  }

  .map-legend-card:not(.collapsed) .legend-body {
    padding: 8px 12px 10px 12px;
    gap: 6px;
  }

  .map-legend-card:not(.collapsed) .legend-swatch {
    width: 18px;
    height: 18px;
  }

  .map-legend-card:not(.collapsed) .legend-label {
    font-size: 10.5px;
  }

  .map-legend-card:not(.collapsed) .legend-sub {
    font-size: 9.5px;
  }
}

/* Completely hide the default Leaflet.BigImage on-map export button */
#print-container,
.leaflet-control #print-container,
.leaflet-control-container #print-container,
.leaflet-top.leaflet-right #print-container {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
}
</style>