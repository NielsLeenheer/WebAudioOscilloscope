// Renderer Manager - handles switching between different rendering backends
import { Canvas2DRenderer } from './canvas2d-renderer.js';
import { WebGPURenderer, isWebGPUSupported } from './webgpu-renderer.js';

export const RendererType = {
    CANVAS_2D: 'canvas2d',
    WEBGPU: 'webgpu',
};

export class RendererManager {
    constructor() {
        this.currentRenderer = null;
        this.currentType = null;
        this.canvas = null;
        this.devicePixelRatio = 1;
        this.logicalWidth = 600;
        this.logicalHeight = 600;
        this.webgpuSupported = null; // Cache WebGPU support check
    }

    /**
     * Initialize the renderer manager
     * @param {OffscreenCanvas} canvas - The canvas to render to
     * @param {number} devicePixelRatio - Display pixel ratio
     * @param {number} logicalWidth - Logical width in CSS pixels
     * @param {number} logicalHeight - Logical height in CSS pixels
     * @param {string} rendererType - Initial renderer type
     */
    async init(canvas, devicePixelRatio, logicalWidth, logicalHeight, rendererType = RendererType.CANVAS_2D) {
        this.canvas = canvas;
        this.devicePixelRatio = devicePixelRatio;
        this.logicalWidth = logicalWidth;
        this.logicalHeight = logicalHeight;

        // Check WebGPU support once
        this.webgpuSupported = isWebGPUSupported();

        // Initialize with the requested renderer
        await this.switchRenderer(rendererType);
    }

    /**
     * Switch to a different renderer
     * @param {string} rendererType - The renderer type to switch to
     * @returns {boolean} - True if switch was successful
     */
    async switchRenderer(rendererType) {
        // If already using this renderer, do nothing
        if (this.currentType === rendererType && this.currentRenderer?.isReady()) {
            return true;
        }

        // Validate renderer type
        if (rendererType === RendererType.WEBGPU && !this.webgpuSupported) {
            console.warn('WebGPU not supported, falling back to Canvas 2D');
            rendererType = RendererType.CANVAS_2D;
        }

        // Destroy current renderer if exists
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
            this.currentRenderer = null;
        }

        // Create new renderer
        let newRenderer;
        let success = false;

        switch (rendererType) {
            case RendererType.WEBGPU:
                newRenderer = new WebGPURenderer();
                success = await newRenderer.init(
                    this.canvas,
                    this.devicePixelRatio,
                    this.logicalWidth,
                    this.logicalHeight
                );
                if (!success) {
                    console.warn('WebGPU initialization failed, falling back to Canvas 2D');
                    newRenderer.destroy();
                    // Fall through to Canvas 2D
                    rendererType = RendererType.CANVAS_2D;
                    newRenderer = new Canvas2DRenderer();
                    newRenderer.init(
                        this.canvas,
                        this.devicePixelRatio,
                        this.logicalWidth,
                        this.logicalHeight
                    );
                    success = newRenderer.isReady();
                }
                break;

            case RendererType.CANVAS_2D:
            default:
                newRenderer = new Canvas2DRenderer();
                newRenderer.init(
                    this.canvas,
                    this.devicePixelRatio,
                    this.logicalWidth,
                    this.logicalHeight
                );
                success = newRenderer.isReady();
                break;
        }

        if (success) {
            this.currentRenderer = newRenderer;
            this.currentType = rendererType;
            console.log(`Switched to ${newRenderer.getName()} renderer`);
            return true;
        }

        console.error('Failed to initialize renderer');
        return false;
    }

    /**
     * Get the current renderer
     * @returns {Canvas2DRenderer|WebGPURenderer}
     */
    getRenderer() {
        return this.currentRenderer;
    }

    /**
     * Get the current renderer type
     * @returns {string}
     */
    getCurrentType() {
        return this.currentType;
    }

    /**
     * Check if a renderer type is available
     * @param {string} rendererType - The renderer type to check
     * @returns {boolean}
     */
    isAvailable(rendererType) {
        switch (rendererType) {
            case RendererType.WEBGPU:
                return this.webgpuSupported;
            case RendererType.CANVAS_2D:
                return true;
            default:
                return false;
        }
    }

    /**
     * Get list of available renderer types
     * @returns {Array<{type: string, name: string, available: boolean}>}
     */
    getAvailableRenderers() {
        return [
            {
                type: RendererType.CANVAS_2D,
                name: 'Canvas 2D',
                available: true
            },
            {
                type: RendererType.WEBGPU,
                name: 'WebGPU (Experimental)',
                available: this.webgpuSupported
            }
        ];
    }

    /**
     * Check if the current renderer is ready
     * @returns {boolean}
     */
    isReady() {
        return this.currentRenderer?.isReady() ?? false;
    }

    /**
     * Clear the canvas with persistence effect
     */
    clearWithPersistence(persistence, canvasWidth, canvasHeight) {
        this.currentRenderer?.clearWithPersistence(persistence, canvasWidth, canvasHeight);
    }

    /**
     * Clear the canvas completely
     */
    clear() {
        this.currentRenderer?.clear();
    }

    /**
     * Render the trace
     */
    renderTrace(params) {
        this.currentRenderer?.renderTrace(params);
    }

    /**
     * Draw FPS counter
     */
    drawFPS(fps) {
        this.currentRenderer?.drawFPS(fps);
    }

    /**
     * Get the rendering context (for Canvas 2D specific operations)
     */
    getContext() {
        return this.currentRenderer?.getContext();
    }

    /**
     * Destroy the manager and release resources
     */
    destroy() {
        if (this.currentRenderer) {
            this.currentRenderer.destroy();
            this.currentRenderer = null;
        }
        this.currentType = null;
    }
}
