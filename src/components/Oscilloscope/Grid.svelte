<script>
    import { onMount } from 'svelte';

    let {
        canvasWidth = 600,
        canvasHeight = 600,
        visibleWidth = 400,
        visibleHeight = 400,
        divisions = 10,
        gridColor = 'rgba(0, 0, 0, 0.5)',
        gridLineWidth = 1,
        tickColor = 'rgba(0, 0, 0, 0.7)',
        tickLineWidth = 1,
        ticksPerDivision = 5,
        tickLength = 4
    } = $props();

    let canvas;

    function drawGrid() {
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const overscan = (canvasWidth - visibleWidth) / 2;

        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Grid style
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = gridLineWidth;

        // Calculate division size
        const divSize = visibleWidth / divisions;

        // Draw vertical lines
        for (let i = 0; i <= divisions; i++) {
            const x = overscan + i * divSize;
            ctx.beginPath();
            ctx.moveTo(x, overscan);
            ctx.lineTo(x, overscan + visibleHeight);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let i = 0; i <= divisions; i++) {
            const y = overscan + i * divSize;
            ctx.beginPath();
            ctx.moveTo(overscan, y);
            ctx.lineTo(overscan + visibleWidth, y);
            ctx.stroke();
        }

        // Draw tick marks on center lines
        const centerX = overscan + visibleWidth / 2;
        const centerY = overscan + visibleHeight / 2;

        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickLineWidth;

        // Horizontal center line ticks (Y = center)
        for (let i = 0; i <= divisions * ticksPerDivision; i++) {
            const x = overscan + (i / ticksPerDivision) * divSize;
            // Skip if this is a major grid line
            if (i % ticksPerDivision !== 0) {
                ctx.beginPath();
                ctx.moveTo(x, centerY - tickLength);
                ctx.lineTo(x, centerY + tickLength);
                ctx.stroke();
            }
        }

        // Vertical center line ticks (X = center)
        for (let i = 0; i <= divisions * ticksPerDivision; i++) {
            const y = overscan + (i / ticksPerDivision) * divSize;
            // Skip if this is a major grid line
            if (i % ticksPerDivision !== 0) {
                ctx.beginPath();
                ctx.moveTo(centerX - tickLength, y);
                ctx.lineTo(centerX + tickLength, y);
                ctx.stroke();
            }
        }
    }

    onMount(() => {
        drawGrid();
    });

    // Expose redraw method for external use
    export function redraw() {
        drawGrid();
    }
</script>

<canvas
    bind:this={canvas}
    width={canvasWidth}
    height={canvasHeight}
    class="grid-canvas"
></canvas>

<style>
    .grid-canvas {
        position: absolute;
        top: -100px;
        left: -100px;
        display: block;
        background: transparent;
        pointer-events: none;
        border-radius: 8px;
    }
</style>
