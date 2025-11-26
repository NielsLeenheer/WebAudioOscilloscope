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
        // Render target texture (can be copied from, unlike swap chain)
        this.renderTargetTexture = null;
        this.renderTargetTextureView = null;
        this.copyPipeline = null;
        this.fadeAndCopyPipeline = null;
        this.blitPipeline = null;
        this.sampler = null;
        this.bindGroupLayout = null;
        this.persistenceBindGroup = null;

        // Bloom effect textures and pipelines
        this.bloomTexture = null;
        this.bloomTextureView = null;
        this.bloomBlurTexture = null;
        this.bloomBlurTextureView = null;
        this.bloomExtractPipeline = null;
        this.bloomBlurHPipeline = null;
        this.bloomBlurVPipeline = null;
        this.bloomCompositePipeline = null;
        this.bloomBindGroupLayout = null;
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
            console.error('WebGPU not supported in this context');
            return false;
        }

        try {
            console.log('WebGPU: Requesting adapter...');
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.error('WebGPU: Failed to get GPU adapter');
                return false;
            }

            console.log('WebGPU: Requesting device...');
            this.device = await adapter.requestDevice();

            console.log('WebGPU: Getting context...');
            this.context = canvas.getContext('webgpu');
            if (!this.context) {
                console.error('WebGPU: Failed to get webgpu context');
                return false;
            }

            this.format = navigator.gpu.getPreferredCanvasFormat();
            console.log('WebGPU: Canvas format:', this.format);

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

            // Create render target texture (can be copied from, unlike swap chain)
            this.renderTargetTexture = this.device.createTexture({
                size: [physicalWidth, physicalHeight],
                format: this.format,
                usage: GPUTextureUsage.TEXTURE_BINDING |
                       GPUTextureUsage.COPY_SRC |
                       GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.renderTargetTextureView = this.renderTargetTexture.createView();

            // Create bloom textures (half resolution for performance)
            const bloomWidth = Math.floor(physicalWidth / 2);
            const bloomHeight = Math.floor(physicalHeight / 2);
            this.bloomWidth = bloomWidth;
            this.bloomHeight = bloomHeight;

            this.bloomTexture = this.device.createTexture({
                size: [bloomWidth, bloomHeight],
                format: this.format,
                usage: GPUTextureUsage.TEXTURE_BINDING |
                       GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.bloomTextureView = this.bloomTexture.createView();

            this.bloomBlurTexture = this.device.createTexture({
                size: [bloomWidth, bloomHeight],
                format: this.format,
                usage: GPUTextureUsage.TEXTURE_BINDING |
                       GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.bloomBlurTextureView = this.bloomBlurTexture.createView();

            // Create sampler for texture sampling
            this.sampler = this.device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
            });

            // Create shaders and pipelines
            console.log('WebGPU: Creating pipelines...');
            await this.createPipelines();

            this.initialized = true;
            console.log('WebGPU: Initialization complete');
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
                // Boost brightness to compensate for lack of anti-aliasing vs Canvas 2D
                let boostedOpacity = min(input.opacity * 2.0, 1.0);
                return vec4<f32>(green * boostedOpacity, boostedOpacity);
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
                            srcFactor: 'one',  // Premultiplied alpha - color already multiplied
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

        // Create colored line pipeline for debug dots (red/blue)
        const coloredLineVertexShader = `
            struct VertexInput {
                @location(0) position: vec2<f32>,
                @location(1) color: vec3<f32>,
                @location(2) opacity: f32,
            }

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) color: vec3<f32>,
                @location(1) opacity: f32,
            }

            @vertex
            fn main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                // Convert from pixel coordinates to clip space [-1, 1]
                let clipX = (input.position.x / 300.0) - 1.0;
                let clipY = 1.0 - (input.position.y / 300.0);
                output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                output.color = input.color;
                output.opacity = input.opacity;
                return output;
            }
        `;

        const coloredLineFragmentShader = `
            struct FragmentInput {
                @location(0) color: vec3<f32>,
                @location(1) opacity: f32,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                return vec4<f32>(input.color * input.opacity, input.opacity);
            }
        `;

        const coloredLineVertexModule = this.device.createShaderModule({ code: coloredLineVertexShader });
        const coloredLineFragmentModule = this.device.createShaderModule({ code: coloredLineFragmentShader });

        this.coloredLinePipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: coloredLineVertexModule,
                entryPoint: 'main',
                buffers: [{
                    arrayStride: 24, // 2 floats position + 3 floats color + 1 float opacity
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' },
                        { shaderLocation: 1, offset: 8, format: 'float32x3' },
                        { shaderLocation: 2, offset: 20, format: 'float32' },
                    ],
                }],
            },
            fragment: {
                module: coloredLineFragmentModule,
                entryPoint: 'main',
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'one',  // Premultiplied alpha
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

        // Create simple blit pipeline (copy texture without fade)
        const blitFragmentShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                return textureSample(tex, texSampler, input.texCoord);
            }
        `;

        const blitFragmentModule = this.device.createShaderModule({ code: blitFragmentShader });

        this.blitBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            ],
        });

        const blitPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.blitBindGroupLayout],
        });

        this.blitPipeline = this.device.createRenderPipeline({
            layout: blitPipelineLayout,
            vertex: {
                module: fadeVertexModule, // Reuse the same fullscreen quad vertex shader
                entryPoint: 'main',
            },
            fragment: {
                module: blitFragmentModule,
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

        // ============================================
        // BLOOM EFFECT PIPELINES
        // ============================================

        // Bloom extract shader - extracts bright parts and downsamples
        const bloomExtractShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                let color = textureSample(tex, texSampler, input.texCoord);
                // Extract bright parts - threshold at 0.3 brightness
                let brightness = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
                let threshold = 0.3;
                let contribution = max(brightness - threshold, 0.0) / max(brightness, 0.001);
                return vec4<f32>(color.rgb * contribution * 1.5, color.a);
            }
        `;

        // Horizontal blur shader
        const bloomBlurHShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;
            @group(0) @binding(2) var<uniform> texelSize: vec2<f32>;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                // 9-tap Gaussian blur weights
                let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
                var result = textureSample(tex, texSampler, input.texCoord) * weights[0];

                for (var i = 1; i < 5; i++) {
                    let offset = vec2<f32>(texelSize.x * f32(i), 0.0);
                    result += textureSample(tex, texSampler, input.texCoord + offset) * weights[i];
                    result += textureSample(tex, texSampler, input.texCoord - offset) * weights[i];
                }
                return result;
            }
        `;

        // Vertical blur shader
        const bloomBlurVShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var tex: texture_2d<f32>;
            @group(0) @binding(2) var<uniform> texelSize: vec2<f32>;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                // 9-tap Gaussian blur weights
                let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
                var result = textureSample(tex, texSampler, input.texCoord) * weights[0];

                for (var i = 1; i < 5; i++) {
                    let offset = vec2<f32>(0.0, texelSize.y * f32(i));
                    result += textureSample(tex, texSampler, input.texCoord + offset) * weights[i];
                    result += textureSample(tex, texSampler, input.texCoord - offset) * weights[i];
                }
                return result;
            }
        `;

        // Bloom composite shader - adds bloom to original
        const bloomCompositeShader = `
            @group(0) @binding(0) var texSampler: sampler;
            @group(0) @binding(1) var originalTex: texture_2d<f32>;
            @group(0) @binding(2) var bloomTex: texture_2d<f32>;

            struct FragmentInput {
                @location(0) texCoord: vec2<f32>,
            }

            @fragment
            fn main(input: FragmentInput) -> @location(0) vec4<f32> {
                let original = textureSample(originalTex, texSampler, input.texCoord);
                let bloom = textureSample(bloomTex, texSampler, input.texCoord);
                // Add bloom with intensity
                return vec4<f32>(original.rgb + bloom.rgb * 0.8, original.a);
            }
        `;

        const bloomExtractModule = this.device.createShaderModule({ code: bloomExtractShader });
        const bloomBlurHModule = this.device.createShaderModule({ code: bloomBlurHShader });
        const bloomBlurVModule = this.device.createShaderModule({ code: bloomBlurVShader });
        const bloomCompositeModule = this.device.createShaderModule({ code: bloomCompositeShader });

        // Bloom bind group layout (sampler + texture)
        this.bloomBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            ],
        });

        // Bloom blur bind group layout (sampler + texture + texelSize uniform)
        this.bloomBlurBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            ],
        });

        // Bloom composite bind group layout (sampler + 2 textures)
        this.bloomCompositeBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            ],
        });

        // Create bloom pipelines
        this.bloomExtractPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bloomBindGroupLayout] }),
            vertex: { module: fadeVertexModule, entryPoint: 'main' },
            fragment: { module: bloomExtractModule, entryPoint: 'main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        this.bloomBlurHPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bloomBlurBindGroupLayout] }),
            vertex: { module: fadeVertexModule, entryPoint: 'main' },
            fragment: { module: bloomBlurHModule, entryPoint: 'main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        this.bloomBlurVPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bloomBlurBindGroupLayout] }),
            vertex: { module: fadeVertexModule, entryPoint: 'main' },
            fragment: { module: bloomBlurVModule, entryPoint: 'main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        this.bloomCompositePipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bloomCompositeBindGroupLayout] }),
            vertex: { module: fadeVertexModule, entryPoint: 'main' },
            fragment: { module: bloomCompositeModule, entryPoint: 'main', targets: [{ format: this.format }] },
            primitive: { topology: 'triangle-strip' },
        });

        // Create uniform buffer for bloom texel size
        this.bloomTexelSizeBuffer = this.device.createBuffer({
            size: 8, // vec2<f32>
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

        // Also clear persistence and render target textures
        const clearEncoder = this.device.createCommandEncoder();

        if (this.persistenceTextureView) {
            const clearPass = clearEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.persistenceTextureView,
                    clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            clearPass.end();
        }

        if (this.renderTargetTextureView) {
            const clearPass = clearEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.renderTargetTextureView,
                    clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            clearPass.end();
        }

        this.device.queue.submit([clearEncoder.finish()]);
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
            bloomEnabled,
            timeSegment,
            dotOpacity,
            dotSizeVariation,
            sampleDotOpacity,
            canvasWidth,
            canvasHeight,
            calculatePhosphorExcitation,
            interpolatePoints
        } = params;

        // Debug: Log on first call regardless of state
        if (!this._renderTraceCallLogged) {
            console.log('WebGPU renderTrace called:', {
                device: !!this.device,
                initialized: this.initialized,
                pointsLength: points?.length,
                canvasWidth,
                canvasHeight
            });
            this._renderTraceCallLogged = true;
        }

        if (!this.device || !this.initialized) {
            console.log('WebGPU renderTrace: not ready', { device: !!this.device, initialized: this.initialized });
            return;
        }
        if (points.length < 2) {
            console.log('WebGPU renderTrace: not enough points', points.length);
            return;
        }

        try {

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

        // Build dot vertices for direction changes (green dots)
        // Using triangle-list style: 6 vertices per quad (2 triangles)
        const dotVertices = [];
        const greenDotSize = GREEN_DOT_RATIO * canvasScale;

        for (const [idx, brightness] of directionChanges) {
            const point = originalPoints[idx];
            const opacity = basePower * brightness;
            const size = greenDotSize;

            // Two triangles forming a quad (6 vertices for triangle-strip compatibility)
            // Triangle 1: bottom-left, bottom-right, top-left
            // Triangle 2: top-left, bottom-right, top-right
            // For triangle strip: v0, v1, v2, v3 forms quad

            // Add degenerate to start new quad (duplicate first vertex)
            if (dotVertices.length > 0) {
                // Duplicate last vertex of previous quad
                const lastIdx = dotVertices.length - 3;
                dotVertices.push(dotVertices[lastIdx], dotVertices[lastIdx + 1], dotVertices[lastIdx + 2]);
                // Duplicate first vertex of this quad
                dotVertices.push(point.x - size, point.y - size, opacity);
            }

            // Quad vertices for triangle strip
            dotVertices.push(point.x - size, point.y - size, opacity);  // bottom-left
            dotVertices.push(point.x + size, point.y - size, opacity);  // bottom-right
            dotVertices.push(point.x - size, point.y + size, opacity);  // top-left
            dotVertices.push(point.x + size, point.y + size, opacity);  // top-right
        }

        // Build debug dot vertices (red for interpolated, blue for samples)
        // Format: position (2), color (3), opacity (1) = 6 floats per vertex
        const coloredDotVertices = [];
        const debugDotSize = DEBUG_DOT_RATIO * canvasScale;

        // Helper to add a colored quad
        const addColoredQuad = (x, y, size, r, g, b, opacity) => {
            // Add degenerate to start new quad (duplicate first vertex)
            if (coloredDotVertices.length > 0) {
                // Duplicate last vertex of previous quad
                const lastIdx = coloredDotVertices.length - 6;
                coloredDotVertices.push(
                    coloredDotVertices[lastIdx], coloredDotVertices[lastIdx + 1],
                    coloredDotVertices[lastIdx + 2], coloredDotVertices[lastIdx + 3],
                    coloredDotVertices[lastIdx + 4], coloredDotVertices[lastIdx + 5]
                );
                // Duplicate first vertex of this quad
                coloredDotVertices.push(x - size, y - size, r, g, b, opacity);
            }

            // Quad vertices for triangle strip
            coloredDotVertices.push(x - size, y - size, r, g, b, opacity);  // bottom-left
            coloredDotVertices.push(x + size, y - size, r, g, b, opacity);  // bottom-right
            coloredDotVertices.push(x - size, y + size, r, g, b, opacity);  // top-left
            coloredDotVertices.push(x + size, y + size, r, g, b, opacity);  // top-right
        };

        if (debugMode) {
            // Red dots for interpolated points (255, 0, 0)
            if (dotOpacity > 0) {
                for (let i = 0; i < renderPoints.length; i++) {
                    if (isInterpolated[i]) {
                        const point = renderPoints[i];
                        addColoredQuad(point.x, point.y, debugDotSize, 1.0, 0.0, 0.0, dotOpacity);
                    }
                }
            }

            // Blue dots for sample points (59, 130, 246) / 255
            if (sampleDotOpacity > 0) {
                for (let i = 0; i < originalPoints.length; i++) {
                    const point = originalPoints[i];
                    const brightness = directionChanges.get(i) || 0;
                    const sizeMultiplier = 1 + (brightness * (dotSizeVariation - 1));
                    const size = debugDotSize * sizeMultiplier;
                    addColoredQuad(point.x, point.y, size, 0.231, 0.510, 0.965, sampleDotOpacity);
                }
            }
        }

        // Create GPU buffers for vertices
        const lineVertexArray = new Float32Array(lineVertices);
        const dotVertexArray = new Float32Array(dotVertices);
        const coloredDotVertexArray = new Float32Array(coloredDotVertices);

        // Debug: Log vertex count on first frame
        if (!this._vertexDebugLogged && lineVertices.length > 0) {
            console.log('WebGPU vertices:', {
                floatCount: lineVertices.length,
                vertexCount: lineVertices.length / 3,
                byteSize: lineVertexArray.byteLength,
                dotCount: dotVertices.length / 3,
                coloredDotCount: coloredDotVertices.length / 6,
                sampleVertices: lineVertices.slice(0, 12) // First 4 vertices
            });
            this._vertexDebugLogged = true;
        }

        if (lineVertexArray.byteLength === 0 && dotVertexArray.byteLength === 0 && coloredDotVertexArray.byteLength === 0) {
            console.warn('WebGPU: No vertices to render');
            return;
        }

        let lineVertexBuffer = null;
        if (lineVertexArray.byteLength > 0) {
            lineVertexBuffer = this.device.createBuffer({
                size: lineVertexArray.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(lineVertexBuffer, 0, lineVertexArray);
        }

        let dotVertexBuffer = null;
        if (dotVertexArray.byteLength > 0) {
            dotVertexBuffer = this.device.createBuffer({
                size: dotVertexArray.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(dotVertexBuffer, 0, dotVertexArray);
        }

        let coloredDotVertexBuffer = null;
        if (coloredDotVertexArray.byteLength > 0) {
            coloredDotVertexBuffer = this.device.createBuffer({
                size: coloredDotVertexArray.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(coloredDotVertexBuffer, 0, coloredDotVertexArray);
        }

        // Update fade uniform
        this.device.queue.writeBuffer(this.fadeUniformBuffer, 0, new Float32Array([persistence]));

        // Create bind group for persistence texture (for fade pass)
        const persistenceBindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.persistenceTextureView },
                { binding: 2, resource: { buffer: this.fadeUniformBuffer } },
            ],
        });

        // Create bind group for render target (for blit to swap chain)
        const renderTargetBindGroup = this.device.createBindGroup({
            layout: this.blitBindGroupLayout,
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.renderTargetTextureView },
            ],
        });

        const commandEncoder = this.device.createCommandEncoder();
        const swapChainView = this.context.getCurrentTexture().createView();

        // First pass: render faded previous frame to RENDER TARGET (not swap chain)
        const fadePass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.renderTargetTextureView,
                clearValue: { r: 0.102, g: 0.122, b: 0.102, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store',
            }],
        });
        fadePass.setPipeline(this.fadeAndCopyPipeline);
        fadePass.setBindGroup(0, persistenceBindGroup);
        fadePass.draw(4);
        fadePass.end();

        // Second pass: render new trace on top of render target
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.renderTargetTextureView,
                loadOp: 'load',
                storeOp: 'store',
            }],
        });

        // Draw lines
        if (lineVertexBuffer && lineVertices.length > 0) {
            renderPass.setPipeline(this.linePipeline);
            renderPass.setVertexBuffer(0, lineVertexBuffer);
            renderPass.draw(lineVertices.length / 3);
        }

        // Draw direction change dots (green)
        if (dotVertexBuffer && dotVertices.length > 0) {
            renderPass.setPipeline(this.linePipeline);
            renderPass.setVertexBuffer(0, dotVertexBuffer);
            renderPass.draw(dotVertices.length / 3);
        }

        // Draw colored debug dots (red/blue)
        if (coloredDotVertexBuffer && coloredDotVertices.length > 0) {
            renderPass.setPipeline(this.coloredLinePipeline);
            renderPass.setVertexBuffer(0, coloredDotVertexBuffer);
            renderPass.draw(coloredDotVertices.length / 6);  // 6 floats per vertex
        }

        renderPass.end();

        // Third pass: copy render target to persistence texture for next frame
        commandEncoder.copyTextureToTexture(
            { texture: this.renderTargetTexture },
            { texture: this.persistenceTexture },
            [this.logicalWidth * this.devicePixelRatio, this.logicalHeight * this.devicePixelRatio]
        );

        // Apply bloom effect if enabled
        if (bloomEnabled && this.bloomExtractPipeline) {
            // Update texel size uniform for blur passes
            const texelSize = new Float32Array([1.0 / this.bloomWidth, 1.0 / this.bloomHeight]);
            this.device.queue.writeBuffer(this.bloomTexelSizeBuffer, 0, texelSize);

            // Bloom pass 1: Extract bright parts from render target to bloom texture
            const bloomExtractBindGroup = this.device.createBindGroup({
                layout: this.bloomBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.sampler },
                    { binding: 1, resource: this.renderTargetTextureView },
                ],
            });

            const extractPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.bloomTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            extractPass.setPipeline(this.bloomExtractPipeline);
            extractPass.setBindGroup(0, bloomExtractBindGroup);
            extractPass.draw(4);
            extractPass.end();

            // Bloom pass 2: Horizontal blur (bloom -> bloomBlur)
            const blurHBindGroup = this.device.createBindGroup({
                layout: this.bloomBlurBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.sampler },
                    { binding: 1, resource: this.bloomTextureView },
                    { binding: 2, resource: { buffer: this.bloomTexelSizeBuffer } },
                ],
            });

            const blurHPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.bloomBlurTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            blurHPass.setPipeline(this.bloomBlurHPipeline);
            blurHPass.setBindGroup(0, blurHBindGroup);
            blurHPass.draw(4);
            blurHPass.end();

            // Bloom pass 3: Vertical blur (bloomBlur -> bloom)
            const blurVBindGroup = this.device.createBindGroup({
                layout: this.bloomBlurBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.sampler },
                    { binding: 1, resource: this.bloomBlurTextureView },
                    { binding: 2, resource: { buffer: this.bloomTexelSizeBuffer } },
                ],
            });

            const blurVPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: this.bloomTextureView,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            blurVPass.setPipeline(this.bloomBlurVPipeline);
            blurVPass.setBindGroup(0, blurVBindGroup);
            blurVPass.draw(4);
            blurVPass.end();

            // Bloom pass 4: Composite (render target + bloom -> swap chain)
            const compositeBindGroup = this.device.createBindGroup({
                layout: this.bloomCompositeBindGroupLayout,
                entries: [
                    { binding: 0, resource: this.sampler },
                    { binding: 1, resource: this.renderTargetTextureView },
                    { binding: 2, resource: this.bloomTextureView },
                ],
            });

            const compositePass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: swapChainView,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            compositePass.setPipeline(this.bloomCompositePipeline);
            compositePass.setBindGroup(0, compositeBindGroup);
            compositePass.draw(4);
            compositePass.end();
        } else {
            // No bloom - simple blit render target to swap chain for display
            const blitPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: swapChainView,
                    loadOp: 'clear',
                    storeOp: 'store',
                }],
            });
            blitPass.setPipeline(this.blitPipeline);
            blitPass.setBindGroup(0, renderTargetBindGroup);
            blitPass.draw(4);
            blitPass.end();
        }

        this.device.queue.submit([commandEncoder.finish()]);

        // Clean up temporary buffers
        if (lineVertexBuffer) lineVertexBuffer.destroy();
        if (dotVertexBuffer) dotVertexBuffer.destroy();
        if (coloredDotVertexBuffer) coloredDotVertexBuffer.destroy();

        } catch (error) {
            console.error('WebGPU renderTrace error:', error);
        }
    }

    /**
     * Draw debug info (FPS) for debug mode using stick figure numbers
     * Uses line rendering for simplicity
     * @param {number} fps - Current FPS value
     */
    drawDebugInfo(fps) {
        if (!this.device || !this.initialized) return;

        // For WebGPU, we'll draw FPS using simple line segments
        // This is simpler than text rendering and matches Canvas2D approach
        const fpsValue = Math.round(fps);
        const digits = String(fpsValue).split('');

        // Position in top-left of visible area
        const startX = 112;
        const startY = 112;
        const digitWidth = 8;
        const digitHeight = 12;
        const spacing = 2;
        const lineWidth = 1.5;

        // Build line vertices for all digits
        const lineVertices = [];

        // 7-segment style digit definitions
        const segments = {
            0: [[0,0,1,0], [0,0,0,0.5], [1,0,1,0.5], [0,0.5,0,1], [1,0.5,1,1], [0,1,1,1]],
            1: [[1,0,1,0.5], [1,0.5,1,1]],
            2: [[0,0,1,0], [1,0,1,0.5], [0,0.5,1,0.5], [0,0.5,0,1], [0,1,1,1]],
            3: [[0,0,1,0], [1,0,1,0.5], [0,0.5,1,0.5], [1,0.5,1,1], [0,1,1,1]],
            4: [[0,0,0,0.5], [1,0,1,0.5], [0,0.5,1,0.5], [1,0.5,1,1]],
            5: [[0,0,1,0], [0,0,0,0.5], [0,0.5,1,0.5], [1,0.5,1,1], [0,1,1,1]],
            6: [[0,0,1,0], [0,0,0,0.5], [0,0.5,1,0.5], [0,0.5,0,1], [1,0.5,1,1], [0,1,1,1]],
            7: [[0,0,1,0], [1,0,1,0.5], [1,0.5,1,1]],
            8: [[0,0,1,0], [0,0,0,0.5], [1,0,1,0.5], [0,0.5,1,0.5], [0,0.5,0,1], [1,0.5,1,1], [0,1,1,1]],
            9: [[0,0,1,0], [0,0,0,0.5], [1,0,1,0.5], [0,0.5,1,0.5], [1,0.5,1,1], [0,1,1,1]],
        };

        let offsetX = startX;
        const opacity = 0.6;

        for (const digitChar of digits) {
            const digit = parseInt(digitChar);
            const segs = segments[digit] || [];

            for (const seg of segs) {
                const x1 = offsetX + seg[0] * digitWidth;
                const y1 = startY + seg[1] * digitHeight;
                const x2 = offsetX + seg[2] * digitWidth;
                const y2 = startY + seg[3] * digitHeight;

                // Create thick line as two triangles
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const px = (-dy / len) * lineWidth * 0.5;
                    const py = (dx / len) * lineWidth * 0.5;

                    // Triangle strip: 4 vertices
                    lineVertices.push(x1 + px, y1 + py, opacity);
                    lineVertices.push(x1 - px, y1 - py, opacity);
                    lineVertices.push(x2 + px, y2 + py, opacity);
                    lineVertices.push(x2 - px, y2 - py, opacity);

                    // Degenerate triangles to separate segments
                    lineVertices.push(x2 - px, y2 - py, 0);
                    lineVertices.push(x2 - px, y2 - py, 0);
                }
            }

            offsetX += digitWidth + spacing;
        }

        if (lineVertices.length === 0) return;

        try {
            const vertexArray = new Float32Array(lineVertices);
            const vertexBuffer = this.device.createBuffer({
                size: vertexArray.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(vertexBuffer, 0, vertexArray);

            const commandEncoder = this.device.createCommandEncoder();
            const textureView = this.context.getCurrentTexture().createView();

            const renderPass = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: textureView,
                    loadOp: 'load',
                    storeOp: 'store',
                }],
            });

            renderPass.setPipeline(this.linePipeline);
            renderPass.setVertexBuffer(0, vertexBuffer);
            renderPass.draw(lineVertices.length / 3);
            renderPass.end();

            this.device.queue.submit([commandEncoder.finish()]);
            vertexBuffer.destroy();
        } catch (error) {
            console.error('WebGPU drawDebugInfo error:', error);
        }
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
        if (this.renderTargetTexture) {
            this.renderTargetTexture.destroy();
            this.renderTargetTexture = null;
        }
        if (this.bloomTexture) {
            this.bloomTexture.destroy();
            this.bloomTexture = null;
        }
        if (this.bloomBlurTexture) {
            this.bloomBlurTexture.destroy();
            this.bloomBlurTexture = null;
        }
        if (this.fadeUniformBuffer) {
            this.fadeUniformBuffer.destroy();
            this.fadeUniformBuffer = null;
        }
        if (this.bloomTexelSizeBuffer) {
            this.bloomTexelSizeBuffer.destroy();
            this.bloomTexelSizeBuffer = null;
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
