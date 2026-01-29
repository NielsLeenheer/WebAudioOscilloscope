<script>
    import { untrack } from 'svelte';
    import { svgExamples } from '../../../utils/svgExamples/index.js';
    import { onMount } from 'svelte';
    import Preview from '../../Common/Preview.svelte';
    import CodeEditor from '../../Common/CodeEditor.svelte';
    import TabBar from '../../Common/TabBar.svelte';
    import Button from '../../Common/Button.svelte';
    import PathEditor from '../../Common/PathEditor.svelte';
    import ImageUpload from '../../Common/ImageUpload.svelte';
    import EraseIcon from '../../../assets/icons/erase.svg?raw';
    import MoveIcon from '../../../assets/icons/move.svg?raw';
    import {
        normalizePoints,
        extractPathPoints,
        parseSVGMarkupStatic,
        createContinuousSampler
    } from '../../../utils/svgSampler.js';

    let { audioEngine, frameProcessor, isActive = false, animationFPS = $bindable(30), numSamples = $bindable(200), optimizeSegments = $bindable(true), doubleDraw = $bindable(true) } = $props();

    // Sub-view switching
    let activeSubView = $state('code');
    const subViewTabs = [
        { id: 'code', label: 'Code' },
        { id: 'draw', label: 'Draw' }
    ];
    let isCodeActive = $derived(isActive && activeSubView === 'code');
    let isDrawActive = $derived(isActive && activeSubView === 'draw');

    // --- Shared state (previously in Generator.svelte) ---
    let svgInput = $state('');
    let selectedExample = $state('star');

    // --- Code sub-view state ---
    let validationError = $state('');
    let isValid = $state(true);
    let codePreviewPoints = $state([]);
    // Validated segments from SVG parsing — NOT reactive to avoid feedback loop
    // with onPreviewUpdate (which overwrites codePreviewPoints with worker output).
    let validatedSegments = [];
    let optimizationInitialized = $state(false);
    let sampler = null;
    let staticFrameInterval = null;

    // --- Draw sub-view state ---
    let pathEditor;
    let backgroundImage = $state(null);
    let backgroundOpacity = $state(30);
    let currentNormalizedPoints = $state(null);

    // ===== Preview update (works for both sub-views) =====
    $effect(() => {
        if (isActive) {
            frameProcessor.onPreviewUpdate = () => {
                if (frameProcessor.processedPreview) {
                    codePreviewPoints = frameProcessor.processedPreview;
                }
            };
            return () => {
                frameProcessor.onPreviewUpdate = null;
            };
        }
    });

    // ===== Code sub-view logic =====

    function detectInputType(input) {
        const trimmed = input.trim();
        return trimmed.includes('<svg') ? 'full' : 'path';
    }

    function startContinuousSampling(markup, samples) {
        stopContinuousSampling();
        try {
            sampler = createContinuousSampler(
                markup,
                samples,
                animationFPS,
                (normalized) => {
                    const segments = Array.isArray(normalized[0]?.[0]) ? normalized : [normalized];
                    frameProcessor.processFrame(segments);
                    codePreviewPoints = frameProcessor.processedPreview ?? normalized;
                },
                () => true,
                optimizeSegments,
                doubleDraw
            );
        } catch (error) {
            console.error('Error starting continuous sampling:', error);
        }
    }

    function stopContinuousSampling() {
        if (sampler) {
            sampler.stop();
            sampler = null;
        }
    }

    function startStaticFrameLoop(segments) {
        stopStaticFrameLoop();
        frameProcessor.processFrame(segments);
        staticFrameInterval = setInterval(() => {
            frameProcessor.processFrame(segments);
        }, 1000 / animationFPS);
    }

    function stopStaticFrameLoop() {
        if (staticFrameInterval !== null) {
            clearInterval(staticFrameInterval);
            staticFrameInterval = null;
        }
    }

    function validateInput(value) {
        const data = value.trim();
        if (!data) {
            validationError = '';
            isValid = true;
            validatedSegments = [];
            return;
        }
        try {
            const inputType = detectInputType(data);
            let segments;
            if (inputType === 'path') {
                const result = extractPathPoints(data, numSamples, optimizeSegments, doubleDraw);
                segments = result.segments.map(segment => normalizePoints(segment, result.bbox));
            } else {
                segments = parseSVGMarkupStatic(data, numSamples, optimizeSegments, doubleDraw);
            }
            validatedSegments = segments;
            codePreviewPoints = segments;
            validationError = '';
            isValid = true;
        } catch (error) {
            validationError = error.message || 'Invalid SVG';
            isValid = false;
        }
    }

    function applyInput(value) {
        if (!isValid || !isCodeActive) return;
        const data = value.trim();
        if (!data) return;
        const inputType = detectInputType(data);
        if (inputType === 'full') {
            stopStaticFrameLoop();
            startContinuousSampling(data, numSamples);
            return;
        }
        stopContinuousSampling();
        try {
            if (validatedSegments.length > 0) {
                const segments = Array.isArray(validatedSegments[0]?.[0]) ? validatedSegments : [validatedSegments];
                startStaticFrameLoop(segments);
            }
        } catch (error) {
            console.error('Error applying SVG:', error);
        }
    }

    function handleEditorInput(event) {
        selectedExample = 'custom';
    }

    function handleSelectChange(event) {
        if (selectedExample === 'custom') return;
        const example = svgExamples.find(ex => ex.id === selectedExample);
        if (example) {
            svgInput = example.path;
            if (example.complex) {
                numSamples = 400;
            } else {
                numSamples = 200;
            }
            validateInput(svgInput);
            if (isValid) {
                applyInput(svgInput);
            }
        }
    }

    onMount(() => {
        handleSelectChange();
        return () => {
            stopContinuousSampling();
            stopStaticFrameLoop();
        };
    });

    // Apply SVG when code sub-view becomes active
    $effect(() => {
        if (isCodeActive && svgInput && isValid) {
            applyInput(svgInput);
        }
    });

    // Stop continuous sampling when code sub-view becomes inactive
    $effect(() => {
        if (!isCodeActive) {
            stopContinuousSampling();
            stopStaticFrameLoop();
        }
    });

    // Validate input when it changes (e.g., from Draw copy)
    $effect(() => {
        if (selectedExample === 'custom' && svgInput) {
            validateInput(svgInput);
        }
    });

    // Re-validate and re-apply when optimization settings change
    $effect(() => {
        optimizeSegments;
        doubleDraw;
        if (!optimizationInitialized) {
            optimizationInitialized = true;
            return;
        }
        untrack(() => {
            if (svgInput && isValid) {
                validateInput(svgInput);
                if (isCodeActive) {
                    applyInput(svgInput);
                }
            }
        });
    });

    // ===== Draw sub-view logic =====

    $effect(() => {
        if (isDrawActive && currentNormalizedPoints) {
            updateScope();
        }
    });

    function handlePathChange(normalizedPoints) {
        currentNormalizedPoints = normalizedPoints;
        if (normalizedPoints) {
            updateScope();
        }
    }

    function updateScope() {
        if (!currentNormalizedPoints) return;
        const segments = Array.isArray(currentNormalizedPoints[0]?.[0])
            ? currentNormalizedPoints
            : [currentNormalizedPoints];
        frameProcessor.processFrame(segments);
    }

    function clearCanvas() {
        if (pathEditor) {
            pathEditor.clear();
        }
    }

    function copyToCode() {
        if (!pathEditor || !pathEditor.hasPath()) {
            alert('No path to copy');
            return;
        }
        const svg = pathEditor.exportSVG();
        if (svg) {
            const pathMatch = svg.match(/<path[^>]+d="([^"]+)"/);
            if (pathMatch && pathMatch[1]) {
                selectedExample = 'custom';
                svgInput = pathMatch[1];
                activeSubView = 'code';
            }
        }
    }
</script>

<div class="svg-combined">
    <div class="sub-nav">
        <TabBar tabs={subViewTabs} activeTab={activeSubView} onTabChange={(id) => activeSubView = id} />
    </div>

    <div class="sub-panel" class:active={activeSubView === 'code'}>
        <div class="svg-controls">
            <div class="header">
                <Preview points={codePreviewPoints} width={150} height={150} />

                <select bind:value={selectedExample} onchange={handleSelectChange}>
                    <option value="custom">Custom...</option>
                    {#each svgExamples as example}
                        <option value={example.id}>{example.label}</option>
                    {/each}
                </select>
            </div>

            <CodeEditor
                bind:value={svgInput}
                bind:validationError
                bind:isValid
                oninput={handleEditorInput}
                onvalidate={validateInput}
                onapply={applyInput}
                autoapply={true}
                placeholder="Paste SVG path data or full SVG markup here.

Path data example:
M 10,10 L 90,90 L 10,90 Z

Full SVG example:
<svg viewBox='0 0 100 100'>
  <circle cx='50' cy='50' r='40'/>
</svg>"
            />
        </div>
    </div>

    <div class="sub-panel" class:active={activeSubView === 'draw'}>
        <div class="draw-controls">
            <div style="display: flex; justify-content: center; margin: 20px 0;">
                <ImageUpload bind:image={backgroundImage} bind:opacity={backgroundOpacity}>
                    <PathEditor
                        bind:this={pathEditor}
                        bind:backgroundImage
                        bind:backgroundOpacity
                        onPathChange={handlePathChange}
                    />
                </ImageUpload>
            </div>
            <div style="display: flex; justify-content: center; gap: 10px; margin: 15px 0;">
                <Button variant="secondary" onclick={clearCanvas}>
                    {@html EraseIcon}
                    Clear
                </Button>
                <Button variant="secondary" onclick={copyToCode}>
                    {@html MoveIcon}
                    Copy to Code
                </Button>
            </div>
        </div>
    </div>
</div>

<style>
    .svg-combined {
        display: grid;
        grid-template-rows: auto 1fr;
        height: 100%;
    }

    .sub-nav {
        display: flex;
        justify-content: center;
        padding: 24px 40px 0;
    }

    .sub-panel {
        display: none;
        overflow: auto;
    }

    .sub-panel.active {
        display: block;
    }

    .svg-controls {
        display: grid;
        grid-template-rows: auto 1fr;
        height: 100%;
    }

    .header {
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
    }

    select {
        border: 2px solid #ccc;
    }

    .draw-controls {
        background: none;
        margin-top: 0px;
        padding: 10px;
    }
</style>
