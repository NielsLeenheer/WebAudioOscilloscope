/**
 * DOOM Map Geometry Processor
 * Converts raw WAD data into renderable wall segments
 */

/**
 * Process map data into wall segments
 * @param {Array} vertices - Parsed vertices
 * @param {Array} linedefs - Parsed linedefs
 * @param {Array} sidedefs - Parsed sidedefs
 * @param {Array} sectors - Parsed sectors
 * @param {Array} things - Parsed things (for player start)
 * @returns {Object} Processed map data
 */
export function processMap(vertices, linedefs, sidedefs, sectors, things) {
    const walls = [];
    const horizontalSurfaces = []; // Floor/ceiling surfaces
    // Store linedef info for floor height lookups
    const floorLines = [];

    for (let i = 0; i < linedefs.length; i++) {
        const linedef = linedefs[i];
        const start = vertices[linedef.startVertex];
        const end = vertices[linedef.endVertex];

        if (!start || !end) continue;

        // Check if this linedef is a door (has a door-related special type)
        const isDoor = isDoorType(linedef.specialType);

        // One-sided linedef = solid wall (no back sidedef)
        if (linedef.backSidedef === -1 || linedef.backSidedef === 0xFFFF) {
            if (linedef.frontSidedef === -1 || linedef.frontSidedef === 0xFFFF) continue;

            const sidedef = sidedefs[linedef.frontSidedef];
            if (!sidedef) continue;

            const sector = sectors[sidedef.sectorIndex];
            if (!sector) continue;

            walls.push({
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
                bottomHeight: sector.floorHeight,
                topHeight: sector.ceilingHeight,
                isSolid: true,
                isDoor,
                linedefIndex: i
            });

            // Store for floor height lookup (one-sided, only front sector matters)
            floorLines.push({
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
                frontFloor: sector.floorHeight,
                backFloor: sector.floorHeight, // Same as front for one-sided
                isTwoSided: false
            });
        } else {
            // Two-sided linedef - may have upper/lower walls if heights differ
            const frontSidedef = sidedefs[linedef.frontSidedef];
            const backSidedef = sidedefs[linedef.backSidedef];

            if (!frontSidedef || !backSidedef) continue;

            const frontSector = sectors[frontSidedef.sectorIndex];
            const backSector = sectors[backSidedef.sectorIndex];

            if (!frontSector || !backSector) continue;

            // Store for floor height lookup
            floorLines.push({
                start: { x: start.x, y: start.y },
                end: { x: end.x, y: end.y },
                frontFloor: frontSector.floorHeight,
                backFloor: backSector.floorHeight,
                isTwoSided: true
            });

            // Lower wall (step) - visible from both sides
            const lowerFloor = Math.min(frontSector.floorHeight, backSector.floorHeight);
            const upperFloor = Math.max(frontSector.floorHeight, backSector.floorHeight);
            if (upperFloor > lowerFloor) {
                // Create wall facing front sector (camera in front sector looking at back)
                // "Behind" this wall is the back sector
                walls.push({
                    start: { x: start.x, y: start.y },
                    end: { x: end.x, y: end.y },
                    bottomHeight: lowerFloor,
                    topHeight: upperFloor,
                    isSolid: false,
                    isDoor,
                    isLowerWall: true,
                    behindFloorHeight: backSector.floorHeight,
                    behindCeilingHeight: backSector.ceilingHeight,
                    linedefIndex: i
                });
                // Create wall facing back sector (camera in back sector looking at front)
                // "Behind" this wall is the front sector
                walls.push({
                    start: { x: end.x, y: end.y },
                    end: { x: start.x, y: start.y },
                    bottomHeight: lowerFloor,
                    topHeight: upperFloor,
                    isSolid: false,
                    isDoor,
                    isLowerWall: true,
                    behindFloorHeight: frontSector.floorHeight,
                    behindCeilingHeight: frontSector.ceilingHeight,
                    linedefIndex: i
                });

                // Note: We don't generate artificial step tread surfaces here.
                // Proper horizontal surface rendering requires sector floor polygons,
                // which are complex arbitrary shapes in DOOM. The back-face culling
                // on walls already provides good occlusion for the wireframe view.
            }

            // Upper wall (ceiling step) - visible from both sides
            const lowerCeiling = Math.min(frontSector.ceilingHeight, backSector.ceilingHeight);
            const upperCeiling = Math.max(frontSector.ceilingHeight, backSector.ceilingHeight);
            if (upperCeiling > lowerCeiling) {
                // Create wall facing front sector
                walls.push({
                    start: { x: start.x, y: start.y },
                    end: { x: end.x, y: end.y },
                    bottomHeight: lowerCeiling,
                    topHeight: upperCeiling,
                    isSolid: false,
                    isDoor,
                    isUpperWall: true,
                    behindFloorHeight: backSector.floorHeight,
                    behindCeilingHeight: backSector.ceilingHeight,
                    linedefIndex: i
                });
                // Create wall facing back sector (reversed vertices)
                walls.push({
                    start: { x: end.x, y: end.y },
                    end: { x: start.x, y: start.y },
                    bottomHeight: lowerCeiling,
                    topHeight: upperCeiling,
                    isSolid: false,
                    isDoor,
                    isUpperWall: true,
                    behindFloorHeight: frontSector.floorHeight,
                    behindCeilingHeight: frontSector.ceilingHeight,
                    linedefIndex: i
                });
            }
        }
    }

    // Calculate map bounds
    const bounds = calculateBounds(vertices);

    // Find player start position (thing type 1 = Player 1 start)
    const playerStart = findPlayerStart(things);

    // Find initial floor height at player start
    playerStart.floorHeight = getFloorHeightAt(playerStart.x, playerStart.y, floorLines);

    return { walls, bounds, playerStart, floorLines, horizontalSurfaces };
}

// Cached sector polygons for floor height lookup
let cachedSectorPolygons = null;

/**
 * Set sector polygons for floor height lookup
 * @param {Array} sectorPolygons - Array of sector polygon objects
 */
export function setSectorPolygonsForFloorLookup(sectorPolygons) {
    cachedSectorPolygons = sectorPolygons;
}

// Debug flag for floor lookup
let debugFloorLookup = false;
let lastFloorLookupMethod = 'none';

export function setDebugFloorLookup(enabled) {
    debugFloorLookup = enabled;
}

export function getLastFloorLookupMethod() {
    return lastFloorLookupMethod;
}

/**
 * Get floor height at a position
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Array} floorLines - Array of floor line data
 * @returns {number} Floor height at position
 */
export function getFloorHeightAt(x, y, floorLines) {
    // First, try sector polygon containment (most accurate)
    if (cachedSectorPolygons && cachedSectorPolygons.length > 0) {
        const sectorFloor = getFloorHeightFromSectorPolygons(x, y, cachedSectorPolygons);
        if (sectorFloor !== null) {
            lastFloorLookupMethod = 'sector-polygon';
            return sectorFloor;
        }
    }

    // Using fallback - log this as it may indicate a problem
    lastFloorLookupMethod = 'linedef-fallback';

    // Fallback: Find the floor height by checking which side of nearby linedefs we're on
    // Use a simple approach: find closest linedef and determine side

    let closestDist = Infinity;
    let floorHeight = 0;

    for (const line of floorLines) {
        // Calculate distance from point to line segment
        const dist = pointToLineDistance(x, y, line.start, line.end);

        if (dist < closestDist) {
            closestDist = dist;

            // Determine which side of the line the point is on
            const side = pointSide(x, y, line.start, line.end);

            // Front side (right of line direction) gets frontFloor
            // Back side (left of line direction) gets backFloor
            floorHeight = side >= 0 ? line.frontFloor : line.backFloor;
        }
    }

    // Also check if we're very close to multiple linedefs and take the highest floor
    // This handles corners and intersections better
    const nearbyThreshold = 32; // DOOM player radius
    let maxFloor = floorHeight;

    for (const line of floorLines) {
        const dist = pointToLineDistance(x, y, line.start, line.end);
        if (dist < nearbyThreshold) {
            const side = pointSide(x, y, line.start, line.end);
            const lineFloor = side >= 0 ? line.frontFloor : line.backFloor;
            maxFloor = Math.max(maxFloor, lineFloor);
        }
    }

    return maxFloor;
}

/**
 * Get floor height by checking which sector polygon contains the point
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Array} sectorPolygons - Array of sector polygon objects
 * @returns {number|null} Floor height or null if not found
 */
function getFloorHeightFromSectorPolygons(x, y, sectorPolygons) {
    const point = { x, y };

    // Find all sectors that contain this point
    const containingSectors = [];

    for (const sector of sectorPolygons) {
        // Check outer boundary
        const outerBoundary = sector.boundaries[0];
        if (!outerBoundary || outerBoundary.length < 3) continue;

        if (pointInPolygon(point, outerBoundary)) {
            // Check if point is in any hole (then it's not in this sector)
            let inHole = false;
            for (let i = 1; i < sector.boundaries.length; i++) {
                const hole = sector.boundaries[i];
                if (hole && hole.length >= 3 && pointInPolygon(point, hole)) {
                    inHole = true;
                    break;
                }
            }

            if (!inHole) {
                containingSectors.push(sector);
            }
        }
    }

    if (containingSectors.length === 0) {
        return null; // Point not in any sector, use fallback
    }

    // If multiple sectors contain the point (overlapping), take the highest floor
    // This handles cases like raised platforms
    let maxFloor = -Infinity;
    for (const sector of containingSectors) {
        if (sector.floorHeight > maxFloor) {
            maxFloor = sector.floorHeight;
        }
    }

    return maxFloor;
}

/**
 * Calculate distance from point to line segment
 */
function pointToLineDistance(px, py, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        // Point segment
        return Math.sqrt((px - start.x) ** 2 + (py - start.y) ** 2);
    }

    let t = ((px - start.x) * dx + (py - start.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = start.x + t * dx;
    const closestY = start.y + t * dy;

    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

/**
 * Determine which side of a line a point is on
 * @returns {number} Positive = front (right), Negative = back (left), 0 = on line
 */
function pointSide(px, py, start, end) {
    return (end.x - start.x) * (py - start.y) - (end.y - start.y) * (px - start.x);
}

/**
 * Calculate bounding box of all vertices
 * @param {Array} vertices - Parsed vertices
 * @returns {Object} Bounds object
 */
function calculateBounds(vertices) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const v of vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
    }

    return { minX, maxX, minY, maxY };
}

/**
 * Find player 1 start position from things
 * @param {Array} things - Parsed things
 * @returns {Object} Player start position and angle
 */
function findPlayerStart(things) {
    // Thing type 1 = Player 1 start
    const playerThing = things.find(t => t.type === 1);

    if (playerThing) {
        return {
            x: playerThing.x,
            y: playerThing.y,
            angle: playerThing.angle * Math.PI / 180  // Convert to radians
        };
    }

    // Fallback to first thing or origin
    if (things.length > 0) {
        return {
            x: things[0].x,
            y: things[0].y,
            angle: 0
        };
    }

    return { x: 0, y: 0, angle: 0 };
}

/**
 * Get all solid walls (for collision detection)
 * @param {Array} walls - All walls
 * @returns {Array} Solid walls only
 */
export function getSolidWalls(walls) {
    return walls.filter(w => w.isSolid);
}

/**
 * Get walls within a certain distance of a point (for rendering optimization)
 * @param {Array} walls - All walls
 * @param {number} x - Center X
 * @param {number} y - Center Y
 * @param {number} maxDistance - Maximum distance
 * @returns {Array} Filtered walls
 */
export function getWallsInRange(walls, x, y, maxDistance) {
    const maxDistSq = maxDistance * maxDistance;

    return walls.filter(wall => {
        // Check distance to wall segment
        const midX = (wall.start.x + wall.end.x) / 2;
        const midY = (wall.start.y + wall.end.y) / 2;
        const distSq = (midX - x) ** 2 + (midY - y) ** 2;
        return distSq <= maxDistSq;
    });
}

// ============================================================================
// Sector Polygon Extraction
// ============================================================================

/**
 * Collect directed edges for each sector from linedefs
 * @param {Array} linedefs - Parsed linedefs
 * @param {Array} sidedefs - Parsed sidedefs
 * @param {Array} vertices - Parsed vertices
 * @returns {Map<number, Array>} Map of sectorIndex -> directed edges
 */
function collectSectorEdges(linedefs, sidedefs, vertices) {
    const sectorEdges = new Map();

    for (let i = 0; i < linedefs.length; i++) {
        const linedef = linedefs[i];
        const startVertex = vertices[linedef.startVertex];
        const endVertex = vertices[linedef.endVertex];

        if (!startVertex || !endVertex) continue;

        // Front sidedef: edge direction is start -> end
        if (linedef.frontSidedef !== -1 && linedef.frontSidedef !== 0xFFFF) {
            const sidedef = sidedefs[linedef.frontSidedef];
            if (sidedef) {
                const sectorIdx = sidedef.sectorIndex;
                if (!sectorEdges.has(sectorIdx)) {
                    sectorEdges.set(sectorIdx, []);
                }
                sectorEdges.get(sectorIdx).push({
                    start: { x: startVertex.x, y: startVertex.y },
                    end: { x: endVertex.x, y: endVertex.y },
                    linedefIndex: i
                });
            }
        }

        // Back sidedef: edge direction is REVERSED (end -> start)
        if (linedef.backSidedef !== -1 && linedef.backSidedef !== 0xFFFF) {
            const sidedef = sidedefs[linedef.backSidedef];
            if (sidedef) {
                const sectorIdx = sidedef.sectorIndex;
                if (!sectorEdges.has(sectorIdx)) {
                    sectorEdges.set(sectorIdx, []);
                }
                sectorEdges.get(sectorIdx).push({
                    start: { x: endVertex.x, y: endVertex.y },
                    end: { x: startVertex.x, y: startVertex.y },
                    linedefIndex: i
                });
            }
        }
    }

    return sectorEdges;
}

/**
 * Create a vertex key for adjacency lookup
 * @param {Object} v - Vertex {x, y}
 * @returns {string} Key string
 */
function vertexKey(v) {
    return `${Math.round(v.x)},${Math.round(v.y)}`;
}

/**
 * Chain edges into closed polygon loops
 * @param {Array} edges - Array of directed edges for a sector
 * @returns {Array<Array<{x,y}>>} Array of closed loops (vertex arrays)
 */
function chainEdgesIntoLoops(edges) {
    if (!edges || edges.length < 3) return [];

    const loops = [];
    const used = new Set();

    // Build adjacency: map from vertex key to edge indices starting there
    const edgesByStart = new Map();
    for (let i = 0; i < edges.length; i++) {
        const key = vertexKey(edges[i].start);
        if (!edgesByStart.has(key)) {
            edgesByStart.set(key, []);
        }
        edgesByStart.get(key).push(i);
    }

    // Trace loops starting from each unused edge
    for (let startIdx = 0; startIdx < edges.length; startIdx++) {
        if (used.has(startIdx)) continue;

        const loop = [];
        let currentIdx = startIdx;
        let iterations = 0;
        const maxIterations = edges.length + 1;

        while (currentIdx !== -1 && !used.has(currentIdx) && iterations < maxIterations) {
            iterations++;
            used.add(currentIdx);
            const edge = edges[currentIdx];
            loop.push({ x: edge.start.x, y: edge.start.y });

            // Find next edge starting at current edge's end
            const endKey = vertexKey(edge.end);
            const candidates = edgesByStart.get(endKey) || [];

            currentIdx = -1;
            for (const candidateIdx of candidates) {
                if (!used.has(candidateIdx)) {
                    currentIdx = candidateIdx;
                    break;
                }
            }

            // Check if we've completed the loop (back to start)
            if (currentIdx === -1 && loop.length > 0) {
                const first = loop[0];
                const last = edge.end;
                const dx = first.x - last.x;
                const dy = first.y - last.y;
                if (Math.sqrt(dx * dx + dy * dy) < 1) {
                    // Valid closed loop
                    break;
                }
            }
        }

        // Only keep loops with at least 3 vertices
        if (loop.length >= 3) {
            loops.push(loop);
        }
    }

    return loops;
}

/**
 * Calculate signed area of a polygon (positive = counter-clockwise)
 * @param {Array<{x,y}>} vertices - Polygon vertices
 * @returns {number} Signed area
 */
function calculateSignedArea(vertices) {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return area / 2;
}

/**
 * Check if point is inside polygon using ray casting
 * @param {Object} point - Point {x, y}
 * @param {Array} polygon - Polygon vertices
 * @returns {boolean}
 */
function pointInPolygon(point, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Classify loops into outer boundary and holes
 * @param {Array<Array<{x,y}>>} loops - Raw polygon loops
 * @returns {Object} { outer: Array<{x,y}>, holes: Array<Array<{x,y}>> }
 */
function classifyLoops(loops) {
    if (loops.length === 0) return { outer: [], holes: [] };
    if (loops.length === 1) return { outer: loops[0], holes: [] };

    // Calculate properties for each loop
    const loopData = loops.map((loop, idx) => ({
        loop,
        idx,
        area: Math.abs(calculateSignedArea(loop)),
        centroid: {
            x: loop.reduce((s, v) => s + v.x, 0) / loop.length,
            y: loop.reduce((s, v) => s + v.y, 0) / loop.length
        }
    }));

    // Sort by area descending - largest is likely outer boundary
    loopData.sort((a, b) => b.area - a.area);

    // The largest loop is the outer boundary
    const outer = loopData[0];
    const holes = [];

    // Remaining loops: check if inside outer boundary (then they're holes)
    for (let i = 1; i < loopData.length; i++) {
        const candidate = loopData[i];
        if (pointInPolygon(candidate.centroid, outer.loop)) {
            holes.push(candidate.loop);
        }
        // Disjoint polygons (not inside outer) are skipped for now
    }

    return { outer: outer.loop, holes };
}

/**
 * Build sector polygons from map data
 * @param {Array} vertices - Parsed vertices
 * @param {Array} linedefs - Parsed linedefs
 * @param {Array} sidedefs - Parsed sidedefs
 * @param {Array} sectors - Parsed sectors
 * @returns {Array} Array of sector polygon objects
 */
export function buildSectorPolygons(vertices, linedefs, sidedefs, sectors) {
    // Step 1: Collect edges for each sector
    const sectorEdges = collectSectorEdges(linedefs, sidedefs, vertices);

    const sectorPolygons = [];

    for (let sectorIdx = 0; sectorIdx < sectors.length; sectorIdx++) {
        const sector = sectors[sectorIdx];
        const edges = sectorEdges.get(sectorIdx);

        if (!edges || edges.length < 3) {
            // Degenerate sector - skip
            continue;
        }

        // Step 2: Chain edges into closed loops
        const loops = chainEdgesIntoLoops(edges);

        if (loops.length === 0) {
            continue;
        }

        // Step 3: Classify outer boundary vs holes
        const { outer, holes } = classifyLoops(loops);

        if (outer.length < 3) {
            continue;
        }

        sectorPolygons.push({
            sectorIndex: sectorIdx,
            floorHeight: sector.floorHeight,
            ceilingHeight: sector.ceilingHeight,
            lightLevel: sector.lightLevel,
            boundaries: [outer, ...holes],
            hasHoles: holes.length > 0
        });
    }

    return sectorPolygons;
}

/**
 * Check if a linedef special type is a door
 * DOOM door types include various manual and triggered doors
 * @param {number} specialType - Linedef special type
 * @returns {boolean} True if this is a door type
 */
function isDoorType(specialType) {
    // Common DOOM door special types
    const doorTypes = [
        1,   // DR Door Open Wait Close
        4,   // W1 Door Open Wait Close
        26,  // DR Door Blue Key
        27,  // DR Door Yellow Key
        28,  // DR Door Red Key
        29,  // S1 Door Open Wait Close
        31,  // D1 Door Open Stay
        32,  // D1 Door Blue Key Open Stay
        33,  // D1 Door Red Key Open Stay
        34,  // D1 Door Yellow Key Open Stay
        46,  // GR Door Open Stay
        61,  // SR Door Open Stay
        63,  // SR Door Open Wait Close
        90,  // WR Door Open Wait Close
        99,  // SR Door Blue Key Open Fast
        100, // W1 Turbo Door Raise
        103, // S1 Door Open Stay
        105, // WR Turbo Door Raise
        106, // WR Turbo Door Open Stay
        107, // WR Turbo Door Close
        108, // W1 Turbo Door Open Stay
        109, // W1 Turbo Door Open Wait Close
        110, // W1 Turbo Door Close
        111, // S1 Turbo Door Open Stay
        112, // S1 Turbo Door Open Wait Close
        113, // S1 Turbo Door Close
        114, // SR Turbo Door Raise
        115, // SR Turbo Door Open Stay
        116, // SR Turbo Door Close
        117, // DR Turbo Door Raise
        118, // D1 Turbo Door Open Stay
        133, // S1 Door Blue Key Open Fast
        134, // SR Door Red Key Open Fast
        135, // S1 Door Red Key Open Fast
        136, // SR Door Yellow Key Open Fast
        137  // S1 Door Yellow Key Open Fast
    ];
    return doorTypes.includes(specialType);
}
