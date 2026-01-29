/**
 * Chrome Dino Runner Generator for Oscilloscope
 * A side-scrolling endless runner rendered as vector lines
 */

import {
    TREX_STANDING, TREX_RUN_1, TREX_RUN_2, TREX_CRASHED,
    TREX_DUCK_1, TREX_DUCK_2,
    CACTUS_SMALL_1, CACTUS_SMALL_2, CACTUS_SMALL_3,
    CACTUS_LARGE_1, CACTUS_LARGE_2, CACTUS_LARGE_3,
    PTERO_1, PTERO_2,
    CLOUD,
    RESTART, TEXT_GAME_OVER,
    GROUND_1, GROUND_2,
    ORIG_TREX_STANDING, ORIG_TREX_RUN_1, ORIG_TREX_RUN_2, ORIG_TREX_CRASHED,
    ORIG_TREX_DUCK_1, ORIG_TREX_DUCK_2,
    ORIG_CACTUS_SMALL_1, ORIG_CACTUS_SMALL_2, ORIG_CACTUS_SMALL_3,
    ORIG_CACTUS_LARGE_1, ORIG_CACTUS_LARGE_2, ORIG_CACTUS_LARGE_3,
    ORIG_PTERO_1, ORIG_PTERO_2,
    ORIG_CLOUD,
    ORIG_RESTART, ORIG_TEXT_GAME_OVER,
    ORIG_GROUND_1, ORIG_GROUND_2
} from './spriteData.js';

// Sprite sets: simplified (default) and original
const SPRITES = {
    simplified: {
        TREX_STANDING, TREX_RUN_1, TREX_RUN_2, TREX_CRASHED,
        TREX_DUCK_1, TREX_DUCK_2,
        CACTUS_SMALL: [CACTUS_SMALL_1, CACTUS_SMALL_2, CACTUS_SMALL_3],
        CACTUS_LARGE: [CACTUS_LARGE_1, CACTUS_LARGE_2, CACTUS_LARGE_3],
        PTERO_1, PTERO_2, CLOUD,
        RESTART, TEXT_GAME_OVER,
        GROUND_1, GROUND_2
    },
    original: {
        TREX_STANDING: ORIG_TREX_STANDING, TREX_RUN_1: ORIG_TREX_RUN_1,
        TREX_RUN_2: ORIG_TREX_RUN_2, TREX_CRASHED: ORIG_TREX_CRASHED,
        TREX_DUCK_1: ORIG_TREX_DUCK_1, TREX_DUCK_2: ORIG_TREX_DUCK_2,
        CACTUS_SMALL: [ORIG_CACTUS_SMALL_1, ORIG_CACTUS_SMALL_2, ORIG_CACTUS_SMALL_3],
        CACTUS_LARGE: [ORIG_CACTUS_LARGE_1, ORIG_CACTUS_LARGE_2, ORIG_CACTUS_LARGE_3],
        PTERO_1: ORIG_PTERO_1, PTERO_2: ORIG_PTERO_2, CLOUD: ORIG_CLOUD,
        RESTART: ORIG_RESTART, TEXT_GAME_OVER: ORIG_TEXT_GAME_OVER,
        GROUND_1: ORIG_GROUND_1, GROUND_2: ORIG_GROUND_2
    }
};

// Physics constants (scaled for oscilloscope coordinate system -1 to 1)
// Position update uses: y += velocity * deltaTime * 60, so velocity ~= units per frame at 60fps
// Physics scaled from original (g=0.6, v₀=10, drop=-5 per frame) with 2x visual multiplier
// Original: v₀ = -(10 + speed/10), so jumps get higher with speed
const GRAVITY = -0.38;          // Gravity acceleration (negative = pulls down)
const JUMP_VELOCITY = 0.106;    // Base jump velocity (positive = up)
const JUMP_SPEED_BONUS = 0.008; // Extra velocity per unit of game speed (from original speed/10 scaling)
const DROP_VELOCITY = -0.042;   // Fast drop when ducking mid-air (negative = down)
const BASE_SPEED = 0.8;        // Initial game speed
const MAX_SPEED = 2.0;         // Maximum game speed
const ACCELERATION = 0.0005;   // Speed increase per frame

// Game dimensions (in oscilloscope coordinates -1 to 1)
const GROUND_Y = -0.6;         // Ground level
const DINO_X = -0.6;           // Fixed dino X position (center of dino)
const DINO_HALF_W = 0.106;     // Half-width of dino for collision
const DINO_HEIGHT = 0.228;     // Dino standing height
const DINO_DUCK_HALF_W = 0.146; // Half-width when ducking
const DINO_DUCK_HEIGHT = 0.122; // Dino ducking height

// Obstacle settings
const MIN_OBSTACLE_GAP = 0.8;  // Minimum gap between obstacles
const OBSTACLE_SPAWN_X = 1.2;  // X position where obstacles spawn

// Pixel-to-oscilloscope scale factor (uniform: 0.25 units / 47 pixels)
const PIXEL_SCALE = 0.25 / 47;

// Ground strip width in oscilloscope units (600 pixels * PIXEL_SCALE)
const GROUND_STRIP_W = GROUND_1.w * PIXEL_SCALE;

// ─── Shape transform ────────────────────────────────────────────────────────

/**
 * Transform a shape by offset and optional extra scale.
 * Handles two formats:
 *   - Pixel sprites: { w, h, paths } with integer pixel coords (Y-down)
 *   - Legacy shapes: array of segments with oscilloscope coords (Y-up)
 */
function transformShape(shape, offsetX, offsetY, scale = 1) {
    if (shape.paths) {
        // Pixel coordinate sprite: center horizontally, flip Y, scale to oscilloscope units
        const s = PIXEL_SCALE * scale;
        const hw = shape.w / 2;
        const sh = shape.h;
        return shape.paths.map(path =>
            path.map(([px, py]) => [
                offsetX + (px - hw) * s,
                offsetY + (sh - py) * s
            ])
        );
    }
    // Legacy format: oscilloscope coordinate arrays
    return shape.map(segment =>
        segment.map(([x, y]) => [
            x * scale + offsetX,
            y * scale + offsetY
        ])
    );
}

/**
 * Create the dino game instance
 */
export function createDinoGame() {
    // Game state
    let state = 'waiting'; // 'waiting', 'running', 'crashed'
    let score = 0;
    let highScore = 0;
    let speed = BASE_SPEED;

    // Dino state
    let dinoY = GROUND_Y;
    let dinoVelocityY = 0;
    let isDucking = false;
    let runFrame = 0;
    let frameCount = 0;

    // Obstacles
    let obstacles = [];

    // Clouds
    let clouds = [];

    // Ground scroll (two strips tiling horizontally)
    let groundScrollX = 0;

    // Dirty flag: set when game state changes, cleared after getPoints()
    let dirty = true;
    let cachedPoints = null;

    // Display options (toggled from debug panel)
    const display = {
        showScore: true,
        showClouds: true,
        showFloor: true,  // false = simple ground line only (no bumps)
        scale: 1.0,       // Scene scale (0.75, 1.0, 1.25)
        simplify: true    // true = simplified sprites, false = original sprites
    };

    // Helper to get current sprite set
    function S() { return display.simplify ? SPRITES.simplified : SPRITES.original; }

    // Input state
    const keys = {
        jump: false,
        duck: false,
        jumpPressed: false  // Edge-triggered: set on press, cleared after processing
    };

    // Initialize clouds
    function initClouds() {
        clouds = [];
        for (let i = 0; i < 3; i++) {
            clouds.push({
                x: Math.random() * 2 - 0.5,
                y: 0.3 + Math.random() * 0.4
            });
        }
    }

    // Spawn a new obstacle
    function spawnObstacle() {
        const lastObstacle = obstacles[obstacles.length - 1];
        const minX = lastObstacle
            ? lastObstacle.x + MIN_OBSTACLE_GAP + Math.random() * 0.5
            : OBSTACLE_SPAWN_X;

        if (minX < OBSTACLE_SPAWN_X) return;

        // Random obstacle type
        const rand = Math.random();
        let type, halfW, height, y, variant;

        if (rand < 0.4) {
            type = 'cactus_small';
            halfW = 0.040;   // from sprite bounds
            height = 0.176;
            y = GROUND_Y - 1 * PIXEL_SCALE; // 1px bottom padding in sprite
            variant = Math.floor(Math.random() * 3);
        } else if (rand < 0.75) {
            type = 'cactus_large';
            halfW = 0.061;
            height = 0.256;
            y = GROUND_Y - 3 * PIXEL_SCALE; // 3px bottom padding in sprite
            variant = Math.floor(Math.random() * 3);
        } else {
            type = 'ptero';
            halfW = 0.112;
            height = 0.159;
            // Pterodactyl at different heights
            const pteroHeights = [GROUND_Y, GROUND_Y + 0.15, GROUND_Y + 0.3];
            y = pteroHeights[Math.floor(Math.random() * pteroHeights.length)];
            variant = 0;
        }

        obstacles.push({
            type,
            x: OBSTACLE_SPAWN_X,
            y,
            halfW,
            height,
            frame: 0,
            variant
        });
    }

    // Check collision between dino and obstacle (both use centered X positions)
    function checkCollision(obstacle) {
        const dinoHalfW = isDucking ? DINO_DUCK_HALF_W : DINO_HALF_W;
        const dinoHeight = isDucking ? DINO_DUCK_HEIGHT : DINO_HEIGHT;
        const dinoLeft = DINO_X - dinoHalfW;
        const dinoRight = DINO_X + dinoHalfW;
        const dinoTop = dinoY + dinoHeight;

        const obstacleLeft = obstacle.x - obstacle.halfW;
        const obstacleRight = obstacle.x + obstacle.halfW;
        const obstacleTop = obstacle.y + obstacle.height;

        // AABB collision with small inset for forgiveness
        const inset = 0.01;
        return (
            dinoLeft + inset < obstacleRight &&
            dinoRight - inset > obstacleLeft &&
            dinoY + inset < obstacleTop &&
            dinoTop > obstacle.y + inset
        );
    }

    // Initialize
    initClouds();

    return {
        keys,

        /**
         * Set jump key state
         */
        setJump(pressed) {
            keys.jump = pressed;
            if (pressed) {
                keys.jumpPressed = true;
            }
        },

        /**
         * Set duck key state
         */
        setDuck(pressed) {
            keys.duck = pressed;
        },

        /**
         * Set display options (score, clouds, floor detail)
         */
        setDisplayOptions(options) {
            Object.assign(display, options);
            dirty = true;
        },

        /**
         * Get current game state
         */
        getState() {
            return state;
        },

        /**
         * Get current score
         */
        getScore() {
            return Math.floor(score);
        },

        /**
         * Get high score
         */
        getHighScore() {
            return Math.floor(highScore);
        },

        /**
         * Start the game
         */
        start() {
            if (state === 'waiting' || state === 'crashed') {
                state = 'running';
                score = 0;
                speed = BASE_SPEED;
                dinoY = GROUND_Y;
                dinoVelocityY = 0;
                isDucking = false;
                obstacles = [];
                groundScrollX = 0;
                dirty = true;
                // Keep existing clouds
            }
        },

        /**
         * Reset to waiting state
         */
        reset() {
            state = 'waiting';
            score = 0;
            speed = BASE_SPEED;
            dinoY = GROUND_Y;
            dinoVelocityY = 0;
            isDucking = false;
            obstacles = [];
            initClouds();
            dirty = true;
        },

        /**
         * Update game state
         */
        update(deltaTime) {
            frameCount++;

            // Check for jump input (edge-triggered or held)
            const wantsJump = keys.jump || keys.jumpPressed;

            // Handle waiting state
            if (state === 'waiting') {
                // Jump to start
                if (wantsJump) {
                    this.start();
                    dinoVelocityY = JUMP_VELOCITY + speed * JUMP_SPEED_BONUS;
                    keys.jumpPressed = false;  // Clear edge trigger
                }
                return;
            }

            // Handle crashed state
            if (state === 'crashed') {
                // Allow restart with jump
                if (wantsJump) {
                    this.start();
                    dinoVelocityY = JUMP_VELOCITY + speed * JUMP_SPEED_BONUS;
                    keys.jumpPressed = false;
                }
                return;
            }

            // Running state - scene changes every frame
            dirty = true;
            // Update score and speed
            score += deltaTime * speed * 10;
            speed = Math.min(speed + ACCELERATION * deltaTime * 60, MAX_SPEED);

            // Handle ducking
            isDucking = keys.duck && dinoY === GROUND_Y;

            // Handle jumping (use edge-triggered for more responsive controls)
            if (wantsJump && dinoY === GROUND_Y && !isDucking) {
                dinoVelocityY = JUMP_VELOCITY + speed * JUMP_SPEED_BONUS;
                keys.jumpPressed = false;  // Clear edge trigger
            }

            // Fast drop when ducking mid-air (use min to make velocity more negative)
            if (keys.duck && dinoY > GROUND_Y) {
                dinoVelocityY = Math.min(dinoVelocityY, DROP_VELOCITY);
            }

            // Apply gravity (run physics when airborne or has velocity)
            if (dinoY > GROUND_Y || dinoVelocityY !== 0) {
                dinoVelocityY += GRAVITY * deltaTime;
                dinoY += dinoVelocityY * deltaTime * 60;

                if (dinoY <= GROUND_Y) {
                    dinoY = GROUND_Y;
                    dinoVelocityY = 0;
                }
            }

            // Update run animation frame
            if (dinoY === GROUND_Y && frameCount % 6 === 0) {
                runFrame = (runFrame + 1) % 2;
            }

            // Update obstacles
            for (let i = obstacles.length - 1; i >= 0; i--) {
                obstacles[i].x -= speed * deltaTime;
                obstacles[i].frame = (obstacles[i].frame + 1) % 20;

                // Remove off-screen obstacles
                if (obstacles[i].x < -1.5) {
                    obstacles.splice(i, 1);
                    continue;
                }

                // Check collision
                if (checkCollision(obstacles[i])) {
                    state = 'crashed';
                    if (score > highScore) {
                        highScore = score;
                    }
                    return;
                }
            }

            // Spawn new obstacles
            if (obstacles.length === 0 || obstacles[obstacles.length - 1].x < 0.5) {
                if (Math.random() < 0.03) {
                    spawnObstacle();
                }
            }

            // Update clouds
            for (const cloud of clouds) {
                cloud.x -= speed * deltaTime * 0.2;
                if (cloud.x < -1.4) {
                    cloud.x = 1.4;
                    cloud.y = 0.3 + Math.random() * 0.4;
                }
            }

            // Update ground scroll
            groundScrollX += speed * deltaTime;
            if (groundScrollX >= GROUND_STRIP_W) {
                groundScrollX -= GROUND_STRIP_W;
            }
        },

        /**
         * Get all line segments for rendering
         */
        getPoints() {
            // Return cached points if nothing has changed (e.g. game over, waiting)
            if (!dirty && cachedPoints) return cachedPoints;
            dirty = false;

            const segments = [];

            const s = S();

            // Ground
            if (display.showFloor) {
                // Two tiling ground strips scrolling left
                const baseX = -groundScrollX;
                segments.push(...transformShape(s.GROUND_1, baseX, GROUND_Y));
                segments.push(...transformShape(s.GROUND_2, baseX + GROUND_STRIP_W, GROUND_Y));
            } else {
                // Simple ground line (raised 4px to match sprite ground surface)
                const groundLineY = GROUND_Y + 4 * PIXEL_SCALE;
                segments.push([[-1, groundLineY], [1, groundLineY]]);
            }

            // Clouds
            if (display.showClouds) {
                for (const cloud of clouds) {
                    if (cloud.x >= -1.2 && cloud.x <= 1.2) {
                        const transformed = transformShape(s.CLOUD, cloud.x, cloud.y, 0.7);
                        segments.push(...transformed);
                    }
                }
            }

            // Obstacles
            for (const obstacle of obstacles) {
                let shape;
                if (obstacle.type === 'cactus_small') {
                    shape = s.CACTUS_SMALL[obstacle.variant];
                } else if (obstacle.type === 'cactus_large') {
                    shape = s.CACTUS_LARGE[obstacle.variant];
                } else if (obstacle.type === 'ptero') {
                    shape = obstacle.frame < 10 ? s.PTERO_1 : s.PTERO_2;
                }
                if (shape && obstacle.x >= -1 && obstacle.x <= 1.2) {
                    const transformed = transformShape(shape, obstacle.x, obstacle.y);
                    segments.push(...transformed);
                }
            }

            // Dino
            let dinoShape;
            if (state === 'crashed') {
                dinoShape = s.TREX_CRASHED;
            } else if (dinoY > GROUND_Y) {
                dinoShape = s.TREX_STANDING;
            } else if (isDucking) {
                dinoShape = runFrame === 0 ? s.TREX_DUCK_1 : s.TREX_DUCK_2;
            } else {
                dinoShape = runFrame === 0 ? s.TREX_RUN_1 : s.TREX_RUN_2;
            }
            const dinoTransformed = transformShape(dinoShape, DINO_X, dinoY);
            segments.push(...dinoTransformed);

            // Score display in scene (top right)
            if (display.showScore) {
                const scoreText = String(Math.floor(score)).padStart(5, '0');
                const scoreSegments = renderScore(scoreText, 0.5, 0.85, 0.08);
                segments.push(...scoreSegments);

                // High score in scene
                if (highScore > 0) {
                    const hiScoreText = String(Math.floor(highScore)).padStart(5, '0');
                    const hiSegments = renderScore('HI ' + hiScoreText, -0.1, 0.85, 0.08);
                    segments.push(...hiSegments);
                }
            }

            // Game over text
            if (state === 'crashed') {
                const gameOverSegments = renderGameOver(s);
                segments.push(...gameOverSegments);
            }

            // Apply scene scale
            let output = segments;
            if (display.scale !== 1.0) {
                const s = display.scale;
                output = output.map(seg =>
                    seg.map(([x, y]) => [x * s, y * s])
                );
            }

            cachedPoints = output;
            return output;
        }
    };
}

/**
 * Simple 7-segment style digits for score
 */
const DIGIT_SEGMENTS = {
    '0': [[[0, 0], [0.6, 0], [0.6, 1], [0, 1], [0, 0]], [[0, 0.5], [0.6, 0.5]]],
    '1': [[[0.3, 0], [0.3, 1]]],
    '2': [[[0, 1], [0.6, 1], [0.6, 0.5], [0, 0.5], [0, 0], [0.6, 0]]],
    '3': [[[0, 1], [0.6, 1], [0.6, 0], [0, 0]], [[0, 0.5], [0.6, 0.5]]],
    '4': [[[0, 1], [0, 0.5], [0.6, 0.5]], [[0.6, 1], [0.6, 0]]],
    '5': [[[0.6, 1], [0, 1], [0, 0.5], [0.6, 0.5], [0.6, 0], [0, 0]]],
    '6': [[[0.6, 1], [0, 1], [0, 0], [0.6, 0], [0.6, 0.5], [0, 0.5]]],
    '7': [[[0, 1], [0.6, 1], [0.6, 0]]],
    '8': [[[0, 0], [0.6, 0], [0.6, 1], [0, 1], [0, 0]], [[0, 0.5], [0.6, 0.5]]],
    '9': [[[0.6, 0], [0.6, 1], [0, 1], [0, 0.5], [0.6, 0.5]]],
    'H': [[[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.5], [0.6, 0.5]]],
    'I': [[[0.3, 0], [0.3, 1]]],
    ' ': []
};

function renderScore(text, startX, startY, size) {
    const segments = [];
    let x = startX;

    for (const char of text) {
        const digitSegments = DIGIT_SEGMENTS[char] || [];
        for (const segment of digitSegments) {
            const transformed = segment.map(([px, py]) => [
                x + px * size,
                startY + py * size
            ]);
            segments.push(transformed);
        }
        x += size * 0.9;
    }

    return segments;
}

function renderGameOver(spriteSet) {
    const segments = [];
    // "GAME OVER" text sprite, centered horizontally
    segments.push(...transformShape(spriteSet.TEXT_GAME_OVER, 0, 0.3));
    // Restart icon below the text
    segments.push(...transformShape(spriteSet.RESTART, 0, 0.0));
    return segments;
}

