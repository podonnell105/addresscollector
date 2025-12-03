# Address Collector 📍

A beautiful, interactive web application that allows you to draw shapes on a map and collect all addresses within that area. Perfect for real estate professionals, delivery services, marketing campaigns, and anyone who needs to collect addresses from specific geographic regions.

![Address Collector](https://img.shields.io/badge/Status-Ready-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

- **Interactive Map**: Dark-themed map powered by Leaflet.js with CartoDB tiles
- **Location Search**: Search for any location using OpenStreetMap's Nominatim API
- **Drawing Tools**: 
  - 🔷 Polygon - Draw custom shapes
  - ⭕ Circle - Draw circular areas
  - ⬛ Rectangle - Draw rectangular areas
- **Address Collection**: Automatically fetches addresses within drawn areas using OpenStreetMap's Overpass API
- **Address Data**: Each address includes:
  - Street address
  - City
  - State
  - Zipcode
  - Latitude
  - Longitude
- **List Management**:
  - Create multiple address lists
  - Each list is stored separately
  - Delete addresses or entire lists
- **Local Storage**: All lists are automatically saved to your browser's localStorage
- **CSV Export**: Export any list as a CSV file for use in spreadsheets or other applications

## 🚀 Getting Started

### Option 1: Open Directly
Simply open `index.html` in your web browser. No server required!

```bash
open index.html
```

### Option 2: Use a Local Server
For the best experience, use a local development server:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js (if you have npx)
npx serve

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

## 📖 How to Use

### 1. Search for a Location
Use the search box in the sidebar to find any location. Click on a result to zoom to that area.

### 2. Create a New List
Click the **+** button in the "Address Lists" section to create a new list. Give it a descriptive name.

### 3. Draw an Area
Select a drawing tool:
- **Polygon**: Click to place points, close the shape by clicking the first point
- **Circle**: Click and drag to set center and radius
- **Rectangle**: Click and drag to define corners

### 4. Collect Addresses
Once you complete a shape, the app automatically fetches all addresses within that area from OpenStreetMap.

### 5. View & Manage Addresses
- Click on a list to view its addresses
- Double-click an address row to zoom to that location
- Click the ✕ button to remove individual addresses
- Export the list as CSV using the download button

### 6. Export to CSV
Click the download icon in the addresses panel to export your current list as a CSV file.

## 🛠️ Technical Details

### Dependencies (loaded via CDN)
- [Leaflet.js](https://leafletjs.com/) - Interactive maps
- [Leaflet.draw](https://github.com/Leaflet/Leaflet.draw) - Drawing tools
- [CartoDB Basemaps](https://carto.com/basemaps/) - Dark map tiles
- [Nominatim API](https://nominatim.openstreetmap.org/) - Location search
- [Overpass API](https://overpass-api.de/) - Address data from OpenStreetMap

### Browser Support
- Chrome (recommended)
- Firefox
- Safari
- Edge

### Data Storage
All lists and addresses are stored in your browser's localStorage. Data persists between sessions but is local to your browser.

## ⚠️ Important Notes

1. **Address Availability**: The app uses OpenStreetMap data, which may not have complete address coverage in all areas. Urban areas typically have better coverage than rural areas.

2. **Rate Limiting**: Both Nominatim and Overpass APIs have usage limits. For heavy usage, consider setting up your own instances.

3. **Large Areas**: Drawing very large areas may result in timeouts or incomplete data. For best results, draw smaller, focused areas.

## 📁 Project Structure

```
addresscollector/
├── index.html    # Main HTML structure
├── styles.css    # All styling (dark theme)
├── app.js        # Application logic
└── README.md     # This file
```

## 🎨 Customization

### Change Map Theme
Edit the tile layer URL in `app.js` to use different map styles:

```javascript
// Light theme
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {...})

// Satellite
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {...})
```

### Modify Colors
CSS variables in `styles.css` make it easy to customize the color scheme:

```css
:root {
    --accent-primary: #3b82f6;    /* Primary accent color */
    --accent-secondary: #8b5cf6;  /* Secondary accent color */
    --bg-primary: #0a0f1a;        /* Main background */
    /* ... more variables */
}
```

## 📄 License

MIT License - feel free to use this for any purpose!

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues and pull requests.

---

Made with ❤️ for address collection

