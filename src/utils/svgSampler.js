/**
 * SVG Sampler Utility
 * Handles SVG DOM creation and continuous path sampling for oscilloscope visualization
 *
 * Optimizations ported from WebDmxController/src/lib/outputs/laser/SVGSampler.js:
 * - Direct bezier evaluation (bypasses svg-path-properties entirely)
 * - Section-level path caching for animations
 * - Geometry caching via WeakMap
 * - Corner detection for geometric primitives
 * - Clipping to visible range
 * - Adaptive sampling density
 * - Ancestor visibility walk
 * - CSS d property / path("...") wrapper support
 * - Fixed transform matrix multiplication order
 * - Native arc command parsing into cubic beziers
 */

import { resolveEnv } from './env.js';

// ---- Constants ----

const DRAWABLE_SELECTOR = 'path, circle, ellipse, rect, polygon, polyline, line';

// Parser selection for SVG injection.
//   'html'  — permissive HTML parser (via <template>). Accepts missing xmlns,
//             unclosed tags, unquoted attributes, etc. Matches how browsers
//             handle SVG inside HTML documents elsewhere on the page.
//   'xml'   — strict XML parser (DOMParser with 'image/svg+xml'). Rejects
//             malformed input with a parsererror node; kept as a fallback.
const SVG_PARSER = 'html';

/**
 * Parse an SVG markup string using the HTML parser (permissive).
 * Returns the root <svg> element (detached from any document), or null.
 */
function parseSvgHTML(svgMarkup) {
    const template = document.createElement('template');
    template.innerHTML = svgMarkup;
    const svg = template.content.querySelector('svg');
    return svg || null;
}

/**
 * Parse an SVG markup string using DOMParser (strict XML).
 * Returns the imported <svg> element, or null on parse error.
 */
function parseSvgXML(svgMarkup) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        console.warn('SVG parse error:', parseError.textContent);
        return null;
    }
    return document.importNode(doc.documentElement, true);
}

/**
 * Parse an SVG markup string. Dispatches to the parser selected by SVG_PARSER.
 */
function parseSvgMarkup(svgMarkup) {
    return SVG_PARSER === 'html' ? parseSvgHTML(svgMarkup) : parseSvgXML(svgMarkup);
}

/** Points per unit of path length in viewBox coordinates */
const SAMPLES_PER_UNIT = 0.5;
const MIN_SAMPLES = 10;
const MAX_SAMPLES = 500;

// ---- Singleton SVG Container ----

let svgContainer = null;

/**
 * Get or create the hidden SVG container element
 */
function getContainer() {
    if (!svgContainer) {
        svgContainer = document.createElement('div');
        svgContainer.style.position = 'fixed';
        svgContainer.style.left = '0';
        svgContainer.style.top = '0';
        svgContainer.style.width = '500px';
        svgContainer.style.height = '500px';
        svgContainer.style.opacity = '0';
        svgContainer.style.pointerEvents = 'none';
        svgContainer.style.zIndex = '-9999';
        document.body.appendChild(svgContainer);
    }
    return svgContainer;
}

// ---- Script Execution ----

let lastScriptContent = null;
let trackedTimers = [];

/**
 * Clean up timers created by previously executed SVG scripts
 */
function cleanupScriptTimers() {
    for (const { type, id } of trackedTimers) {
        if (type === 'interval') clearInterval(id);
        else if (type === 'timeout') clearTimeout(id);
        else if (type === 'raf') cancelAnimationFrame(id);
    }
    trackedTimers = [];
}

/**
 * Execute <script> tags within an SVG element.
 *
 * All scripts are concatenated and run in a single new Function() scope so
 * they can share variables. The function receives shadowed globals:
 *
 *   document  – a Proxy that scopes query methods (querySelector, getElementById,
 *               etc.) to the SVG element while forwarding everything else
 *               (addEventListener, createElementNS, …) to the real document.
 *   svg       – the SVG element directly, as a convenience.
 *   setInterval / setTimeout / requestAnimationFrame – wrapped versions that
 *               track timer IDs (including recursive rAF) for cleanup.
 *
 * After the script body executes, the SVG element's `onload` attribute (if
 * any) is evaluated in the same scope so it can call functions defined by
 * the scripts.
 *
 * CDATA wrappers are stripped automatically.
 *
 * Re-execution is skipped when the concatenated script content hasn't
 * changed, unless `force` is true.
 */
function executeScripts(svgElement, force = false, explicitScripts = null, explicitOnload = null) {
    const scripts = explicitScripts ?? Array.from(svgElement.querySelectorAll('script'));
    const onload = explicitOnload ?? svgElement.getAttribute('onload');
    if (scripts.length === 0 && !onload) return;

    // Concatenate all scripts, stripping CDATA wrappers
    const rawContent = Array.from(scripts)
        .map(s => s.textContent.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''))
        .join('\n');

    if (!force && rawContent === lastScriptContent) {
        console.log('[svgSampler] Scripts unchanged, skipping execution');
        return;
    }

    cleanupScriptTimers();
    lastScriptContent = rawContent;

    // Append onload handler so it runs in the same scope as the scripts
    let code = rawContent;
    if (onload) {
        code += `\n;${onload};`;
    }
    console.log(`[svgSampler] Executing ${scripts.length} script(s), ${rawContent.length} chars, onload=${onload || 'none'}`);

    // Proxy scopes DOM queries to the SVG element while forwarding
    // everything else (addEventListener, createElementNS, …) to the
    // real document.
    const scopedDocument = new Proxy(document, {
        get(target, prop) {
            switch (prop) {
                case 'querySelector':
                    return (sel) => svgElement.querySelector(sel);
                case 'querySelectorAll':
                    return (sel) => svgElement.querySelectorAll(sel);
                case 'getElementById':
                    return (id) => svgElement.querySelector(`#${CSS.escape(id)}`);
                case 'getElementsByTagName':
                    return (tag) => svgElement.getElementsByTagName(tag);
                case 'getElementsByClassName':
                    return (cls) => svgElement.getElementsByClassName(cls);
                case 'documentElement':
                case 'rootElement':
                    return svgElement;
            }
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });

    try {
        const fn = new Function(
            'document',
            'svg',
            'setInterval',
            'setTimeout',
            'requestAnimationFrame',
            code
        );

        fn(
            scopedDocument,
            svgElement,
            (...args) => {
                const id = setInterval(...args);
                trackedTimers.push({ type: 'interval', id });
                return id;
            },
            (...args) => {
                const id = setTimeout(...args);
                trackedTimers.push({ type: 'timeout', id });
                return id;
            },
            (...args) => {
                const id = requestAnimationFrame(...args);
                trackedTimers.push({ type: 'raf', id });
                return id;
            }
        );
    } catch (error) {
        console.error('Error executing SVG script:', error);
    }
}

/**
 * Reset the SVG container, cleaning up all script timers and DOM.
 * After calling this, the next createContinuousSampler call will
 * build a fresh container and re-execute all scripts.
 */
export function resetSVGContainer() {
    cleanupScriptTimers();
    lastScriptContent = null;
    if (svgContainer) {
        svgContainer.remove();
        svgContainer = null;
    }
}

// ---- Direct Bezier Evaluation ----

function cubicAt(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    return [
        mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3,
        mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3
    ];
}

function quadAt(x0, y0, x1, y1, x2, y2, t) {
    const mt = 1 - t;
    return [
        mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
        mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
    ];
}

function approxCubicLength(x0, y0, x1, y1, x2, y2, x3, y3) {
    const chord = Math.hypot(x3 - x0, y3 - y0);
    const poly = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
    return (chord + poly) / 2;
}

function approxQuadLength(x0, y0, x1, y1, x2, y2) {
    const chord = Math.hypot(x2 - x0, y2 - y0);
    const poly = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1);
    return (chord + poly) / 2;
}

// ---- Path Parsing ----

/**
 * Tokenize an SVG path d-attribute string into numbers
 */
function tokenizeNumbers(s) {
    const nums = [];
    const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        nums.push(parseFloat(m[0]));
    }
    return nums;
}

/**
 * Strip path("...") CSS wrapper if present
 */
function stripPathWrapper(d) {
    const wrapped = d.match(/path\(\s*"(.+?)"\s*\)/);
    return wrapped ? wrapped[1] : d;
}

/**
 * Parse the argument list of an SVG arc (A/a) command into tuples of
 * { rx, ry, xRot, largeArc, sweep, x, y }.
 *
 * The arc flags (large-arc, sweep) are single '0' or '1' characters per the
 * SVG spec — they can be adjacent with no separator, so `11` is two flags,
 * not the number eleven. The generic number tokenizer gets this wrong, hence
 * this position-aware parser.
 */
function parseArcArgs(s) {
    const NUM_RE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/;
    let pos = 0;
    const len = s.length;
    const skipSep = () => { while (pos < len && /[\s,]/.test(s[pos])) pos++; };
    const num = () => {
        skipSep();
        const m = s.slice(pos).match(NUM_RE);
        if (!m) return null;
        pos += m[1].length;
        return parseFloat(m[1]);
    };
    const flag = () => {
        skipSep();
        if (pos >= len) return null;
        const c = s[pos];
        if (c !== '0' && c !== '1') return null;
        pos++;
        return c === '1' ? 1 : 0;
    };

    const tuples = [];
    while (pos < len) {
        const rx = num(); if (rx === null) break;
        const ry = num();
        const xRot = num();
        const largeArc = flag();
        const sweep = flag();
        const x = num();
        const y = num();
        if (ry === null || xRot === null || largeArc === null || sweep === null || x === null || y === null) break;
        tuples.push({ rx, ry, xRot, largeArc, sweep, x, y });
    }
    return tuples;
}

/**
 * Decompose an SVG elliptical arc into a sequence of cubic bezier curves.
 * Implements the endpoint → center parameterization conversion from SVG
 * spec appendix B.2.4, then approximates each sub-arc (≤ 90°) with a
 * cubic bezier using the standard t = 4/3 · tan(θ/4) control-point formula.
 *
 * Returns [] for degenerate cases (coincident endpoints); returns a single
 * L-style segment (as a line expressed via a cubic) when either radius is 0.
 */
function arcToCubics(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2) {
    if (x1 === x2 && y1 === y2) return [];
    if (rx === 0 || ry === 0) {
        return [{ x1, y1, x2: x2, y2: y2, x: x2, y: y2 }];
    }
    rx = Math.abs(rx);
    ry = Math.abs(ry);

    const phi = (phiDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }

    const rxSq = rx * rx;
    const rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;
    let num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
    if (num < 0) num = 0;
    const denom = rxSq * y1pSq + rySq * x1pSq;
    const sign = largeArc === sweep ? -1 : 1;
    const coef = sign * Math.sqrt(num / denom);
    const cxp = coef * ((rx * y1p) / ry);
    const cyp = coef * (-(ry * x1p) / rx);

    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

    const vectorAngle = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy;
        const lenU = Math.sqrt(ux * ux + uy * uy);
        const lenV = Math.sqrt(vx * vx + vy * vy);
        let a = Math.acos(Math.max(-1, Math.min(1, dot / (lenU * lenV))));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const startAngle = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let deltaAngle = vectorAngle(
        (x1p - cxp) / rx, (y1p - cyp) / ry,
        (-x1p - cxp) / rx, (-y1p - cyp) / ry
    );
    if (!sweep && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
    else if (sweep && deltaAngle < 0) deltaAngle += 2 * Math.PI;

    const segCount = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
    const step = deltaAngle / segCount;
    const t = (4 / 3) * Math.tan(step / 4);

    const cubics = [];
    let a1 = startAngle;
    let fromX = x1;
    let fromY = y1;

    for (let i = 0; i < segCount; i++) {
        const a2 = a1 + step;
        const cosA1 = Math.cos(a1), sinA1 = Math.sin(a1);
        const cosA2 = Math.cos(a2), sinA2 = Math.sin(a2);

        const endX = cosPhi * rx * cosA2 - sinPhi * ry * sinA2 + cx;
        const endY = sinPhi * rx * cosA2 + cosPhi * ry * sinA2 + cy;

        const tan1X = cosPhi * (-rx * sinA1) - sinPhi * (ry * cosA1);
        const tan1Y = sinPhi * (-rx * sinA1) + cosPhi * (ry * cosA1);
        const tan2X = cosPhi * (-rx * sinA2) - sinPhi * (ry * cosA2);
        const tan2Y = sinPhi * (-rx * sinA2) + cosPhi * (ry * cosA2);

        cubics.push({
            x1: fromX + t * tan1X,
            y1: fromY + t * tan1Y,
            x2: endX - t * tan2X,
            y2: endY - t * tan2Y,
            x: endX,
            y: endY
        });

        a1 = a2;
        fromX = endX;
        fromY = endY;
    }

    return cubics;
}

/**
 * Parse SVG path d-attribute into absolute-coordinate segment objects.
 * Supports M, L, H, V, C, S, Q, T, A, Z (and lowercase relative versions).
 * Arcs are decomposed into cubic bezier approximations.
 * Returns null on unknown commands.
 */
function parsePathD(d) {
    d = stripPathWrapper(d);

    const segments = [];
    const cmdRe = /([MmLlHhVvCcSsQqTtZzAa])([^MmLlHhVvCcSsQqTtZzAa]*)/g;
    let match;

    let cx = 0, cy = 0;
    let mx = 0, my = 0;
    let lastCmd = '';
    let lastCx1 = 0, lastCy1 = 0;

    while ((match = cmdRe.exec(d)) !== null) {
        const cmd = match[1];
        const isRel = cmd === cmd.toLowerCase();
        const CMD = cmd.toUpperCase();
        
        const nums = CMD === 'A' ? null : tokenizeNumbers(match[2]);

        switch (CMD) {
            case 'M': {
                for (let i = 0; i < nums.length; i += 2) {
                    const x = isRel ? cx + nums[i] : nums[i];
                    const y = isRel ? cy + nums[i + 1] : nums[i + 1];
                    if (i === 0) {
                        segments.push({ type: 'M', x, y });
                        mx = x; my = y;
                    } else {
                        segments.push({ type: 'L', x, y });
                    }
                    cx = x; cy = y;
                }
                lastCmd = 'M';
                break;
            }
            case 'L': {
                for (let i = 0; i < nums.length; i += 2) {
                    const x = isRel ? cx + nums[i] : nums[i];
                    const y = isRel ? cy + nums[i + 1] : nums[i + 1];
                    segments.push({ type: 'L', x, y });
                    cx = x; cy = y;
                }
                lastCmd = 'L';
                break;
            }
            case 'H': {
                for (let i = 0; i < nums.length; i++) {
                    const x = isRel ? cx + nums[i] : nums[i];
                    segments.push({ type: 'L', x, y: cy });
                    cx = x;
                }
                lastCmd = 'H';
                break;
            }
            case 'V': {
                for (let i = 0; i < nums.length; i++) {
                    const y = isRel ? cy + nums[i] : nums[i];
                    segments.push({ type: 'L', x: cx, y });
                    cy = y;
                }
                lastCmd = 'V';
                break;
            }
            case 'C': {
                for (let i = 0; i < nums.length; i += 6) {
                    const x1 = isRel ? cx + nums[i] : nums[i];
                    const y1 = isRel ? cy + nums[i + 1] : nums[i + 1];
                    const x2 = isRel ? cx + nums[i + 2] : nums[i + 2];
                    const y2 = isRel ? cy + nums[i + 3] : nums[i + 3];
                    const x = isRel ? cx + nums[i + 4] : nums[i + 4];
                    const y = isRel ? cy + nums[i + 5] : nums[i + 5];
                    segments.push({ type: 'C', x1, y1, x2, y2, x, y, fx: cx, fy: cy });
                    lastCx1 = x2; lastCy1 = y2;
                    cx = x; cy = y;
                }
                lastCmd = 'C';
                break;
            }
            case 'S': {
                for (let i = 0; i < nums.length; i += 4) {
                    const x1 = (lastCmd === 'C' || lastCmd === 'S') ? 2 * cx - lastCx1 : cx;
                    const y1 = (lastCmd === 'C' || lastCmd === 'S') ? 2 * cy - lastCy1 : cy;
                    const x2 = isRel ? cx + nums[i] : nums[i];
                    const y2 = isRel ? cy + nums[i + 1] : nums[i + 1];
                    const x = isRel ? cx + nums[i + 2] : nums[i + 2];
                    const y = isRel ? cy + nums[i + 3] : nums[i + 3];
                    segments.push({ type: 'C', x1, y1, x2, y2, x, y, fx: cx, fy: cy });
                    lastCx1 = x2; lastCy1 = y2;
                    cx = x; cy = y;
                    lastCmd = 'S';
                }
                break;
            }
            case 'Q': {
                for (let i = 0; i < nums.length; i += 4) {
                    const x1 = isRel ? cx + nums[i] : nums[i];
                    const y1 = isRel ? cy + nums[i + 1] : nums[i + 1];
                    const x = isRel ? cx + nums[i + 2] : nums[i + 2];
                    const y = isRel ? cy + nums[i + 3] : nums[i + 3];
                    segments.push({ type: 'Q', x1, y1, x, y, fx: cx, fy: cy });
                    lastCx1 = x1; lastCy1 = y1;
                    cx = x; cy = y;
                }
                lastCmd = 'Q';
                break;
            }
            case 'T': {
                for (let i = 0; i < nums.length; i += 2) {
                    const x1 = (lastCmd === 'Q' || lastCmd === 'T') ? 2 * cx - lastCx1 : cx;
                    const y1 = (lastCmd === 'Q' || lastCmd === 'T') ? 2 * cy - lastCy1 : cy;
                    const x = isRel ? cx + nums[i] : nums[i];
                    const y = isRel ? cy + nums[i + 1] : nums[i + 1];
                    segments.push({ type: 'Q', x1, y1, x, y, fx: cx, fy: cy });
                    lastCx1 = x1; lastCy1 = y1;
                    cx = x; cy = y;
                    lastCmd = 'T';
                }
                break;
            }
            case 'A': {
                const tuples = parseArcArgs(match[2]);
                for (const arc of tuples) {
                    const endX = isRel ? cx + arc.x : arc.x;
                    const endY = isRel ? cy + arc.y : arc.y;
                    const cubics = arcToCubics(cx, cy, arc.rx, arc.ry, arc.xRot, arc.largeArc, arc.sweep, endX, endY);
                    if (cubics.length === 0) continue;
                    for (const c of cubics) {
                        segments.push({ type: 'C', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, x: c.x, y: c.y, fx: cx, fy: cy });
                        lastCx1 = c.x2; lastCy1 = c.y2;
                        cx = c.x; cy = c.y;
                    }
                }
                lastCmd = 'A';
                break;
            }
            case 'Z': {
                if (cx !== mx || cy !== my) {
                    segments.push({ type: 'L', x: mx, y: my });
                }
                segments.push({ type: 'Z' });
                cx = mx; cy = my;
                lastCmd = 'Z';
                break;
            }
            default:
                return null;
        }
    }

    return segments;
}

// ---- Path Section Splitting & Sampling ----

/**
 * Split a path d-string into sections at M (moveto) boundaries
 */
function splitPathSections(d) {
    d = stripPathWrapper(d);

    const positions = [];
    const re = /[Mm]/g;
    let m;
    while ((m = re.exec(d)) !== null) positions.push(m.index);

    if (positions.length === 0) return [];

    const sections = [];
    for (let i = 0; i < positions.length; i++) {
        const start = positions[i];
        const end = i + 1 < positions.length ? positions[i + 1] : d.length;
        const section = d.substring(start, end).trim();
        if (section) sections.push(section);
    }

    return sections;
}

/**
 * Sample a single path section using direct bezier evaluation.
 * Returns array of [x, y] points, or null on failure (arcs, M-only, etc.)
 */
function sampleSection(sectionStr, samplesPerUnit) {
    const segments = parsePathD(sectionStr);
    if (!segments || segments.length === 0) return null;

    const points = [];
    let cx = 0, cy = 0;

    for (const seg of segments) {
        switch (seg.type) {
            case 'M':
                cx = seg.x; cy = seg.y;
                points.push([cx, cy]);
                break;
            case 'L':
                points.push([seg.x, seg.y]);
                cx = seg.x; cy = seg.y;
                break;
            case 'C': {
                const len = approxCubicLength(seg.fx, seg.fy, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y);
                const n = Math.max(2, Math.min(20, Math.round(len * samplesPerUnit)));
                for (let i = 1; i <= n; i++) {
                    points.push(cubicAt(seg.fx, seg.fy, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y, i / n));
                }
                cx = seg.x; cy = seg.y;
                break;
            }
            case 'Q': {
                const len = approxQuadLength(seg.fx, seg.fy, seg.x1, seg.y1, seg.x, seg.y);
                const n = Math.max(2, Math.min(16, Math.round(len * samplesPerUnit)));
                for (let i = 1; i <= n; i++) {
                    points.push(quadAt(seg.fx, seg.fy, seg.x1, seg.y1, seg.x, seg.y, i / n));
                }
                cx = seg.x; cy = seg.y;
                break;
            }
            case 'Z':
                break;
        }
    }

    return points.length >= 2 ? points : null;
}

/**
 * Sample all sections of a path, returning separate segments for each.
 * Uses direct bezier evaluation.
 */
function samplePathSections(pathData, samplesPerUnit) {
    const sections = splitPathSections(pathData);

    // If no M commands found, try the whole path as a single section
    if (sections.length === 0) {
        const points = sampleSection(pathData, samplesPerUnit);
        return (points && points.length >= 2) ? [points] : [];
    }

    const sectionResults = [];

    for (const sectionStr of sections) {
        let points = sampleSection(sectionStr, samplesPerUnit);

        if (points && points.length >= 2) {
            // Ensure closed paths close exactly
            const isClosed = /[Zz]\s*$/.test(sectionStr.trim());
            if (isClosed) {
                points[points.length - 1] = [points[0][0], points[0][1]];
            }
            sectionResults.push(points);
        } else {
            sectionResults.push(null);
        }
    }

    const segments = [];
    let currentPart = [];
    const EPS = 1e-4;

    for (const pts of sectionResults) {
        if (!pts || pts.length < 2) {
            if (currentPart.length >= 2) segments.push(currentPart);
            currentPart = [];
            continue;
        }

        if (currentPart.length === 0) {
            currentPart = pts.slice();
            continue;
        }

        const prevEnd = currentPart[currentPart.length - 1];
        const newStart = pts[0];
        const continuation = Math.abs(prevEnd[0] - newStart[0]) < EPS && 
                             Math.abs(prevEnd[1] - newStart[1]) < EPS;

        if (continuation) {
            for (let j = 1; j < pts.length; j++) currentPart.push(pts[j]);
        } else {
            segments.push(currentPart);
            currentPart = pts.slice();
        }
    }
    if (currentPart.length >= 2) segments.push(currentPart);

    return segments;
}

// ---- Section-Level Caching (for animations) ----

/** Per-element cache for geometry and path sections */
const elementCache = new WeakMap();

/**
 * Sample path with section-level caching.
 * Frozen sections (all but last) are cached; only the last section is re-evaluated.
 */
function samplePathCached(pathData, samplesPerUnit, cache) {
    const sections = splitPathSections(pathData);
    if (sections.length === 0) return [];

    // Reuse cached results for unchanged leading sections
    const oldSections = cache.sections;
    let matchCount = 0;
    if (oldSections) {
        const limit = Math.min(sections.length - 1, oldSections.length);
        while (matchCount < limit && sections[matchCount] === oldSections[matchCount]) matchCount++;
    }

    const sectionResults = [];
    for (let i = 0; i < sections.length; i++) {
        if (i < matchCount) {
            sectionResults.push(cache.sectionResults[i]);
        } else {
            let points = sampleSection(sections[i], samplesPerUnit);
            if (points && points.length >= 2) {
                const isClosed = /[Zz]\s*$/.test(sections[i].trim());
                if (isClosed) {
                    points[points.length - 1] = [points[0][0], points[0][1]];
                }
            }
            sectionResults.push(points);
        }
    }

    cache.sections = sections;
    cache.sectionResults = sectionResults;

    const segments = [];
    let currentPart = [];
    const EPS = 1e-4;

    for (const pts of sectionResults) {
        if (!pts || pts.length < 2) {
            if (currentPart.length >= 2) segments.push(currentPart);
            currentPart = [];
            continue;
        }

        if (currentPart.length === 0) {
            currentPart = pts.slice();
            continue;
        }

        const prevEnd = currentPart[currentPart.length - 1];
        const newStart = pts[0];
        const continuation = Math.abs(prevEnd[0] - newStart[0]) < EPS && 
                             Math.abs(prevEnd[1] - newStart[1]) < EPS;

        if (continuation) {
            for (let j = 1; j < pts.length; j++) currentPart.push(pts[j]);
        } else {
            segments.push(currentPart);
            currentPart = pts.slice();
        }
    }
    if (currentPart.length >= 2) segments.push(currentPart);

    return segments;
}


// ---- Closed Shape Detection ----

function isClosedShape(element) {
    const tag = element.tagName.toLowerCase();
    if (tag === 'circle' || tag === 'ellipse' || tag === 'rect' || tag === 'polygon') return true;
    if (tag === 'path') {
        const d = element.getAttribute('d') || '';
        return /[Zz]\s*$/.test(d.trim());
    }
    return false;
}

// ---- Non-Path Element Sampling ----

/**
 * Sample a non-path SVG element using getPointAtLength with corner detection
 * and adaptive density based on element length.
 */
function sampleNonPathElement(element) {
    try {
        const tag = element.tagName.toLowerCase();

        // Rect without rounded corners: just return the 4 corner points directly.
        // No need for getPointAtLength — a rect is fully defined by its corners,
        // and uniform samples between them are redundant (straight lines).
        if (tag === 'rect') {
            const x = parseFloat(element.getAttribute('x')) || 0;
            const y = parseFloat(element.getAttribute('y')) || 0;
            const w = parseFloat(element.getAttribute('width')) || 0;
            const h = parseFloat(element.getAttribute('height')) || 0;
            const rx = parseFloat(element.getAttribute('rx')) || 0;
            const ry = parseFloat(element.getAttribute('ry')) || 0;

            if (rx === 0 && ry === 0 && w > 0 && h > 0) {
                return [
                    [x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]
                ];
            }
        }

        // Line: just the two endpoints
        if (tag === 'line') {
            const x1 = parseFloat(element.getAttribute('x1')) || 0;
            const y1 = parseFloat(element.getAttribute('y1')) || 0;
            const x2 = parseFloat(element.getAttribute('x2')) || 0;
            const y2 = parseFloat(element.getAttribute('y2')) || 0;
            return [[x1, y1], [x2, y2]];
        }

        // Polygon/polyline: read vertices directly from the points attribute
        if (tag === 'polygon' || tag === 'polyline') {
            const pointsAttr = element.getAttribute('points') || '';
            const coords = pointsAttr.trim().split(/[\s,]+/).map(Number);
            const points = [];
            for (let i = 0; i + 1 < coords.length; i += 2) {
                points.push([coords[i], coords[i + 1]]);
            }
            if (tag === 'polygon' && points.length > 0) {
                points.push([points[0][0], points[0][1]]);
            }
            return points.length >= 2 ? points : [];
        }

        // Circles, ellipses, rounded rects: use getPointAtLength with adaptive density
        const length = element.getTotalLength();
        if (!isFinite(length) || length === 0) return [];

        const closed = isClosedShape(element);
        const numSamples = Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, Math.round(length * SAMPLES_PER_UNIT)));

        const points = [];
        for (let i = 0; i < numSamples; i++) {
            const d = closed
                ? (i / numSamples) * length
                : (i / (numSamples - 1)) * length;
            const pt = element.getPointAtLength(d);
            points.push([pt.x, pt.y]);
        }

        if (closed && points.length > 0) {
            points.push([points[0][0], points[0][1]]);
        }

        return points;
    } catch (error) {
        console.warn('Failed to sample non-path element:', error);
        return [];
    }
}

// ---- Visibility ----

/**
 * Check if an element is visible -- walks up the ancestor chain to svgRoot
 */
function isElementVisible(element, svgRoot) {
    let el = element;
    while (el && el !== svgRoot?.parentElement && el.nodeType === 1) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        el = el.parentElement;
    }
    return true;
}

// ---- Transform ----

/**
 * Get the relative transform matrix from element to SVG root.
 * Uses the correct multiplication order: inverse(svgCTM) * elementCTM
 */
function getTransformMatrix(element, svgRoot) {
    if (!svgRoot) return null;
    try {
        const elementCTM = element.getScreenCTM();
        const svgCTM = svgRoot.getScreenCTM();
        if (!elementCTM || !svgCTM) return null;
        const inverseSvgCTM = svgCTM.inverse();
        return inverseSvgCTM.multiply(elementCTM);
    } catch (error) {
        return null;
    }
}

/**
 * Apply a transformation matrix to a set of points
 */
function applyTransform(points, matrix, svgRoot) {
    const svgPoint = svgRoot.createSVGPoint();
    return points.map(([x, y]) => {
        svgPoint.x = x;
        svgPoint.y = y;
        const transformed = svgPoint.matrixTransform(matrix);
        return [transformed.x, transformed.y];
    });
}

// ---- Clipping ----

function isInRange(x, y) {
    return x >= -1 && x <= 1 && y >= -1 && y <= 1;
}

/**
 * Interpolate between an inside and outside point to find the [-1, 1] boundary crossing
 */
function clipEdge(inside, outside) {
    const dx = outside[0] - inside[0];
    const dy = outside[1] - inside[1];
    let t = 1;

    if (dx !== 0) {
        const tx = dx > 0 ? (1 - inside[0]) / dx : (-1 - inside[0]) / dx;
        if (tx >= 0 && tx < t) t = tx;
    }
    if (dy !== 0) {
        const ty = dy > 0 ? (1 - inside[1]) / dy : (-1 - inside[1]) / dy;
        if (ty >= 0 && ty < t) t = ty;
    }

    return [inside[0] + dx * t, inside[1] + dy * t];
}

/**
 * Clip points to the [-1, 1] visible range, splitting into sub-segments
 * at boundary crossings with interpolated edge points.
 */
function clipToVisibleRange(points) {
    if (points.length === 0) return [];

    const clippedSegments = [];
    let currentSegment = [];

    for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const inside = isInRange(pt[0], pt[1]);

        if (inside) {
            if (currentSegment.length === 0 && i > 0) {
                const prev = points[i - 1];
                if (!isInRange(prev[0], prev[1])) {
                    currentSegment.push(clipEdge(pt, prev));
                }
            }
            currentSegment.push(pt);
        } else {
            if (currentSegment.length > 0) {
                const prev = points[i - 1];
                if (isInRange(prev[0], prev[1])) {
                    currentSegment.push(clipEdge(prev, pt));
                }
                clippedSegments.push(currentSegment);
                currentSegment = [];
            }
        }
    }

    if (currentSegment.length > 0) {
        clippedSegments.push(currentSegment);
    }

    return clippedSegments;
}

// ---- Geometry Cache Key ----

/**
 * Build a cache key representing the element's geometry definition.
 * Changes when the shape itself changes, but NOT for transform/opacity/color.
 */
function getGeometryKey(element, computed) {
    const tag = element.tagName.toLowerCase();
    switch (tag) {
        case 'path': {
            const cssD = computed.getPropertyValue('d');
            return cssD || element.getAttribute('d') || '';
        }
        case 'circle':
            return `${element.getAttribute('cx')},${element.getAttribute('cy')},${element.getAttribute('r')}`;
        case 'ellipse':
            return `${element.getAttribute('cx')},${element.getAttribute('cy')},${element.getAttribute('rx')},${element.getAttribute('ry')}`;
        case 'rect':
            return `${element.getAttribute('x')},${element.getAttribute('y')},${element.getAttribute('width')},${element.getAttribute('height')},${element.getAttribute('rx')},${element.getAttribute('ry')}`;
        case 'line':
            return `${element.getAttribute('x1')},${element.getAttribute('y1')},${element.getAttribute('x2')},${element.getAttribute('y2')}`;
        case 'polygon':
        case 'polyline':
            return element.getAttribute('points') || '';
        default:
            return '';
    }
}

// ---- Distance & Optimization ----

function distance(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Optimize segment order to minimize jump distances.
 * Uses greedy nearest-neighbor algorithm starting from center.
 */
function optimizeSegmentOrder(segments, startFromCenter = true) {
    if (segments.length <= 1) return segments;

    const ordered = [];
    const remaining = [...segments];

    let startIndex = 0;
    if (startFromCenter) {
        let minDistToCenter = Infinity;
        remaining.forEach((segment, index) => {
            const segStart = segment[0];
            const segEnd = segment[segment.length - 1];
            const distStart = distance(segStart, [0, 0]);
            const distEnd = distance(segEnd, [0, 0]);
            const minDist = Math.min(distStart, distEnd);
            if (minDist < minDistToCenter) {
                minDistToCenter = minDist;
                startIndex = index;
            }
        });
    }

    let current = remaining.splice(startIndex, 1)[0];
    ordered.push(current);

    while (remaining.length > 0) {
        const currentEnd = current[current.length - 1];
        let minDist = Infinity;
        let minIndex = -1;
        let shouldReverse = false;

        remaining.forEach((segment, index) => {
            const segStart = segment[0];
            const segEnd = segment[segment.length - 1];

            const distToStart = distance(currentEnd, segStart);
            if (distToStart < minDist) {
                minDist = distToStart;
                minIndex = index;
                shouldReverse = false;
            }

            const distToEnd = distance(currentEnd, segEnd);
            if (distToEnd < minDist) {
                minDist = distToEnd;
                minIndex = index;
                shouldReverse = true;
            }
        });

        if (minIndex !== -1) {
            let nextSegment = remaining.splice(minIndex, 1)[0];
            if (shouldReverse) {
                nextSegment = [...nextSegment].reverse();
            }
            ordered.push(nextSegment);
            current = nextSegment;
        }
    }

    return ordered;
}

/**
 * Double draw segments -- draw forward then backward.
 * Makes the beam return to the starting point of each segment.
 */
function doubleDrawSegments(segments) {
    return segments.map(segment => {
        if (segment.length === 0) return segment;
        const reversed = [...segment].reverse().slice(1);
        return [...segment, ...reversed];
    });
}

// ---- Normalization ----

/**
 * Normalize points to -1 to 1 range for oscilloscope coordinates
 */
export function normalizePoints(points, bbox) {
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;
    const scale = Math.max(bbox.width, bbox.height);

    return points.map(([x, y]) => [
        ((x - centerX) / scale) * 2,
        -((y - centerY) / scale) * 2  // Flip Y for oscilloscope coordinates
    ]);
}

// ---- Helpers ----

/**
 * Cap total points across all segments to a maximum budget
 */
function capTotalPoints(segments, maxPoints) {
    let totalPoints = 0;
    for (const seg of segments) totalPoints += seg.length;

    if (totalPoints <= maxPoints) return segments;

    const ratio = maxPoints / totalPoints;
    return segments.map(seg => {
        const cap = Math.max(2, Math.round(seg.length * ratio));
        if (seg.length <= cap) return seg;
        const step = seg.length / cap;
        const capped = [];
        for (let j = 0; j < cap; j++) {
            capped.push(seg[Math.round(j * step)]);
        }
        return capped;
    });
}

/**
 * Get the effective viewBox of an SVG element
 */
function getViewBox(svgElement) {
    const viewBoxAttr = svgElement.getAttribute('viewBox');
    if (viewBoxAttr) {
        const parts = viewBoxAttr.split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts.every(n => isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
            return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
        }
    }

    const width = parseFloat(svgElement.getAttribute('width'));
    const height = parseFloat(svgElement.getAttribute('height'));
    if (isFinite(width) && isFinite(height) && width > 0 && height > 0) {
        return { x: 0, y: 0, width, height };
    }

    try {
        const bbox = svgElement.getBBox();
        if (bbox.width > 0 && bbox.height > 0) {
            return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
        }
    } catch (e) {}

    return null;
}

// ---- Exported API Functions ----

/**
 * Extract raw segments and bbox from SVG path data string
 */
export function extractPathPoints(pathData, numSamples = 200, optimize = true, doubleDraw = true) {
    // Sample using direct bezier eval with fallback for arcs
    let segments = samplePathSections(pathData, SAMPLES_PER_UNIT);

    if (segments.length === 0) {
        throw new Error('No valid segments could be extracted from path');
    }

    // Cap total points to numSamples budget
    segments = capTotalPoints(segments, numSamples);

    // Apply optimizations
    let processedSegments = segments;
    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }
    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
    }

    // Calculate bbox across all segments
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    processedSegments.forEach(segment => {
        segment.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });
    });

    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
        throw new Error('Invalid bounding box calculated from path');
    }

    const bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    return { segments: processedSegments, bbox };
}

/**
 * Extract points from an SVG element using adaptive density sampling.
 * For path elements, uses direct bezier evaluation with arc fallback.
 * For other shapes, uses getPointAtLength with corner detection.
 */
export function extractPointsFromElement(element, _samples, checkVisibility = false) {
    const segments = [];
    const svgRoot = element.ownerSVGElement;

    // Ancestor visibility check (walks up the DOM tree)
    if (checkVisibility) {
        if (!isElementVisible(element, svgRoot)) return segments;
    }

    if (typeof element.getTotalLength !== 'function') return segments;

    try {
        const svg = svgRoot;
        const matrix = getTransformMatrix(element, svg);
        const tag = element.tagName.toLowerCase();

        if (tag === 'path') {
            // Get path data -- try CSS computed value first (handles CSS animations), then attribute
            let pathData = element.getAttribute('d');
            const computed = window.getComputedStyle(element);
            const cssD = computed.getPropertyValue('d');
            if (cssD && cssD !== 'none') {
                pathData = stripPathWrapper(cssD);
            } else if (pathData) {
                pathData = stripPathWrapper(pathData);
            }

            if (pathData) {
                const pathSegments = samplePathSections(pathData, SAMPLES_PER_UNIT);

                for (let segPoints of pathSegments) {
                    if (matrix && svg) {
                        segPoints = applyTransform(segPoints, matrix, svg);
                    }
                    segments.push(segPoints);
                }
            }
        } else {
            // Non-path elements -- adaptive density with corner detection
            const points = sampleNonPathElement(element);
            if (points.length > 0) {
                if (matrix && svg) {
                    segments.push(applyTransform(points, matrix, svg));
                } else {
                    segments.push(points);
                }
            }
        }
    } catch (error) {
        console.warn('Could not extract points from element:', error.message);
    }

    return segments;
}

/**
 * Parse full SVG markup and extract all paths (static, no animation)
 */
export function parseSVGMarkupStatic(markup, samples, optimize = true, doubleDraw = true) {
    const container = getContainer();

    let cleanedMarkup = markup.trim();
    if (cleanedMarkup.startsWith('<?xml')) {
        cleanedMarkup = cleanedMarkup.replace(/<\?xml[^?]*\?>\s*/i, '');
    }

    // Resolve env(time-*) values before DOM insertion
    cleanedMarkup = resolveEnv(cleanedMarkup);

    const svgElement = parseSvgMarkup(cleanedMarkup);
    if (!svgElement) {
        throw new Error('No <svg> element found in markup');
    }

    const hasScripts = svgElement.querySelectorAll('script').length > 0 || svgElement.hasAttribute('onload');

    // Prevent scripts from executing globally when appended
    const detachedScripts = Array.from(svgElement.querySelectorAll('script'));
    for (const s of detachedScripts) s.remove();
    if (svgElement.hasAttribute('onload')) svgElement.removeAttribute('onload');

    container.innerHTML = '';
    container.appendChild(svgElement);

    // Normalize SVG dimensions to match viewBox
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
        if (vbWidth && vbHeight) {
            svgElement.setAttribute('width', vbWidth);
            svgElement.setAttribute('height', vbHeight);
        }
    }

    const elements = svgElement.querySelectorAll(DRAWABLE_SELECTOR);
    if (elements.length === 0 && !hasScripts) {
        throw new Error('No drawable shapes found in SVG');
    }

    // For scripted SVGs with no initial elements, return empty — the
    // continuous sampler will execute the scripts and sample dynamically.
    if (elements.length === 0) {
        return [];
    }

    // Extract segments from all elements using adaptive density
    let allSegments = [];
    for (const element of elements) {
        const elementSegments = extractPointsFromElement(element, samples);
        if (elementSegments.length > 0) {
            allSegments = allSegments.concat(elementSegments);
        }
    }

    if (allSegments.length === 0) {
        throw new Error('Could not extract points from SVG');
    }

    // Cap total points
    allSegments = capTotalPoints(allSegments, samples);

    // Apply optimizations
    let processedSegments = allSegments;
    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }
    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
    }

    // Get bounding box for normalization (prefer viewBox)
    let bbox = getViewBox(svgElement);
    if (!bbox) {
        try {
            bbox = svgElement.getBBox();
        } catch (error) {
            throw new Error(`Could not get bounding box from SVG: ${error.message}`);
        }
    }

    if (!bbox || !isFinite(bbox.width) || !isFinite(bbox.height) || bbox.width === 0 || bbox.height === 0) {
        throw new Error('Invalid bounding box from SVG');
    }

    // Normalize and clip to visible range
    const normalizedSegments = [];
    for (const segment of processedSegments) {
        const normalized = normalizePoints(segment, bbox);
        const clipped = clipToVisibleRange(normalized);
        for (const clippedSeg of clipped) {
            if (clippedSeg.length >= 2) {
                normalizedSegments.push(clippedSeg);
            }
        }
    }

    return normalizedSegments;
}

/**
 * Sample current frame from live animations.
 * Uses section-level caching for paths and geometry caching for other elements.
 */
export function sampleCurrentFrame(svgElement, elements, samples, optimize = true, doubleDraw = true) {
    // Force style recalculation to get current animated state
    svgElement.getBoundingClientRect();

    let frameSegments = [];

    for (const element of elements) {
        // Ancestor visibility check
        if (!isElementVisible(element, svgElement)) continue;

        const tag = element.tagName.toLowerCase();
        const matrix = getTransformMatrix(element, svgElement);

        if (tag === 'path') {
            // Get path data -- prefer CSS computed value for animated paths
            const computed = window.getComputedStyle(element);
            let pathData = computed.getPropertyValue('d') || element.getAttribute('d') || '';
            if (!pathData || pathData === 'none') continue;
            pathData = stripPathWrapper(pathData);

            // Section-level caching: only re-evaluate changed sections
            let cache = elementCache.get(element);
            if (!cache || !cache._pathCache) {
                cache = { _pathCache: true, sections: null, sectionResults: [] };
                elementCache.set(element, cache);
            }

            const pathSegments = samplePathCached(pathData, SAMPLES_PER_UNIT, cache);

            for (let segPoints of pathSegments) {
                if (matrix && svgElement) {
                    segPoints = applyTransform(segPoints, matrix, svgElement);
                }
                frameSegments.push(segPoints);
            }
        } else {
            // Non-path elements -- geometry caching
            const computed = window.getComputedStyle(element);
            const geoKey = getGeometryKey(element, computed);
            let cached = elementCache.get(element);
            let points;

            if (cached && !cached._pathCache && cached.key === geoKey) {
                points = cached.points;
            } else {
                points = sampleNonPathElement(element);
                elementCache.set(element, { key: geoKey, points });
            }

            if (points && points.length > 0) {
                if (matrix && svgElement) {
                    frameSegments.push(applyTransform(points, matrix, svgElement));
                } else {
                    frameSegments.push(points);
                }
            }
        }
    }

    // Cap total points
    frameSegments = capTotalPoints(frameSegments, samples);

    // Apply optimizations
    let processedSegments = frameSegments;
    if (optimize) {
        processedSegments = optimizeSegmentOrder(processedSegments, true);
    }
    if (doubleDraw) {
        processedSegments = doubleDrawSegments(processedSegments);
    }

    return processedSegments;
}

/**
 * Create a continuous sampler for animated SVGs
 */
export function createContinuousSampler(markup, samples, fps, onFrame, isPlayingGetter, optimize = true, doubleDraw = true) {
    const container = getContainer();

    let cleanedMarkup = markup.trim();
    if (cleanedMarkup.startsWith('<?xml')) {
        cleanedMarkup = cleanedMarkup.replace(/<\?xml[^?]*\?>\s*/i, '');
    }

    // Resolve env(time-*) values before DOM insertion
    cleanedMarkup = resolveEnv(cleanedMarkup);

    const svgElement = parseSvgMarkup(cleanedMarkup);
    if (!svgElement) {
        throw new Error('No <svg> element found in markup');
    }

    // Detach scripts and onload BEFORE appendChild to prevent runaway global execution
    const detachedScripts = Array.from(svgElement.querySelectorAll('script'));
    for (const s of detachedScripts) s.remove();
    const detachedOnload = svgElement.getAttribute('onload');
    if (detachedOnload !== null) svgElement.removeAttribute('onload');

    container.innerHTML = '';
    container.appendChild(svgElement);

    // Normalize SVG dimensions to match viewBox
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
        const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number);
        if (vbWidth && vbHeight) {
            svgElement.setAttribute('width', vbWidth);
            svgElement.setAttribute('height', vbHeight);
        }
    }

    // Execute scripts before querying elements — scripts may create them.
    // Always force: innerHTML / appendChild rebuilds the DOM, so script state is lost.
    if (detachedScripts.length > 0 || detachedOnload) {
        executeScripts(svgElement, true, detachedScripts, detachedOnload);
    }

    const hasScripts = detachedScripts.length > 0 || detachedOnload !== null;
    const elements = svgElement.querySelectorAll(DRAWABLE_SELECTOR);
    if (hasScripts) {
        console.log('[svgSampler] Scripts executed, initial drawable elements:', elements.length);
    }
    if (elements.length === 0 && !hasScripts) {
        throw new Error('No drawable shapes found in SVG');
    }

    // Get bounding box for normalization (prefer viewBox)
    let bbox = getViewBox(svgElement);
    if (!bbox) {
        bbox = svgElement.getBBox();
    }

    const frameDuration = 1000 / fps;
    let samplingInterval = null;
    let frameLogCounter = 0;

    samplingInterval = setInterval(() => {
        if (!isPlayingGetter()) {
            if (samplingInterval) {
                clearInterval(samplingInterval);
                samplingInterval = null;
            }
            return;
        }

        try {
            // Re-query each frame for scripts that dynamically add/remove elements
            const currentElements = hasScripts
                ? svgElement.querySelectorAll(DRAWABLE_SELECTOR)
                : elements;
            if (currentElements.length === 0) return;

            const frameSegments = sampleCurrentFrame(svgElement, currentElements, samples, optimize, doubleDraw);

            if (hasScripts && (frameLogCounter++ % 60 === 0)) {
                console.log(`[svgSampler] frame: ${currentElements.length} elements, ${frameSegments.length} segments, ${frameSegments.reduce((s, seg) => s + seg.length, 0)} points`);
            }

            // Normalize and clip to visible range
            const normalizedSegments = [];
            for (const segment of frameSegments) {
                const normalized = normalizePoints(segment, bbox);
                const clipped = clipToVisibleRange(normalized);
                for (const clippedSeg of clipped) {
                    if (clippedSeg.length >= 2) {
                        normalizedSegments.push(clippedSeg);
                    }
                }
            }

            // Always call onFrame, even with empty segments, so the
            // display clears when everything is off-screen or hidden
            onFrame(normalizedSegments);
        } catch (error) {
            console.error('Error sampling animation frame:', error);
        }
    }, frameDuration);

    return {
        stop: () => {
            if (samplingInterval) {
                clearInterval(samplingInterval);
                samplingInterval = null;
            }
        }
    };
}
