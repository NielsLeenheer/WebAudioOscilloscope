<script>
    let {
        value = $bindable(''),
        placeholder = 'Enter text here...',
        validationError = '',
        isValid = true,
        oninput = () => {},
        onvalidate = null,
        validateDebounce = 300,
        applyDebounce = 800,
        autoapply = false,
        onapply = null,
        fontSize = '13px',
        lineHeight = '1.6',
        padding = '20px',
        fontFamily = 'monospace',
        showValidationError = true
    } = $props();

    let validationTimeout = null;
    let applyTimeout = null;

    function handleInput(event) {
        // Call the user's oninput handler
        oninput(event);

        // Debounce validation if onvalidate is provided
        if (onvalidate) {
            if (validationTimeout) {
                clearTimeout(validationTimeout);
            }
            validationTimeout = setTimeout(() => {
                onvalidate(value);
            }, validateDebounce);
        }

        // Debounce auto-apply if enabled
        if (autoapply && onapply) {
            if (applyTimeout) {
                clearTimeout(applyTimeout);
            }
            applyTimeout = setTimeout(() => {
                if (isValid) {
                    onapply(value);
                }
            }, applyDebounce);
        }
    }

    // Cleanup timeouts on destroy
    function cleanup() {
        if (validationTimeout) {
            clearTimeout(validationTimeout);
            validationTimeout = null;
        }
        if (applyTimeout) {
            clearTimeout(applyTimeout);
            applyTimeout = null;
        }
    }

    // Cleanup on unmount
    $effect(() => {
        return cleanup;
    });
</script>

<div class="code-editor-container">
    <pre
        class="code-editor"
        class:invalid={!isValid}
        contenteditable="plaintext-only"
        bind:textContent={value}
        oninput={handleInput}
        data-placeholder={placeholder}
        style="font-size: {fontSize}; line-height: {lineHeight}; padding: {padding}; font-family: {fontFamily};"
    ></pre>

    {#if showValidationError && validationError && !isValid}
        <div class="validation-error">
            {validationError}
        </div>
    {/if}
</div>

<style>
    .code-editor-container {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .code-editor {
        flex: 1;
        margin: 0;
        color: #666;
        overflow-x: auto;
        overflow-y: auto;
        max-width: 50vw;
        white-space: pre-wrap;
        outline: none;
        border: 2px solid transparent;
        transition: border-color 0.2s;
    }

    .code-editor:empty:before {
        content: attr(data-placeholder);
        color: #999;
        pointer-events: none;
    }

    .validation-error {
        padding: 8px 20px;
        background: #ffebee;
        color: #c62828;
        font-size: 12px;
        border-top: 1px solid #ef9a9a;
    }
</style>
