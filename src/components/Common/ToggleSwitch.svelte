<script>
    let {
        checked = $bindable(false),
        disabled = false,
        onchange = null,
        label = null
    } = $props();

    function handleClick() {
        if (disabled) return;
        checked = !checked;
        if (onchange) {
            onchange(checked);
        }
    }
</script>

<div class="toggle-container">
    <button
        class="toggle-switch"
        class:on={checked}
        onclick={handleClick}
        {disabled}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
    >
        <span class="toggle-slider"></span>
    </button>
    {#if label}
        <label class="toggle-label">{label}</label>
    {/if}
</div>

<style>
    .toggle-container {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .toggle-label {
        color: #4CAF50;
        font-family: system-ui;
        font-size: 12px;
        font-weight: 600;
        user-select: none;
    }

    .toggle-switch {
        position: relative;
        width: 44px;
        height: 24px;
        background: #3a3a3a;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: background-color 0.3s;
        padding: 0;
        flex-shrink: 0;
    }

    .toggle-switch:hover:not(:disabled) {
        background: #4a4a4a;
    }

    .toggle-switch.on {
        background: #4caf50;
    }

    .toggle-switch.on:hover:not(:disabled) {
        background: #45a049;
    }

    .toggle-switch:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: #3a3a3a;
    }

    .toggle-switch:disabled .toggle-slider {
        background: #666;
    }

    .toggle-slider {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        transition: transform 0.3s, background 0.3s;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        display: block;
    }

    .toggle-switch.on .toggle-slider {
        transform: translateX(20px);
    }
</style>
