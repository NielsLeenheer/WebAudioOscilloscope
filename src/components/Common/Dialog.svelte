<script>
    /**
     * Reusable Dialog component
     *
     * @prop {string} title - Dialog title (optional for anchored dialogs)
     * @prop {Function} onclose - Close handler
     * @prop {boolean} open - Bind to control dialog state
     * @prop {boolean} anchored - Enable anchored positioning
     * @prop {string} anchorId - Anchor name (CSS anchor-name value)
     * @prop {boolean} showArrow - Show arrow pointing to anchor (default true for anchored)
     * @prop {boolean} lightDismiss - Enable light dismiss on backdrop click (default true for anchored)
     * @snippet tools - Optional snippet for tool buttons (e.g., Delete)
     * @snippet buttons - Optional snippet for action buttons (e.g., Cancel, Save)
     */
    let {
        title = null,
        onclose = null,
        dialogRef = $bindable(null),
        anchored = false,
        anchorId = null,
        showArrow = true,
        lightDismiss = true,
        children,
        tools,
        buttons
    } = $props();

    function handleClose() {
        dialogRef?.close();
        if (onclose) onclose();
    }

    function handleClick(event) {
        if (anchored && lightDismiss && event.target === dialogRef) {
            handleClose();
        }
    }
</script>

<dialog
    bind:this={dialogRef}
    class="dialog"
    class:anchored
    class:show-arrow={showArrow && anchored}
    style={anchored && anchorId ? `position-anchor: --${anchorId}` : ''}
    onclick={handleClick}
>
    {#if title}
        <div class="dialog-header">
            <h2>{title}</h2>
        </div>
    {/if}
    <div class="dialog-body">
        {@render children()}
    </div>
    {#if tools || buttons}
        <div class="dialog-footer">
            <div class="dialog-footer-tools">
                {#if tools}
                    {@render tools()}
                {/if}
            </div>
            <div class="dialog-footer-buttons">
                {#if buttons}
                    {@render buttons()}
                {/if}
            </div>
        </div>
    {/if}
</dialog>

<style>
    .dialog {
        border: none;
        border-radius: 8px;
        padding: 0;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        min-width: 400px;
        max-width: 90vw;
        max-height: 90vh;
    }

    .dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
    }

    /* Anchored dialog styles */
    .dialog.anchored {
        position: fixed;
        position-anchor: var(--position-anchor);
        top: anchor(bottom);
        left: anchor(center);
        translate: -50% 16px;
        margin: 0;
        z-index: 100;
        min-width: 300px;
        max-width: 400px;
        overflow: visible;
    }

    .dialog.anchored::backdrop {
        background: rgba(0, 0, 0, 0.3);
    }

    /* Arrow pointing up to anchor element */
    .dialog.show-arrow::before {
        content: '';
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid #fff;
        filter: drop-shadow(0 -2px 2px rgba(0, 0, 0, 0.1));
    }

    .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: #f5f5f5;
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
    }

    .dialog-header h2 {
        margin: 0;
        font-size: 12pt;
        font-weight: 600;
    }

    .dialog-body {
        padding: 20px;
    }

    .dialog-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 20px 20px 20px;
        gap: 10px;
    }

    .dialog-footer-tools {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .dialog-footer-buttons {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .dialog-footer :global(svg) {
        width: 16px;
        height: 16px;
        margin-right: 6px;
    }
</style>
