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
    let cursorStyle = $state('crosshair');

    onMount(() => {
        // Setup paper.js with explicit sizing to prevent canvas resize
        paper.setup(canvas);

        // Lock the view size and disable auto-resize
        paper.view.autoUpdate = false;
        paper.view.viewSize = new paper.Size(600, 600);

        // Configure selection appearance with black color for handles
        paper.settings.handleSize = 8;
        paper.settings.hitTolerance = 8;

        // Create tool
        tool = new paper.Tool();
        let currentSegment = null;
        let activeSegment = null;
        let isDragging = false;
        let hitItem = null;
        let hitType = null;
        let isEditingExisting = false;

        function setActiveSegment(segment) {
            // Deselect all segments first
            if (currentPath) {
                currentPath.fullySelected = false;
                for (let seg of currentPath.segments) {
                    seg.selected = false;
                }
            }

            // Select only the active segment
            activeSegment = segment;
            if (activeSegment) {
                activeSegment.selected = true;
            }
            paper.view.draw();
        }

        tool.onMouseMove = (event) => {
            // Check if hovering over segment or handle
            if (currentPath) {
                const hitResult = currentPath.hitTest(event.point, {
                    segments: true,
                    handles: true,
                    tolerance: 8
                });

                if (hitResult) {
                    cursorStyle = 'pointer';
                } else {
                    // Only show crosshair if path is not closed
                    cursorStyle = currentPath.closed ? 'default' : 'crosshair';
                }
            }
        };

        tool.onMouseDown = (event) => {
            // First check if we're clicking on an existing segment or handle
            if (currentPath) {
                const hitResult = currentPath.hitTest(event.point, {
                    segments: true,
                    handles: true,
                    tolerance: 8
                });

                if (hitResult) {
                    // Check if clicking on first segment to close path
                    if (hitResult.type === 'segment' && hitResult.segment.index === 0 && currentPath.segments.length > 2 && !currentPath.closed) {
                        currentPath.closePath();
                        paper.view.draw();
                        return;
                    }

                    // If clicking on a segment point, make it active
                    if (hitResult.type === 'segment') {
                        setActiveSegment(hitResult.segment);
                        hitItem = hitResult.segment;
                        hitType = 'segment';
                        isEditingExisting = true;
                        return;
                    }

                    // Editing existing geometry (handles)
                    isEditingExisting = true;
                    hitType = hitResult.type;
                    if (hitResult.type === 'handle-in') {
                        hitItem = hitResult.segment;
                    } else if (hitResult.type === 'handle-out') {
                        hitItem = hitResult.segment;
                    }
                    return;
                }
            }

            // Don't add new points if path is closed
            if (currentPath && currentPath.closed) {
                return;
            }

            // Not clicking on existing geometry, so add new point
            isEditingExisting = false;
            if (!currentPath) {
                // Start new path
                currentPath = new paper.Path();
                currentPath.strokeColor = '#1976d2';
                currentPath.strokeWidth = 2;
                currentPath.selectedColor = 'black';
            }

            // Add new point
            const segment = currentPath.add(event.point);
            currentSegment = segment;
            setActiveSegment(segment);
            isDragging = false;
        };

        tool.onMouseDrag = (event) => {
            if (isEditingExisting && hitItem) {
                // Dragging existing segments or handles
                if (hitType === 'segment') {
                    hitItem.point = hitItem.point.add(event.delta);
                } else if (hitType === 'handle-in') {
                    hitItem.handleIn = hitItem.handleIn.add(event.delta);
                } else if (hitType === 'handle-out') {
                    hitItem.handleOut = hitItem.handleOut.add(event.delta);
                }
                paper.view.draw();
            } else if (currentSegment) {
                // Creating bezier handles for new point
                isDragging = true;
                const delta = event.point.subtract(currentSegment.point);
                currentSegment.handleOut = delta.divide(3);
                currentSegment.handleIn = delta.divide(-3);
                paper.view.draw();
            }
        };

        tool.onMouseUp = (event) => {
            if (isEditingExisting) {
                // Clear edit state
                hitItem = null;
                hitType = null;
                isEditingExisting = false;
            } else {
                // Finished adding new point
                if (!isDragging && currentSegment) {
                    // If not dragging, create a straight line (no handles)
                    currentSegment.handleIn = null;
                    currentSegment.handleOut = null;
                }
                currentSegment = null;
            }
            paper.view.draw();
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
        Click to add points, drag while adding to create curves. Click any point to make it active and edit its handles.
    </p>

    <div style="text-align: center; margin: 20px 0;">
        <canvas
            bind:this={canvas}
            width="600"
            height="600"
            style="border: 2px solid #1976d2; background: #fff; cursor: {cursorStyle}; max-width: 100%; border-radius: 6px; width: 600px; height: 600px;"
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
        • Click empty space to add points (straight segments)<br>
        • Click and drag while adding to create curved segments<br>
        • Click the first point to close the path (no more points can be added)<br>
        • Click any point to make it active (only active point shows handles)<br>
        • Click and drag the active point to reposition it<br>
        • Click and drag bezier handles (circles) to adjust curves<br>
        • Drag and drop an image to trace over it<br>
        • Use Simplify to smooth the path
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
