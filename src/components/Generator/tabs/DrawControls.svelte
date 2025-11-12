<script>
    import { onMount, onDestroy } from 'svelte';
    import paper from 'paper';
    import Button from '../../Common/Button.svelte';
    import EraseIcon from '../../../assets/icons/erase.svg?raw';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);
    let currentPath = null;
    let backgroundRaster = null;
    let tool = null;
    let cursorStyle = $state('crosshair');
    let pathVersion = $state(0); // Track path changes for auto-update

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
                        pathVersion++; // Trigger scope update
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
                pathVersion++; // Update scope after editing
            } else {
                // Finished adding new point
                if (!isDragging && currentSegment) {
                    // If not dragging, create a straight line (no handles)
                    currentSegment.handleIn = null;
                    currentSegment.handleOut = null;
                }
                currentSegment = null;
                pathVersion++; // Update scope after adding point
            }
            paper.view.draw();
        };

        // Activate the tool
        tool.activate();

        // Draw initial view
        paper.view.draw();
    });

    // Auto-update scope whenever path changes
    $effect(() => {
        pathVersion; // Track dependency
        if (isPlaying && currentPath && currentPath.segments.length >= 2) {
            updateScope();
        }
    });

    function updateScope() {
        if (!currentPath || currentPath.segments.length < 2) return;

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

        // Clear the oscilloscope output
        audioEngine.restoreDefaultFrequency();
        audioEngine.createWaveform([]);
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
    <div style="display: flex; justify-content: center; margin: 15px 0;">
        <Button variant="secondary" onclick={clearCanvas}>
            {@html EraseIcon}
            Clear
        </Button>
    </div>

    <div style="display: flex; justify-content: center; margin: 20px 0;">
        <canvas
            bind:this={canvas}
            width="600"
            height="600"
            style="background: #fff; cursor: {cursorStyle}; width: 600px; height: 600px;"
            ondragover={handleDragOver}
            ondrop={handleDrop}
        ></canvas>
    </div>

    {#if backgroundImage}
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
    {/if}
</div>

<style>

    .control-group {
        background: none;
        margin-top: 0px;
        padding: 10px;
    }

</style>