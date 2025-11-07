<script>
    import { Icon } from 'svelte-icon';
    import connectIcon from '../assets/icons/connect.svg?raw';

    const microphoneIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
<path fill="#9fa8da" d="M33,24c0,3.3-2.7,6-6,6h-6c-3.3,0-6-2.7-6-6V10c0-3.3,2.7-6,6-6h6c3.3,0,6,2.7,6,6V24z"></path><path fill="#3f51b5" d="M22 34H26V44H22z"></path><path fill="#303f9f" d="M35,43c0,0-6-2-11-2s-11,2-11,2v2h22V43z"></path><path fill="#5c6bc0" d="M15 10H23V12H15zM25 10H33V12H25zM25 14H33V16H25zM15 14H23V16H15zM25 18H33V20H25zM15 18H23V20H15zM15 22H23V24H15zM25 22H33V24H25z"></path><path fill="#3f51b5" d="M26,35h-4c-3.1,0-9-1.7-9-8v-9h2v9c0,5.9,6.7,6,7,6h4c0.3,0,7-0.1,7-6v-9h2v9C35,33.3,29.1,35,26,35z"></path>
</svg>`;

    let { inputSource = $bindable() } = $props();
</script>

<div class="input-selector">
    <nav>
        <label>
            <input type="radio" name="input" value="generated" bind:group={inputSource}>
            <Icon data={connectIcon} />
            Generated
        </label>

        <label>
            <input type="radio" name="input" value="microphone" bind:group={inputSource}>
            <Icon data={microphoneIcon} />
            Microphone
        </label>
    </nav>
</div>

<style>
    .input-selector {
        display: flex;
        align-items: center;
        padding: 0 20px;
        background: #1a1a1a;
        border-bottom: 1px solid #333;
        padding-top: 15px;
        padding-bottom: 15px;
    }

    nav {
        border: none;
        border-radius: 6px;
        background: #2d2d2d;
        font-family: system-ui;
        font-size: 10pt;
        display: flex;
        height: 32px;
        align-items: stretch;
        user-select: none;
    }

    label {
        display: flex;
        align-items: center;
        padding: 0px 12px;
        cursor: pointer;
        color: #888;
        transition: all 0.2s;
    }

    label:first-child {
        border-radius: 6px 0 0 6px;
    }

    label:last-child {
        border-radius: 0 6px 6px 0;
    }

    label:has(:focus-visible) {
        outline: 2px solid #4CAF50;
    }

    label:has(input:checked) {
        background: #1b5e20;
        color: #4CAF50;
    }

    label:hover:not(:has(input:checked)) {
        background: #333;
        color: #aaa;
    }

    label :global(svg) {
        width: 1.5em;
        height: 1.5em;
        margin-right: 6px;
    }

    input {
        position: absolute;
        opacity: 0;
    }
</style>
