/**
 * Address Collector - Map Drawing Application
 * Allows users to draw shapes on a map and collect addresses within those areas
 */

// ========================================
// Global State
// ========================================

const state = {
    map: null,
    drawnItems: null,
    drawControl: null,
    currentListId: null,
    lists: [],
    searchTimeout: null,
    addressMarkers: null, // Layer group for address pins
    satelliteLayer: null,
    labelsLayer: null,
    arcgisOverlay: null
};

// ========================================
// Local Storage Management
// ========================================

const Storage = {
    LISTS_KEY: 'addressCollector_lists',
    
    saveLists() {
        try {
            localStorage.setItem(this.LISTS_KEY, JSON.stringify(state.lists));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    },
    
    loadLists() {
        try {
            const saved = localStorage.getItem(this.LISTS_KEY);
            if (saved) {
                state.lists = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            state.lists = [];
        }
    }
};

// ========================================
// Map Initialization
// ========================================

function initMap() {
    // Initialize the map centered on USA
    state.map = L.map('map', {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true
    });
    
    // Add satellite tile layer (base)
    state.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19
    }).addTo(state.map);
    
    // Add labels overlay (places, states, roads) - using CartoDB labels for better visibility
    state.labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        opacity: 0.9
    }).addTo(state.map);
    
    // Add ArcGIS web map overlay (parcel/property data)
    // Web map ID: 841e4f742d444a5aa38957cbd84518fc
    loadArcGISWebMap('841e4f742d444a5aa38957cbd84518fc');
    
    // Initialize feature group for drawn items
    state.drawnItems = new L.FeatureGroup();
    state.map.addLayer(state.drawnItems);
    
    // Initialize feature group for address markers
    state.addressMarkers = new L.FeatureGroup();
    state.map.addLayer(state.addressMarkers);
    
    // Initialize draw control
    state.drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polygon: {
                allowIntersection: false,
                showArea: true,
                showLength: true,
                drawError: {
                    color: '#ef4444',
                    message: '<strong>Error:</strong> Shape edges cannot cross!'
                },
                shapeOptions: {
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.3,
                    weight: 3,
                    clickable: true
                },
                repeatMode: false
            },
            circle: {
                shapeOptions: {
                    color: '#8b5cf6',
                    fillColor: '#8b5cf6',
                    fillOpacity: 0.2,
                    weight: 2
                }
            },
            rectangle: {
                showArea: true,
                shapeOptions: {
                    color: '#10b981',
                    fillColor: '#10b981',
                    fillOpacity: 0.3,
                    weight: 3,
                    clickable: true
                },
                repeatMode: false
            },
            polyline: {
                shapeOptions: {
                    color: '#f59e0b',
                    weight: 4
                },
                metric: true
            },
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: state.drawnItems,
            remove: true
        }
    });
    
    state.map.addControl(state.drawControl);
    
    // Handle draw events
    state.map.on(L.Draw.Event.CREATED, handleDrawCreated);
    
    // Debug: log all draw events
    state.map.on(L.Draw.Event.DRAWSTART, function(e) {
        console.log('Draw started:', e.layerType);
    });
    
    state.map.on(L.Draw.Event.DRAWSTOP, function(e) {
        console.log('Draw stopped');
    });
    
    state.map.on(L.Draw.Event.DRAWVERTEX, function(e) {
        console.log('Vertex added, total vertices:', e.layers ? e.layers.getLayers().length : 'N/A');
    });
    
    // Update coordinates and zoom on mouse move/zoom
    state.map.on('mousemove', (e) => {
        document.getElementById('coordinates').textContent = 
            `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
    });
    
    state.map.on('zoomend', () => {
        document.getElementById('zoom-level').textContent = 
            `Zoom: ${state.map.getZoom()}`;
    });
    
    // Initial zoom level display
    document.getElementById('zoom-level').textContent = `Zoom: ${state.map.getZoom()}`;
}

// ========================================
// ArcGIS Web Map Integration
// ========================================

async function loadArcGISWebMap(webMapId) {
    try {
        // Fetch web map definition from ArcGIS REST API
        const response = await fetch(
            `https://www.arcgis.com/sharing/rest/content/items/${webMapId}/data?f=json`
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch web map data');
        }
        
        const webMapData = await response.json();
        console.log('ArcGIS Web Map loaded:', webMapData);
        
        // Create a layer group for all ArcGIS layers
        state.arcgisOverlay = L.layerGroup().addTo(state.map);
        
        // Process operational layers from the web map
        if (webMapData.operationalLayers && webMapData.operationalLayers.length > 0) {
            for (const layerDef of webMapData.operationalLayers) {
                try {
                    await addArcGISLayer(layerDef);
                } catch (layerError) {
                    console.warn('Failed to load layer:', layerDef.title, layerError);
                }
            }
        }
        
        // Also check for baseMap layers that might have useful data
        if (webMapData.baseMap && webMapData.baseMap.baseMapLayers) {
            for (const layerDef of webMapData.baseMap.baseMapLayers) {
                if (layerDef.layerType === 'ArcGISTiledMapServiceLayer' && layerDef.url) {
                    try {
                        await addArcGISLayer(layerDef);
                    } catch (layerError) {
                        console.warn('Failed to load basemap layer:', layerError);
                    }
                }
            }
        }
        
        console.log('ArcGIS overlay layers added successfully');
        
    } catch (error) {
        console.error('Error loading ArcGIS web map:', error);
        // Fallback: add transportation reference overlay
        addFallbackOverlay();
    }
}

async function addArcGISLayer(layerDef) {
    if (!layerDef.url) return;
    
    const opacity = layerDef.opacity !== undefined ? layerDef.opacity : 0.7;
    const layerUrl = layerDef.url;
    
    // Check if esri-leaflet is available
    if (typeof L.esri === 'undefined') {
        console.warn('esri-leaflet not loaded, skipping layer:', layerDef.title);
        return;
    }
    
    let layer = null;
    
    // Determine layer type based on URL
    if (layerUrl.includes('/FeatureServer') || layerUrl.includes('/featureserver')) {
        // Feature layer
        layer = L.esri.featureLayer({
            url: layerUrl,
            opacity: opacity,
            style: function() {
                return {
                    color: '#3b82f6',
                    weight: 1,
                    fillOpacity: 0.1
                };
            }
        });
    } else if (layerUrl.includes('/MapServer') || layerUrl.includes('/mapserver')) {
        // Try as dynamic map layer first for better interactivity
        layer = L.esri.dynamicMapLayer({
            url: layerUrl,
            opacity: opacity,
            useCors: true
        });
    } else if (layerUrl.includes('/ImageServer')) {
        layer = L.esri.imageMapLayer({
            url: layerUrl,
            opacity: opacity
        });
    }
    
    if (layer) {
        state.arcgisOverlay.addLayer(layer);
        console.log('Added ArcGIS layer:', layerDef.title || layerUrl);
    }
}

function addFallbackOverlay() {
    // Add Esri reference overlay as fallback
    if (typeof L.esri !== 'undefined') {
        try {
            const referenceLayer = L.esri.tiledMapLayer({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer',
                opacity: 0.6
            });
            state.arcgisOverlay = L.layerGroup([referenceLayer]).addTo(state.map);
            console.log('Added fallback transportation reference layer');
        } catch (e) {
            console.warn('Could not add fallback layer:', e);
        }
    }
}

// ========================================
// Drawing Handlers
// ========================================

function handleDrawCreated(e) {
    const layer = e.layer;
    
    console.log('=== SHAPE CREATED ===');
    console.log('Layer type:', e.layerType);
    console.log('Layer:', layer);
    
    // Add the layer to the drawn items group
    state.drawnItems.addLayer(layer);
    
    // Lines (polylines) are just for drawing, don't fetch addresses
    if (e.layerType === 'polyline') {
        showToast('✏️ Line drawn - no address fetch for lines');
        return;
    }
    
    // Check if we have a current list selected
    if (!state.currentListId) {
        // Create a new list automatically
        const listId = createList('Untitled List');
        selectList(listId);
        console.log('Created new list:', listId);
    }
    
    // Start background fetch process (non-blocking)
    console.log('Starting background fetch for:', e.layerType);
    
    if (e.layerType === 'circle') {
        fetchAddressesInBackground(layer, 'circle');
    } else {
        // Works for polygon, rectangle, etc.
        fetchAddressesInBackground(layer, 'polygon');
    }
}

function startDrawing(type) {
    console.log('Starting draw mode:', type);
    
    // Disable any active drawing mode first
    try {
        if (state.drawControl && state.drawControl._toolbars && 
            state.drawControl._toolbars.draw && state.drawControl._toolbars.draw._activeMode) {
            state.drawControl._toolbars.draw._activeMode.handler.disable();
        }
    } catch (e) {
        console.warn('Could not disable previous draw mode:', e);
    }
    
    // Map button IDs to draw types
    const typeMap = {
        'polygon': 'Polygon',
        'circle': 'Circle',
        'rectangle': 'Rectangle',
        'polyline': 'Polyline'
    };
    
    const drawType = typeMap[type.toLowerCase()] || type;
    const optionsKey = type.toLowerCase();
    
    // Get draw options
    const drawOptions = state.drawControl.options.draw[optionsKey] || {};
    
    try {
        // Create and enable drawing handler
        const DrawHandler = L.Draw[drawType];
        if (!DrawHandler) {
            console.error('Draw handler not found for:', drawType);
            return;
        }
        
        const drawingMode = new DrawHandler(state.map, drawOptions);
        drawingMode.enable();
        
        console.log('Draw mode enabled:', drawType);
        
    } catch (error) {
        console.error('Error starting draw mode:', error);
    }
    
    // Update active button state
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`draw-${type.toLowerCase()}`);
    if (btn) btn.classList.add('active');
}

function clearDrawings() {
    state.drawnItems.clearLayers();
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
}

// ========================================
// Address Fetching (Background Process)
// ========================================

// Grid cell size in degrees (roughly 100m = ~0.001 degrees)
const GRID_CELL_SIZE = 0.002; // About 200m per cell
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_DELAY = 1000; // 1 second between batches to avoid rate limiting

// Background fetch process
async function fetchAddressesInBackground(layer, shapeType) {
    const fetchStatus = document.getElementById('fetch-status');
    const progressContainer = document.getElementById('fetch-progress');
    const progressBar = document.getElementById('fetch-progress-bar');
    
    fetchStatus.textContent = 'Preparing...';
    fetchStatus.className = 'status-item loading';
    progressContainer.classList.add('active');
    progressBar.style.width = '0%';
    
    showToast('🔍 Fetching addresses in the background...');
    
    try {
        let bounds;
        let polygon = null;
        let center = null;
        let radius = null;
        
        if (shapeType === 'circle') {
            center = layer.getLatLng();
            radius = layer.getRadius();
            bounds = layer.getBounds();
        } else {
            bounds = layer.getBounds();
            if (layer.getLatLngs) {
                const latLngs = layer.getLatLngs();
                polygon = extractPolygonPoints(latLngs);
            }
        }
        
        if (!bounds || !bounds.isValid()) {
            fetchStatus.textContent = 'Invalid area';
            fetchStatus.className = 'status-item error';
            progressContainer.classList.remove('active');
            showToast('❌ Invalid area selected', 'error');
            return;
        }
        
        // Calculate grid cells to cover the area
        const cells = generateGridCells(bounds, polygon, center, radius);
        console.log(`Generated ${cells.length} grid cells to search`);
        
        if (cells.length === 0) {
            fetchStatus.textContent = 'No valid area';
            fetchStatus.className = 'status-item error';
            progressContainer.classList.remove('active');
            showToast('❌ No valid area to search', 'error');
            return;
        }
        
        showToast(`📍 Searching ${cells.length} areas...`);
        
        // Fetch addresses in background
        let totalFound = 0;
        let processed = 0;
        
        // Process cells in batches
        for (let i = 0; i < cells.length; i += MAX_CONCURRENT_REQUESTS) {
            const batch = cells.slice(i, i + MAX_CONCURRENT_REQUESTS);
            const progress = Math.round((processed / cells.length) * 100);
            
            // Update status and progress bar
            fetchStatus.textContent = `${progress}% (${totalFound} found)`;
            progressBar.style.width = `${progress}%`;
            
            // Fetch batch in parallel
            const results = await Promise.all(
                batch.map(cell => fetchAddressesForCell(cell))
            );
            
            // Process results
            for (const addresses of results) {
                if (addresses && addresses.length > 0) {
                    addAddressesToCurrentList(addresses);
                    totalFound += addresses.length;
                }
            }
            
            processed += batch.length;
            
            // Small delay to avoid rate limiting
            if (i + MAX_CONCURRENT_REQUESTS < cells.length) {
                await sleep(REQUEST_DELAY);
            }
        }
        
        // Final status
        progressBar.style.width = '100%';
        
        if (totalFound > 0) {
            fetchStatus.textContent = `${totalFound} addresses`;
            fetchStatus.className = 'status-item';
            showToast(`✅ Found ${totalFound} addresses!`, 'success');
        } else {
            fetchStatus.textContent = 'No addresses';
            fetchStatus.className = 'status-item';
            showToast('⚠️ No addresses found in this area');
        }
        
        // Hide progress bar after a delay
        setTimeout(() => {
            progressContainer.classList.remove('active');
        }, 2000);
        
    } catch (error) {
        console.error('Error in background fetch:', error);
        fetchStatus.textContent = 'Error';
        fetchStatus.className = 'status-item error';
        progressContainer.classList.remove('active');
        showToast('❌ Error fetching addresses', 'error');
    }
}

// Show toast notification
function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    if (!toast || !toastMessage) return;
    
    toastMessage.textContent = message;
    toast.className = 'toast show' + (type ? ` ${type}` : '');
    
    // Hide after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Extract polygon points from various layer formats
function extractPolygonPoints(latLngs) {
    if (!latLngs || latLngs.length === 0) return null;
    
    // Check various nesting levels
    if (latLngs[0] && latLngs[0].lat !== undefined) {
        return latLngs; // Flat array [LatLng, LatLng, ...]
    } else if (Array.isArray(latLngs[0]) && latLngs[0][0] && latLngs[0][0].lat !== undefined) {
        return latLngs[0]; // Nested [[LatLng, LatLng, ...]]
    } else if (Array.isArray(latLngs[0]) && Array.isArray(latLngs[0][0]) && latLngs[0][0][0] && latLngs[0][0][0].lat !== undefined) {
        return latLngs[0][0]; // Double nested
    }
    return null;
}

// Generate grid cells to cover the bounding area
function generateGridCells(bounds, polygon, center, radius) {
    const cells = [];
    
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();
    
    // Calculate number of cells
    const latSteps = Math.ceil((north - south) / GRID_CELL_SIZE);
    const lngSteps = Math.ceil((east - west) / GRID_CELL_SIZE);
    
    // Limit total cells to prevent massive requests
    const maxCells = 100;
    let actualLatStep = GRID_CELL_SIZE;
    let actualLngStep = GRID_CELL_SIZE;
    
    if (latSteps * lngSteps > maxCells) {
        // Increase cell size to fit within limit
        const scale = Math.sqrt((latSteps * lngSteps) / maxCells);
        actualLatStep = GRID_CELL_SIZE * scale;
        actualLngStep = GRID_CELL_SIZE * scale;
    }
    
    for (let lat = south; lat < north; lat += actualLatStep) {
        for (let lng = west; lng < east; lng += actualLngStep) {
            const cellSouth = lat;
            const cellNorth = Math.min(lat + actualLatStep, north);
            const cellWest = lng;
            const cellEast = Math.min(lng + actualLngStep, east);
            
            // Check if cell center is within the shape
            const cellCenterLat = (cellSouth + cellNorth) / 2;
            const cellCenterLng = (cellWest + cellEast) / 2;
            
            let includeCell = true;
            
            // For circles, check if center is within radius
            if (center && radius) {
                const distance = haversineDistance(center.lat, center.lng, cellCenterLat, cellCenterLng);
                includeCell = distance <= radius;
            }
            // For polygons, check if center is inside
            else if (polygon && polygon.length > 0) {
                includeCell = isPointInPolygon(cellCenterLat, cellCenterLng, polygon);
            }
            
            if (includeCell) {
                cells.push({
                    south: cellSouth,
                    north: cellNorth,
                    west: cellWest,
                    east: cellEast
                });
            }
        }
    }
    
    return cells;
}

// Haversine distance in meters
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

// Fetch addresses for a single grid cell
async function fetchAddressesForCell(cell) {
    try {
        const query = `
            [out:json][timeout:30];
            (
                node["addr:housenumber"](${cell.south},${cell.west},${cell.north},${cell.east});
                way["addr:housenumber"](${cell.south},${cell.west},${cell.north},${cell.east});
                node["addr:full"](${cell.south},${cell.west},${cell.north},${cell.east});
                way["addr:full"](${cell.south},${cell.west},${cell.north},${cell.east});
            );
            out center;
        `;
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'data=' + encodeURIComponent(query)
        });
        
        if (!response.ok) {
            console.warn(`Cell fetch failed: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        const addresses = processOverpassData(data, null);
        
        // Fill in missing city, state, zipcode using reverse geocoding
        const enrichedAddresses = await enrichAddressesWithLocation(addresses);
        return enrichedAddresses;
        
    } catch (error) {
        console.warn('Error fetching cell:', error);
        return [];
    }
}

// Reverse geocode to fill in missing city, state, zipcode
async function enrichAddressesWithLocation(addresses) {
    if (!addresses || addresses.length === 0) return addresses;
    
    // Find addresses missing location data
    const needsEnrichment = addresses.filter(
        addr => !addr.city || !addr.state || !addr.zipcode
    );
    
    if (needsEnrichment.length === 0) return addresses;
    
    console.log(`Enriching ${needsEnrichment.length} addresses with reverse geocoding`);
    
    // Process in small batches to avoid rate limiting
    for (let i = 0; i < needsEnrichment.length; i++) {
        const addr = needsEnrichment[i];
        
        try {
            const locationData = await reverseGeocode(addr.lat, addr.lng);
            
            if (locationData) {
                if (!addr.city && locationData.city) {
                    addr.city = locationData.city;
                }
                if (!addr.state && locationData.state) {
                    addr.state = locationData.state;
                }
                if (!addr.zipcode && locationData.zipcode) {
                    addr.zipcode = locationData.zipcode;
                }
            }
            
            // Small delay between requests to avoid rate limiting
            if (i < needsEnrichment.length - 1) {
                await sleep(200);
            }
            
        } catch (error) {
            console.warn('Reverse geocode failed for:', addr.address, error);
        }
    }
    
    return addresses;
}

// Reverse geocode a single lat/lng to get city, state, zipcode
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AddressCollector/1.0'
                }
            }
        );
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        if (!data || !data.address) {
            return null;
        }
        
        const address = data.address;
        
        return {
            city: address.city || address.town || address.village || address.municipality || address.county || '',
            state: address.state || address.province || '',
            zipcode: address.postcode || ''
        };
        
    } catch (error) {
        console.warn('Reverse geocode error:', error);
        return null;
    }
}

// Enrich all addresses in the current list that are missing city/state/zip
async function enrichCurrentListAddresses() {
    const list = state.lists.find(l => l.id === state.currentListId);
    if (!list || list.addresses.length === 0) return;
    
    const fetchStatus = document.getElementById('fetch-status');
    const progressContainer = document.getElementById('fetch-progress');
    const progressBar = document.getElementById('fetch-progress-bar');
    const enrichBtn = document.getElementById('enrich-addresses');
    
    // Find addresses missing data
    const needsEnrichment = list.addresses.filter(
        addr => !addr.city || !addr.state || !addr.zipcode
    );
    
    if (needsEnrichment.length === 0) {
        showToast('✅ All addresses already have complete data!', 'success');
        return;
    }
    
    // Disable button during processing
    enrichBtn.disabled = true;
    fetchStatus.textContent = 'Enriching...';
    fetchStatus.className = 'status-item loading';
    progressContainer.classList.add('active');
    progressBar.style.width = '0%';
    
    showToast(`🔍 Filling in data for ${needsEnrichment.length} addresses...`);
    
    let enriched = 0;
    
    for (let i = 0; i < needsEnrichment.length; i++) {
        const addr = needsEnrichment[i];
        
        try {
            const locationData = await reverseGeocode(addr.lat, addr.lng);
            
            if (locationData) {
                if (!addr.city && locationData.city) {
                    addr.city = locationData.city;
                }
                if (!addr.state && locationData.state) {
                    addr.state = locationData.state;
                }
                if (!addr.zipcode && locationData.zipcode) {
                    addr.zipcode = locationData.zipcode;
                }
                enriched++;
            }
            
            // Update progress
            const progress = Math.round(((i + 1) / needsEnrichment.length) * 100);
            progressBar.style.width = `${progress}%`;
            fetchStatus.textContent = `${progress}% (${enriched} updated)`;
            
            // Small delay to avoid rate limiting
            if (i < needsEnrichment.length - 1) {
                await sleep(300);
            }
            
        } catch (error) {
            console.warn('Failed to enrich:', addr.address, error);
        }
    }
    
    // Save and refresh
    Storage.saveLists();
    renderAddresses(list.addresses);
    
    // Final status
    progressBar.style.width = '100%';
    fetchStatus.textContent = `${enriched} updated`;
    fetchStatus.className = 'status-item';
    showToast(`✅ Updated ${enriched} addresses with location data!`, 'success');
    
    // Re-enable button and hide progress
    setTimeout(() => {
        progressContainer.classList.remove('active');
        enrichBtn.disabled = false;
        updateEnrichButtonState();
    }, 2000);
}

// Update the enrich button state based on missing data
function updateEnrichButtonState() {
    const enrichBtn = document.getElementById('enrich-addresses');
    const list = state.lists.find(l => l.id === state.currentListId);
    
    if (!list || list.addresses.length === 0) {
        enrichBtn.disabled = true;
        enrichBtn.title = 'No addresses to enrich';
        return;
    }
    
    const needsEnrichment = list.addresses.filter(
        addr => !addr.city || !addr.state || !addr.zipcode
    );
    
    if (needsEnrichment.length > 0) {
        enrichBtn.disabled = false;
        enrichBtn.title = `Fill missing data for ${needsEnrichment.length} address(es)`;
    } else {
        enrichBtn.disabled = true;
        enrichBtn.title = 'All addresses have complete data';
    }
}

// Sleep helper for rate limiting
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Legacy function - kept for compatibility
async function fetchAddressesInBounds(layer) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const fetchStatus = document.getElementById('fetch-status');
    
    loadingOverlay.classList.add('active');
    fetchStatus.textContent = 'Fetching...';
    fetchStatus.className = 'status-item loading';
    
    try {
        let bounds;
        let polygon = null;
        
        if (layer.getBounds) {
            bounds = layer.getBounds();
            
            // Get polygon points for precise filtering
            if (layer.getLatLngs) {
                const latLngs = layer.getLatLngs();
                // Handle nested arrays (rectangles return [[points]], polygons return [points])
                if (latLngs && latLngs.length > 0) {
                    // Check if first element is an array of LatLngs or a LatLng itself
                    if (Array.isArray(latLngs[0]) && latLngs[0].length > 0 && latLngs[0][0].lat !== undefined) {
                        polygon = latLngs[0]; // Nested array, get first ring
                    } else if (latLngs[0].lat !== undefined) {
                        polygon = latLngs; // Already a flat array
                    } else if (Array.isArray(latLngs[0]) && Array.isArray(latLngs[0][0])) {
                        polygon = latLngs[0][0]; // Double nested (some polygon types)
                    }
                }
            }
        }
        
        if (!bounds || !bounds.isValid()) {
            throw new Error('Invalid bounds for the drawn shape');
        }
        
        const south = bounds.getSouth();
        const west = bounds.getWest();
        const north = bounds.getNorth();
        const east = bounds.getEast();
        
        console.log('Fetching addresses in bounds:', { south, west, north, east });
        console.log('Polygon points:', polygon ? polygon.length : 'none');
        
        // Use Overpass API to fetch addresses
        const query = `
            [out:json][timeout:60];
            (
                node["addr:street"]["addr:housenumber"](${south},${west},${north},${east});
                way["addr:street"]["addr:housenumber"](${south},${west},${north},${east});
                relation["addr:street"]["addr:housenumber"](${south},${west},${north},${east});
                node["addr:full"](${south},${west},${north},${east});
                way["addr:full"](${south},${west},${north},${east});
                node["building"]["addr:housenumber"](${south},${west},${north},${east});
                way["building"]["addr:housenumber"](${south},${west},${north},${east});
            );
            out center;
        `;
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'data=' + encodeURIComponent(query)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch addresses: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Overpass API returned:', data.elements ? data.elements.length : 0, 'elements');
        
        const addresses = processOverpassData(data, polygon);
        
        // Add addresses to current list
        if (addresses.length > 0) {
            addAddressesToCurrentList(addresses);
            fetchStatus.textContent = `Found ${addresses.length} addresses`;
            fetchStatus.className = 'status-item';
        } else {
            fetchStatus.textContent = 'No addresses found';
            fetchStatus.className = 'status-item';
        }
        
    } catch (error) {
        console.error('Error fetching addresses:', error);
        fetchStatus.textContent = 'Error fetching';
        fetchStatus.className = 'status-item error';
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

async function fetchAddressesInCircle(center, radius) {
    const loadingOverlay = document.getElementById('loading-overlay');
    const fetchStatus = document.getElementById('fetch-status');
    
    loadingOverlay.classList.add('active');
    fetchStatus.textContent = 'Fetching...';
    fetchStatus.className = 'status-item loading';
    
    try {
        const lat = center.lat;
        const lng = center.lng;
        const radiusInMeters = radius;
        
        console.log('Fetching addresses in circle:', { lat, lng, radius: radiusInMeters });
        
        // Use Overpass API with around query for circles
        const query = `
            [out:json][timeout:60];
            (
                node["addr:street"]["addr:housenumber"](around:${radiusInMeters},${lat},${lng});
                way["addr:street"]["addr:housenumber"](around:${radiusInMeters},${lat},${lng});
                relation["addr:street"]["addr:housenumber"](around:${radiusInMeters},${lat},${lng});
                node["addr:full"](around:${radiusInMeters},${lat},${lng});
                way["addr:full"](around:${radiusInMeters},${lat},${lng});
                node["building"]["addr:housenumber"](around:${radiusInMeters},${lat},${lng});
                way["building"]["addr:housenumber"](around:${radiusInMeters},${lat},${lng});
            );
            out center;
        `;
        
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'data=' + encodeURIComponent(query)
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch addresses');
        }
        
        const data = await response.json();
        const addresses = processOverpassData(data);
        
        if (addresses.length > 0) {
            addAddressesToCurrentList(addresses);
            fetchStatus.textContent = `Found ${addresses.length} addresses`;
            fetchStatus.className = 'status-item';
        } else {
            fetchStatus.textContent = 'No addresses found';
            fetchStatus.className = 'status-item';
        }
        
    } catch (error) {
        console.error('Error fetching addresses:', error);
        fetchStatus.textContent = 'Error fetching';
        fetchStatus.className = 'status-item error';
    } finally {
        loadingOverlay.classList.remove('active');
    }
}

function processOverpassData(data, polygon = null) {
    const addresses = [];
    const seen = new Set();
    
    if (!data || !data.elements) {
        console.warn('No elements in Overpass response');
        return addresses;
    }
    
    console.log('Processing', data.elements.length, 'elements from Overpass API');
    
    for (const element of data.elements) {
        const tags = element.tags || {};
        let lat, lng;
        
        // Get coordinates
        if (element.type === 'node') {
            lat = element.lat;
            lng = element.lon;
        } else if (element.center) {
            lat = element.center.lat;
            lng = element.center.lon;
        } else if (element.lat && element.lon) {
            lat = element.lat;
            lng = element.lon;
        } else {
            continue;
        }
        
        // If we have a polygon, check if point is inside
        if (polygon && polygon.length > 0 && !isPointInPolygon(lat, lng, polygon)) {
            continue;
        }
        
        // Build address - handle multiple address formats
        let fullAddress = '';
        const houseNumber = tags['addr:housenumber'] || '';
        const street = tags['addr:street'] || '';
        const city = tags['addr:city'] || '';
        const state = tags['addr:state'] || '';
        const zipcode = tags['addr:postcode'] || '';
        
        // Try addr:full first, then construct from parts
        if (tags['addr:full']) {
            fullAddress = tags['addr:full'];
        } else if (houseNumber && street) {
            fullAddress = `${houseNumber} ${street}`.trim();
        } else if (street) {
            fullAddress = street;
        } else if (tags['name'] && tags['building']) {
            fullAddress = tags['name'];
        }
        
        if (!fullAddress) continue;
        
        // Create unique key to avoid duplicates
        const key = `${fullAddress}-${city}-${zipcode}-${lat.toFixed(4)}-${lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        
        addresses.push({
            id: generateId(),
            address: fullAddress,
            city: city,
            state: state,
            zipcode: zipcode,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6)
        });
    }
    
    return addresses;
}

function isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    const x = lng, y = lat;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng, yi = polygon[i].lat;
        const xj = polygon[j].lng, yj = polygon[j].lat;
        
        if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
}

// ========================================
// List Management
// ========================================

function createList(name) {
    const list = {
        id: generateId(),
        name: name || 'Untitled List',
        createdAt: new Date().toISOString(),
        addresses: []
    };
    
    state.lists.push(list);
    Storage.saveLists();
    renderLists();
    
    return list.id;
}

function selectList(listId) {
    state.currentListId = listId;
    
    // Update UI
    document.querySelectorAll('.list-item').forEach(item => {
        item.classList.toggle('active', item.dataset.listId === listId);
    });
    
    const list = state.lists.find(l => l.id === listId);
    if (list) {
        document.getElementById('current-list-name').textContent = list.name;
        document.getElementById('export-csv').disabled = list.addresses.length === 0;
        renderAddresses(list.addresses);
        updateAddressMarkers(list.addresses);
        updateEnrichButtonState();
    } else {
        updateAddressMarkers([]);
        document.getElementById('enrich-addresses').disabled = true;
    }
}

function deleteList(listId) {
    const index = state.lists.findIndex(l => l.id === listId);
    if (index !== -1) {
        state.lists.splice(index, 1);
        Storage.saveLists();
        
        if (state.currentListId === listId) {
            state.currentListId = null;
            document.getElementById('current-list-name').textContent = 'No List Selected';
            document.getElementById('export-csv').disabled = true;
            document.getElementById('enrich-addresses').disabled = true;
            renderAddresses([]);
            updateAddressMarkers([]);
        }
        
        renderLists();
    }
}

function addAddressesToCurrentList(addresses) {
    const list = state.lists.find(l => l.id === state.currentListId);
    if (!list) return;
    
    // Add only unique addresses
    for (const addr of addresses) {
        const exists = list.addresses.some(
            a => a.address === addr.address && a.city === addr.city && a.zipcode === addr.zipcode
        );
        if (!exists) {
            list.addresses.push(addr);
        }
    }
    
    Storage.saveLists();
    renderAddresses(list.addresses);
    updateAddressMarkers(list.addresses);
    renderLists();
    document.getElementById('export-csv').disabled = list.addresses.length === 0;
    updateEnrichButtonState();
}

function deleteAddress(addressId) {
    const list = state.lists.find(l => l.id === state.currentListId);
    if (!list) return;
    
    const index = list.addresses.findIndex(a => a.id === addressId);
    if (index !== -1) {
        list.addresses.splice(index, 1);
        Storage.saveLists();
        renderAddresses(list.addresses);
        updateAddressMarkers(list.addresses);
        renderLists();
        document.getElementById('export-csv').disabled = list.addresses.length === 0;
    }
}

// ========================================
// Address Markers (Pins)
// ========================================

// Create custom pin icon that's visible on satellite imagery
function createPinIcon() {
    return L.divIcon({
        className: 'custom-pin',
        html: `
            <div style="
                width: 40px;
                height: 40px;
                background: #3b82f6;
                border: 4px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 4px 14px rgba(0,0,0,0.6), 0 0 0 2px rgba(59, 130, 246, 0.3);
                position: relative;
                z-index: 1000;
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(45deg);
                    width: 14px;
                    height: 14px;
                    background: white;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                "></div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
    });
}

// Update address markers on the map
function updateAddressMarkers(addresses) {
    // Clear existing markers
    state.addressMarkers.clearLayers();
    
    if (!addresses || addresses.length === 0) {
        return;
    }
    
    // Create markers for each address
    addresses.forEach(addr => {
        if (!addr.lat || !addr.lng) return;
        
        const lat = parseFloat(addr.lat);
        const lng = parseFloat(addr.lng);
        
        if (isNaN(lat) || isNaN(lng)) return;
        
        const marker = L.marker([lat, lng], {
            icon: createPinIcon()
        });
        
        // Create popup content
        const popupContent = `
            <div style="min-width: 200px; font-family: 'DM Sans', sans-serif;">
                <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">
                    ${escapeHtml(addr.address)}
                </div>
                <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">
                    ${escapeHtml(addr.city)}${addr.state ? ', ' + escapeHtml(addr.state) : ''}
                </div>
                ${addr.zipcode ? `<div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">${escapeHtml(addr.zipcode)}</div>` : ''}
                <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 8px; font-family: 'JetBrains Mono', monospace;">
                    ${lat.toFixed(6)}, ${lng.toFixed(6)}
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        
        // Add click handler to zoom to address
        marker.on('click', () => {
            state.map.setView([lat, lng], 18);
        });
        
        state.addressMarkers.addLayer(marker);
    });
    
    // Fit map to show all markers if there are any
    if (addresses.length > 0) {
        const group = new L.featureGroup(state.addressMarkers.getLayers());
        if (group.getBounds().isValid()) {
            state.map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

// ========================================
// Location Search
// ========================================

async function searchLocation(query) {
    if (!query || query.length < 3) {
        hideSearchResults();
        return;
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) throw new Error('Search failed');
        
        const results = await response.json();
        displaySearchResults(results);
        
    } catch (error) {
        console.error('Search error:', error);
        hideSearchResults();
    }
}

function displaySearchResults(results) {
    const container = document.getElementById('search-results');
    
    if (!results || results.length === 0) {
        container.innerHTML = '<div class="search-result-item"><span class="result-name">No results found</span></div>';
        container.classList.add('active');
        return;
    }
    
    container.innerHTML = results.map(result => `
        <div class="search-result-item" data-lat="${result.lat}" data-lng="${result.lon}">
            <div class="result-name">${result.display_name.split(',')[0]}</div>
            <div class="result-address">${result.display_name.split(',').slice(1, 3).join(',')}</div>
        </div>
    `).join('');
    
    container.classList.add('active');
    
    // Add click handlers
    container.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                state.map.setView([lat, lng], 15);
                
                // Add a marker
                L.marker([lat, lng])
                    .addTo(state.map)
                    .bindPopup(item.querySelector('.result-name').textContent)
                    .openPopup();
            }
            
            hideSearchResults();
            document.getElementById('location-search').value = '';
        });
    });
}

function hideSearchResults() {
    document.getElementById('search-results').classList.remove('active');
}

// ========================================
// CSV Export
// ========================================

function exportToCSV() {
    const list = state.lists.find(l => l.id === state.currentListId);
    if (!list || list.addresses.length === 0) return;
    
    // Create CSV content
    const headers = ['Address', 'City', 'State', 'Zipcode', 'Latitude', 'Longitude'];
    const rows = list.addresses.map(a => [
        `"${a.address.replace(/"/g, '""')}"`,
        `"${a.city.replace(/"/g, '""')}"`,
        `"${a.state.replace(/"/g, '""')}"`,
        `"${a.zipcode}"`,
        a.lat,
        a.lng
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${list.name.replace(/[^a-z0-9]/gi, '_')}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ========================================
// UI Rendering
// ========================================

function renderLists() {
    const container = document.getElementById('lists-container');
    
    if (state.lists.length === 0) {
        container.innerHTML = `
            <div class="empty-lists">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                <p>No lists yet. Click + to create one.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.lists.map(list => `
        <div class="list-item ${list.id === state.currentListId ? 'active' : ''}" data-list-id="${list.id}">
            <div class="list-item-info">
                <div class="list-item-name">${escapeHtml(list.name)}</div>
                <div class="list-item-count">${list.addresses.length} address${list.addresses.length !== 1 ? 'es' : ''}</div>
            </div>
            <div class="list-item-actions">
                <button class="list-action-btn delete" data-delete-list="${list.id}" title="Delete list">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    container.querySelectorAll('.list-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.list-action-btn')) {
                selectList(item.dataset.listId);
            }
        });
    });
    
    container.querySelectorAll('[data-delete-list]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this list?')) {
                deleteList(btn.dataset.deleteList);
            }
        });
    });
}

function renderAddresses(addresses) {
    const tbody = document.getElementById('addresses-body');
    const emptyState = document.getElementById('empty-state');
    const table = document.getElementById('addresses-table');
    
    // Update stats
    document.getElementById('address-count').textContent = addresses.length;
    document.getElementById('unique-zips').textContent = new Set(addresses.map(a => a.zipcode).filter(Boolean)).size;
    document.getElementById('unique-cities').textContent = new Set(addresses.map(a => a.city).filter(Boolean)).size;
    
    if (addresses.length === 0) {
        emptyState.classList.remove('hidden');
        table.style.display = 'none';
        return;
    }
    
    emptyState.classList.add('hidden');
    table.style.display = 'table';
    
    tbody.innerHTML = addresses.map(addr => {
        // Ensure lat/lng are properly formatted and displayed
        const lat = addr.lat ? parseFloat(addr.lat).toFixed(6) : 'N/A';
        const lng = addr.lng ? parseFloat(addr.lng).toFixed(6) : 'N/A';
        
        // Check for missing data
        const cityClass = !addr.city ? 'missing-data' : '';
        const stateClass = !addr.state ? 'missing-data' : '';
        const zipClass = !addr.zipcode ? 'missing-data' : '';
        
        const cityDisplay = addr.city || '—';
        const stateDisplay = addr.state || '—';
        const zipDisplay = addr.zipcode || '—';
        
        return `
        <tr data-address-id="${addr.id}">
            <td title="${escapeHtml(addr.address)}">${escapeHtml(addr.address)}</td>
            <td class="${cityClass}" title="${addr.city ? escapeHtml(addr.city) : 'Missing - click Enrich to fill'}">${escapeHtml(cityDisplay)}</td>
            <td class="${stateClass}" title="${addr.state ? escapeHtml(addr.state) : 'Missing - click Enrich to fill'}">${escapeHtml(stateDisplay)}</td>
            <td class="${zipClass}" title="${addr.zipcode ? escapeHtml(addr.zipcode) : 'Missing - click Enrich to fill'}">${escapeHtml(zipDisplay)}</td>
            <td class="coord-cell" title="Latitude: ${lat}">${lat}</td>
            <td class="coord-cell" title="Longitude: ${lng}">${lng}</td>
            <td>
                <button class="delete-address-btn" data-delete-address="${addr.id}" title="Remove">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </td>
        </tr>
    `;
    }).join('');
    
    // Add delete handlers
    tbody.querySelectorAll('[data-delete-address]').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteAddress(btn.dataset.deleteAddress);
        });
    });
    
    // Add click to zoom handlers
    tbody.querySelectorAll('tr').forEach(row => {
        row.addEventListener('dblclick', () => {
            const addr = addresses.find(a => a.id === row.dataset.addressId);
            if (addr) {
                state.map.setView([parseFloat(addr.lat), parseFloat(addr.lng)], 18);
            }
        });
    });
}

// ========================================
// Modal Handling
// ========================================

function openNewListModal() {
    document.getElementById('new-list-modal').classList.add('active');
    document.getElementById('list-name').value = '';
    document.getElementById('list-name').focus();
}

function closeNewListModal() {
    document.getElementById('new-list-modal').classList.remove('active');
}

function handleCreateList() {
    const name = document.getElementById('list-name').value.trim();
    if (name) {
        const listId = createList(name);
        selectList(listId);
        closeNewListModal();
    }
}

// ========================================
// Panel Toggle
// ========================================

function toggleAddressPanel() {
    const panel = document.getElementById('addresses-panel');
    const toggleBtn = document.getElementById('toggle-panel');
    
    panel.classList.toggle('collapsed');
    
    // Rotate the chevron icon
    toggleBtn.style.transform = panel.classList.contains('collapsed') ? 'rotate(180deg)' : '';
    
    // Trigger map resize to fix layout
    setTimeout(() => state.map.invalidateSize(), 300);
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar');
    
    sidebar.classList.toggle('collapsed');
    
    // Rotate the chevron icon
    toggleBtn.style.transform = sidebar.classList.contains('collapsed') ? 'rotate(180deg)' : '';
    
    // Trigger map resize to fix layout
    setTimeout(() => state.map.invalidateSize(), 300);
}

// ========================================
// Utility Functions
// ========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// Event Listeners
// ========================================

function setupEventListeners() {
    // Drawing buttons
    document.getElementById('draw-polygon').addEventListener('click', () => startDrawing('polygon'));
    document.getElementById('draw-circle').addEventListener('click', () => startDrawing('circle'));
    document.getElementById('draw-rectangle').addEventListener('click', () => startDrawing('rectangle'));
    document.getElementById('draw-polyline').addEventListener('click', () => startDrawing('polyline'));
    document.getElementById('clear-drawings').addEventListener('click', clearDrawings);
    
    // Search
    const searchInput = document.getElementById('location-search');
    searchInput.addEventListener('input', (e) => {
        clearTimeout(state.searchTimeout);
        state.searchTimeout = setTimeout(() => searchLocation(e.target.value), 300);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSearchResults();
            searchInput.blur();
        }
    });
    
    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            hideSearchResults();
        }
    });
    
    // New list button
    document.getElementById('new-list-btn').addEventListener('click', openNewListModal);
    
    // Modal handlers
    document.getElementById('modal-close').addEventListener('click', closeNewListModal);
    document.getElementById('modal-cancel').addEventListener('click', closeNewListModal);
    document.getElementById('modal-create').addEventListener('click', handleCreateList);
    
    document.getElementById('list-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleCreateList();
        } else if (e.key === 'Escape') {
            closeNewListModal();
        }
    });
    
    // Close modal on overlay click
    document.getElementById('new-list-modal').addEventListener('click', (e) => {
        if (e.target.id === 'new-list-modal') {
            closeNewListModal();
        }
    });
    
    // Export CSV
    document.getElementById('export-csv').addEventListener('click', exportToCSV);
    
    // Enrich addresses button
    document.getElementById('enrich-addresses').addEventListener('click', enrichCurrentListAddresses);
    
    // Panel toggle
    document.getElementById('toggle-panel').addEventListener('click', toggleAddressPanel);
    
    // Sidebar toggle
    document.getElementById('toggle-sidebar').addEventListener('click', toggleSidebar);
}

// ========================================
// Initialize Application
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Load saved lists from localStorage
    Storage.loadLists();
    
    // Initialize the map
    initMap();
    
    // Setup event listeners
    setupEventListeners();
    
    // Render initial lists
    renderLists();
    
    // Select first list if exists
    if (state.lists.length > 0) {
        selectList(state.lists[0].id);
    }
    
    console.log('Address Collector initialized!');
});

