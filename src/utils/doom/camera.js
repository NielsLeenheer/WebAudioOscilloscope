/**
 * DOOM Camera System
 * First-person camera with movement and collision detection
 */

import { getLastFloorLookupMethod } from './mapGeometry.js';

const EYE_HEIGHT = 41;          // DOOM player eye height above floor
const MAX_STEP_HEIGHT = 24;     // Maximum step height player can climb
const PLAYER_RADIUS = 6;        // Player collision radius (for walls)
const FLOOR_SAMPLE_RADIUS = 8;  // Floor height sampling radius (small to stay on platforms)
const STEP_CHECK_RADIUS = 12;   // Radius for step height blocking
const MAX_MOVE_PER_FRAME = 4;   // Maximum movement per collision check (must be < PLAYER_RADIUS)

// Debug logging
let debugCollisionEnabled = false;
let debugHeightEnabled = false;
let lastDebugTime = 0;
const DEBUG_THROTTLE_MS = 100;  // Throttle debug output to avoid spam

export function setDebugCollision(enabled) {
    debugCollisionEnabled = enabled;
    console.log(`[CAMERA] Collision debug ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function setDebugHeight(enabled) {
    debugHeightEnabled = enabled;
    console.log(`[CAMERA] Height debug ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

function shouldDebugLog() {
    const now = Date.now();
    if (now - lastDebugTime < DEBUG_THROTTLE_MS) return false;
    lastDebugTime = now;
    return true;
}

/**
 * Create a new camera
 * @param {number} x - Starting X position
 * @param {number} y - Starting Y position
 * @param {number} angle - Starting angle in radians
 * @param {number} floorHeight - Starting floor height
 * @returns {Object} Camera object
 */
export function createCamera(x, y, angle, floorHeight = 0) {
    return {
        x,
        y,
        z: floorHeight + EYE_HEIGHT,
        floorHeight,
        angle,
        fov: Math.PI / 2,
        moveSpeed: 400,
        turnSpeed: Math.PI * 1.5,
        nearPlane: 0.1,
        farPlane: 3000
    };
}

/**
 * Update camera position based on input
 * @param {Object} camera - Camera object
 * @param {Object} keys - Key state { up, down, left, right }
 * @param {number} deltaTime - Time since last update in seconds
 * @param {Array} solidWalls - Array of solid walls for collision
 * @param {Function} getFloorHeight - Function to get floor height at position
 */
export function updateCamera(camera, keys, deltaTime, solidWalls = [], getFloorHeight = null) {
    // Rotation
    if (keys.left) {
        camera.angle += camera.turnSpeed * deltaTime;
    }
    if (keys.right) {
        camera.angle -= camera.turnSpeed * deltaTime;
    }

    // Normalize angle to [0, 2PI]
    camera.angle = ((camera.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    // Calculate movement direction
    const moveX = -Math.sin(camera.angle);
    const moveY = Math.cos(camera.angle);

    // Calculate desired movement
    let dx = 0, dy = 0;
    if (keys.up) {
        dx += moveX * camera.moveSpeed * deltaTime;
        dy += moveY * camera.moveSpeed * deltaTime;
    }
    if (keys.down) {
        dx -= moveX * camera.moveSpeed * deltaTime;
        dy -= moveY * camera.moveSpeed * deltaTime;
    }

    // Apply movement with collision detection (walls + step height)
    if (dx !== 0 || dy !== 0) {
        const newPos = applyCollision(
            camera.x, camera.y,
            dx, dy,
            solidWalls,
            camera.floorHeight,
            getFloorHeight
        );
        camera.x = newPos.x;
        camera.y = newPos.y;
    }

    // Update floor height and camera Z (smooth interpolation for stairs)
    if (getFloorHeight) {
        const newFloorHeight = sampleFloorHeight(camera.x, camera.y, getFloorHeight);
        const heightDiff = newFloorHeight - camera.floorHeight;

        // Debug logging for height changes
        if (debugHeightEnabled && Math.abs(heightDiff) > 0.5 && shouldDebugLog()) {
            const direction = heightDiff > 0 ? 'UP' : 'DOWN';
            console.log(`[HEIGHT] Step ${direction} detected at (${camera.x.toFixed(1)}, ${camera.y.toFixed(1)})`);
            console.log(`  Previous floor: ${camera.floorHeight.toFixed(1)}`);
            console.log(`  New floor: ${newFloorHeight.toFixed(1)}`);
            console.log(`  Height difference: ${heightDiff.toFixed(1)} (${direction})`);
            console.log(`  Previous Z: ${camera.z.toFixed(1)}`);
            console.log(`  New Z will be: ${(newFloorHeight + EYE_HEIGHT).toFixed(1)}`);

            // Log individual sample points for debugging
            const samples = {
                center: getFloorHeight(camera.x, camera.y),
                east: getFloorHeight(camera.x + FLOOR_SAMPLE_RADIUS, camera.y),
                west: getFloorHeight(camera.x - FLOOR_SAMPLE_RADIUS, camera.y),
                north: getFloorHeight(camera.x, camera.y + FLOOR_SAMPLE_RADIUS),
                south: getFloorHeight(camera.x, camera.y - FLOOR_SAMPLE_RADIUS)
            };
            console.log(`  Floor samples: center=${samples.center.toFixed(1)}, E=${samples.east.toFixed(1)}, W=${samples.west.toFixed(1)}, N=${samples.north.toFixed(1)}, S=${samples.south.toFixed(1)}`);
            console.log(`  Lookup method: ${getLastFloorLookupMethod()}`);
        }

        if (Math.abs(heightDiff) > 0.1) {
            // Smooth transition for visual effect
            camera.floorHeight += heightDiff * Math.min(1, deltaTime * 10);
        } else {
            camera.floorHeight = newFloorHeight;
        }
        camera.z = camera.floorHeight + EYE_HEIGHT;
    }
}

/**
 * Apply collision detection with walls and step height checking
 * @param {number} x - Current X
 * @param {number} y - Current Y
 * @param {number} dx - Desired X movement
 * @param {number} dy - Desired Y movement
 * @param {Array} walls - Solid walls
 * @param {number} currentFloorHeight - Current floor height
 * @param {Function} getFloorHeight - Function to get floor height at position
 * @returns {Object} New position { x, y }
 */
function applyCollision(x, y, dx, dy, walls, currentFloorHeight, getFloorHeight) {
    // Subdivide movement if it's too large (prevents tunneling through thin walls)
    const moveDist = Math.sqrt(dx * dx + dy * dy);
    if (moveDist > MAX_MOVE_PER_FRAME) {
        const steps = Math.ceil(moveDist / MAX_MOVE_PER_FRAME);
        const stepDx = dx / steps;
        const stepDy = dy / steps;

        let currentX = x;
        let currentY = y;
        let currentFloor = currentFloorHeight;

        for (let i = 0; i < steps; i++) {
            const result = applyCollisionStep(currentX, currentY, stepDx, stepDy, walls, currentFloor, getFloorHeight);
            if (result.x === currentX && result.y === currentY) {
                // Movement blocked, stop subdividing
                break;
            }
            currentX = result.x;
            currentY = result.y;
            // Update floor height for next step
            if (getFloorHeight) {
                currentFloor = sampleFloorHeight(currentX, currentY, getFloorHeight);
            }
        }

        return { x: currentX, y: currentY };
    }

    return applyCollisionStep(x, y, dx, dy, walls, currentFloorHeight, getFloorHeight);
}

function applyCollisionStep(x, y, dx, dy, walls, currentFloorHeight, getFloorHeight) {
    // Try full movement first
    let newX = x + dx;
    let newY = y + dy;
    let blocked = false;

    // Check wall collision
    let collidedWall = null;
    for (const wall of walls) {
        if (circleLineCollision(newX, newY, PLAYER_RADIUS, wall.start, wall.end)) {
            blocked = true;
            collidedWall = wall;
            break;
        }
    }

    // Check step height at new position
    let stepBlockInfo = null;
    if (!blocked && getFloorHeight) {
        const newFloorHeight = checkStepHeight(newX, newY, getFloorHeight);
        const stepUp = newFloorHeight - currentFloorHeight;

        // Block if step is too high to climb
        if (stepUp > MAX_STEP_HEIGHT) {
            blocked = true;
            stepBlockInfo = { newFloorHeight, currentFloorHeight, stepUp };
        }
    }

    // Debug logging for initial collision check
    if (blocked && debugCollisionEnabled && shouldDebugLog()) {
        if (collidedWall) {
            console.log(`[COLLISION] Wall blocked movement at (${x.toFixed(1)}, ${y.toFixed(1)}) → (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
            console.log(`  Wall: (${collidedWall.start.x.toFixed(1)}, ${collidedWall.start.y.toFixed(1)}) → (${collidedWall.end.x.toFixed(1)}, ${collidedWall.end.y.toFixed(1)})`);
            console.log(`  Wall heights: bottom=${collidedWall.bottomHeight}, top=${collidedWall.topHeight}`);
            if (collidedWall.isDoor) console.log(`  Wall type: DOOR`);
            if (collidedWall.isTwoSided) console.log(`  Wall type: TWO-SIDED`);
        }
        if (stepBlockInfo) {
            console.log(`[COLLISION] Step too high at (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
            console.log(`  Current floor: ${stepBlockInfo.currentFloorHeight.toFixed(1)}`);
            console.log(`  New floor: ${stepBlockInfo.newFloorHeight.toFixed(1)}`);
            console.log(`  Step height: ${stepBlockInfo.stepUp.toFixed(1)} (max: ${MAX_STEP_HEIGHT})`);
        }
    }

    if (blocked) {
        // Try sliding along X axis only
        let canMoveX = true;
        let canMoveY = true;

        // Check X movement
        for (const wall of walls) {
            if (circleLineCollision(x + dx, y, PLAYER_RADIUS, wall.start, wall.end)) {
                canMoveX = false;
                break;
            }
        }
        if (canMoveX && getFloorHeight) {
            const floorAtX = checkStepHeight(x + dx, y, getFloorHeight);
            if (floorAtX - currentFloorHeight > MAX_STEP_HEIGHT) {
                canMoveX = false;
            }
        }

        // Check Y movement
        for (const wall of walls) {
            if (circleLineCollision(x, y + dy, PLAYER_RADIUS, wall.start, wall.end)) {
                canMoveY = false;
                break;
            }
        }
        if (canMoveY && getFloorHeight) {
            const floorAtY = checkStepHeight(x, y + dy, getFloorHeight);
            if (floorAtY - currentFloorHeight > MAX_STEP_HEIGHT) {
                canMoveY = false;
            }
        }

        // Apply allowed movement
        let slideResult = 'none';
        if (canMoveX && !canMoveY) {
            newX = x + dx;
            newY = y;
            slideResult = 'slide-X';
        } else if (!canMoveX && canMoveY) {
            newX = x;
            newY = y + dy;
            slideResult = 'slide-Y';
        } else if (canMoveX && canMoveY) {
            // Both axes work individually but diagonal was blocked - wall is at an angle
            // Be conservative: check if sliding position is still safe from the wall we hit
            // If we can't determine which axis is safer, block movement entirely
            if (collidedWall) {
                // Check distance to wall from each potential slide position
                const distX = pointToLineDistance(x + dx, y, collidedWall.start, collidedWall.end);
                const distY = pointToLineDistance(x, y + dy, collidedWall.start, collidedWall.end);

                // Only allow slide if we're moving away from the wall (distance increases)
                const currentDist = pointToLineDistance(x, y, collidedWall.start, collidedWall.end);

                if (distX > currentDist && distX > PLAYER_RADIUS) {
                    newX = x + dx;
                    newY = y;
                    slideResult = 'slide-X (away from wall)';
                } else if (distY > currentDist && distY > PLAYER_RADIUS) {
                    newX = x;
                    newY = y + dy;
                    slideResult = 'slide-Y (away from wall)';
                } else {
                    // Both slides move toward or along the wall - block entirely
                    newX = x;
                    newY = y;
                    slideResult = 'BLOCKED (diagonal wall)';
                }
            } else {
                // Step height block with both axes clear - prefer smaller step
                if (getFloorHeight) {
                    const stepX = checkStepHeight(x + dx, y, getFloorHeight) - currentFloorHeight;
                    const stepY = checkStepHeight(x, y + dy, getFloorHeight) - currentFloorHeight;
                    if (Math.abs(stepX) <= Math.abs(stepY)) {
                        newX = x + dx;
                        newY = y;
                        slideResult = 'slide-X (smaller step)';
                    } else {
                        newX = x;
                        newY = y + dy;
                        slideResult = 'slide-Y (smaller step)';
                    }
                } else {
                    newX = x;
                    newY = y;
                    slideResult = 'BLOCKED (no wall info)';
                }
            }
        } else {
            // Completely blocked
            newX = x;
            newY = y;
            slideResult = 'BLOCKED';
        }

        // FINAL SAFETY CHECK: Verify the computed position doesn't collide with ANY wall
        // This catches edge cases at corners where slide logic checked only one wall
        if (newX !== x || newY !== y) {
            for (const wall of walls) {
                if (circleLineCollision(newX, newY, PLAYER_RADIUS, wall.start, wall.end)) {
                    // Slide position still collides! Revert to original position
                    if (debugCollisionEnabled && shouldDebugLog()) {
                        console.log(`[COLLISION] SAFETY CHECK FAILED - slide position still collides!`);
                        console.log(`  Attempted slide: ${slideResult}`);
                        console.log(`  Blocking wall: (${wall.start.x.toFixed(1)}, ${wall.start.y.toFixed(1)}) → (${wall.end.x.toFixed(1)}, ${wall.end.y.toFixed(1)})`);
                    }
                    newX = x;
                    newY = y;
                    slideResult = 'BLOCKED (safety check)';
                    break;
                }
            }
        }

        if (debugCollisionEnabled && shouldDebugLog()) {
            console.log(`[COLLISION] Slide result: ${slideResult}`);
            console.log(`  canMoveX: ${canMoveX}, canMoveY: ${canMoveY}`);
            console.log(`  Final position: (${newX.toFixed(1)}, ${newY.toFixed(1)})`);
        }
    }

    return { x: newX, y: newY };
}

/**
 * Sample floor height at position
 * Uses small radius and max to handle cracks without falling off platforms
 */
function sampleFloorHeight(x, y, getFloorHeight) {
    if (!getFloorHeight) return 0;

    // Sample at small radius - stays within platforms but catches small cracks
    const samples = [
        getFloorHeight(x, y),
        getFloorHeight(x + FLOOR_SAMPLE_RADIUS, y),
        getFloorHeight(x - FLOOR_SAMPLE_RADIUS, y),
        getFloorHeight(x, y + FLOOR_SAMPLE_RADIUS),
        getFloorHeight(x, y - FLOOR_SAMPLE_RADIUS)
    ];

    // Use max - with small radius this won't cause floating issues
    return Math.max(...samples);
}

/**
 * Check floor height for step blocking (smaller radius than floor sampling)
 * Only blocks if the immediate area has a step too high
 */
function checkStepHeight(x, y, getFloorHeight) {
    if (!getFloorHeight) return 0;

    // Use smaller radius for step detection - only check immediate surroundings
    const samples = [
        getFloorHeight(x, y),
        getFloorHeight(x + STEP_CHECK_RADIUS, y),
        getFloorHeight(x - STEP_CHECK_RADIUS, y),
        getFloorHeight(x, y + STEP_CHECK_RADIUS),
        getFloorHeight(x, y - STEP_CHECK_RADIUS)
    ];

    return Math.max(...samples);
}

/**
 * Calculate distance from a point to a line segment
 */
function pointToLineDistance(px, py, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = px - p1.x;
    const fy = py - p1.y;

    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return Math.sqrt(fx * fx + fy * fy);
    }

    let t = (fx * dx + fy * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;

    return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

/**
 * Check collision between a circle and a line segment
 */
function circleLineCollision(cx, cy, r, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = cx - p1.x;
    const fy = cy - p1.y;

    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return fx * fx + fy * fy <= r * r;
    }

    let t = (fx * dx + fy * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;
    const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;

    return distSq <= r * r;
}

/**
 * Reset camera to a position
 */
export function resetCamera(camera, x, y, angle, floorHeight = 0) {
    camera.x = x;
    camera.y = y;
    camera.angle = angle;
    camera.floorHeight = floorHeight;
    camera.z = floorHeight + EYE_HEIGHT;
}
