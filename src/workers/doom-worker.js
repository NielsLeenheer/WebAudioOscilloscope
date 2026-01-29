/**
 * DOOM Renderer Worker
 * Performs depth-buffered 3D rendering off the main thread
 */

// Import the renderer - worker modules are supported by Vite
import {
    renderScene3D,
    deduplicateLines,
    setRendererSettings,
    triggerDebugCapture
} from '../utils/doom/renderer3d.js';

// Stored map data
let mapData = null;
let settings = {
    deduplicateLines: true,
    dedupeThreshold: 25  // Rounding factor for deduplication (higher = stricter, 25 = 0.040 tolerance)
};

// Handle messages from main thread
self.onmessage = function(e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'loadMap':
            // Store map data for rendering
            mapData = {
                walls: payload.walls,
                sectorPolygons: payload.sectorPolygons
            };
            self.postMessage({ type: 'mapLoaded' });
            break;

        case 'render':
            // Perform rendering with given camera state
            if (!mapData) {
                self.postMessage({ type: 'rendered', payload: { points: [] } });
                return;
            }

            const camera = payload.camera;

            // Render visible lines using depth-buffered 3D renderer
            let lines = renderScene3D(mapData.walls, camera, mapData.sectorPolygons);

            // Remove duplicate lines
            if (settings.deduplicateLines && lines.length > 0) {
                lines = deduplicateLines(lines, settings.dedupeThreshold);
            }

            // Convert to raw 2-point segments (frame-processor worker handles reordering/resampling)
            const points = lines.map(line => [line.start, line.end]);

            self.postMessage({ type: 'rendered', payload: { points } });
            break;

        case 'setSettings':
            // Update local settings
            if (payload.deduplicateLines !== undefined) {
                settings.deduplicateLines = payload.deduplicateLines;
            }
            if (payload.dedupeThreshold !== undefined) {
                settings.dedupeThreshold = payload.dedupeThreshold;
            }
            break;

        case 'setRendererSettings':
            // Update renderer settings (distance culling, depth buffer res, etc.)
            setRendererSettings(payload);
            break;

        case 'triggerDebugCapture':
            // Enable debug capture for next frame
            triggerDebugCapture();
            break;

        default:
            console.warn('Unknown message type:', type);
    }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
