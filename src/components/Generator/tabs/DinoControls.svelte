<script>
    import { onMount, onDestroy } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import Card from '../../Common/Card.svelte';
    import { createDinoGame } from '../../../utils/dino/dinoGenerator.js';

    let { audioEngine, frameProcessor, isActive = false, dinoShowDebug = false, sceneScale = $bindable(1.25), simplifySprites = $bindable(true) } = $props();

    // Track state for use in event handlers (initialized with current prop value)
    const handlerState = {
        active: isActive,
        game: null
    };

    // Keep handlerState.active in sync with isActive prop and focus container
    $effect(() => {
        handlerState.active = isActive;
        // Focus container when tab becomes active for keyboard input
        if (isActive && containerRef) {
            containerRef.focus();
        }
    });

    // Game state
    let game = $state(null);

    // Preview
    let previewPoints = $state([]);
    let animationInterval = null;

    // Container ref for focus management
    let containerRef = $state(null);

    // Key press state for button visual feedback
    let keyPressed = $state({ jump: false, duck: false });

    // Display options (toggled from debug panel)
    let showScore = $state(false);
    let showClouds = $state(false);
    let showFloor = $state(false);

    // Push display options to game when they change
    $effect(() => {
        if (game) {
            game.setDisplayOptions({ showScore, showClouds, showFloor, simplify: simplifySprites, scale: sceneScale });
        }
    });

    // Listen for processed preview updates (e.g. settings changes that re-process cached frame)
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    previewPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // Initialize game on mount
    onMount(() => {
        game = createDinoGame();
        handlerState.game = game;

        // Get initial points
        previewPoints = game.getPoints();

        // Setup keyboard controls
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

    });

    onDestroy(() => {
        stopAnimation();
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    });

    // Handle keyboard input
    function handleKeyDown(e) {
        // Check if game exists; for window events also check if tab is active
        const isWindowEvent = e.currentTarget === window;
        if (!handlerState.game) return;
        if (isWindowEvent && !handlerState.active) return;

        switch (e.key) {
            case 'ArrowUp':
            case ' ':
            case 'w':
            case 'W':
                handlerState.game.setJump(true);
                keyPressed.jump = true;
                // Immediately process the jump to start game without waiting for next update tick
                handlerState.game.update(0);
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                handlerState.game.setDuck(true);
                keyPressed.duck = true;
                e.preventDefault();
                break;
        }
    }

    function handleKeyUp(e) {
        if (!handlerState.game) return;

        switch (e.key) {
            case 'ArrowUp':
            case ' ':
            case 'w':
            case 'W':
                handlerState.game.setJump(false);
                keyPressed.jump = false;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                handlerState.game.setDuck(false);
                keyPressed.duck = false;
                break;
        }
    }

    // Start/stop animation when tab becomes active
    $effect(() => {
        if (isActive && game) {
            startAnimation();
        } else {
            stopAnimation();
        }
    });

    function startAnimation() {
        if (animationInterval) return;

        let lastTime = performance.now();
        let lastSentPoints = null;

        function animationLoop() {
            if (!game) {
                stopAnimation();
                return;
            }

            const now = performance.now();
            const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 100ms to avoid large jumps
            lastTime = now;

            // Update game
            game.update(deltaTime);

            // Get rendered points (returns cached result when nothing changed)
            const points = game.getPoints();

            if (points.length > 0) {
                // Only send to frame processor if points actually changed
                if (points !== lastSentPoints) {
                    frameProcessor.processFrame(points);
                    lastSentPoints = points;

                    // Share points with preview (use processed output when available)
                    previewPoints = frameProcessor.processedPreview ?? points;
                }
            }

            animationInterval = requestAnimationFrame(animationLoop);
        }

        animationInterval = requestAnimationFrame(animationLoop);
    }

    function stopAnimation() {
        if (animationInterval) {
            cancelAnimationFrame(animationInterval);
            animationInterval = null;
        }
    }

    // Touch/mouse handlers for buttons
    function startJump() {
        if (handlerState.game) {
            handlerState.game.setJump(true);
            keyPressed.jump = true;
            // Immediately process the jump to start game without waiting for next update tick
            handlerState.game.update(0);
        }
    }

    function endJump() {
        if (handlerState.game) {
            handlerState.game.setJump(false);
            keyPressed.jump = false;
        }
    }

    function startDuck() {
        if (handlerState.game) {
            handlerState.game.setDuck(true);
            keyPressed.duck = true;
        }
    }

    function endDuck() {
        if (handlerState.game) {
            handlerState.game.setDuck(false);
            keyPressed.duck = false;
        }
    }
</script>

<div
    class="dino-container"
    bind:this={containerRef}
    tabindex="0"
    onkeydown={handleKeyDown}
    onkeyup={handleKeyUp}
>
    <div class="header">
        <Preview points={previewPoints} width={400} height={300} />
    </div>

    <div class="controls">
        <div>
            <button
                class="control-button jump"
                class:pressed={keyPressed.jump}
                tabindex="-1"
                onmousedown={startJump}
                onmouseup={endJump}
                onmouseleave={endJump}
                ontouchstart={startJump}
                ontouchend={endJump}
            >
                <span class="arrow">SPACE</span>
            </button>
            <span class="label">JUMP</span>
        </div>
        <div>
            <button
                class="control-button duck"
                class:pressed={keyPressed.duck}
                tabindex="-1"
                onmousedown={startDuck}
                onmouseup={endDuck}
                onmouseleave={endDuck}
                ontouchstart={startDuck}
                ontouchend={endDuck}
            >
                <span class="arrow">▼</span>
            </button>
            <span class="label">DUCK</span>
        </div>
    </div>

    {#if dinoShowDebug}
    <Card title="Debug">
        <div class="settings-grid">
            <label class="checkbox-row">
                <input type="checkbox" bind:checked={showScore} />
                <span>Show score</span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" bind:checked={showClouds} />
                <span>Show clouds</span>
            </label>
            <label class="checkbox-row">
                <input type="checkbox" bind:checked={showFloor} />
                <span>Show floor detail</span>
                <span class="hint">When off, draws a simple line</span>
            </label>
        </div>
    </Card>
    {/if}
</div>

<style>
    .dino-container {
        padding: 24px 40px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: center;
        outline: none;  /* Remove focus outline, we handle keyboard input */
    }

    .header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    .controls {
        display: flex;
        gap: 20px;
        margin: 20px 0;
    }

    .controls > div {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
    }

    .controls .label {
        font-size: 11px;
        font-weight: 600;
        color: #888;
        margin-top: 4px;
    }


    .control-button {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 6px;
        background: #f0f0f0;
        border: none;
        cursor: pointer;
        transition: all 0.1s;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        box-shadow: inset 0 -4px 0 0 #bbb;
    }

    .control-button.jump {
        width: 160px;
    }

    .control-button:active,
    .control-button.pressed {
        transform: translateY(3px);
        box-shadow: inset 0 -1px 0 0 #ccc;
    }

    .control-button .arrow {
        font-size: 20px;
        color: #888;
    }
    .control-button.jump .arrow {
        font-size: 16px;
        letter-spacing: 0.4em;
        text-indent: 0.4em
    }

    .control-button:focus {
        outline: none;
    }

    .settings-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .checkbox-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding-top: 4px;
    }

    .checkbox-row input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
    }

    .checkbox-row span:first-of-type {
        font-size: 13px;
        color: #333;
    }

    .checkbox-row .hint {
        font-size: 11px;
        color: #888;
        text-align: right;
    }

</style>
