<script>
    import { onMount, untrack } from 'svelte';
    import { EditorView, basicSetup } from 'codemirror';
    import { EditorState } from '@codemirror/state';
    import { keymap, placeholder as placeholderExt } from '@codemirror/view';
    import { indentWithTab } from '@codemirror/commands';
    import { html } from '@codemirror/lang-html';

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

    let containerRef = $state(null);
    let editorView = null;
    let ignoreNextUpdate = false;

    function handleInput() {
        // Call the user's oninput handler
        oninput(value);

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

    onMount(() => {
        const extensions = [
            basicSetup,
            html(),
            keymap.of([indentWithTab]),
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
                if (update.docChanged && !ignoreNextUpdate) {
                    const newValue = update.state.doc.toString();
                    value = newValue;
                    handleInput();
                }
                ignoreNextUpdate = false;
            }),
            EditorView.theme({
                '&': {
                    height: '100%',
                    fontSize: fontSize,
                    backgroundColor: 'transparent',
                    color: '#666'
                },
                '.cm-scroller': {
                    overflow: 'auto',
                    fontFamily: fontFamily,
                    lineHeight: lineHeight,
                    padding: padding
                },
                '.cm-content': {
                    minHeight: '100%'
                },
                '&.cm-focused': {
                    outline: 'none'
                },
                '.cm-gutters': {
                    display: 'none'
                },
                '.cm-activeLineGutter': {
                    backgroundColor: '#e2e2e2'
                },
                '.cm-activeLine': {
                    backgroundColor: 'transparent'
                }
            })
        ];

        if (placeholder) {
            extensions.push(placeholderExt(placeholder));
        }

        editorView = new EditorView({
            state: EditorState.create({
                doc: value,
                extensions
            }),
            parent: containerRef
        });

        return () => {
            editorView?.destroy();
        };
    });

    // Update editor when value changes externally
    $effect(() => {
        if (editorView && value !== editorView.state.doc.toString()) {
            ignoreNextUpdate = true;
            editorView.dispatch({
                changes: {
                    from: 0,
                    to: editorView.state.doc.length,
                    insert: value
                }
            });
        }
    });

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
    <div 
        class="code-editor" 
        bind:this={containerRef}
    ></div>

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
        overflow: hidden;
        background: white;
    }

    .code-editor :global(.cm-editor) {
        height: 100%;
    }

    .validation-error {
        padding: 8px 20px;
        background: #ffebee;
        color: #c62828;
        font-size: 12px;
        border-top: 1px solid #ef9a9a;
    }
</style>
