<script>
    let {
        mode,
        beamPower = $bindable(),
        focus = $bindable(),
        xPosition = $bindable(),
        timeDivBase = $bindable(),
        timeDivFine = $bindable(),
        timeDivLabels,
        triggerLevel = $bindable(),
        triggerChannel = $bindable(),
        positionA = $bindable(),
        amplBaseA = $bindable(),
        amplFineA = $bindable(),
        amplLabels,
        positionB = $bindable(),
        amplBaseB = $bindable(),
        amplFineB = $bindable()
    } = $props();
</script>

<div class="controls-grid">
    <!-- Top Left: Display Controls -->
    <div class="control-panel">
        <div class="slider-control">
            <label>INTENS</label>
            <input type="range" min="0" max="2" step="0.01" bind:value={beamPower} />
            <span class="value">{beamPower.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>FOCUS</label>
            <input type="range" min="-1" max="1" step="0.01" bind:value={focus} />
            <span class="value">{focus.toFixed(2)}</span>
        </div>
    </div>

    <!-- Top Right: Position/Time Controls -->
    <div class="control-panel">
        <div class="slider-control">
            <label>X POS</label>
            <input type="range" min="-1" max="1" step="0.01" bind:value={xPosition} />
            <span class="value">{xPosition.toFixed(2)}</span>
        </div>
        <div class="slider-control dual-slider" class:disabled={mode === 'xy'}>
            <label>TIME/DIV</label>
            <input type="range" min="0" max="21" step="1" bind:value={timeDivBase} disabled={mode === 'xy'} class="base-slider" />
            <input type="range" min="0.5" max="2.5" step="0.01" bind:value={timeDivFine} disabled={mode === 'xy'} class="fine-slider" />
            <span class="value">{timeDivLabels[timeDivBase]}</span>
        </div>
        <div class="slider-control trigger-control" class:disabled={mode === 'xy'}>
            <label>TRIGGER</label>
            <input type="range" min="-1" max="1" step="0.01" bind:value={triggerLevel} disabled={mode === 'xy'} class="trigger-slider" />
            <div class="trigger-channel-selector">
                <button
                    class="channel-btn"
                    class:active={triggerChannel === 'a'}
                    onclick={() => triggerChannel = 'a'}
                    disabled={mode === 'xy'}
                >A</button>
                <button
                    class="channel-btn"
                    class:active={triggerChannel === 'b'}
                    onclick={() => triggerChannel = 'b'}
                    disabled={mode === 'xy'}
                >B</button>
            </div>
            <span class="value">{triggerLevel.toFixed(2)}</span>
        </div>
    </div>

    <!-- Bottom Left: Channel A Controls -->
    <div class="control-panel">
        <div class="panel-label">CHANNEL A</div>
        <div class="slider-control" class:disabled={mode === 'b'}>
            <label>POSITION</label>
            <input type="range" min="-1" max="1" step="0.01" bind:value={positionA} disabled={mode === 'b'} />
            <span class="value">{positionA.toFixed(2)}</span>
        </div>
        <div class="slider-control dual-slider" class:disabled={mode === 'b'}>
            <label>AMPL/DIV</label>
            <input type="range" min="0" max="11" step="1" bind:value={amplBaseA} disabled={mode === 'b'} class="base-slider" />
            <input type="range" min="0.5" max="2.5" step="0.01" bind:value={amplFineA} disabled={mode === 'b'} class="fine-slider" />
            <span class="value">{amplLabels[amplBaseA]}</span>
        </div>
    </div>

    <!-- Bottom Right: Channel B Controls -->
    <div class="control-panel">
        <div class="panel-label">CHANNEL B</div>
        <div class="slider-control" class:disabled={mode === 'a'}>
            <label>POSITION</label>
            <input type="range" min="-1" max="1" step="0.01" bind:value={positionB} disabled={mode === 'a'} />
            <span class="value">{positionB.toFixed(2)}</span>
        </div>
        <div class="slider-control dual-slider" class:disabled={mode === 'a'}>
            <label>AMPL/DIV</label>
            <input type="range" min="0" max="11" step="1" bind:value={amplBaseB} disabled={mode === 'a'} class="base-slider" />
            <input type="range" min="0.5" max="2.5" step="0.01" bind:value={amplFineB} disabled={mode === 'a'} class="fine-slider" />
            <span class="value">{amplLabels[amplBaseB]}</span>
        </div>
    </div>
</div>

<style>
    .controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 20px;
        width: 100%;
        box-sizing: border-box;
    }

    .control-panel {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
        background: #1a1a1a;
        border-radius: 4px;
        min-height: 80px;
    }

    .panel-label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        margin-bottom: 5px;
        padding-bottom: 8px;
        border-bottom: 1px solid #333;
    }

    .slider-control {
        display: grid;
        grid-template-columns: 80px 1fr 50px;
        gap: 10px;
        align-items: center;
        transition: opacity 0.2s;
    }

    .slider-control.disabled {
        opacity: 0.4;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .slider-control.disabled label {
        color: #666;
    }

    .slider-control .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        text-align: right;
    }

    .slider-control.disabled .value {
        color: #666;
    }

    .slider-control input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
    }

    .slider-control input[type="range"]:disabled {
        background: #222;
        cursor: not-allowed;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
    }

    .slider-control input[type="range"]:disabled::-webkit-slider-thumb {
        background: #555;
        cursor: not-allowed;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }

    .slider-control input[type="range"]:disabled::-moz-range-thumb {
        background: #555;
        cursor: not-allowed;
    }

    .slider-control select {
        width: 100%;
        background: #2d2d2d;
        color: #4CAF50;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 4px 8px;
        font-family: system-ui;
        font-size: 12px;
        cursor: pointer;
        outline: none;
    }

    .slider-control select:hover:not(:disabled) {
        border-color: #4CAF50;
    }

    .slider-control select:disabled {
        background: #1a1a1a;
        color: #666;
        border-color: #222;
        cursor: not-allowed;
    }

    .slider-control select option {
        background: #2d2d2d;
        color: #4CAF50;
    }

    .slider-control.dual-slider {
        grid-template-columns: 80px 1fr 1fr 50px;
    }

    .slider-control.dual-slider .base-slider {
        width: 100%;
    }

    .slider-control.dual-slider .fine-slider {
        width: 100%;
    }

    .slider-control.trigger-control {
        grid-template-columns: 80px 1fr 60px 50px;
    }

    .slider-control.trigger-control .trigger-slider {
        width: 100%;
    }

    .trigger-channel-selector {
        display: flex;
        /* gap: 2px; */
        background: #2d2d2d;
        border-radius: 5px;
        height: 24px;
        align-items: center;
    }

    .channel-btn {
        width: 50%;
        background: transparent;
        color: #666;
        border: none;
        border-radius: 5px;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        line-height: 1;
        height: 100%;
    }
    .channel-btn:hover:not(:disabled) {
        background: transparent;
        color: #4CAF50;
    }

    /* .channel-btn:hover:not(:disabled) {
        background: #333;
        color: #4CAF50;
    } */

    .channel-btn.active, 
    .channel-btn.active:hover:not(:disabled) {
        background: #4CAF50;
        color: #1a1a1a;
    }

    .channel-btn:disabled {
        background: transparent;
        color: #444;
        cursor: not-allowed;
    }
</style>
