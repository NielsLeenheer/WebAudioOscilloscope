<script>
    /**
     * Reusable Button component
     *
     * @prop {string} variant - Button style variant: 'primary' | 'secondary' | 'danger'
     * @prop {boolean} disabled - Whether button is disabled
     * @prop {Function} onclick - Click handler
     * @prop {string} type - Button type attribute
     * @prop {boolean} pulsating - Whether button should have pulsating animation
     */
    let {
        variant = 'primary',
        disabled = false,
        onclick = null,
        type = 'button',
        pulsating = false,
        children
    } = $props();
</script>

<button
    class="button {variant} {pulsating ? 'pulsating' : ''}"
    {disabled}
    {onclick}
    {type}
>
    {@render children()}
</button>

<style>
    .button {
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        font-family: system-ui;
        font-size: 10pt;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, opacity 0.2s;
        user-select: none;
    }

    .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .button :global(svg) {
        width: 16px;
        height: 16px;
        margin-right: 6px;
    }



    .button.primary {
        background: #bbdefb;
        color: #1976d2;
    }

    .button.primary:hover:not(:disabled) {
        background: #acd2f1;
    }

    .button.primary:active:not(:disabled) {
        background: #95bede;
    }

    .button.secondary {
        background: #f0f0f0;
        color: #333;
    }

    .button.secondary:hover:not(:disabled) {
        background: #e0e0e0;
    }

    .button.secondary:active:not(:disabled) {
        background: #d0d0d0;
    }

    .button.danger {
        background: #d13438;
        color: white;
    }

    .button.danger:hover:not(:disabled) {
        background: #a52a2d;
    }

    .button.danger:active:not(:disabled) {
        background: #7d1f22;
    }

    .button.pulsating {
        animation: glowingRing 2s ease-in-out infinite !important;
    }

    @keyframes glowingRing {
        0%, 100% {
            box-shadow:
                0 0 0 0 0 rgba(33, 150, 243, 0);
        }
        50% {
            box-shadow:
                0 0 10px 8px rgba(33, 150, 243, 0.1),
                0 0 20px 16px rgba(33, 150, 243, 0.05),
                0 0 30px 0 rgba(33, 150, 243, 0.075);
        }
    }
</style>
