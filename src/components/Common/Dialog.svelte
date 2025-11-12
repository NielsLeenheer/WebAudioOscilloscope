<script>
    /**
     * Reusable Dialog component for anchored/floating dialogs
     *
     * @prop {boolean} open - Whether the dialog is open
     * @prop {string} title - Dialog title
     * @prop {Function} onClose - Callback when dialog is closed
     */
    let {
        open = $bindable(false),
        title = '',
        onClose = null
    } = $props();

    function handleClose() {
        open = false;
        if (onClose) {
            onClose();
        }
    }

    function handleBackdropClick(e) {
        if (e.target === e.currentTarget) {
            handleClose();
        }
    }
</script>

{#if open}
    <div class="dialog-backdrop" onclick={handleBackdropClick}>
        <div class="dialog">
            <div class="dialog-header">
                <h3>{title}</h3>
                <button class="close-button" onclick={handleClose}>×</button>
            </div>
            <div class="dialog-content">
                <slot></slot>
            </div>
        </div>
    </div>
{/if}

<style>
    .dialog-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .dialog {
        background: white;
        border-radius: 8px;
        min-width: 300px;
        max-width: 500px;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #ddd;
    }

    .dialog-header h3 {
        margin: 0;
        font-size: 14pt;
        font-weight: 600;
        color: #333;
    }

    .close-button {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .close-button:hover {
        background: #f0f0f0;
        color: #333;
    }

    .dialog-content {
        padding: 20px;
    }
</style>
