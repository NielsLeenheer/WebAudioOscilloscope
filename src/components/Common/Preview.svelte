<script>
    import { onMount } from 'svelte';

    let {
        points = [],
        width = 150,
        height = 150,
        strokeColor = 'rgba(60, 60, 60, 0.7)',
        jumpColor = 'rgba(60, 60, 60, 0.1)',
        lineWidth = 1.5,
        jumpThreshold = 0.3  // In normalized coordinates
    } = $props();

    let canvas;
    let ctx;

    onMount(() => {
        if (canvas) {
            ctx = canvas.getContext('2d');
        }
    });

    // Draw the preview when points change
    $effect(() => {
        if (!canvas || !ctx || !points || points.length === 0) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate padding and available space
        const padding = 10;
        const availableWidth = canvas.width - padding * 2;
        const availableHeight = canvas.height - padding * 2;
        const scale = Math.min(availableWidth, availableHeight) / 2;  // Divide by 2 because normalized is -1 to 1

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        // Draw points as a path
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        let firstPoint = true;
        let prevX = 0;
        let prevY = 0;

        for (let i = 0; i < points.length; i++) {
            const [normX, normY] = points[i];

            // Convert normalized coordinates (-1 to 1) to canvas coordinates
            const canvasX = centerX + normX * scale;
            const canvasY = centerY - normY * scale;  // Flip Y for canvas

            if (firstPoint) {
                ctx.moveTo(canvasX, canvasY);
                firstPoint = false;
            } else {
                // Calculate distance in normalized space
                const dx = normX - prevX;
                const dy = normY - prevY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // If it's a large jump, draw with lower opacity
                if (distance > jumpThreshold) {
                    ctx.stroke(); // Finish current path
                    ctx.strokeStyle = jumpColor;
                    ctx.beginPath();
                    ctx.moveTo(centerX + prevX * scale, centerY - prevY * scale);
                    ctx.lineTo(canvasX, canvasY);
                    ctx.stroke();
                    ctx.strokeStyle = strokeColor;
                    ctx.beginPath();
                    ctx.moveTo(canvasX, canvasY);
                } else {
                    ctx.lineTo(canvasX, canvasY);
                }
            }

            prevX = normX;
            prevY = normY;
        }

        ctx.stroke();
    });
</script>

<canvas
    bind:this={canvas}
    width={width}
    height={height}
    class="preview-canvas"
></canvas>

<style>
    .preview-canvas {
        display: block;
    }
</style>
