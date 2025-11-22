# Canvas-Independent Rendering Analysis

This document analyzes the current canvas-size and resolution dependencies in the oscilloscope rendering system and proposes solutions for achieving true resolution independence.

## Current Canvas Dependencies

### 1. Physics Simulation Units

The physics simulation currently operates in **pixel space**, making several parameters dependent on canvas size:

**Location:** `src/workers/physics-worker.js` - `simulatePhysics()` function

```javascript
// Current implementation uses pixel-based distances
const dx = targetX - beamX;
const dy = targetY - beamY;

// Force calculation in pixels
const force = forceMultiplier * distance;
```

**Issues:**
- Same signal on different canvas sizes produces different physics behavior
- Scaling the canvas changes the electromagnetic forces
- No consistent physical model across different display sizes

### 2. Velocity and Speed Measurements

**Location:** `src/workers/physics-worker.js` - Speed calculation

```javascript
// Speed calculated in pixels/frame
const speed = Math.sqrt(dx * dx + dy * dy);
```

**Dependencies:**
- Speed values are absolute pixel distances
- Phosphor excitation model uses pixel-based reference velocity
- Direction change detection uses pixel-based magnitude calculations

### 3. Phosphor Excitation Model

**Location:** `src/workers/physics-worker.js:55-119` - `calculatePhosphorExcitation()`

```javascript
const REFERENCE_VELOCITY = 300; // pixels/second

// Dwell time calculation based on pixel velocity
const energyFactor = REFERENCE_VELOCITY / velocity;
```

**Critical Issue:**
- Reference velocity is in **pixels/second**
- Same beam velocity appears different on different canvas sizes
- A 300px/s movement on 400px canvas ≠ 300px/s on 800px canvas in real-world terms

### 4. Canvas Coordinate System

**Location:** `src/workers/physics-worker.js` - Coordinate mapping

```javascript
const centerX = canvasWidth / 2;
const centerY = canvasHeight / 2;
const scale = Math.min(canvasWidth, canvasHeight) / 2;
```

**Current behavior:**
- Signal normalized to [-1, 1] range
- Scaled by canvas dimensions
- Physics operates on scaled pixel coordinates

### 5. Rendering Primitives

**Canvas-dependent rendering parameters:**

```javascript
ctx.lineWidth = 1.5;        // Pixels
ctx.arc(x, y, 1.5, ...);    // Radius in pixels (green dots)
ctx.arc(x, y, 2, ...);      // Radius in pixels (red dots)
```

**Issue:** Fixed pixel sizes don't scale with canvas resolution

### 6. Catmull-Rom Interpolation

**Location:** `src/workers/physics-worker.js` - `interpolatePoints()`

The interpolation generates virtual points based on time, but the resulting positions are still in pixel coordinates, making the smooth curves resolution-dependent.

## Problems with Current Approach

### 1. Inconsistent Physics Across Resolutions

**Scenario:** Same waveform on different canvas sizes

- **400×400 canvas:** Beam travels 100 pixels → Speed = 100 px/frame
- **800×800 canvas:** Beam travels 200 pixels → Speed = 200 px/frame
- **Result:** Same signal produces 2× speed difference, causing different dimming

### 2. Non-Portable Configurations

**Problem:** Physics parameters tuned for one canvas size break on another

- Coil Strength, Beam Inertia, Field Damping all tuned for specific pixel scale
- Reference velocity (300 px/s) only valid for specific canvas size
- Green dot brightness varies with canvas size

### 3. Temporal Resolution Mismatch

**Current TIME_SEGMENT:**
```javascript
const TIME_SEGMENT = 0.010; // 10 microseconds
```

Time is independent, but the resulting **pixel distance per segment** varies with canvas size, affecting visual appearance.

### 4. Debug Visualization Inconsistency

- Dot sizes (1.5px, 2px) are absolute
- Same direction change angle produces different dot sizes on different canvases
- Angle-based sizing doesn't account for canvas scale

## Proposed Solution: Normalized Coordinate System

### Core Concept

Introduce a **normalized virtual space** where:
- All coordinates are in range [-1, 1] (or similar consistent unit)
- Physics operates in virtual space units
- Conversion to pixel space happens only at rendering time

### 1. Virtual Space Physics

**Define standard units:**

```javascript
// Virtual space: [-1, 1] normalized coordinates
// Reference unit: 1.0 = full canvas radius

// Convert physics parameters to virtual units
const VIRTUAL_REFERENCE_VELOCITY = 0.5; // Virtual units per second
const VIRTUAL_DOT_SIZE = 0.005;         // 0.5% of canvas size
const VIRTUAL_LINE_WIDTH = 0.003;       // 0.3% of canvas size
```

**Benefits:**
- Same physics behavior regardless of canvas size
- Parameters portable across different displays
- Consistent physical model

### 2. Two-Stage Coordinate Transformation

**Stage 1: Signal → Virtual Space**
```javascript
// Already normalized: audio signal is [-1, 1]
const virtualX = signalX;  // No change needed
const virtualY = signalY;  // No change needed
```

**Stage 2: Virtual Space → Pixel Space** (at render time only)
```javascript
function virtualToPixel(virtualCoord, canvasSize) {
    const scale = canvasSize / 2;
    const center = canvasSize / 2;
    return center + (virtualCoord * scale);
}

function virtualDistanceToPixels(virtualDistance, canvasSize) {
    const scale = canvasSize / 2;
    return virtualDistance * scale;
}
```

### 3. Resolution-Independent Phosphor Model

**Revised phosphor excitation:**

```javascript
function calculatePhosphorExcitation(virtualSpeed, velocityDimming, basePower, deltaTime) {
    // Reference velocity in virtual units/second
    const VIRTUAL_REFERENCE_VELOCITY = 0.5; // Half canvas per second

    // Speed is already in virtual units
    const energyFactor = Math.min(1.0, VIRTUAL_REFERENCE_VELOCITY / virtualSpeed);

    // Rest of calculation unchanged...
}
```

**Key change:** Speed measured in **virtual units/second** instead of pixels/second

### 4. Scalable Rendering Primitives

**Define rendering sizes as percentages:**

```javascript
// Virtual sizes (as fraction of canvas)
const LINE_WIDTH_RATIO = 0.003;           // 0.3% of canvas
const GREEN_DOT_RATIO = 0.003;            // 0.3% of canvas
const RED_DOT_RATIO = 0.004;              // 0.4% of canvas
const BLUE_DOT_BASE_RATIO = 0.002;        // 0.2% of canvas

// Convert to pixels at render time
const canvasScale = Math.min(canvasWidth, canvasHeight);
ctx.lineWidth = LINE_WIDTH_RATIO * canvasScale;

const greenDotRadius = GREEN_DOT_RATIO * canvasScale;
ctx.arc(x, y, greenDotRadius, 0, Math.PI * 2);
```

### 5. Resolution-Independent Time Segmentation

**Current implementation already good:**
```javascript
const TIME_SEGMENT = 0.010; // Time is naturally resolution-independent
```

**Enhancement needed:** Ensure accumulated distance is in virtual units

```javascript
// Calculate speed in virtual units
const virtualDx = virtualPoints[i].x - virtualPoints[i-1].x;
const virtualDy = virtualPoints[i].y - virtualPoints[i-1].y;
const virtualSpeed = Math.sqrt(virtualDx * virtualDx + virtualDy * virtualDy) / timePerPoint;
```

## Implementation Strategy

### Phase 1: Add Virtual→Pixel Conversion Layer

**Minimal changes, backward compatible:**

1. Add conversion utilities:
   ```javascript
   const VirtualUnits = {
       toPixels: (virtualDist, canvasSize) => virtualDist * (canvasSize / 2),
       fromPixels: (pixelDist, canvasSize) => pixelDist / (canvasSize / 2),

       pointToPixels: (virtualPoint, canvasWidth, canvasHeight) => {
           const scaleX = canvasWidth / 2;
           const scaleY = canvasHeight / 2;
           return {
               x: canvasWidth/2 + virtualPoint.x * scaleX,
               y: canvasHeight/2 + virtualPoint.y * scaleY
           };
       }
   };
   ```

2. Apply conversions at render boundaries only
3. Keep physics simulation in current pixel units
4. Test for visual parity

### Phase 2: Convert Physics to Virtual Units

**Refactor physics simulation:**

1. Modify `simulatePhysics()` to operate in virtual space:
   ```javascript
   function simulatePhysics(virtualTargets, ...) {
       // All calculations in [-1, 1] space
       // No pixel conversions needed
   }
   ```

2. Update electromagnetic model:
   ```javascript
   // Virtual units: 1.0 = full canvas radius
   const virtualDistance = Math.sqrt(dx * dx + dy * dy);
   const virtualForce = forceMultiplier * virtualDistance;
   ```

3. Recalibrate physics parameters for virtual space:
   ```javascript
   // New defaults in virtual units
   coilStrength: 0.60      // Virtual units
   beamInertia: 0.10       // Virtual units
   fieldDamping: 0.30      // Virtual units
   ```

### Phase 3: Update Phosphor Excitation

**Convert reference velocity:**

```javascript
// Old: REFERENCE_VELOCITY = 300 pixels/second (canvas-dependent)
// New: VIRTUAL_REFERENCE_VELOCITY = 0.5 virtual units/second

function calculatePhosphorExcitation(virtualSpeed, ...) {
    const VIRTUAL_REFERENCE_VELOCITY = 0.5; // Half-canvas per second
    const energyFactor = VIRTUAL_REFERENCE_VELOCITY / virtualSpeed;
    // ... rest unchanged
}
```

**Benefit:** Same velocity value regardless of canvas size

### Phase 4: Scale Rendering Primitives

**Make all rendering sizes proportional:**

```javascript
// In renderTraceAlternative():
const canvasScale = Math.min(canvasWidth, canvasHeight);

// Scalable line width
ctx.lineWidth = 0.003 * canvasScale; // 0.3% of canvas

// Scalable dots
const greenDotSize = 0.003 * canvasScale;
const redDotSize = 0.004 * canvasScale;
const blueDotBaseSize = 0.002 * canvasScale;
const blueDotSize = blueDotBaseSize * (1 + brightness * (dotSizeVariation - 1));
```

### Phase 5: Add DPI Awareness (Optional)

**Handle high-DPI displays:**

```javascript
const dpr = window.devicePixelRatio || 1;

// Scale canvas backing store
canvas.width = canvasWidth * dpr;
canvas.height = canvasHeight * dpr;

// Scale rendering context
ctx.scale(dpr, dpr);

// Keep virtual units unchanged - they automatically scale correctly
```

## Testing Strategy

### 1. Visual Parity Test

**Setup:** Render same waveform at different resolutions

- 400×400 @ 1× DPI
- 800×800 @ 1× DPI
- 400×400 @ 2× DPI
- 1600×1600 @ 1× DPI

**Expected:** Identical visual appearance (proportional scaling only)

### 2. Physics Consistency Test

**Setup:** Measure green dot brightness for same waveform

- Clock face at various canvas sizes
- Record brightness values at hand reversal points
- Compare direction change detection

**Expected:** Same brightness values regardless of canvas size

### 3. Performance Test

**Setup:** Benchmark rendering performance

- Small canvas (200×200) vs large canvas (2000×2000)
- Measure frame times
- Profile virtual→pixel conversions

**Expected:** Conversion overhead < 5% of frame time

### 4. Parameter Portability Test

**Setup:** Save physics parameters, change canvas size

- Configure parameters on 400×400 canvas
- Export configuration
- Import on 800×800 canvas

**Expected:** Identical behavior and appearance

## Migration Path

### Backward Compatibility

**Option 1: Automatic Migration**
```javascript
// Detect old pixel-based configs
if (config.version < 2.0) {
    // Convert pixel-based parameters to virtual units
    config.referenceVelocity = config.referenceVelocity / (canvasSize / 2);
    config.version = 2.0;
}
```

**Option 2: Dual-Mode Support**
```javascript
// Support both coordinate systems temporarily
const useVirtualUnits = config.virtualUnits ?? true;

if (useVirtualUnits) {
    // New virtual space physics
} else {
    // Legacy pixel-based physics (deprecated)
}
```

### User Communication

**In Physics Dialog:**
```
⚠️ Canvas-Independent Mode Enabled
Physics parameters now work consistently across all canvas sizes.
Your previous settings have been automatically converted.
```

## Benefits Summary

### 1. Portability
- Same configuration works on any canvas size
- Export/import settings between different displays
- Consistent behavior on mobile vs desktop

### 2. Predictability
- Physics parameters have clear meaning
- Reference velocity = fraction of canvas per second
- Dot sizes = percentage of canvas

### 3. Scalability
- Support any canvas resolution
- Automatic DPI adaptation
- Future-proof for 4K/8K displays

### 4. Maintainability
- Single source of truth for physics
- No pixel-specific magic numbers
- Clearer code intent

### 5. User Experience
- Zoom in/out without changing behavior
- Responsive design friendly
- Accessibility improvements (larger displays work correctly)

## Potential Challenges

### 1. Parameter Recalibration

**Issue:** Existing tuned parameters need conversion

**Solution:** Provide migration tool with visual comparison
```javascript
function migratePhysicsParams(oldParams, oldCanvasSize) {
    const scale = oldCanvasSize / 2;
    return {
        coilStrength: oldParams.coilStrength,  // Dimensionless, no change
        beamInertia: oldParams.beamInertia,    // Dimensionless, no change
        fieldDamping: oldParams.fieldDamping,  // Dimensionless, no change
        referenceVelocity: oldParams.referenceVelocity / scale
    };
}
```

### 2. Performance Overhead

**Issue:** Additional conversions per frame

**Mitigation:**
- Convert once at physics stage, not per pixel
- Use lookup tables for common conversions
- Profile and optimize hot paths

### 3. Interpolation Complexity

**Issue:** Catmull-Rom interpolation currently uses pixel space

**Solution:** Perform interpolation in virtual space:
```javascript
// Interpolate in virtual coordinates
const interpolatedVirtual = catmullRomInterpolate(v0, v1, v2, v3, t);

// Convert to pixels only for rendering
const pixelPoint = virtualToPixel(interpolatedVirtual, canvasSize);
```

## Recommended Next Steps

1. **Create proof-of-concept branch**
   - Implement Phase 1 (conversion layer)
   - Test visual parity
   - Measure performance impact

2. **Validate with real content**
   - Test with clock generator
   - Test with various SVG shapes
   - Test with audio input

3. **Gather user feedback**
   - Beta test with different canvas sizes
   - Validate parameter portability
   - Check for edge cases

4. **Document conversion formulas**
   - Create reference guide
   - Update user documentation
   - Add migration guide

5. **Implement progressively**
   - Phase 1 first (non-breaking)
   - Validate each phase
   - Keep rollback capability

## Conclusion

Converting to a canvas-independent rendering system will:

- ✅ Eliminate resolution-dependent behavior
- ✅ Make physics parameters portable
- ✅ Improve code clarity and maintainability
- ✅ Enable responsive design
- ✅ Future-proof the implementation

The virtual coordinate system approach provides a clean separation between physics (resolution-independent) and rendering (resolution-specific), following the principle of least surprise and making the oscilloscope behave consistently across all display configurations.
