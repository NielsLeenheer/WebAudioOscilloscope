<script>
    /**
     * Reusable TabBar component
     *
     * @prop {Array} tabs - Array of tab objects with structure: { id: string, label: string, icon?: string }
     * @prop {string} activeTab - Currently active tab ID
     * @prop {Function} onTabChange - Callback when tab changes, receives tab ID
     */
    let {
        tabs = [],
        activeTab = $bindable(''),
        onTabChange = null
    } = $props();

    function handleTabClick(tabId) {
        activeTab = tabId;
        if (onTabChange) {
            onTabChange(tabId);
        }
    }
</script>

<div class="tab-bar">
    {#each tabs as tab}
        <button
            class="tab"
            class:active={activeTab === tab.id}
            onclick={() => handleTabClick(tab.id)}
            title={tab.label}
        >
            {#if tab.icon}
                <div class="tab-icon">
                    {@html tab.icon}
                </div>
            {/if}
            {#if tab.label && !tab.icon}
                <span class="tab-label">{tab.label}</span>
            {/if}
        </button>
    {/each}
</div>

<style>
    .tab-bar {
        display: flex;
        gap: 4px;
        background: #f5f5f5;
        padding: 4px;
        border-radius: 6px;
    }

    .tab {
        flex: 1;
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: system-ui;
        font-size: 11pt;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
    }

    .tab:hover {
        background: rgba(0, 0, 0, 0.05);
    }

    .tab.active {
        background: white;
        color: #1976d2;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .tab-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 24px;
    }

    .tab-icon :global(svg) {
        width: 100%;
        height: 100%;
    }

    .tab-label {
        user-select: none;
    }
</style>
