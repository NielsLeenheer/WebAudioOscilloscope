<script>
    import { onMount, onDestroy } from 'svelte';
    import paper from 'paper';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);
    let currentPath = null;
    let backgroundRaster = null;
    let tool = null;
    let mode = $state('draw'); // 'draw' or 'edit'

    onMount(() => {
        // Setup paper.js
        paper.setup(canvas);

        // Create tool
        tool = new paper.Tool();
        let currentSegment = null;
        let isDragging = false;
        let hitItem = null;
        let hitType = null;

        tool.onMouseDown = (event) => {
            if (mode === 'draw') {
                // Draw mode: add new points
                if (!currentPath) {
                    // Start new path
                    currentPath = new paper.Path();
                    currentPath.strokeColor = '#1976d2';
                    currentPath.strokeWidth = 2;
                    currentPath.fullySelected = false;
                }

                // Add point
                const segment = currentPath.add(event.point);
                currentSegment = segment;
                isDragging = false;
            } else {
                // Edit mode: select and prepare to drag
                if (!currentPath) return;

                const hitResult = currentPath.hitTest(event.point, {
                    segments: true,
                    handles: true,
                    tolerance: 8
                });

                if (hitResult) {
                    hitType = hitResult.type;
                    if (hitResult.type === 'segment') {
                        hitItem = hitResult.segment;
                    } else if (hitResult.type === 'handle-in') {
                        hitItem = hitResult.segment;
                    } else if (hitResult.type === 'handle-out') {
                        hitItem = hitResult.segment;
                    }
                }
            }
        };

        tool.onMouseDrag = (event) => {
            if (mode === 'draw' && currentSegment) {
                isDragging = true;
                // Create bezier handles by dragging
                const delta = event.point.subtract(currentSegment.point);
                currentSegment.handleOut = delta.divide(3);
                currentSegment.handleIn = delta.divide(-3);
            } else if (mode === 'edit' && hitItem) {
                // Edit mode: drag segments or handles
                if (hitType === 'segment') {
                    hitItem.point = hitItem.point.add(event.delta);
                } else if (hitType === 'handle-in') {
                    hitItem.handleIn = hitItem.handleIn.add(event.delta);
                } else if (hitType === 'handle-out') {
                    hitItem.handleOut = hitItem.handleOut.add(event.delta);
                }
            }
        };

        tool.onMouseUp = (event) => {
            if (mode === 'draw') {
                if (!isDragging && currentSegment) {
                    // If not dragging, create a straight line (no handles)
                    currentSegment.handleIn = null;
                    currentSegment.handleOut = null;
                }
                currentSegment = null;
            } else {
                // Edit mode: clear drag state
                hitItem = null;
                hitType = null;
            }
        };

        // Activate the tool
        tool.activate();

        // Draw initial view
        paper.view.draw();
    });

    onDestroy(() => {
        if (tool) {
            tool.remove();
        }
        if (paper.project) {
            paper.project.clear();
        }
    });

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    backgroundImage = img;
                    updateBackgroundImage();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    function updateBackgroundImage() {
        if (!paper.project) return;

        // Remove old background
        if (backgroundRaster) {
            backgroundRaster.remove();
            backgroundRaster = null;
        }

        if (backgroundImage) {
            // Create raster from image
            backgroundRaster = new paper.Raster(backgroundImage);

            // Scale to fit canvas
            const scale = Math.min(
                paper.view.size.width / backgroundRaster.width,
                paper.view.size.height / backgroundRaster.height
            );
            backgroundRaster.scale(scale);

            // Center the image
            backgroundRaster.position = paper.view.center;

            // Set opacity
            backgroundRaster.opacity = backgroundOpacity / 100;

            // Send to back
            backgroundRaster.sendToBack();
        }

        paper.view.draw();
    }

    function updateOpacity(value) {
        backgroundOpacity = value;
        if (backgroundRaster) {
            backgroundRaster.opacity = backgroundOpacity / 100;
            paper.view.draw();
        }
    }

    function toggleMode() {
        if (mode === 'draw') {
            mode = 'edit';
            // Show handles and selection in edit mode
            if (currentPath) {
                currentPath.fullySelected = true;
                paper.view.draw();
            }
        } else {
            mode = 'draw';
            // Hide handles in draw mode
            if (currentPath) {
                currentPath.fullySelected = false;
                paper.view.draw();
            }
        }
    }

    function clearCanvas() {
        if (currentPath) {
            currentPath.remove();
            currentPath = null;
        }
        paper.view.draw();
    }

    function closePath() {
        if (currentPath && currentPath.segments.length > 0) {
            currentPath.closePath();
            paper.view.draw();
        }
    }

    function simplifyPath() {
        if (currentPath) {
            currentPath.simplify(10);
            paper.view.draw();
        }
    }

    function drawToScope() {
        if (!isPlaying) return;
        if (!currentPath || currentPath.segments.length < 2) {
            alert('Please draw a path with at least 2 points');
            return;
        }

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        // Sample points along the path
        const numSamples = 200;
        const points = [];

        for (let i = 0; i <= numSamples; i++) {
            const offset = (i / numSamples) * currentPath.length;
            const point = currentPath.getPointAt(offset);
            if (point) {
                points.push(point);
            }
        }

        // Get bounding box for normalization
        const bounds = currentPath.bounds;
        const centerX = bounds.center.x;
        const centerY = bounds.center.y;
        const scale = Math.max(bounds.width, bounds.height) / 2;

        // Convert to normalized coordinates [-1, 1]
        const normalizedPoints = points.map(point => [
            (point.x - centerX) / scale,
            -(point.y - centerY) / scale  // Flip Y axis for oscilloscope
        ]);

        audioEngine.createWaveform(normalizedPoints);
    }

    function exportSVG() {
        if (!currentPath) {
            alert('No path to export');
            return;
        }

        const svg = paper.project.exportSVG({ asString: true });
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'path.svg';
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="control-group">
    <label>Draw Your Own Path:</label>
    <p style="color: #666; font-size: 14px; margin: 10px 0;">
        {#if mode === 'draw'}
            Click to add points. Drag while adding to create curved segments. Drag an image to trace over it.
        {:else}
            Click and drag points to move them. Click and drag handles to adjust curves.
        {/if}
    </p>

    <div style="margin-bottom: 10px;">
        <button onclick={toggleMode} style="background: {mode === 'edit' ? '#4caf50' : '#ff9800'}; color: white; padding: 8px 16px; font-weight: bold;">
            {mode === 'draw' ? '✏️ Draw Mode' : '🔧 Edit Mode'}
        </button>
    </div>

    <div style="text-align: center; margin: 20px 0;">
        <canvas
            bind:this={canvas}
            width="600"
            height="600"
            style="border: 2px solid #1976d2; background: #fff; cursor: {mode === 'draw' ? 'crosshair' : 'default'}; max-width: 100%; border-radius: 6px;"
            ondragover={handleDragOver}
            ondrop={handleDrop}
        ></canvas>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-top: 15px;">
        <button onclick={() => closePath()}>⭘ Close Path</button>
        <button onclick={() => simplifyPath()}>⌇ Simplify</button>
        <button onclick={() => clearCanvas()}>✕ Clear</button>
        <button onclick={() => exportSVG()}>⬇ Export SVG</button>
        <button onclick={() => drawToScope()} style="background: #bbdefb; color: #1976d2; grid-column: span 2;">▶ Draw on Scope</button>
    </div>

    <div class="value-display" style="margin-top: 15px;">
        <strong>Instructions:</strong><br>
        {#if mode === 'draw'}
            • Click to add points (straight segments)<br>
            • Click and drag to create curved segments<br>
            • Drag and drop an image to trace over it<br>
            • Use Simplify to smooth the path<br>
            • Switch to Edit Mode to adjust points
        {:else}
            • Click and drag points to reposition them<br>
            • Click and drag bezier handles to adjust curves<br>
            • Handles appear as small circles on selected segments<br>
            • Switch to Draw Mode to add more points
        {/if}
    </div>

    <div style="margin-top: 15px;">
        <label for="backgroundOpacity">Background Image Opacity: <span>{backgroundOpacity}</span>%</label>
        <input
            type="range"
            id="backgroundOpacity"
            min="0"
            max="100"
            value={backgroundOpacity}
            step="5"
            oninput={(e) => updateOpacity(e.target.value)}
        >
    </div>
</div>
