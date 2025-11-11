<script>
    /**
     * Reusable Card component
     *
     * @prop {string} title - Card title
     * @prop {children} - Card content
     */
    let {
        title = '',
        children
    } = $props();
</script>

<div class="card">
    {#if title}
        <div class="card-header">
            <h3 class="card-title">{title}</h3>
        </div>
    {/if}
    <div class="card-content">
        {@render children()}
    </div>
</div>

<style>
    .card {
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
    }

    .card-header {
        padding: 12px 16px;
        background: #f8f9fa;
        border-bottom: 1px solid #e0e0e0;
    }

    .card-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #333;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .card-content {
        padding: 16px;
    }
</style>
