<script>
    import { get } from 'svelte/store';
    import Card from '../../Common/Card.svelte';
    import TabBar from '../../Common/TabBar.svelte';
    import Dialog from '../../Common/Dialog.svelte';
    import {
        generateCircle,
        generateSquare,
        generateTriangle,
        generateStar,
        generateHeart,
        generateSpiral,
        generateLissajous
    } from '../../../utils/shapes.js';
    import CircleIcon from '../../../assets/icons/shape-circle.svg?raw';
    import SquareIcon from '../../../assets/icons/shape-square.svg?raw';
    import TriangleIcon from '../../../assets/icons/shape-triangle.svg?raw';
    import StarIcon from '../../../assets/icons/shape-star.svg?raw';
    import HeartIcon from '../../../assets/icons/shape-heart.svg?raw';
    import SpiralIcon from '../../../assets/icons/shape-spiral.svg?raw';
    import Lissajous32Icon from '../../../assets/icons/shape-lissajous-3-2.svg?raw';
    import Lissajous54Icon from '../../../assets/icons/shape-lissajous-5-4.svg?raw';
    import LissajousCustomIcon from '../../../assets/icons/shape-lissajous-custom.svg?raw';

    let { audioEngine } = $props();
    let isPlaying = audioEngine.isPlaying;

    let selectedShape = $state('circle');
    let lissX = $state(3);
    let lissY = $state(2);
    let customDialog = $state(null);
    let hasAutoDrawn = $state(false);

    const shapeTabs = [
        { id: 'circle', label: 'Circle', icon: CircleIcon },
        { id: 'square', label: 'Square', icon: SquareIcon },
        { id: 'triangle', label: 'Triangle', icon: TriangleIcon },
        { id: 'star', label: 'Star', icon: StarIcon },
        { id: 'heart', label: 'Heart', icon: HeartIcon },
        { id: 'spiral', label: 'Spiral', icon: SpiralIcon },
        { id: 'liss32', label: 'Lissajous 3:2', icon: Lissajous32Icon },
        { id: 'liss54', label: 'Lissajous 5:4', icon: Lissajous54Icon },
        { id: 'custom', label: 'Custom Lissajous', icon: LissajousCustomIcon, anchorName: 'custom-liss-anchor' }
    ];

    const shapeGenerators = {
        circle: generateCircle,
        square: generateSquare,
        triangle: generateTriangle,
        star: generateStar,
        heart: generateHeart,
        spiral: generateSpiral,
        liss32: () => generateLissajous(3, 2),
        liss54: () => generateLissajous(5, 4),
        custom: () => generateLissajous(lissX, lissY)
    };

    function drawShape(shapeGenerator) {
        if (!get(audioEngine.isPlaying)) return;
        // Restore Settings tab default frequency before generating
        audioEngine.restoreDefaultFrequency();
        const points = shapeGenerator();
        audioEngine.createWaveform(points);
    }

    function handleShapeChange(shapeId) {
        selectedShape = shapeId;

        if (shapeId === 'custom') {
            customDialog?.showModal();
        } else {
            const generator = shapeGenerators[shapeId];
            if (generator) {
                drawShape(generator);
            }
        }
    }

    // Auto-draw circle when component mounts and audio is playing
    $effect(() => {
        if (!hasAutoDrawn && $isPlaying) {
            hasAutoDrawn = true;
            handleShapeChange('circle');
        }
    });

    // Auto-apply custom lissajous when sliders change
    $effect(() => {
        if (selectedShape === 'custom' && $isPlaying) {
            const generator = shapeGenerators.custom;
            if (generator) {
                drawShape(generator);
            }
        }
    });
</script>

<div class="shapes-container">
    <Card title="X/Y Shapes">
        <TabBar
            tabs={shapeTabs}
            bind:activeTab={selectedShape}
            onTabChange={handleShapeChange}
            wrap={true}
        />
    </Card>
</div>

<Dialog bind:dialogRef={customDialog} anchored={true} anchorId="custom-liss-anchor">
    {#snippet children()}
        <div class="dialog-controls">
            <div class="slider-group">
                <label for="dialogLissX">X Frequency Ratio: {lissX}</label>
                <input
                    type="range"
                    id="dialogLissX"
                    bind:value={lissX}
                    min="1"
                    max="10"
                    step="1"
                >
            </div>

            <div class="slider-group">
                <label for="dialogLissY">Y Frequency Ratio: {lissY}</label>
                <input
                    type="range"
                    id="dialogLissY"
                    bind:value={lissY}
                    min="1"
                    max="10"
                    step="1"
                >
            </div>
        </div>
    {/snippet}
</Dialog>

<style>
    .shapes-container {
        padding: 20px;
    }

    .dialog-controls {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .slider-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .slider-group label {
        font-size: 12px;
        font-weight: 600;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .slider-group input[type="range"] {
        width: 100%;
    }
</style>
