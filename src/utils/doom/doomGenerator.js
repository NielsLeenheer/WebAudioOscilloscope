/**
 * DOOM Wireframe Generator
 * Main entry point integrating WAD parsing, geometry, camera, and rendering
 * Uses a Web Worker for off-thread rendering
 */

import {
    parseWad,
    findMapLumps,
    parseVertexes,
    parseLinedefs,
    parseSidedefs,
    parseSectors,
    parseThings,
    getMapList
} from './wadParser.js';
import { processMap, getSolidWalls, getFloorHeightAt, buildSectorPolygons, setSectorPolygonsForFloorLookup } from './mapGeometry.js';
import { createCamera, updateCamera, resetCamera, setDebugCollision, setDebugHeight } from './camera.js';

/**
 * Create a DOOM renderer instance
 * @param {string} wadUrl - URL to the WAD file
 * @param {string} mapName - Initial map name (default: 'E1M1')
 * @returns {Promise<Object>} DOOM renderer object
 */
export async function createDoomRenderer(wadUrl, mapName = 'E1M1') {
    // Parse WAD file
    const wad = await parseWad(wadUrl);

    // Get list of available maps
    const availableMaps = getMapList(wad.lumps);

    // Use first available map if requested map not found
    if (!availableMaps.includes(mapName)) {
        mapName = availableMaps[0] || 'E1M1';
    }

    // Load initial map
    let mapData = loadMapData(wad, mapName);
    let solidWalls = getSolidWalls(mapData.walls);

    // Create floor height lookup function
    const getFloorHeight = (x, y) => getFloorHeightAt(x, y, mapData.floorLines);

    // Create camera at player start with correct floor height
    const camera = createCamera(
        mapData.playerStart.x,
        mapData.playerStart.y,
        mapData.playerStart.angle,
        mapData.playerStart.floorHeight || 0
    );

    // Key state
    const keys = {
        up: false,
        down: false,
        left: false,
        right: false
    };

    // Settings
    let pointDensity = 80;  // Points per line segment (higher = smoother on oscilloscope)
    let optimizeOrder = true;
    let deduplicateLines = true;
    let dedupeThreshold = 25;  // Rounding factor for deduplication (25 = 0.040 tolerance)
    let renderMode = 'frequency';  // 'frequency' or 'points'

    // Worker state
    let worker = null;
    let workerReady = false;
    let renderPending = false;
    let currentPoints = []; // Cached render result

    // Create and initialize worker
    worker = new Worker(
        new URL('../../workers/doom-worker.js', import.meta.url),
        { type: 'module' }
    );

    // Handle worker messages
    worker.onmessage = function(e) {
        const { type, payload } = e.data;

        switch (type) {
            case 'ready':
                workerReady = true;
                // Send initial settings
                worker.postMessage({
                    type: 'setSettings',
                    payload: { pointDensity, optimizeOrder, deduplicateLines, dedupeThreshold, renderMode }
                });
                // Send initial map data
                sendMapToWorker();
                break;

            case 'mapLoaded':
                // Worker has loaded map, can start rendering
                break;

            case 'rendered':
                // Update cached points with new render
                currentPoints = payload.points;
                renderPending = false;
                break;
        }
    };

    worker.onerror = function(e) {
        console.error('DOOM Worker error:', e);
    };

    /**
     * Send map data to worker
     */
    function sendMapToWorker() {
        if (!worker || !workerReady) return;

        worker.postMessage({
            type: 'loadMap',
            payload: {
                walls: mapData.walls,
                sectorPolygons: mapData.sectorPolygons
            }
        });
    }

    /**
     * Request a render from the worker
     */
    function requestRender() {
        if (!worker || !workerReady || renderPending) return;

        renderPending = true;

        // Send camera state to worker
        worker.postMessage({
            type: 'render',
            payload: {
                camera: {
                    x: camera.x,
                    y: camera.y,
                    z: camera.z,
                    angle: camera.angle,
                    fov: camera.fov,
                    nearPlane: camera.nearPlane,
                    farPlane: camera.farPlane,
                    floorHeight: camera.floorHeight
                }
            }
        });
    }

    /**
     * Load map data from WAD
     */
    function loadMapData(wad, mapName) {
        const mapLumps = findMapLumps(wad.lumps, mapName);

        const vertices = parseVertexes(wad.buffer, mapLumps.VERTEXES);
        const linedefs = parseLinedefs(wad.buffer, mapLumps.LINEDEFS);
        const sidedefs = parseSidedefs(wad.buffer, mapLumps.SIDEDEFS);
        const sectors = parseSectors(wad.buffer, mapLumps.SECTORS);
        const things = parseThings(wad.buffer, mapLumps.THINGS);

        const mapData = processMap(vertices, linedefs, sidedefs, sectors, things);

        // Build sector polygons for floor/ceiling rendering
        mapData.sectorPolygons = buildSectorPolygons(vertices, linedefs, sidedefs, sectors);

        // Set sector polygons for floor height lookup (more accurate than linedef-based)
        setSectorPolygonsForFloorLookup(mapData.sectorPolygons);

        return mapData;
    }

    return {
        camera,
        keys,

        /**
         * Get list of available maps
         */
        getAvailableMaps() {
            return availableMaps;
        },

        /**
         * Get current map name
         */
        getCurrentMap() {
            return mapName;
        },

        /**
         * Load a different map
         */
        loadMap(newMapName) {
            if (!availableMaps.includes(newMapName)) {
                throw new Error(`Map ${newMapName} not found`);
            }
            mapName = newMapName;
            mapData = loadMapData(wad, mapName);
            solidWalls = getSolidWalls(mapData.walls);

            // Reset camera to new player start with floor height
            resetCamera(
                camera,
                mapData.playerStart.x,
                mapData.playerStart.y,
                mapData.playerStart.angle,
                mapData.playerStart.floorHeight || 0
            );

            // Send new map data to worker
            sendMapToWorker();
            currentPoints = []; // Clear cached points
        },

        /**
         * Update camera position based on input
         */
        update(deltaTime) {
            updateCamera(camera, keys, deltaTime, solidWalls, getFloorHeight);

            // Request a new render with updated camera
            requestRender();
        },

        /**
         * Get current frame as points for oscilloscope
         * Returns cached result from worker (non-blocking)
         */
        getPoints() {
            return currentPoints;
        },

        /**
         * Reset camera to player start
         */
        reset() {
            resetCamera(
                camera,
                mapData.playerStart.x,
                mapData.playerStart.y,
                mapData.playerStart.angle,
                mapData.playerStart.floorHeight || 0
            );
        },

        /**
         * Set rendering options
         */
        setOptions(options) {
            if (options.pointDensity !== undefined) {
                pointDensity = options.pointDensity;
                if (worker && workerReady) {
                    worker.postMessage({
                        type: 'setSettings',
                        payload: { pointDensity }
                    });
                }
            }
            if (options.optimizeOrder !== undefined) {
                optimizeOrder = options.optimizeOrder;
                if (worker && workerReady) {
                    worker.postMessage({
                        type: 'setSettings',
                        payload: { optimizeOrder }
                    });
                }
            }
            if (options.deduplicateLines !== undefined) {
                deduplicateLines = options.deduplicateLines;
                if (worker && workerReady) {
                    worker.postMessage({
                        type: 'setSettings',
                        payload: { deduplicateLines }
                    });
                }
            }
            if (options.dedupeThreshold !== undefined) {
                dedupeThreshold = options.dedupeThreshold;
                if (worker && workerReady) {
                    worker.postMessage({
                        type: 'setSettings',
                        payload: { dedupeThreshold }
                    });
                }
            }
            if (options.renderMode !== undefined) {
                renderMode = options.renderMode;
                if (worker && workerReady) {
                    worker.postMessage({
                        type: 'setSettings',
                        payload: { renderMode }
                    });
                }
            }
            if (options.moveSpeed !== undefined) {
                camera.moveSpeed = options.moveSpeed;
            }
            if (options.turnSpeed !== undefined) {
                camera.turnSpeed = options.turnSpeed;
            }
        },

        /**
         * Get map bounds (for debugging/minimap)
         */
        getBounds() {
            return mapData.bounds;
        },

        /**
         * Get camera position (for debugging/minimap)
         */
        getPosition() {
            return {
                x: camera.x,
                y: camera.y,
                angle: camera.angle
            };
        },

        /**
         * Set renderer optimization settings
         * @param {Object} rendererSettings - Settings object
         * @param {boolean} rendererSettings.distanceCulling - Enable distance culling
         * @param {number} rendererSettings.maxRenderDistance - Max render distance
         * @param {boolean} rendererSettings.lowResDepth - Use low resolution depth buffer
         * @param {boolean} rendererSettings.coarseEdgeSampling - Use coarse edge sampling
         * @param {boolean} rendererSettings.renderFloorsCeilings - Render floors and ceilings
         */
        setRendererSettings(rendererSettings) {
            if (worker && workerReady) {
                worker.postMessage({
                    type: 'setRendererSettings',
                    payload: rendererSettings
                });
            }
        },

        /**
         * Trigger debug capture for next frame
         */
        triggerDebugCapture() {
            if (worker && workerReady) {
                worker.postMessage({ type: 'triggerDebugCapture' });
            }
        },

        /**
         * Enable/disable collision debug logging
         * @param {boolean} enabled
         */
        setDebugCollision(enabled) {
            setDebugCollision(enabled);
        },

        /**
         * Enable/disable height change debug logging
         * @param {boolean} enabled
         */
        setDebugHeight(enabled) {
            setDebugHeight(enabled);
        },

        /**
         * Clean up worker when done
         */
        destroy() {
            if (worker) {
                worker.terminate();
                worker = null;
            }
        }
    };
}
