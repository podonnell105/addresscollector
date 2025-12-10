/**
 * CSV Map Viewer - Upload and visualize CSV data on a map
 * Supports both lat/long coordinates and address geocoding
 */

// ========================================
// Global State
// ========================================

const csvState = {
    map: null,
    markersLayer: null,
    data: [],
    currentMode: 'latlong', // 'latlong' or 'address'
    geocodedCache: new Map(), // Cache geocoded results
    isGeocoding: false
};

// ========================================
// Map Initialization
// ========================================

function initMap() {
    // Initialize the map centered on USA
    csvState.map = L.map('map', {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true
    });
    
    // Add satellite tile layer (base)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19
    }).addTo(csvState.map);
    
    // Add labels overlay
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        opacity: 0.9
    }).addTo(csvState.map);
    
    // Initialize markers layer
    csvState.markersLayer = L.featureGroup().addTo(csvState.map);
    
    // Update coordinates and zoom on mouse move/zoom
    csvState.map.on('mousemove', (e) => {
        document.getElementById('coordinates').textContent = 
            `Lat: ${e.latlng.lat.toFixed(5)}, Lng: ${e.latlng.lng.toFixed(5)}`;
    });
    
    csvState.map.on('zoomend', () => {
        document.getElementById('zoom-level').textContent = 
            `Zoom: ${csvState.map.getZoom()}`;
    });
    
    // Initial zoom level display
    document.getElementById('zoom-level').textContent = `Zoom: ${csvState.map.getZoom()}`;
}

// ========================================
// CSV Parsing
// ========================================

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    
    // Parse header - handle both tab and comma separators
    const separator = lines[0].includes('\t') ? '\t' : ',';
    const headers = parseCSVLine(lines[0], separator).map(h => h.trim().toLowerCase());
    
    // Find column indices
    const columnMap = {
        address: findColumn(headers, ['address', 'street', 'street address', 'addr']),
        city: findColumn(headers, ['city', 'town']),
        state: findColumn(headers, ['state', 'province', 'region']),
        zip: findColumn(headers, ['zip', 'zipcode', 'zip code', 'postal', 'postal code', 'postcode']),
        latitude: findColumn(headers, ['latitude', 'lat']),
        longitude: findColumn(headers, ['longitude', 'lng', 'long', 'lon'])
    };
    
    console.log('Column map:', columnMap);
    console.log('Headers:', headers);
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line, separator);
        
        const row = {
            id: i,
            address: getValue(values, columnMap.address),
            city: getValue(values, columnMap.city),
            state: getValue(values, columnMap.state),
            zip: getValue(values, columnMap.zip),
            latitude: parseCoordinate(getValue(values, columnMap.latitude)),
            longitude: parseCoordinate(getValue(values, columnMap.longitude)),
            geocoded: null // Will store geocoded lat/lng if needed
        };
        
        // Only add rows that have some data
        if (row.address || row.city || row.latitude) {
            data.push(row);
        }
    }
    
    return data;
}

function parseCSVLine(line, separator) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

function findColumn(headers, possibleNames) {
    for (const name of possibleNames) {
        const index = headers.indexOf(name);
        if (index !== -1) return index;
    }
    return -1;
}

function getValue(values, index) {
    if (index === -1 || index >= values.length) return '';
    return values[index].replace(/^"|"$/g, '').trim();
}

function parseCoordinate(value) {
    if (!value) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

// ========================================
// File Upload Handling
// ========================================

function setupFileUpload() {
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    
    // Click to upload
    uploadZone.addEventListener('click', () => fileInput.click());
    
    // File input change
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });
    
    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    
    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
}

async function handleFile(file) {
    if (!file.name.endsWith('.csv')) {
        showToast('Please upload a CSV file', 'error');
        return;
    }
    
    showToast('Loading CSV file...');
    updateMapStatus('Loading...');
    
    try {
        const text = await file.text();
        csvState.data = parseCSV(text);
        
        if (csvState.data.length === 0) {
            showToast('No valid data found in CSV', 'error');
            updateMapStatus('Ready');
            return;
        }
        
        console.log('Parsed data:', csvState.data);
        
        // Update UI
        updateStats();
        renderPreviewTable();
        document.getElementById('clear-btn').style.display = 'block';
        
        // Place markers based on current mode
        await placeMarkers();
        
        showToast(`Loaded ${csvState.data.length} rows`, 'success');
        
    } catch (error) {
        console.error('Error parsing CSV:', error);
        showToast('Error parsing CSV file', 'error');
        updateMapStatus('Error');
    }
}

// ========================================
// Marker Placement
// ========================================

async function placeMarkers() {
    // Clear existing markers
    csvState.markersLayer.clearLayers();
    
    if (csvState.data.length === 0) {
        updateMapStatus('Ready');
        return;
    }
    
    updateMapStatus('Placing markers...');
    
    if (csvState.currentMode === 'latlong') {
        placeMarkersLatLong();
    } else {
        await placeMarkersAddress();
    }
    
    // Update mapped count
    const mappedCount = csvState.markersLayer.getLayers().length;
    document.getElementById('stat-mapped').textContent = mappedCount;
    
    // Fit map to markers
    if (mappedCount > 0) {
        fitMapToMarkers();
    }
    
    updateMapStatus(`${mappedCount} markers`);
}

function placeMarkersLatLong() {
    let placed = 0;
    
    for (const row of csvState.data) {
        if (row.latitude !== null && row.longitude !== null) {
            addMarker(row, row.latitude, row.longitude);
            placed++;
        }
    }
    
    if (placed === 0) {
        showToast('No valid lat/long coordinates found', 'warning');
    }
}

async function placeMarkersAddress() {
    const rowsNeedingGeocode = csvState.data.filter(row => {
        // Check if we have cached geocode result
        if (row.geocoded) return false;
        // Check if we can use lat/long directly
        if (row.latitude !== null && row.longitude !== null) return false;
        // Need to geocode
        return row.address || row.city;
    });
    
    // First, place any rows that already have coordinates
    for (const row of csvState.data) {
        if (row.geocoded) {
            addMarker(row, row.geocoded.lat, row.geocoded.lng);
        } else if (row.latitude !== null && row.longitude !== null) {
            addMarker(row, row.latitude, row.longitude);
        }
    }
    
    // If no rows need geocoding, we're done
    if (rowsNeedingGeocode.length === 0) {
        return;
    }
    
    // Show progress
    csvState.isGeocoding = true;
    const progressContainer = document.getElementById('geocoding-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressCount = document.getElementById('progress-count');
    
    progressContainer.classList.add('active');
    progressText.textContent = 'Geocoding addresses...';
    
    let completed = 0;
    let successful = 0;
    
    // Process in batches
    const batchSize = 5;
    
    for (let i = 0; i < rowsNeedingGeocode.length; i += batchSize) {
        const batch = rowsNeedingGeocode.slice(i, i + batchSize);
        
        // Process batch in parallel
        const results = await Promise.all(
            batch.map(row => geocodeAddress(row))
        );
        
        // Add markers for successful geocodes
        for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const result = results[j];
            
            if (result) {
                row.geocoded = result;
                addMarker(row, result.lat, result.lng);
                successful++;
            }
            
            completed++;
        }
        
        // Update progress
        const percent = Math.round((completed / rowsNeedingGeocode.length) * 100);
        progressFill.style.width = `${percent}%`;
        progressCount.textContent = `${completed}/${rowsNeedingGeocode.length}`;
        
        // Delay between batches to avoid rate limiting
        if (i + batchSize < rowsNeedingGeocode.length) {
            await sleep(300);
        }
    }
    
    // Update stats
    const mappedCount = csvState.markersLayer.getLayers().length;
    document.getElementById('stat-mapped').textContent = mappedCount;
    
    // Hide progress and show result
    progressText.textContent = `Done! ${successful} geocoded`;
    
    setTimeout(() => {
        progressContainer.classList.remove('active');
    }, 2000);
    
    csvState.isGeocoding = false;
    
    if (successful < rowsNeedingGeocode.length) {
        const failed = rowsNeedingGeocode.length - successful;
        showToast(`${failed} addresses could not be geocoded`, 'warning');
    }
}

async function geocodeAddress(row) {
    // Build address string
    const parts = [];
    if (row.address) parts.push(row.address);
    if (row.city) parts.push(row.city);
    if (row.state) parts.push(row.state);
    if (row.zip) parts.push(row.zip);
    
    const addressString = parts.join(', ');
    
    if (!addressString) return null;
    
    // Check cache
    const cacheKey = addressString.toLowerCase();
    if (csvState.geocodedCache.has(cacheKey)) {
        return csvState.geocodedCache.get(cacheKey);
    }
    
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressString)}&limit=1`,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'CSVMapViewer/1.0'
                }
            }
        );
        
        if (!response.ok) {
            if (response.status === 429) {
                // Rate limited, wait and retry
                await sleep(1000);
                return geocodeAddress(row);
            }
            return null;
        }
        
        const results = await response.json();
        
        if (results && results.length > 0) {
            const result = {
                lat: parseFloat(results[0].lat),
                lng: parseFloat(results[0].lon)
            };
            
            // Cache result
            csvState.geocodedCache.set(cacheKey, result);
            
            return result;
        }
        
        return null;
        
    } catch (error) {
        console.warn('Geocode error:', error);
        return null;
    }
}

function addMarker(row, lat, lng) {
    const marker = L.marker([lat, lng], {
        icon: createPinIcon()
    });
    
    // Create popup content
    const popupContent = `
        <div style="min-width: 200px; font-family: 'DM Sans', sans-serif;">
            <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">
                ${escapeHtml(row.address || 'No address')}
            </div>
            <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">
                ${escapeHtml(row.city || '')}${row.state ? ', ' + escapeHtml(row.state) : ''}
            </div>
            ${row.zip ? `<div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 4px;">${escapeHtml(row.zip)}</div>` : ''}
            <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 8px; font-family: 'JetBrains Mono', monospace;">
                ${lat.toFixed(6)}, ${lng.toFixed(6)}
            </div>
        </div>
    `;
    
    marker.bindPopup(popupContent);
    
    // Store row ID for highlighting
    marker._rowId = row.id;
    
    // Click handler
    marker.on('click', () => {
        highlightTableRow(row.id);
    });
    
    csvState.markersLayer.addLayer(marker);
}

function createPinIcon() {
    return L.divIcon({
        className: 'custom-pin',
        html: `
            <div style="
                width: 32px;
                height: 32px;
                background: #3b82f6;
                border: 3px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 4px 14px rgba(0,0,0,0.6), 0 0 0 2px rgba(59, 130, 246, 0.3);
                position: relative;
            ">
                <div style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(45deg);
                    width: 10px;
                    height: 10px;
                    background: white;
                    border-radius: 50%;
                "></div>
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
}

// ========================================
// Mode Toggle
// ========================================

function setupModeToggle() {
    const modeButtons = document.querySelectorAll('.mode-btn');
    const modeDescription = document.getElementById('mode-description');
    
    const descriptions = {
        latlong: '<strong>Lat/Long Mode:</strong> Uses the Latitude and Longitude columns directly to place pins on the map. Fastest option.',
        address: '<strong>Address Mode:</strong> Geocodes each address (Address, City, State, Zip) to find coordinates. May take longer for large datasets.'
    };
    
    modeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            if (csvState.isGeocoding) {
                showToast('Please wait for geocoding to complete', 'warning');
                return;
            }
            
            const mode = btn.dataset.mode;
            if (mode === csvState.currentMode) return;
            
            // Update active state
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            csvState.currentMode = mode;
            modeDescription.innerHTML = descriptions[mode];
            
            // Re-place markers
            if (csvState.data.length > 0) {
                await placeMarkers();
            }
        });
    });
}

// ========================================
// UI Updates
// ========================================

function updateStats() {
    const data = csvState.data;
    
    document.getElementById('stat-total').textContent = data.length;
    document.getElementById('stat-cities').textContent = 
        new Set(data.map(r => r.city).filter(Boolean)).size;
    document.getElementById('stat-states').textContent = 
        new Set(data.map(r => r.state).filter(Boolean)).size;
}

function renderPreviewTable() {
    const emptyPreview = document.getElementById('empty-preview');
    const table = document.getElementById('preview-table');
    const tbody = document.getElementById('preview-body');
    
    if (csvState.data.length === 0) {
        emptyPreview.style.display = 'flex';
        table.style.display = 'none';
        return;
    }
    
    emptyPreview.style.display = 'none';
    table.style.display = 'table';
    
    tbody.innerHTML = csvState.data.map(row => `
        <tr data-row-id="${row.id}">
            <td title="${escapeHtml(row.address)}">${escapeHtml(row.address || '—')}</td>
            <td title="${escapeHtml(row.city)}">${escapeHtml(row.city || '—')}</td>
            <td>${escapeHtml(row.state || '—')}</td>
            <td>${escapeHtml(row.zip || '—')}</td>
            <td class="coord">${row.latitude !== null ? row.latitude.toFixed(6) : '—'}</td>
            <td class="coord">${row.longitude !== null ? row.longitude.toFixed(6) : '—'}</td>
        </tr>
    `).join('');
    
    // Add click handlers to rows
    tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
            const rowId = parseInt(tr.dataset.rowId);
            zoomToMarker(rowId);
        });
    });
}

function highlightTableRow(rowId) {
    // Remove previous highlights
    document.querySelectorAll('#preview-body tr.highlighted').forEach(tr => {
        tr.classList.remove('highlighted');
    });
    
    // Add highlight to clicked row
    const row = document.querySelector(`#preview-body tr[data-row-id="${rowId}"]`);
    if (row) {
        row.classList.add('highlighted');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function zoomToMarker(rowId) {
    const row = csvState.data.find(r => r.id === rowId);
    if (!row) return;
    
    let lat, lng;
    
    if (csvState.currentMode === 'latlong') {
        lat = row.latitude;
        lng = row.longitude;
    } else {
        if (row.geocoded) {
            lat = row.geocoded.lat;
            lng = row.geocoded.lng;
        } else if (row.latitude !== null && row.longitude !== null) {
            lat = row.latitude;
            lng = row.longitude;
        }
    }
    
    if (lat && lng) {
        csvState.map.setView([lat, lng], 17);
        
        // Find and open the marker popup
        csvState.markersLayer.eachLayer(marker => {
            if (marker._rowId === rowId) {
                marker.openPopup();
            }
        });
        
        highlightTableRow(rowId);
    }
}

function fitMapToMarkers() {
    if (csvState.markersLayer.getLayers().length > 0) {
        csvState.map.fitBounds(csvState.markersLayer.getBounds(), {
            padding: [50, 50],
            maxZoom: 15
        });
    }
}

function updateMapStatus(status) {
    document.getElementById('map-status').textContent = status;
}

function clearAll() {
    csvState.data = [];
    csvState.markersLayer.clearLayers();
    csvState.geocodedCache.clear();
    
    // Reset UI
    document.getElementById('stat-total').textContent = '0';
    document.getElementById('stat-mapped').textContent = '0';
    document.getElementById('stat-cities').textContent = '0';
    document.getElementById('stat-states').textContent = '0';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('empty-preview').style.display = 'flex';
    document.getElementById('preview-table').style.display = 'none';
    document.getElementById('file-input').value = '';
    
    updateMapStatus('Ready');
    showToast('All data cleared', 'success');
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    toastMessage.textContent = message;
    toast.className = 'csv-toast show' + (type ? ` ${type}` : '');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// Utility Functions
// ========================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// Event Listeners
// ========================================

function setupEventListeners() {
    // Clear button
    document.getElementById('clear-btn').addEventListener('click', clearAll);
    
    // Fit bounds button
    document.getElementById('fit-bounds').addEventListener('click', fitMapToMarkers);
    
    // Toggle clustering (placeholder for future feature)
    document.getElementById('toggle-clustering').addEventListener('click', () => {
        showToast('Clustering feature coming soon!', 'warning');
    });
}

// ========================================
// Initialize Application
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    setupFileUpload();
    setupModeToggle();
    setupEventListeners();
    
    console.log('CSV Map Viewer initialized!');
});

