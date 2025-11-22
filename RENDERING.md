# Rendering Pipeline Documentation

This document explains how the oscilloscope rendering system works, focusing on the phosphor emulation and beam rendering.

## Architecture Overview

The rendering system is the final stage in a three-stage pipeline:

1. **Signal Processing** - Add noise to raw audio data
2. **Physics Simulation** - Calculate beam position using spring or electromagnetic models
3. **Rendering** - Draw the beam path to canvas with phosphor effects

## Rendering Models

The system supports two rendering modes (selectable via the Physics dialog):

- **Alternative** (default) - Time-based segmentation with Catmull-Rom interpolation and direction change highlighting
- **Phosphor** - Traditional CRT phosphor emulation with Bézier curves

### Rendering Dispatcher

Located in `src/workers/physics-worker.js:518-525`, the dispatcher routes to the appropriate rendering function based on `renderingMode`:

```javascript
function renderTrace(ctx, points, speeds, velocityDimming, basePower, deltaTime, renderingMode) {
    if (renderingMode === 'alternative') {
        return renderTraceAlternative(ctx, points, speeds, velocityDimming, basePower, deltaTime);
    } else {
        return renderTracePhosphor(ctx, points, speeds, velocityDimming, basePower, deltaTime);
    }
}
```

## Phosphor Rendering Model

### Overview

The phosphor model (`renderTracePhosphor`, lines 429-503) emulates realistic CRT oscilloscope behavior by:

1. Drawing smooth Bézier curves between points
2. Calculating phosphor excitation based on beam velocity
3. Applying gradual opacity transitions
4. Modeling P31 phosphor saturation characteristics

### Key Components

#### 1. Smooth Curve Generation

The renderer uses quadratic Bézier curves to create smooth transitions between points:

- **First segment**: Straight line from first point to first midpoint
- **Middle segments**: Curves from midpoint to midpoint through actual points
- **Last segment**: Straight line from last midpoint to last point

This creates a continuous, smooth trace without sharp corners.

#### 2. Sub-segmentation

Each Bézier curve is split into multiple sub-segments (1-8) for gradual opacity transitions:

```javascript
const MAX_SUBSEGMENTS = 8;
const MIN_SUBSEGMENT_LENGTH = 4; // Minimum pixels per sub-segment
```

The number of sub-segments is calculated based on curve length to ensure smooth gradients without excessive overhead.

#### 3. Phosphor Excitation Calculation

The `calculatePhosphorExcitation` function (lines 55-119) models realistic phosphor behavior:

**Input Parameters:**
- `speed` - Beam velocity in pixels/frame
- `velocityDimming` - User control (0-1) for artistic adjustment
- `basePower` - Beam current/intensity
- `deltaTime` - Frame delta time in seconds

**Physical Model:**

The function implements a physics-based model of phosphor excitation:

```
Energy Deposition = Beam Current × Dwell Time
```

**Dwell Time Model (Recalibrated):**
- Reference velocity: **200 pixels/second** (lowered from 500 for earlier dimming)
- Below reference: Full phosphor excitation
- Above reference: Reduced excitation (inversely proportional to velocity)
- **Squared dimming curve**: `energyFactor = (200/velocity)²` for aggressive dimming
- Minimum threshold: **0.1%** (down from 2%) - fast movements almost invisible
- Matches real oscilloscope behavior where fast beam movements are barely visible

**Velocity Dimming Control:**

Allows artistic adjustment between full physics (`velocityDimming = 1.0`) and no dimming (`velocityDimming = 0.0`):

```javascript
depositedEnergy = beamCurrent * (velocityDimming * energyFactor + (1.0 - velocityDimming))
```

**P31 Phosphor Saturation:**

Real phosphors have a logarithmic response at high excitation levels. The model uses:

- Saturation knee: 0.6 (energy level where saturation starts)
- Saturation strength: 0.4 (compression aggressiveness)
- Logarithmic compression: `log(1 + energy × k) / log(1 + k)` where k=10

This prevents unrealistic brightness at low velocities while maintaining physical accuracy.

#### 4. Opacity Interpolation

Opacity transitions use an ease-in-quartic function (`easeInQuartic`, line 20):

```javascript
function easeInQuartic(t) {
    return t * t * t * t;
}
```

This mimics physics behavior where magnetic force takes time to overcome inertia, creating:
- Slow start with delay
- Rapid acceleration
- Smooth visual transitions

### Canvas Configuration

```javascript
ctx.lineWidth = 1.5;
ctx.lineCap = 'butt';    // Prevents overlapping at connection points
ctx.lineJoin = 'round';
```

The `'butt'` cap style is critical to avoid opacity artifacts at segment connections.

## Rendering Parameters

### User-Controllable Parameters

1. **Persistence** (0.0 - 0.95)
   - Controls phosphor afterglow/fade effect
   - Applied as canvas fade: `rgba(26, 31, 26, ${1 - persistence})`
   - 0 = instant fade, 0.95 = long trail

2. **Dimming** (0.0 - 1.0)
   - Labeled as "Velocity Dimming"
   - 0 = no velocity-based dimming (constant brightness)
   - 1 = full physics-based dimming

3. **Decay** (128 - 16384)
   - Maximum points to render
   - Controls phosphor decay/overdraw
   - Only affects XY mode (prevents buffer overload)

### Internal Parameters

- **Beam Power** (`beamPower`, 0.0 - 1.0)
  - Controlled via oscilloscope front panel
  - Affects opacity: `basePower = 0.2 + (beamPower × 1.4)` (max 3.0)

- **Focus** (`focus`, -1.0 to 1.0)
  - Applied as CSS blur filter: `blur(${Math.abs(focus) × 3}px)`
  - Not part of rendering pipeline, applied to canvas element

## Frame-by-Frame Rendering Process

### 1. Canvas Preparation

Clear canvas with persistence fade:

```javascript
ctx.fillStyle = `rgba(26, 31, 26, ${1 - persistence})`;
ctx.fillRect(0, 0, canvasWidth, canvasHeight);
```

### 2. For Each Mode (A, B, or AB)

a. **Beam Teleportation**
   - Snap beam to first target point
   - Prevents spurious lines from previous frame

b. **Physics Simulation**
   - Calculate smoothed beam positions
   - Generate points array and speeds array

c. **Rendering**
   - Iterate through points
   - Calculate Bézier curves
   - Split into sub-segments
   - Calculate phosphor excitation for each sub-segment
   - Draw with interpolated opacity

### 3. Worker Synchronization

Send ready message back to main thread when frame is complete.

## Color System

Currently hardcoded to green phosphor:

```javascript
ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
```

This represents P31 phosphor (green), commonly used in oscilloscopes.

## Alternative Rendering Model

The alternative model (`renderTraceAlternative`) implements **time-based segmentation with Catmull-Rom interpolation**, a fundamentally different approach from the phosphor model's spatial segmentation.

### Time-Based Segmentation Concept

Instead of segmenting based on spatial distance (curve length), the alternative model segments based on **configurable time intervals**:

- **Fast beam movement** → Points are spread out spatially within a time segment
- **Slow beam movement** → Points are clustered closer together within a time segment

This models the beam as having a constant "temporal quantum" - each drawn segment represents the same amount of time, regardless of how far the beam traveled.

### Catmull-Rom Spline Interpolation

When the time segment resolution is finer than the sample rate (TIME_SEGMENT < ~0.021ms at 48kHz), the system applies **Catmull-Rom spline interpolation** to generate smooth curves between sample points.

**Key Functions:**

```javascript
function catmullRomInterpolate(p0, p1, p2, p3, t) {
    // Interpolates between p1 and p2
    // p0 and p3 are control points for curve shape
    // t is interpolation parameter (0 to 1)
}

function interpolatePoints(points, speeds, targetTimePerPoint, actualTimePerPoint) {
    // Creates virtual points between samples
    // Only interpolates when targetTimePerPoint < actualTimePerPoint
}
```

**Benefits:**
- Allows temporal resolution finer than the sample rate
- Smooth curves that pass through all original sample points
- More accurate representation of continuous waveforms
- Enables sub-sample temporal segmentation

### Implementation Details

**User-Configurable Time Quantum:**
```javascript
const TIME_SEGMENT = timeSegment / 1000; // Default: 0.010ms, range: 0.001-0.050ms
```

The time segment is user-adjustable via the Physics dialog (debug mode):
- **Range:** 0.001ms to 0.050ms
- **Default:** 0.010ms (10 microseconds per segment)
- **Step:** 0.001ms (1 microsecond granularity)

**Time Calculation:**
```javascript
const timePerPoint = 1 / sampleRate;
```

Since each point corresponds to one audio sample from the physics simulation, the time between consecutive points is `1 / sampleRate` (e.g., ~20.8µs at 48kHz sample rate).

**Rendering Pipeline:**

The alternative model uses a **four-pass rendering algorithm**, executed on the **original sample points before interpolation** to ensure stability:

**First Pass - Direction Change Detection (Pre-Interpolation):**

This pass operates on `originalPoints` to detect direction changes based purely on the actual physics-simulated data:

1. For each point i in the original sample data (1 to length-1):
   - Calculate incoming velocity vector: from point[i-1] to point[i]
   - Calculate outgoing velocity vector: from point[i] to point[i+1]
2. Calculate the angle between velocity vectors:
   - Dot product: `inX × outX + inY × outY`
   - Magnitudes: `sqrt(inX² + inY²)` and `sqrt(outX² + outY²)`
   - Angle (degrees): `arccos(dotProduct / (mag1 × mag2)) × 180/π`
3. Map angle to brightness using power curve:
   - 0° = no brightness (smooth continuation)
   - 180° = maximum brightness (complete reversal)
   - Formula: `brightness = (angle/180)^1.5`
   - Power curve (^1.5) emphasizes larger angles
4. Store in `directionChanges` map if brightness > 0.05 (angles > ~30°)

**Critical:** Detection happens BEFORE interpolation, so blue dot positions and sizes remain stable regardless of TIME_SEGMENT setting.

**Second Pass - Catmull-Rom Interpolation (Conditional):**

If TIME_SEGMENT < timePerPoint (finer than sample rate):
1. Apply Catmull-Rom spline interpolation between all original points
2. Generate virtual points to achieve desired temporal resolution
3. Calculate number of interpolated points: `ceil(timePerPoint / TIME_SEGMENT)`
4. Interpolate both positions and speeds linearly
5. Update points array with interpolated data

Result: Smooth curves passing through all original sample points with sub-sample temporal resolution.

**Third Pass - Time-Based Segment Rendering:**

Operates on interpolated points (or original points if no interpolation):

1. Start at first point, initialize time accumulator to 0
2. Iterate through points, accumulating time (`interpolatedTimePerPoint` per point)
3. When accumulated time reaches `TIME_SEGMENT`, finalize the segment:
   - Calculate average speed for the segment (total distance / number of points)
   - Calculate opacity using phosphor excitation model (faster = dimmer)
   - Draw **straight lines** connecting all points in the segment
4. Store segment endpoint for debug visualization
5. Reset accumulator and continue from current point

**Fourth Pass - Direction Change Highlighting (Green Dots):**

Always visible (not debug-only), shows realistic beam dwell time:

1. For each entry in `directionChanges` map (from First Pass):
   - Use `originalPoints[idx]` for position (stable, not interpolated)
   - Opacity = `basePower × brightness`
2. Draw green dot (radius 1.5px) at each direction change point:
   ```javascript
   ctx.fillStyle = `rgba(76, 175, 80, ${opacity})`;
   ```
3. Brightness based on angle:
   - 180° direction change → maximum brightness (complete reversal)
   - Small angles (< 30°) → invisible (filtered by brightness > 0.05)
   - Medium angles → proportional brightness
4. Simulates realistic CRT behavior:
   - Sharper turns = longer dwell time = brighter phosphor excitation
   - Matches real oscilloscope where waveform peaks and reversals are brightest

**Fifth Pass - Debug Visualizations (Optional):**

Only visible when Debug Mode is enabled in Physics dialog:

- **Red Dots** (segment endpoints):
  - Position: Interpolated segment endpoints from Third Pass
  - Size: Constant 2px radius
  - Color/Opacity: `rgba(255, 0, 0, ${dotOpacity})`
  - Control: "Dot Opacity" slider (0.0-1.0, default 0.5)
  - Purpose: Visualize time-based segmentation resolution
  - Note: Count exceeds blue dots when TIME_SEGMENT < ~0.021ms (sub-sample)

- **Blue Dots** (sample points):
  - Position: `originalPoints` (actual physics-simulated samples)
  - Size: Angle-based via "Dot Size Var" slider (1-10×, default 1.0):
    - Base size: 1px radius
    - Size multiplier: `1 + brightness × (dotSizeVariation - 1)`
    - At 180° with slider=10: 10px radius
    - Scales with `directionChanges` brightness from First Pass
  - Color/Opacity: `rgba(59, 130, 246, ${sampleDotOpacity})`
  - Control: "Sample Dots" slider (0.0-1.0, default 0.0)
  - Purpose: Visualize actual sample rate and direction changes
  - Stability: Positions and sizes remain constant regardless of TIME_SEGMENT

**Opacity Calculation:**

The alternative model uses the same physics-based phosphor excitation model as the phosphor renderer:

```javascript
const avgSpeed = totalDistance / Math.max(1, i - segmentStartIdx);
const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);
```

**Key Characteristics:**
- **Faster = dimmer** (less dwell time, less phosphor excitation)
- **Slower = brighter** (more dwell time, more phosphor excitation)
- Uses the same P31 phosphor saturation model as the phosphor renderer
- Each time segment has a single, uniform opacity based on average speed

This creates distinct visual "quanta" where each time segment has uniform brightness based on its average speed, following the same physics as the phosphor model but applied to time-based segments instead of spatial curves.

### Visual Characteristics

The time-based approach produces different visual effects compared to phosphor rendering:

1. **Spatial Variation**
   - Fast movements create longer segments (more pixels per time quantum)
   - Slow movements create shorter segments (fewer pixels per time quantum)
   - Segment length varies with beam velocity
   - User-configurable temporal resolution (0.001-0.050ms, default 0.010ms)

2. **Catmull-Rom Interpolation**
   - Smooth curves when TIME_SEGMENT < sample rate (~0.021ms)
   - Curves pass through all original sample points
   - Virtual points generated between samples
   - Enables sub-sample temporal resolution

3. **Physics-Based Opacity**
   - Fast segments are **dimmer** (same as phosphor physics)
   - Slow segments are brighter (more dwell time)
   - Uses P31 phosphor excitation model with saturation curve
   - Each time segment has constant opacity (no gradients within segment)
   - Creates a "quantized" appearance with temporal segmentation

4. **Drawing Style**
   - Uses straight lines (`lineTo`) instead of Bézier curves
   - `lineCap: 'round'` softens segment endpoints
   - Simpler rendering path, potentially faster

5. **Direction Change Highlighting (Green Dots)**
   - Always visible - not a debug feature
   - Appears at ALL angle changes (not limited to low-speed reversals)
   - Brightness proportional to direction change angle:
     - 180° (complete reversal) = brightest
     - 30° or less = invisible (filtered out)
     - Power curve (^1.5) for natural falloff
   - Simulates realistic dwell time: sharper turns = longer dwell = brighter
   - Matches behavior observed on real oscilloscopes where peaks are brightest
   - Stable: Based on originalPoints, unaffected by interpolation

6. **Debug Visualizations** (optional, physics dialog)
   - Red dots: Time segment endpoints (constant 2px size)
   - Blue dots: Sample points with angle-based sizing (1-10× multiplier)
   - Helps understand temporal resolution vs sample rate relationship

### Comparison: Phosphor vs Alternative

| Aspect | Phosphor Model | Alternative Model |
|--------|----------------|-------------------|
| **Default** | No (legacy) | **Yes** (current default) |
| **Segmentation basis** | Spatial (curve length) | Temporal (user-configurable quanta) |
| **Temporal resolution** | Fixed by sample rate | 0.001-0.050ms (default 0.010ms) |
| **Interpolation** | None | Catmull-Rom splines (sub-sample) |
| **Segment length** | Variable by curve estimation | Variable by beam velocity |
| **Opacity variation** | Smooth gradients (ease-in-quartic) | Uniform per segment |
| **Opacity/speed curve** | Faster = dimmer (physics) | Faster = dimmer (same physics) |
| **Drawing primitive** | Quadratic Bézier curves | Straight lines (interpolated) |
| **Sub-segmentation** | Adaptive (1-8 sub-segments) | None (one segment = one draw call) |
| **Direction highlights** | None | Green dots (always visible) |
| **Debug visualizations** | None | Red dots (segments), Blue dots (samples) |
| **Visual style** | Smooth, organic | Smooth + quantized temporal |

### Use Cases

**Alternative Model (Default):**
Best for most use cases due to:
- More realistic beam dwell time visualization (green dots)
- User-configurable temporal resolution
- Sub-sample interpolation for smooth curves
- Debug tools for understanding signal characteristics
- Modern, accurate representation of CRT physics

**Phosphor Model (Legacy):**
May be preferred for:
- Traditional smooth organic appearance
- Simpler rendering without debug features
- Historical accuracy to original implementation
- Lower computational overhead (no interpolation)

## Performance Considerations

1. **OffscreenCanvas**
   - All rendering happens in a Web Worker
   - Canvas control transferred via `transferControlToOffscreen()`
   - Keeps main thread responsive

2. **Catmull-Rom Interpolation (Alternative Model)**
   - Only computed when TIME_SEGMENT < sample rate
   - Adds virtual points but reduces segment count
   - Net performance depends on TIME_SEGMENT setting
   - Typically negligible impact with default settings

3. **Frame Skipping**
   - Worker busy flag prevents frame overlap
   - Drops frames if worker is still processing

4. **Rendering Passes**
   - Alternative model: Up to 5 passes (1 pre-pass, 4 render passes)
   - Phosphor model: Single pass with sub-segmentation
   - Debug visualizations add minimal overhead when disabled

## Default Configuration

The oscilloscope ships with these rendering defaults:

```javascript
renderingMode: 'alternative'  // Alternative model is default
timeSegment: 0.010            // 10 microseconds (0.010ms)
signalNoise: 0.003            // 0.3% noise
persistence: 0.100            // 10% persistence/afterglow
velocityDimming: 1.0          // Full physics-based dimming
debugMode: false              // Debug dots hidden
dotSizeVariation: 1.0         // Uniform blue dot size (1× multiplier)
```

## Future Development

The dual-model architecture makes experimentation safe - both models remain functional and users can switch between them.

### Completed Enhancements (Alternative Model)

- ✅ User-adjustable time quantum (TIME_SEGMENT slider)
- ✅ Sub-sample interpolation (Catmull-Rom splines)
- ✅ Direction change detection and highlighting (green dots)
- ✅ Debug visualizations (red/blue dots)
- ✅ Angle-based brightness for realistic dwell time

### Potential Future Enhancements

**Alternative Model:**
- Gradient within segments: Interpolate opacity across points within each time segment
- Temporal patterns: Visual effects based on time-domain characteristics
- Configurable dot colors and styles
- HDR bloom effects for bright direction changes

**Both Models:**
- Different phosphor types (P7, P11, P15, etc.) with varying persistence
- Bloom/glow effects for overdriven signals
- HDR rendering techniques
- Color variations based on velocity or signal amplitude
- Scanline effects for enhanced CRT realism
- Adjustable phosphor saturation curves
