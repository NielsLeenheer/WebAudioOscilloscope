<script>
    import { onMount } from 'svelte';

    let {
        points = [],
        width = 150,
        height = 150,
        strokeColor = 'rgba(60, 60, 60, 0.7)',
        lineWidth = 1.5,
        marginLeft = 40,
        marginBottom = 40,
        ...restProps
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
        if (!canvas || !ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!points || points.length === 0) return;

        // Calculate padding and available space
        const padding = 10;
        const availableWidth = canvas.width - marginLeft - padding;
        const availableHeight = canvas.height - padding - marginBottom;
        const scale = Math.min(availableWidth, availableHeight) / 2;  // Divide by 2 because normalized is -1 to 1

        const centerX = marginLeft + availableWidth / 2;
        const centerY = padding + availableHeight / 2;

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

            // Draw beam travel line to the next segment (if any)
            // Opacity varies by distance: short jumps are more visible, long jumps fade out
            if (segmentIndex < segments.length - 1 && segments[segmentIndex + 1].length > 0) {
                const lastPoint = segment[segment.length - 1];
                const nextFirstPoint = segments[segmentIndex + 1][0];
                const dx = nextFirstPoint[0] - lastPoint[0];
                const dy = nextFirstPoint[1] - lastPoint[1];
                const dist = Math.sqrt(dx * dx + dy * dy);
                const opacity = 0.25 / (1 + dist * 3);

                ctx.strokeStyle = `rgba(60, 60, 60, ${opacity.toFixed(3)})`;
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
    {...restProps}
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
