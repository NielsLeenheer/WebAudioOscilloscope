<script>
    let {
        forceMultiplier = $bindable(),
        damping = $bindable(),
        mass = $bindable(),
        persistence = $bindable(),
        signalNoise = $bindable(),
        velocityDimming = $bindable(),
        decay = $bindable()
    } = $props();

    let dialog;

    export function open() {
        if (dialog) {
            dialog.show();
        }
    }

    function close() {
        if (dialog) {
            dialog.close();
        }
    }
</script>

<dialog bind:this={dialog} class="physics-dialog">
    <div class="dialog-header">
        <h3>Physics Controls</h3>
        <button class="close-button" onclick={close}>✕</button>
    </div>
    <div class="sliders">
        <div class="slider-control">
            <label>Force</label>
            <input type="range" min="0.01" max="0.5" step="0.01" bind:value={forceMultiplier} />
            <span class="value">{forceMultiplier.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Damping</label>
            <input type="range" min="0.1" max="0.99" step="0.01" bind:value={damping} />
            <span class="value">{damping.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Mass</label>
            <input type="range" min="0.01" max="5.0" step="0.01" bind:value={mass} />
            <span class="value">{mass.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Persistence</label>
            <input type="range" min="0.0" max="0.95" step="0.005" bind:value={persistence} />
            <span class="value">{persistence.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label>Noise</label>
            <input type="range" min="0" max="0.2" step="0.001" bind:value={signalNoise} />
            <span class="value">{signalNoise.toFixed(3)}</span>
        </div>
        <div class="slider-control">
            <label>Dimming</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={velocityDimming} />
            <span class="value">{velocityDimming.toFixed(2)}</span>
        </div>
        <div class="slider-control">
            <label>Decay</label>
            <input type="range" min="512" max="16384" step="256" bind:value={decay} />
            <span class="value">{decay}</span>
        </div>
    </div>
</dialog>

<style>
    .physics-dialog {
        position: fixed;
        top: 20px;
        right: 20px;
        left: auto;
        bottom: auto;
        margin: 0;
        padding: 0;
        background: rgba(26, 26, 26, 0.2);
        border: 1px solid rgba(51, 51, 51, 0.2);
        border-radius: 4px;
        color: #4CAF50;
        min-width: 300px;
        max-width: 400px;
        backdrop-filter: blur(10px);
        transform: none;
        box-shadow: 0px 0px 4px #1c5e20;
        z-index: 20;
    }

    .physics-dialog::backdrop {
        background: transparent;
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        border-bottom: 1px solid #333;
    }

    .dialog-header h3 {
        margin: 0;
        font-family: system-ui;
        font-size: 13px;
        font-weight: 600;
        color: #4CAF50;
    }

    .close-button {
        background: transparent;
        border: none;
        color: #888;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
    }

    .close-button:hover {
        color: #4CAF50;
    }

    .sliders {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 15px;
    }

    .slider-control {
        display: grid;
        grid-template-columns: 80px 1fr 50px;
        gap: 10px;
        align-items: center;
        transition: opacity 0.2s;
    }

    .slider-control label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
    }

    .slider-control .value {
        color: #4CAF50;
        font-family: monospace;
        font-size: 12px;
        font-weight: 600;
        text-align: right;
    }

    .slider-control input[type="range"] {
        width: 100%;
        height: 4px;
        background: #333;
        border-radius: 2px;
        outline: none;
        -webkit-appearance: none;
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

    .slider-control input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
        border: none;
    }
</style>
