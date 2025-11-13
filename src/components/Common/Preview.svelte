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

        // Detect if input is segments (array of arrays) or flat points
        const isSegmented = points.length > 0 &&
                           Array.isArray(points[0]) &&
                           Array.isArray(points[0][0]);

        const segments = isSegmented ? points : [points];

        // Draw each segment
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;

        segments.forEach((segment, segmentIndex) => {
            if (segment.length === 0) return;

            ctx.beginPath();

            for (let i = 0; i < segment.length; i++) {
                const [normX, normY] = segment[i];

                // Convert normalized coordinates (-1 to 1) to canvas coordinates
                const canvasX = centerX + normX * scale;
                const canvasY = centerY - normY * scale;  // Flip Y for canvas

                if (i === 0) {
                    ctx.moveTo(canvasX, canvasY);
                } else {
                    ctx.lineTo(canvasX, canvasY);
                }
            }

            ctx.stroke();

            // Draw a faint line to the next segment (if any) to show the jump
            if (segmentIndex < segments.length - 1 && segments[segmentIndex + 1].length > 0) {
                const lastPoint = segment[segment.length - 1];
                const nextFirstPoint = segments[segmentIndex + 1][0];

                ctx.strokeStyle = jumpColor;
                ctx.beginPath();
                ctx.moveTo(centerX + lastPoint[0] * scale, centerY - lastPoint[1] * scale);
                ctx.lineTo(centerX + nextFirstPoint[0] * scale, centerY - nextFirstPoint[1] * scale);
                ctx.stroke();
                ctx.strokeStyle = strokeColor;
            }
        });
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
