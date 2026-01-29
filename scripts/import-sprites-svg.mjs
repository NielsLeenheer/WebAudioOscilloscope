/**
 * Import SVG sprite files into spriteData.js
 *
 * Reads SVG files from src/assets/dino/simplified and src/assets/dino/original,
 * extracts path data, simplifies paths (remove collinear points, join
 * shared-vertex paths), and outputs the spriteData.js file with both sets.
 *
 * Simplified sprites are exported as TREX_STANDING, etc.
 * Original sprites are exported as ORIG_TREX_STANDING, etc.
 *
 * The SVGs use the same pixel coordinate space as spriteData.js (integer grid,
 * Y-down). The pixel dimensions are read from metadata comments in each SVG.
 *
 * Usage: node scripts/import-sprites-svg.mjs
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Expected sprite names in output order
const SPRITE_NAMES = [
    'TREX_STANDING', 'TREX_RUN_1', 'TREX_RUN_2', 'TREX_CRASHED',
    'TREX_DUCK_1', 'TREX_DUCK_2',
    'CACTUS_SMALL_1', 'CACTUS_SMALL_2', 'CACTUS_SMALL_3',
    'CACTUS_LARGE_1', 'CACTUS_LARGE_2', 'CACTUS_LARGE_3',
    'PTERO_1', 'PTERO_2',
    'CLOUD',
    'RESTART', 'TEXT_GAME_OVER',
    'GROUND_1', 'GROUND_2'
];

// Scale factor: set to 1 for SVGs with pixel-space coordinates (our default).
// Use --scale 10 if an SVG editor has inflated coordinates to match display dimensions.
const DEFAULT_SCALE = 1;

function round(n) {
    return Math.round(n * 1000) / 1000;
}

/**
 * Parse SVG path d attribute into array of [x, y] coordinate pairs.
 * Supports M, L, H, V, Z commands (absolute and relative).
 */
function parseSVGPath(d) {
    const points = [];
    let curX = 0, curY = 0;

    const tokens = d.match(/[MLHVCSQTAZmlhvcsqtaz][^MLHVCSQTAZmlhvcsqtaz]*/g);
    if (!tokens) return points;

    for (const token of tokens) {
        const cmd = token[0];
        const args = token.slice(1).trim();

        if (cmd === 'Z' || cmd === 'z') continue;

        const nums = args.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi);
        if (!nums) continue;

        if (cmd === 'M' || cmd === 'L') {
            for (let i = 0; i < nums.length - 1; i += 2) {
                curX = parseFloat(nums[i]);
                curY = parseFloat(nums[i + 1]);
                points.push([round(curX), round(curY)]);
            }
        } else if (cmd === 'm' || cmd === 'l') {
            for (let i = 0; i < nums.length - 1; i += 2) {
                curX += parseFloat(nums[i]);
                curY += parseFloat(nums[i + 1]);
                points.push([round(curX), round(curY)]);
            }
        } else if (cmd === 'H') {
            for (const n of nums) {
                curX = parseFloat(n);
                points.push([round(curX), round(curY)]);
            }
        } else if (cmd === 'h') {
            for (const n of nums) {
                curX += parseFloat(n);
                points.push([round(curX), round(curY)]);
            }
        } else if (cmd === 'V') {
            for (const n of nums) {
                curY = parseFloat(n);
                points.push([round(curX), round(curY)]);
            }
        } else if (cmd === 'v') {
            for (const n of nums) {
                curY += parseFloat(n);
                points.push([round(curX), round(curY)]);
            }
        } else {
            console.error(`  Warning: unsupported SVG path command "${cmd}" - curves will be approximated as straight lines`);
            if (nums.length >= 2) {
                curX = parseFloat(nums[nums.length - 2]);
                curY = parseFloat(nums[nums.length - 1]);
                points.push([round(curX), round(curY)]);
            }
        }
    }

    return points;
}

/**
 * Extract pixel dimensions from SVG metadata comments or viewBox.
 */
function extractDimensions(svgContent) {
    // Try metadata comments first
    const wMatch = svgContent.match(/pixelW="(\d+)"/);
    const hMatch = svgContent.match(/pixelH="(\d+)"/);
    if (wMatch && hMatch) {
        return { w: parseInt(wMatch[1]), h: parseInt(hMatch[1]) };
    }

    // Fallback: extract from viewBox attribute
    const vbMatch = svgContent.match(/viewBox="([^"]+)"/);
    if (vbMatch) {
        const parts = vbMatch[1].trim().split(/\s+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
            return { w: Math.round(parts[2]), h: Math.round(parts[3]) };
        }
    }

    return null;
}

/**
 * Extract all <path> d attributes from SVG content.
 */
function extractPaths(svgContent) {
    const paths = [];
    const pathRegex = /<path[^>]*\bd="([^"]+)"[^>]*\/?>/g;
    let match;
    while ((match = pathRegex.exec(svgContent)) !== null) {
        paths.push(match[1]);
    }
    return paths;
}

/**
 * Close a polygon by appending the first point if not already closed.
 */
function closePolygon(points) {
    if (points.length < 2) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return points;
    return [...points, [first[0], first[1]]];
}

// ─── Path simplification ─────────────────────────────────────────────────────

/**
 * Remove collinear points from a closed path.
 * A point is collinear if it lies exactly on the line between its neighbors.
 */
function removeCollinearPoints(path) {
    if (path.length < 3) return path;

    const closed = path[0][0] === path[path.length - 1][0] &&
                   path[0][1] === path[path.length - 1][1];

    const result = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
        const [ax, ay] = path[i - 1];
        const [bx, by] = path[i];
        const [cx, cy] = path[i + 1];
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (cross !== 0) {
            result.push(path[i]);
        }
    }
    result.push(path[path.length - 1]);

    if (closed && result.length >= 4) {
        const n = result.length - 1;
        const [ax, ay] = result[n - 1];
        const [bx, by] = result[0];
        const [cx, cy] = result[1];
        const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (cross === 0) {
            result.shift();
            result[result.length - 1] = result[0];
        }
    }

    return result;
}

/**
 * Rotate a closed path so that index `start` becomes the first element.
 */
function rotateClosedPath(path, start) {
    if (start === 0) return path;
    const inner = path.slice(0, -1);
    const rotated = [...inner.slice(start), ...inner.slice(0, start)];
    rotated.push(rotated[0]);
    return rotated;
}

/**
 * Join paths that share vertices into longer continuous paths.
 */
function joinPaths(paths) {
    if (paths.length <= 1) return paths;

    const working = paths.map(p => ({ points: [...p], joined: false }));
    let changed = true;

    while (changed) {
        changed = false;
        const pointIndex = new Map();

        for (let pi = 0; pi < working.length; pi++) {
            if (working[pi].joined) continue;
            const pts = working[pi].points;
            for (let vi = 0; vi < pts.length - 1; vi++) {
                const key = `${pts[vi][0]},${pts[vi][1]}`;
                if (!pointIndex.has(key)) pointIndex.set(key, []);
                pointIndex.get(key).push({ pi, vi });
            }
        }

        for (const [, entries] of pointIndex) {
            if (entries.length < 2) continue;
            const a = entries[0];
            const b = entries[1];
            if (a.pi === b.pi) continue;

            const pathA = working[a.pi].points;
            const pathB = working[b.pi].points;
            const rotatedB = rotateClosedPath(pathB, b.vi);

            const merged = [
                ...pathA.slice(0, a.vi),
                ...rotatedB.slice(0, -1),
                ...pathA.slice(a.vi)
            ];

            working[a.pi].points = merged;
            working[b.pi].joined = true;
            changed = true;
            break;
        }
    }

    return working.filter(w => !w.joined).map(w => w.points);
}

/**
 * Simplify sprite paths: remove collinear points, then join at shared vertices.
 */
function simplifyPaths(paths) {
    let simplified = paths.map(removeCollinearPoints);
    simplified = joinPaths(simplified);
    return simplified;
}

function processSVGFile(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const dims = extractDimensions(content);
    if (!dims) {
        console.error(`  Warning: no pixel dimensions in ${basename(filePath)}, skipping`);
        return null;
    }

    const pathStrings = extractPaths(content);
    if (pathStrings.length === 0) {
        console.error(`  Warning: no paths found in ${basename(filePath)}, skipping`);
        return null;
    }

    const paths = [];
    for (const d of pathStrings) {
        const points = parseSVGPath(d);
        if (points.length < 3) continue;
        paths.push(closePolygon(points));
    }

    return { w: dims.w, h: dims.h, paths };
}

function formatPaths(paths) {
    return paths.map(path => {
        const points = path.map(([x, y]) => `[${x},${y}]`).join(', ');
        return `        [${points}]`;
    }).join(',\n');
}

/**
 * Process all sprites from a directory, returning an array of { name, w, h, paths }.
 */
function processDirectory(indir, scaleFactor) {
    const files = readdirSync(indir).filter(f => f.endsWith('.svg'));
    const fileMap = {};
    for (const f of files) {
        const name = basename(f, '.svg');
        fileMap[name] = join(indir, f);
    }

    const results = [];
    for (const name of SPRITE_NAMES) {
        if (!fileMap[name]) {
            console.error(`  Missing: ${name}.svg - skipping`);
            continue;
        }

        const sprite = processSVGFile(fileMap[name]);
        if (!sprite) continue;

        // Scale dimensions and coordinates back to pixel space
        sprite.w = Math.round(sprite.w / scaleFactor);
        sprite.h = Math.round(sprite.h / scaleFactor);
        sprite.paths = sprite.paths.map(path =>
            path.map(([x, y]) => [round(x / scaleFactor), round(y / scaleFactor)])
        );

        // Simplify: remove collinear points, join paths at shared vertices
        const rawCount = sprite.paths.reduce((s, p) => s + p.length, 0);
        sprite.paths = simplifyPaths(sprite.paths);
        const simplifiedCount = sprite.paths.reduce((s, p) => s + p.length, 0);
        console.log(`  ${name}: ${sprite.paths.length} paths, ${simplifiedCount} points (was ${rawCount}) (${sprite.w}x${sprite.h})`);
        results.push({ name, ...sprite });
    }

    return results;
}

function main() {
    const args = process.argv.slice(2);

    const scaleIdx = args.indexOf('--scale');
    const scaleFactor = scaleIdx >= 0 && args[scaleIdx + 1]
        ? parseFloat(args[scaleIdx + 1])
        : DEFAULT_SCALE;

    const assetsDir = join(__dirname, '..', 'src', 'assets', 'dino');
    const simplifiedDir = join(assetsDir, 'simplified');
    const originalDir = join(assetsDir, 'original');
    const outPath = join(__dirname, '..', 'src', 'utils', 'dino', 'spriteData.js');

    console.log(`Scale factor: 1/${scaleFactor} (dividing coordinates by ${scaleFactor})`);

    // Process simplified sprites
    console.log(`\nReading simplified SVGs from: ${simplifiedDir}`);
    const simplified = processDirectory(simplifiedDir, scaleFactor);

    // Process original sprites
    console.log(`\nReading original SVGs from: ${originalDir}`);
    const original = processDirectory(originalDir, scaleFactor);

    // Generate output
    let output = '// Auto-generated sprite data\n';
    output += '// Imported from SVG files by: node scripts/import-sprites-svg.mjs\n';
    output += '// Integer pixel coordinates (Y-down), scaled to oscilloscope coords at runtime.\n';
    output += '// Two sets: simplified (default) and original (ORIG_ prefix).\n\n';

    // Simplified sprites (default)
    output += '// ─── Simplified sprites ──────────────────────────────────────────────────────\n\n';
    for (const r of simplified) {
        output += `export const ${r.name} = {\n`;
        output += `    w: ${r.w}, h: ${r.h},\n`;
        output += `    paths: [\n`;
        output += formatPaths(r.paths);
        output += '\n    ]\n';
        output += '};\n\n';
    }

    // Original sprites (ORIG_ prefix)
    output += '// ─── Original sprites ───────────────────────────────────────────────────────\n\n';
    for (const r of original) {
        output += `export const ORIG_${r.name} = {\n`;
        output += `    w: ${r.w}, h: ${r.h},\n`;
        output += `    paths: [\n`;
        output += formatPaths(r.paths);
        output += '\n    ]\n';
        output += '};\n\n';
    }

    writeFileSync(outPath, output);
    console.log(`\nWritten ${simplified.length} simplified + ${original.length} original sprites to ${outPath}`);
}

main();
