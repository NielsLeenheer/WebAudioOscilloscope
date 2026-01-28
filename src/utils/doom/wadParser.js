/**
 * DOOM WAD File Parser
 * Parses the binary WAD format to extract level geometry data
 */

/**
 * Parse a WAD file from a URL
 * @param {string} wadUrl - URL to the WAD file
 * @returns {Promise<{header: Object, lumps: Array, buffer: ArrayBuffer}>}
 */
export async function parseWad(wadUrl) {
    const response = await fetch(wadUrl);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);

    // Parse header (12 bytes)
    // Bytes 0-3: "IWAD" or "PWAD"
    // Bytes 4-7: Number of lumps (int32 LE)
    // Bytes 8-11: Directory offset (int32 LE)
    const type = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
    );
    const numLumps = view.getInt32(4, true);
    const directoryOffset = view.getInt32(8, true);

    const header = { type, numLumps, directoryOffset };

    // Parse directory (16 bytes per entry)
    const lumps = [];
    for (let i = 0; i < numLumps; i++) {
        const entryOffset = directoryOffset + i * 16;
        const offset = view.getInt32(entryOffset, true);
        const size = view.getInt32(entryOffset + 4, true);

        // Read 8-character name, strip null bytes
        let name = '';
        for (let j = 0; j < 8; j++) {
            const char = view.getUint8(entryOffset + 8 + j);
            if (char === 0) break;
            name += String.fromCharCode(char);
        }

        lumps.push({ name, offset, size, index: i });
    }

    return { header, lumps, buffer };
}

/**
 * Find all lumps belonging to a specific map
 * @param {Array} lumps - Array of lump entries
 * @param {string} mapName - Map name (e.g., 'E1M1', 'MAP01')
 * @returns {Object} - Object with lump names as keys
 */
export function findMapLumps(lumps, mapName) {
    // Find the map marker lump
    const markerIndex = lumps.findIndex(l => l.name === mapName);
    if (markerIndex === -1) {
        throw new Error(`Map ${mapName} not found in WAD`);
    }

    // Map lumps follow the marker in a specific order
    // The order varies slightly, so we search by name within the next ~11 lumps
    const mapLumps = {};
    const lumpNames = [
        'THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS',
        'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'
    ];

    // Search the next 15 lumps for map data
    for (let i = markerIndex + 1; i < Math.min(markerIndex + 15, lumps.length); i++) {
        const lump = lumps[i];
        if (lumpNames.includes(lump.name)) {
            mapLumps[lump.name] = lump;
        }
        // Stop if we hit another map marker
        if (/^E\dM\d$/.test(lump.name) || /^MAP\d\d$/.test(lump.name)) {
            break;
        }
    }

    return mapLumps;
}

/**
 * Parse VERTEXES lump - each vertex is 4 bytes (2x int16)
 * @param {ArrayBuffer} buffer - WAD file buffer
 * @param {Object} lump - Lump entry
 * @returns {Array<{x: number, y: number}>}
 */
export function parseVertexes(buffer, lump) {
    const view = new DataView(buffer);
    const vertices = [];
    const numVertices = lump.size / 4;

    for (let i = 0; i < numVertices; i++) {
        const offset = lump.offset + i * 4;
        vertices.push({
            x: view.getInt16(offset, true),
            y: view.getInt16(offset + 2, true)
        });
    }

    return vertices;
}

/**
 * Parse LINEDEFS lump - each linedef is 14 bytes
 * @param {ArrayBuffer} buffer - WAD file buffer
 * @param {Object} lump - Lump entry
 * @returns {Array<Object>}
 */
export function parseLinedefs(buffer, lump) {
    const view = new DataView(buffer);
    const linedefs = [];
    const numLinedefs = lump.size / 14;

    for (let i = 0; i < numLinedefs; i++) {
        const offset = lump.offset + i * 14;
        linedefs.push({
            startVertex: view.getUint16(offset, true),
            endVertex: view.getUint16(offset + 2, true),
            flags: view.getUint16(offset + 4, true),
            specialType: view.getUint16(offset + 6, true),
            sectorTag: view.getUint16(offset + 8, true),
            frontSidedef: view.getInt16(offset + 10, true),  // -1 if none
            backSidedef: view.getInt16(offset + 12, true)    // -1 if none
        });
    }

    return linedefs;
}

/**
 * Parse SIDEDEFS lump - each sidedef is 30 bytes
 * @param {ArrayBuffer} buffer - WAD file buffer
 * @param {Object} lump - Lump entry
 * @returns {Array<Object>}
 */
export function parseSidedefs(buffer, lump) {
    const view = new DataView(buffer);
    const sidedefs = [];
    const numSidedefs = lump.size / 30;

    for (let i = 0; i < numSidedefs; i++) {
        const offset = lump.offset + i * 30;

        // Read texture names (8 chars each)
        const readTextureName = (off) => {
            let name = '';
            for (let j = 0; j < 8; j++) {
                const char = view.getUint8(off + j);
                if (char === 0) break;
                name += String.fromCharCode(char);
            }
            return name;
        };

        sidedefs.push({
            xOffset: view.getInt16(offset, true),
            yOffset: view.getInt16(offset + 2, true),
            upperTexture: readTextureName(offset + 4),
            lowerTexture: readTextureName(offset + 12),
            middleTexture: readTextureName(offset + 20),
            sectorIndex: view.getUint16(offset + 28, true)
        });
    }

    return sidedefs;
}

/**
 * Parse SECTORS lump - each sector is 26 bytes
 * @param {ArrayBuffer} buffer - WAD file buffer
 * @param {Object} lump - Lump entry
 * @returns {Array<Object>}
 */
export function parseSectors(buffer, lump) {
    const view = new DataView(buffer);
    const sectors = [];
    const numSectors = lump.size / 26;

    for (let i = 0; i < numSectors; i++) {
        const offset = lump.offset + i * 26;

        // Read texture names (8 chars each)
        const readTextureName = (off) => {
            let name = '';
            for (let j = 0; j < 8; j++) {
                const char = view.getUint8(off + j);
                if (char === 0) break;
                name += String.fromCharCode(char);
            }
            return name;
        };

        sectors.push({
            floorHeight: view.getInt16(offset, true),
            ceilingHeight: view.getInt16(offset + 2, true),
            floorTexture: readTextureName(offset + 4),
            ceilingTexture: readTextureName(offset + 12),
            lightLevel: view.getUint16(offset + 20, true),
            specialType: view.getUint16(offset + 22, true),
            tag: view.getUint16(offset + 24, true)
        });
    }

    return sectors;
}

/**
 * Parse THINGS lump - each thing is 10 bytes
 * @param {ArrayBuffer} buffer - WAD file buffer
 * @param {Object} lump - Lump entry
 * @returns {Array<Object>}
 */
export function parseThings(buffer, lump) {
    const view = new DataView(buffer);
    const things = [];
    const numThings = lump.size / 10;

    for (let i = 0; i < numThings; i++) {
        const offset = lump.offset + i * 10;
        things.push({
            x: view.getInt16(offset, true),
            y: view.getInt16(offset + 2, true),
            angle: view.getUint16(offset + 4, true),  // Degrees (0-360)
            type: view.getUint16(offset + 6, true),
            flags: view.getUint16(offset + 8, true)
        });
    }

    return things;
}

/**
 * Get list of all maps in the WAD
 * @param {Array} lumps - Array of lump entries
 * @returns {Array<string>} - Array of map names
 */
export function getMapList(lumps) {
    const maps = [];
    for (const lump of lumps) {
        // Match DOOM 1 format (E1M1) or DOOM 2 format (MAP01)
        if (/^E\dM\d$/.test(lump.name) || /^MAP\d\d$/.test(lump.name)) {
            maps.push(lump.name);
        }
    }
    return maps;
}
