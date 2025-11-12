<script>
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

    let { audioEngine, isPlaying, isActive = false } = $props();

    let selectedShape = $state('circle');
    let lissX = $state(3);
    let lissY = $state(2);
    let showCustomDialog = $state(false);
    let hasAutoDrawn = $state(false);

    const shapeTabs = [
        { id: 'circle', label: 'Circle' },
        { id: 'square', label: 'Square' },
        { id: 'triangle', label: 'Triangle' },
        { id: 'star', label: 'Star' },
        { id: 'heart', label: 'Heart' },
        { id: 'spiral', label: 'Spiral' },
        { id: 'liss32', label: 'Lissajous 3:2' },
        { id: 'liss54', label: 'Lissajous 5:4' },
        { id: 'custom', label: 'Custom Lissajous' }
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
        if (!isPlaying) return;
        // Restore Settings tab default frequency before generating
        audioEngine.restoreDefaultFrequency();
        const points = shapeGenerator();
        audioEngine.createWaveform(points);
    }

    function handleShapeChange(shapeId) {
        selectedShape = shapeId;

        if (shapeId === 'custom') {
            showCustomDialog = true;
        } else {
            const generator = shapeGenerators[shapeId];
            if (generator) {
                drawShape(generator);
            }
        }
    }

    function applyCustomLissajous() {
        showCustomDialog = false;
        const generator = shapeGenerators.custom;
        if (generator) {
            drawShape(generator);
        }
    }

    // Auto-draw circle when tab becomes active
    $effect(() => {
        if (isActive && !hasAutoDrawn && isPlaying) {
            hasAutoDrawn = true;
            handleShapeChange('circle');
        } else if (!isActive) {
            hasAutoDrawn = false;
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

<Dialog bind:open={showCustomDialog} title="Custom Lissajous">
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

        <button class="apply-button" onclick={applyCustomLissajous}>
            Apply
        </button>
    </div>
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

    .apply-button {
        width: 100%;
        padding: 10px;
        background: #1976d2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-family: system-ui;
        font-size: 11pt;
        transition: all 0.2s;
    }

    .apply-button:hover {
        background: #1565c0;
    }
</style>
