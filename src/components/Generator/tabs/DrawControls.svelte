<script>
    import { onMount } from 'svelte';

    let { audioEngine, isPlaying } = $props();

    let canvas;
    let ctx;
    let drawPoints = $state([]);
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);

    onMount(() => {
        ctx = canvas.getContext('2d');
        redrawCanvas();
    });

    function handleCanvasClick(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Convert to canvas coordinates (accounting for any scaling)
        const canvasX = (x / rect.width) * canvas.width;
        const canvasY = (y / rect.height) * canvas.height;

        drawPoints = [...drawPoints, { x: canvasX, y: canvasY }];
        redrawCanvas();
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        canvas.style.borderColor = '#1976d2';
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        canvas.style.borderColor = '#1976d2';
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        canvas.style.borderColor = '#1976d2';

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    backgroundImage = img;
                    redrawCanvas();
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    function redrawCanvas() {
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background image if present
        if (backgroundImage) {
            ctx.globalAlpha = backgroundOpacity / 100;

            // Scale image to fit canvas while maintaining aspect ratio
            const scale = Math.min(
                canvas.width / backgroundImage.width,
                canvas.height / backgroundImage.height
            );
            const x = (canvas.width - backgroundImage.width * scale) / 2;
            const y = (canvas.height - backgroundImage.height * scale) / 2;

            ctx.drawImage(
                backgroundImage,
                x, y,
                backgroundImage.width * scale,
                backgroundImage.height * scale
            );

            ctx.globalAlpha = 1.0;
        }

        // Draw points and lines
        if (drawPoints.length > 0) {
            ctx.strokeStyle = '#1976d2';
            ctx.fillStyle = '#1976d2';
            ctx.lineWidth = 2;

            // Draw lines between points
            ctx.beginPath();
            ctx.moveTo(drawPoints[0].x, drawPoints[0].y);
            for (let i = 1; i < drawPoints.length; i++) {
                ctx.lineTo(drawPoints[i].x, drawPoints[i].y);
            }
            ctx.stroke();

            // Draw points as circles
            drawPoints.forEach((point, index) => {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                ctx.fill();

                // Draw point number
                ctx.fillStyle = '#333';
                ctx.font = '12px monospace';
                ctx.fillText(index + 1, point.x + 8, point.y - 8);
                ctx.fillStyle = '#1976d2';
            });
        }
    }

    function undoPoint() {
        drawPoints = drawPoints.slice(0, -1);
        redrawCanvas();
    }

    function clearCanvas() {
        drawPoints = [];
        redrawCanvas();
    }

    function drawCustomPath() {
        if (!isPlaying) return;
        if (drawPoints.length < 2) {
            alert('Please add at least 2 points to create a path');
            return;
        }

        // Restore Settings tab default frequency
        audioEngine.restoreDefaultFrequency();

        // Convert canvas coordinates to normalized coordinates [-1, 1]
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = Math.max(canvas.width, canvas.height) / 2;

        const normalizedPoints = drawPoints.map(point => [
            (point.x - centerX) / scale,
            -(point.y - centerY) / scale  // Flip Y axis
        ]);

        audioEngine.createWaveform(normalizedPoints);
    }

    function updateOpacity(value) {
        backgroundOpacity = value;
        redrawCanvas();
    }
</script>

<div class="control-group">
    <label>Draw Your Own Path:</label>
    <p style="color: #666; font-size: 14px; margin: 10px 0;">
        Click on the canvas to add points and create your custom shape. Drag and drop an image to trace over it.
    </p>

    <div style="text-align: center; margin: 20px 0;">
        <canvas
            bind:this={canvas}
            width="600"
            height="600"
            style="border: 2px solid #1976d2; background: #fff; cursor: crosshair; max-width: 100%; border-radius: 6px;"
            onclick={handleCanvasClick}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
        ></canvas>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 15px;">
        <button onclick={() => undoPoint()}>↶ Undo Last Point</button>
        <button onclick={() => clearCanvas()}>✕ Clear Canvas</button>
        <button onclick={() => drawCustomPath()} style="background: #bbdefb; color: #1976d2;">▶ Draw on Scope</button>
    </div>

    <div class="value-display" style="margin-top: 15px;">
        <strong>Instructions:</strong><br>
        • Click to add points and create your path<br>
        • Drag and drop an image onto the canvas to trace<br>
        • Use Undo to remove the last point<br>
        • Click "Draw on Scope" when ready
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
