<script>
    import { Icon } from 'svelte-icon';
    import powerIcon from '../../assets/icons/power.svg?raw';

    let {
        isPowered = $bindable(false),
        variant = 'light',  // 'light' or 'dark'
        onclick = null
    } = $props();

    function handleClick() {
        if (onclick) {
            onclick();
        } else {
            isPowered = !isPowered;
        }
    }
</script>

<button
    class={variant}
    class:powered={isPowered}
    onclick={handleClick}
>
    <Icon data={powerIcon} />
    {isPowered ? 'POWER OFF' : 'POWER ON'}
</button>

<style>
    button {
        border-radius: 6px;
        height: 36px;
        padding: 0 16px;
        font-family: system-ui;
        font-size: 11pt;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.2s;
    }

    /* Light theme (Generator) */
    button.light {
        background-color: #bbdefb;
        color: #1976d2;
        border: none;
    }

    button.light.powered {
        background-color: #1976d2;
        color: #bbdefb;
    }

    /* Dark theme (Oscilloscope) */
    button.dark {
        background-color: #2d2d2d;
        color: #888;
        border: 1px solid #333;
    }

    button.dark.powered {
        background-color: #1b5e20;
        color: #4CAF50;
        border: 1px solid #2d5e30;
    }

    button :global(svg) {
        height: 18px;
        width: 18px;
        stroke-width: 0;
    }
</style>
