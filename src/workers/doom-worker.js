/**
 * DOOM Renderer Worker
 * Performs depth-buffered 3D rendering off the main thread
 */

// Import the renderer - worker modules are supported by Vite
import {
    renderScene3D,
    deduplicateLines,
    dropSmallLines,
    snapLinesToGrid,
    mergeCollinearLines,
    dropParallelDuplicates,
    setRendererSettings,
    triggerDebugCapture
} from '../utils/doom/renderer3d.js';

// Stored map data
let mapData = null;
let settings = {
    deduplicateLines: true,
    dedupeThreshold: 25  // Rounding factor for deduplication (higher = stricter, 25 = 0.040 tolerance)
};

// Multi-pass line-reduction pipeline, ported from cssDOOM's LineRenderer. When
// `enabled`, it replaces the legacy single-pass deduplicateLines with
// dropSmall → snap → merge → dropParallel, collapsing the redundant strokes the
// scene emits (stacked corner edges, linedef-split walls, recessed-opening
// frames) into fewer galvo-cheap segments. Each pass and the grid / tolerances
// are tunable so the laser output can be A/B'd against the old dedupe; flip
// `enabled` off to fall back to deduplicateLines. Defaults mirror cssDOOM.
let lineReduction = {
    enabled: true,
    dropSmall: true,
    snap: true,
    merge: true,
    dropParallel: true,
    gridSize: 0.005,       // snap grid cell (NDC)
    dropPerpTol: 0.02,     // dropParallel perpendicular tolerance (NDC)
    minLineLength: 0.03    // dropSmall minimum segment length (NDC)
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

            // Reduce redundant strokes. The multi-pass pipeline (when enabled)
            // supersedes the legacy single-pass dedupe; flip lineReduction.enabled
            // off to A/B against the old behavior.
            if (lineReduction.enabled && lines.length > 0) {
                const g = lineReduction.gridSize;
                if (lineReduction.dropSmall) lines = dropSmallLines(lines, lineReduction.minLineLength);
                if (lineReduction.snap) lines = snapLinesToGrid(lines, g);
                if (lineReduction.merge) {
                    // Tolerances tied to the grid: only join segments already on the
                    // same grid line (offsetTol < one cell), so a merge never moves a
                    // line perpendicular; gapTol bridges ~1-cell sampling gaps.
                    lines = mergeCollinearLines(lines, { offsetTol: g * 0.5, angleTol: 0.04, gapTol: g * 1.5 });
                }
                if (lineReduction.dropParallel) {
                    lines = dropParallelDuplicates(lines, { perpTol: lineReduction.dropPerpTol });
                }
            } else if (settings.deduplicateLines && lines.length > 0) {
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
            // Partial-merge the line-reduction pipeline config (enabled flag, per-
            // pass toggles, grid / tolerances).
            if (payload.lineReduction !== undefined) {
                Object.assign(lineReduction, payload.lineReduction);
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
