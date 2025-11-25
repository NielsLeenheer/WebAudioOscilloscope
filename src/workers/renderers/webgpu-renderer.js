// WebGPU Renderer for oscilloscope visualization
// Experimental renderer for future shader effects

export class WebGPURenderer {
    constructor() {
        this.device = null;
        this.context = null;
        this.canvas = null;
        this.devicePixelRatio = 1;
        this.logicalWidth = 600;
        this.logicalHeight = 600;
        this.pipeline = null;
        this.linePipeline = null;
        this.format = null;
        this.initialized = false;

        // Persistent texture for phosphor persistence effect
        this.persistenceTexture = null;
        this.persistenceTextureView = null;
        this.copyPipeline = null;
        this.fadeAndCopyPipeline = null;
        this.sampler = null;
        this.bindGroupLayout = null;
        this.persistenceBindGroup = null;
    }

    /**
     * Initialize the renderer with an OffscreenCanvas
     * @param {OffscreenCanvas} canvas - The canvas to render to
     * @param {number} devicePixelRatio - Display pixel ratio for high-DPI support
     * @param {number} logicalWidth - Logical width in CSS pixels
     * @param {number} logicalHeight - Logical height in CSS pixels
     */
    async init(canvas, devicePixelRatio, logicalWidth, logicalHeight) {
        this.canvas = canvas;
        this.devicePixelRatio = devicePixelRatio || 1;
        this.logicalWidth = logicalWidth || 600;
        this.logicalHeight = logicalHeight || 600;

        // Check WebGPU support
        if (!navigator.gpu) {
            console.error('WebGPU not supported');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.error('Failed to get GPU adapter');
                return false;
            }

            this.device = await adapter.requestDevice();
            this.context = canvas.getContext('webgpu');
            this.format = navigator.gpu.getPreferredCanvasFormat();

            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'premultiplied',
            });

            // Create persistence texture for phosphor trail effect
            const physicalWidth = this.logicalWidth * this.devicePixelRatio;
            const physicalHeight = this.logicalHeight * this.devicePixelRatio;

            this.persistenceTexture = this.device.createTexture({
                size: [physicalWidth, physicalHeight],
                format: this.format,
                usage: GPUTextureUsage.TEXTURE_BINDING |
                       GPUTextureUsage.COPY_DST |
                       GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.persistenceTextureView = this.persistenceTexture.createView();

            // Create sampler for texture sampling
            this.sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
            });

            // Create shaders and pipelines
            await this.createPipelines();

            this.initialized = true;
            return true;
        } catch (error) {
            console.error('WebGPU initialization failed:', error);
            return false;
        }
    }

    async createPipelines() {
        // Vertex shader for drawing lines as triangle strips
        const lineVertexShader = `
            struct VertexInput {
                @location(0) position: vec2<f32>,
                @location(1) opacity: f32,
            }

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) opacity: f32,
            }

            @vertex
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                // Convert from pixel coordinates to clip space [-1, 1]
                let clipX = (input.position.x / 300.0) - 1.0;
                let clipY = 1.0 - (input.position.y / 300.0);
                output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                output.opacity = input.opacity;
                return output;
            }
        `;

        // Fragment shader for green phosphor glow
        const lineFragmentShader = `
            struct FragmentInput {
                @location(0) opacity: f32,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                // Green phosphor color (76, 175, 80) / 255
                let green = vec3<f32>(0.298, 0.686, 0.314);
                return vec4<f32>(green * input.opacity, input.opacity);
            }
        `;

        const lineVertexModule = this.device.createShaderModule({ code: lineVertexShader });
        const lineFragmentModule = this.device.createShaderModule({ code: lineFragmentShader });

        this.linePipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: lineVertexModule,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 12, // 2 floats for position + 1 float for opacity
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32' },
                    ],
                }],
            },
            fragment: {
                module: lineFragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-strip',
                stripIndexFormat: undefined,
            },
        });

        // Create point/dot rendering pipeline
        const pointVertexShader = `
            struct VertexInput {
                @location(0) position: vec2<f32>,
                @location(1) color: vec3<f32>,
                @location(2) opacity: f32,
                @location(3) size: f32,
            }

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) color: vec3<f32>,
                @location(1) opacity: f32,
                @location(2) pointCoord: vec2<f32>,
            }

            @vertex
            fn main(input: VertexInput, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var output: VertexOutput;

                // Create quad vertices for each point (instanced rendering simulation)
                let quadOffsets = array<vec2<f32>, 4>(
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );

                let quadIdx = vertexIndex % 4u;
                let offset = quadOffsets[quadIdx] * input.size;

                let pixelPos = input.position + offset;
                let clipX = (pixelPos.x / 300.0) - 1.0;
                let clipY = 1.0 - (pixelPos.y / 300.0);

                output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                output.color = input.color;
                output.opacity = input.opacity;
                output.pointCoord = quadOffsets[quadIdx];
                return output;
            }
        `;

        const pointFragmentShader = `
            struct FragmentInput {
                @location(0) color: vec3<f32>,
                @location(1) opacity: f32,
                @location(2) pointCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                // Circle mask
                let dist = length(input.pointCoord);
                if (dist > 1.0) {
                    discard;
                }
                // Soft edge
                let alpha = input.opacity * (1.0 - smoothstep(0.7, 1.0, dist));
                return vec4<f32>(input.color * alpha, alpha);
            }
        `;

        const pointVertexModule = this.device.createShaderModule({ code: pointVertexShader });
        const pointFragmentModule = this.device.createShaderModule({ code: pointFragmentShader });

        this.pointPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: pointVertexModule,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 24, // 2 floats position + 3 floats color + 1 float opacity + 1 float size (padded)
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32x3' },
                        { shaderLocation: 2, offset: 20, format: 'float32' },
                    ],
                }, {
                    arrayStride: 4,
                    attributes: [
                        { shaderLocation: 3, offset: 0, format: 'float32' },
                    ],
                }],
            },
            fragment: {
                module: pointFragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });

        // Fullscreen quad shader for persistence/fade effect
        const fadeVertexShader = `
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) texCoord: vec2<f32>,
            }

            @vertex
            fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var output: VertexOutput;
                // Fullscreen quad
                let positions = array<vec2<f32>, 4>(
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>(1.0, -1.0),
                    vec2<f32>(-1.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );
                let texCoords = array<vec2<f32>, 4>(
                    vec2<f32>(0.0, 1.0),
                    vec2<f32>(1.0, 1.0),
                    vec2<f32>(0.0, 0.0),
                    vec2<f32>(1.0, 0.0)
                );
                output.position = vec4<f32>(positions[vertexIndex], 0.0, 1.0);
                output.texCoord = texCoords[vertexIndex];
                return output;
            }
        `;

        const fadeFragmentShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;
            @group(0) @binding(2) var<uniform> fadeAmount: f32;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                let color = textureSample(tex, texSampler, input.texCoord);
                // Apply fade (persistence)
                return color * fadeAmount;
            }
        `;

        const fadeVertexModule = this.device.createShaderModule({ code: fadeVertexShader });
        const fadeFragmentModule = this.device.createShaderModule({ code: fadeFragmentShader });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            ],
        });

        const fadePipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout],
        });

        this.fadeAndCopyPipeline = this.device.createRenderPipeline({
            layout: fadePipelineLayout,
            vertex: {
                module: fadeVertexModule,
                entryPoint: 'main',
            },
            fragment: {
                module: fadeFragmentModule,
                entryPoint: 'main',
                targets: [{ format: this.format }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });

        // Create uniform buffer for fade amount
        this.fadeUniformBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    /**
     * Check if the renderer is initialized and ready
     * @returns {boolean}
     */
    isReady() {
        return this.initialized;
    }

    /**
     * Get the rendering context (null for WebGPU - use device instead)
     * @returns {null}
     */
    getContext() {
        return null;
    }

    /**
     * Clear the canvas with persistence effect
     * @param {number} persistence - Persistence level (0 = instant clear, 0.99 = long trails)
     * @param {number} canvasWidth - Canvas width in logical pixels
     * @param {number} canvasHeight - Canvas height in logical pixels
     */
    clearWithPersistence(persistence, canvasWidth, canvasHeight) {
        // Persistence is handled in renderTrace for WebGPU
        this.currentPersistence = persistence;
    }

    /**
     * Clear the canvas completely (power off)
     */
    clear() {
        if (!this.device || !this.context) return;

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 }, // #1a1f1a
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);

        // Also clear persistence texture
        if (this.persistenceTextureView) {
            const clearEncoder = this.device.createCommandEncoder();
            const clearPass = clearEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.persistenceTextureView,
                    clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            clearPass.end();
            this.device.queue.submit([clearEncoder.finish()]);
        }
    }

    /**
     * Render the oscilloscope trace
     * @param {Object} params - Rendering parameters
     */
    renderTrace(params) {
        const {
            points,
            speeds,
            velocityDimming,
            basePower,
            deltaTime,
            sampleRate,
            debugMode,
            timeSegment,
            dotOpacity,
            dotSizeVariation,
            sampleDotOpacity,
            canvasWidth,
            canvasHeight,
            calculatePhosphorExcitation,
            interpolatePoints
        } = params;

        if (!this.device || !this.initialized || points.length < 2) return;

        const persistence = this.currentPersistence || 0;

        // Calculate scale factor for resolution-independent rendering
        const canvasScale = Math.min(canvasWidth, canvasHeight);
        const LINE_WIDTH_RATIO = 0.00375;
        const GREEN_DOT_RATIO = 0.001875;
        const DEBUG_DOT_RATIO = 0.0025;
        const lineWidth = LINE_WIDTH_RATIO * canvasScale;

        const TIME_SEGMENT = timeSegment / 1000;
        const timePerPoint = 1 / sampleRate;

        const originalPoints = points;

        // Detect direction changes
        const directionChanges = new Map();
        for (let i = 1; i < originalPoints.length - 1; i++) {
            const inX = originalPoints[i].x - originalPoints[i - 1].x;
            const inY = originalPoints[i].y - originalPoints[i - 1].y;
            const outX = originalPoints[i + 1].x - originalPoints[i].x;
            const outY = originalPoints[i + 1].y - originalPoints[i].y;

            const inMag = Math.sqrt(inX * inX + inY * inY);
            const outMag = Math.sqrt(outX * outX + outY * outY);

            if (inMag > 0 && outMag > 0) {
                const dotProduct = inX * outX + inY * outY;
                const cosAngle = dotProduct / (inMag * outMag);
                const clampedCos = Math.max(-1, Math.min(1, cosAngle));
                const angleRad = Math.acos(clampedCos);
                const angleDeg = angleRad * (180 / Math.PI);
                const normalizedAngle = angleDeg / 180;
                const brightness = Math.pow(normalizedAngle, 1.5);

                if (brightness > 0.05) {
                    directionChanges.set(i, brightness);
                }
            }
        }

        // Apply interpolation
        const interpolated = interpolatePoints(points, speeds, TIME_SEGMENT, timePerPoint);
        let renderPoints = interpolated.points;
        let renderSpeeds = interpolated.speeds;
        const isInterpolated = interpolated.isInterpolated;

        // Build vertex data for line rendering (as thick line with triangle strip)
        const lineVertices = [];

        let segmentStartIdx = 0;
        let accumulatedTime = 0;

        for (let i = 1; i < renderPoints.length; i++) {
            accumulatedTime += TIME_SEGMENT;

            if (accumulatedTime >= TIME_SEGMENT || i === renderPoints.length - 1) {
                let totalDistance = 0;
                for (let j = segmentStartIdx + 1; j <= i && j < renderSpeeds.length; j++) {
                    totalDistance += renderSpeeds[j] || 0;
                }
                const avgSpeed = totalDistance / Math.max(1, i - segmentStartIdx);
                const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);

                // Generate thick line vertices (triangle strip)
                for (let j = segmentStartIdx; j <= i; j++) {
                    const curr = renderPoints[j];
                    const next = renderPoints[Math.min(j + 1, renderPoints.length - 1)];
                    const prev = renderPoints[Math.max(j - 1, 0)];

                    // Calculate perpendicular direction for line thickness
                    let dx = next.x - prev.x;
                    let dy = next.y - prev.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len > 0) {
                        dx /= len;
                        dy /= len;
                    }

                    // Perpendicular vector
                    const px = -dy * lineWidth * 0.5;
                    const py = dx * lineWidth * 0.5;

                    // Add two vertices (top and bottom of the thick line)
                    lineVertices.push(curr.x + px, curr.y + py, opacity);
                    lineVertices.push(curr.x - px, curr.y - py, opacity);
                }

                // Add degenerate triangles to separate segments
                if (i < renderPoints.length - 1) {
                    const last = renderPoints[i];
                    lineVertices.push(last.x, last.y, 0);
                    lineVertices.push(last.x, last.y, 0);
                }

                segmentStartIdx = i;
                accumulatedTime = 0;
            }
        }

        // Create GPU buffer for line vertices
        const lineVertexArray = new Float32Array(lineVertices);
        const lineVertexBuffer = this.device.createBuffer({
            size: lineVertexArray.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(lineVertexBuffer, 0, lineVertexArray);

        // Update fade uniform
        this.device.queue.writeBuffer(this.fadeUniformBuffer, 0, new Float32Array([persistence]));

        // Create bind group for persistence texture
        const persistenceBindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.persistenceTextureView },
                { binding: 2, resource: { buffer: this.fadeUniformBuffer } },
            ],
        });

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        // First pass: render faded previous frame to current texture
        const fadePass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        fadePass.setPipeline(this.fadeAndCopyPipeline);
        fadePass.setBindGroup(0, persistenceBindGroup);
        fadePass.draw(4);
        fadePass.end();

        // Second pass: render new trace on top
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                loadOp: 'load',
                storeOp: 'store',
            }],
        });

        // Draw lines
        if (lineVertices.length > 0) {
            renderPass.setPipeline(this.linePipeline);
            renderPass.setVertexBuffer(0, lineVertexBuffer);
            renderPass.draw(lineVertices.length / 3);
        }

        renderPass.end();

        // Copy current frame to persistence texture for next frame
        commandEncoder.copyTextureToTexture(
            { texture: this.context.getCurrentTexture() },
            { texture: this.persistenceTexture },
            [this.logicalWidth * this.devicePixelRatio, this.logicalHeight * this.devicePixelRatio]
        );

        this.device.queue.submit([commandEncoder.finish()]);

        // Clean up temporary buffer
        lineVertexBuffer.destroy();
    }

    /**
     * Draw debug info (renderer type and FPS) for debug mode
     * Uses a temporary 2D canvas for text rendering, then copies to WebGPU
     * @param {number} fps - Current FPS value
     */
    drawDebugInfo(fps) {
        if (!this.device || !this.initialized) return;

        // Create a temporary 2D canvas for text rendering
        const textCanvas = new OffscreenCanvas(100, 40);
        const ctx = textCanvas.getContext('2d');

        const rendererText = 'WebGPU';
        const fpsText = `${Math.round(fps)} FPS`;

        // Clear with transparent background
        ctx.clearRect(0, 0, 100, 40);

        // Draw semi-transparent background
        ctx.fillStyle = 'rgba(26, 26, 26, 0.7)';
        ctx.beginPath();
        ctx.roundRect(0, 0, 80, 36, 4);
        ctx.fill();

        // Draw renderer type
        ctx.font = 'bold 12px "Courier New", monospace';
        ctx.fillStyle = '#4CAF50';
        ctx.fillText(rendererText, 6, 14);

        // Draw FPS
        ctx.fillStyle = '#888888';
        ctx.fillText(fpsText, 6, 28);

        // Copy the text canvas to WebGPU texture
        const imageBitmap = textCanvas.transferToImageBitmap();

        // Create texture from the bitmap
        const textTexture = this.device.createTexture({
            size: [imageBitmap.width, imageBitmap.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING |
                   GPUTextureUsage.COPY_DST |
                   GPUTextureUsage.RENDER_ATTACHMENT,
        });

        this.device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: textTexture },
            [imageBitmap.width, imageBitmap.height]
        );

        // Now render this texture to the canvas at position (110, 110)
        // For simplicity, we'll use a blit/copy operation
        // This requires a separate render pass with a textured quad

        // Create a simple blit pipeline if not exists
        if (!this.textBlitPipeline) {
            this.createTextBlitPipeline();
        }

        if (this.textBlitPipeline) {
            const commandEncoder = this.device.createCommandEncoder();
            const textureView = this.context.getCurrentTexture().createView();

            // Create bind group for this text texture
            const textBindGroup = this.device.createBindGroup({
                layout: this.textBlitPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.sampler },
                    { binding: 1, resource: textTexture.createView() },
                ],
            });

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    loadOp: 'load',
                    storeOp: 'store',
                }],
            });

            renderPass.setPipeline(this.textBlitPipeline);
            renderPass.setBindGroup(0, textBindGroup);
            renderPass.draw(4);
            renderPass.end();

            this.device.queue.submit([commandEncoder.finish()]);
        }

        // Clean up
        textTexture.destroy();
        imageBitmap.close();
    }

    /**
     * Create pipeline for blitting text texture to screen
     */
    createTextBlitPipeline() {
        const vertexShader = `
            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) texCoord: vec2<f32>,
            }

            @vertex
            fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
                var output: VertexOutput;
                // Position the quad at top-left of visible area (110, 110) in 600x600 canvas
                // Visible area starts at 100,100 so 110,110 is 10px inside
                // Quad size: 80x36 pixels
                let positions = array<vec2<f32>, 4>(
                    vec2<f32>(110.0, 110.0),      // top-left
                    vec2<f32>(190.0, 110.0),      // top-right
                    vec2<f32>(110.0, 146.0),      // bottom-left
                    vec2<f32>(190.0, 146.0)       // bottom-right
                );
                let texCoords = array<vec2<f32>, 4>(
                    vec2<f32>(0.0, 0.0),
                    vec2<f32>(1.0, 0.0),
                    vec2<f32>(0.0, 1.0),
                    vec2<f32>(1.0, 1.0)
                );
                // Convert pixel coords to clip space (0-600 -> -1 to 1)
                let clipX = (positions[vertexIndex].x / 300.0) - 1.0;
                let clipY = 1.0 - (positions[vertexIndex].y / 300.0);
                output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                output.texCoord = texCoords[vertexIndex];
                return output;
            }
        `;

        const fragmentShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;

            @fragment
            fn main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
                return textureSample(tex, texSampler, texCoord);
            }
        `;

        const vertexModule = this.device.createShaderModule({ code: vertexShader });
        const fragmentModule = this.device.createShaderModule({ code: fragmentShader });

        this.textBlitPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: vertexModule,
                entryPoint: 'main',
            },
            fragment: {
                module: fragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        });
    }

    /**
     * Get renderer name for display
     * @returns {string}
     */
    getName() {
        return 'WebGPU';
    }

    /**
     * Destroy the renderer and release resources
     */
    destroy() {
        if (this.persistenceTexture) {
            this.persistenceTexture.destroy();
            this.persistenceTexture = null;
        }
        if (this.fadeUniformBuffer) {
            this.fadeUniformBuffer.destroy();
            this.fadeUniformBuffer = null;
        }
        this.device = null;
        this.context = null;
        this.canvas = null;
        this.initialized = false;
    }
}

/**
 * Check if WebGPU is supported in the current environment
 * @returns {boolean}
 */
export function isWebGPUSupported() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
