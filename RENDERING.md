# Rendering Pipeline Documentation

This document explains how the oscilloscope rendering system works, focusing on the time-based segmentation approach with phosphor emulation.

## Architecture Overview

The rendering system is the final stage in a three-stage pipeline:

1. **Signal Processing** - Add noise to raw audio data
2. **Physics Simulation** - Calculate beam position using electromagnetic model
3. **Rendering** - Draw the beam path to canvas with phosphor effects

## Rendering Model

The oscilloscope uses a **time-based segmentation** approach with Catmull-Rom interpolation and direction change highlighting to create realistic CRT phosphor behavior.

### Overview

The rendering model (`renderTrace` in `src/workers/physics-worker.js`) creates realistic CRT oscilloscope visuals by:

1. Segmenting traces based on fixed time intervals
2. Applying Catmull-Rom interpolation for smooth curves
3. Calculating phosphor excitation based on beam velocity
4. Highlighting direction changes with green dots (simulating beam dwell time)
5. Providing debug visualizations for understanding signal characteristics

### Time-Based Segmentation Concept

Instead of segmenting based on spatial distance, the rendering model segments based on **configurable time intervals**:

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

### Four-Pass Rendering Algorithm

The rendering model uses a **four-pass algorithm**, executed on the **original sample points before interpolation** to ensure stability:

#### Pass 1: Direction Change Detection (Pre-Interpolation)

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

**Critical:** Detection happens BEFORE interpolation, so direction change positions and brightness remain stable regardless of TIME_SEGMENT setting.

#### Pass 2: Catmull-Rom Interpolation (Conditional)

If TIME_SEGMENT < timePerPoint (finer than sample rate):
1. Apply Catmull-Rom spline interpolation between all original points
2. Generate virtual points to achieve desired temporal resolution
3. Calculate number of interpolated points: `ceil(timePerPoint / TIME_SEGMENT)`
4. Interpolate both positions and speeds linearly
5. Update points array with interpolated data

Result: Smooth curves passing through all original sample points with sub-sample temporal resolution.

#### Pass 3: Time-Based Segment Rendering

Operates on interpolated points (or original points if no interpolation):

1. Start at first point, initialize time accumulator to 0
2. Iterate through points, accumulating time (`interpolatedTimePerPoint` per point)
3. When accumulated time reaches `TIME_SEGMENT`, finalize the segment:
   - Calculate average speed for the segment (total distance / number of points)
   - Calculate opacity using phosphor excitation model (faster = dimmer)
   - Draw **straight lines** connecting all points in the segment
4. Store segment endpoint for debug visualization
5. Reset accumulator and continue from current point

#### Pass 4: Direction Change Highlighting (Green Dots)

Always visible (not debug-only), shows realistic beam dwell time:

1. For each entry in `directionChanges` map (from Pass 1):
   - Use `originalPoints[idx]` for position (stable, not interpolated)
   - Opacity = `basePower × brightness`
2. Draw green dot at each direction change point:
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

### Debug Visualizations (Optional)

Only visible when Debug Mode is enabled in Physics dialog:

**Red Dots (segment endpoints):**
- Position: Interpolated segment endpoints from Pass 3
- Size: Constant radius (scaled with canvas)
- Color/Opacity: `rgba(255, 0, 0, ${dotOpacity})`
- Control: "Interpolation" slider (0.0-1.0, default 0.5)
- Purpose: Visualize time-based segmentation resolution
- Note: Count exceeds blue dots when TIME_SEGMENT < ~0.021ms (sub-sample)

**Blue Dots (sample points):**
- Position: `originalPoints` (actual physics-simulated samples)
- Size: Angle-based via "Angle" slider (1-10×, default 1.0):
  - Base size: Scaled with canvas
  - Size multiplier: `1 + brightness × (dotSizeVariation - 1)`
  - At 180° with slider=10: 10× larger than base
  - Scales with `directionChanges` brightness from Pass 1
- Color/Opacity: `rgba(59, 130, 246, ${sampleDotOpacity})`
- Control: "Sample Dots" slider (0.0-1.0, default 0.0)
- Purpose: Visualize actual sample rate and direction changes
- Stability: Positions and sizes remain constant regardless of TIME_SEGMENT

### Phosphor Excitation Calculation

The rendering model uses physics-based phosphor excitation to determine segment brightness:

```javascript
const avgSpeed = totalDistance / Math.max(1, segmentPointCount);
const opacity = calculatePhosphorExcitation(avgSpeed, velocityDimming, basePower, deltaTime);
```

**Key Characteristics:**
- **Faster = dimmer** (less dwell time, less phosphor excitation)
- **Slower = brighter** (more dwell time, more phosphor excitation)
- Uses the same P31 phosphor saturation model
- Each time segment has a single, uniform opacity based on average speed

This creates distinct visual "quanta" where each time segment has uniform brightness based on its average speed.

### Canvas Configuration

**Resolution Independence:**

All rendering primitives scale with canvas size:
- `LINE_WIDTH_RATIO`: 0.375% of canvas (1.5px on 400px canvas)
- `GREEN_DOT_RATIO`: 0.1875% of canvas (matches line width)
- `RED_DOT_RATIO`: 0.5% of canvas
- `BLUE_DOT_BASE_RATIO`: 0.25% of canvas

**Drawing Settings:**
```javascript
ctx.lineWidth = LINE_WIDTH_RATIO × canvasScale;
ctx.lineCap = 'round';   // Softens segment endpoints
ctx.lineJoin = 'round';
```

### Visual Characteristics

The time-based approach produces these visual effects:

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
   - Fast segments are **dimmer** (less dwell time)
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
   - Red dots: Time segment endpoints (constant size)
   - Blue dots: Sample points with angle-based sizing (1-10× multiplier)
   - Helps understand temporal resolution vs sample rate relationship

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

4. **Time Segment** (0.001 - 0.050ms, debug mode only)
   - Controls temporal resolution of segmentation
   - Default: 0.010ms (10 microseconds)
   - Finer values enable sub-sample interpolation

5. **Interpolation Opacity** (0.0 - 1.0, debug mode only)
   - Controls red dot visibility (segment endpoints)
   - Default: 0.5

6. **Sample Dots Opacity** (0.0 - 1.0, debug mode only)
   - Controls blue dot visibility (sample points)
   - Default: 0.0 (hidden)

7. **Angle Variation** (1.0 - 10.0, debug mode only)
   - Controls blue dot size scaling based on direction change angle
   - Default: 1.0 (uniform size)

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
// Physically realistic persistence model
// Higher beam intensity = longer visible trails
const intensityBoost = ((smoothedBasePower - 0.2) / 2.8) × 0.3;
const effectivePersistence = Math.min(0.99, persistence + intensityBoost);

ctx.fillStyle = `rgba(26, 31, 26, ${1 - effectivePersistence})`;
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
   - Execute four-pass rendering algorithm
   - Draw time-based segments with phosphor excitation
   - Highlight direction changes
   - Optionally draw debug visualizations

### 3. Worker Synchronization

Send ready message back to main thread when frame is complete.

## Color System

Currently uses green phosphor (P31):

```javascript
ctx.strokeStyle = `rgba(76, 175, 80, ${opacity})`;
ctx.fillStyle = `rgba(76, 175, 80, ${opacity})`;  // For green dots
```

Debug visualizations use different colors:
- Red: `rgba(255, 0, 0, ${dotOpacity})` for segment endpoints
- Blue: `rgba(59, 130, 246, ${sampleDotOpacity})` for sample points

## Performance Considerations

1. **OffscreenCanvas**
   - All rendering happens in a Web Worker
   - Canvas control transferred via `transferControlToOffscreen()`
   - Keeps main thread responsive

2. **Catmull-Rom Interpolation**
   - Only computed when TIME_SEGMENT < sample rate
   - Adds virtual points but creates smooth curves
   - Net performance depends on TIME_SEGMENT setting
   - Typically negligible impact with default settings

3. **Frame Skipping**
   - Worker busy flag prevents frame overlap
   - Drops frames if worker is still processing

4. **Rendering Passes**
   - Four-pass algorithm with optimizations
   - Direction detection runs once per frame
   - Debug visualizations add minimal overhead when disabled

5. **Resolution Independence**
   - All rendering primitives scale with canvas size
   - Single codebase works across all display resolutions
   - Maintains consistent visual appearance

## Default Configuration

The oscilloscope ships with these rendering defaults:

```javascript
timeSegment: 0.010            // 10 microseconds (0.010ms)
signalNoise: 0.003            // 0.3% noise
persistence: 0.100            // 10% persistence/afterglow
velocityDimming: 1.0          // Full physics-based dimming
debugMode: false              // Debug dots hidden
dotOpacity: 0.5               // Red dot opacity (when debug enabled)
dotSizeVariation: 1.0         // Uniform blue dot size (1× multiplier)
sampleDotOpacity: 0.0         // Blue dots hidden by default
```

## Implementation Details

### Code Location

- **Physics Worker:** `/src/workers/physics-worker.js`
  - `renderTrace()` - Main rendering function
  - `catmullRomInterpolate()` - Spline interpolation
  - `interpolatePoints()` - Point generation for sub-sampling
  - `calculatePhosphorExcitation()` - Brightness calculation

- **Display Component:** `/src/components/Oscilloscope/Display.svelte`
  - Rendering parameter definitions and defaults

- **Visualizer:** `/src/components/Oscilloscope/Visualiser.svelte`
  - Frame timing and worker communication

- **Physics Dialog:** `/src/components/Oscilloscope/PhysicsDialog.svelte`
  - Debug mode controls and parameter adjustment

### Web Worker Architecture

The rendering runs in a Web Worker (`physics-worker.js`) to:
- Keep heavy calculations off the main thread
- Maintain 60fps animation smoothness
- Use OffscreenCanvas for direct GPU rendering
- Prevent UI blocking during complex rendering

## Future Development

### Completed Enhancements

- ✅ User-adjustable time quantum (TIME_SEGMENT slider)
- ✅ Sub-sample interpolation (Catmull-Rom splines)
- ✅ Direction change detection and highlighting (green dots)
- ✅ Debug visualizations (red/blue dots)
- ✅ Angle-based brightness for realistic dwell time
- ✅ Resolution-independent rendering

### Potential Future Enhancements

- Gradient within segments: Interpolate opacity across points within each time segment
- Temporal patterns: Visual effects based on time-domain characteristics
- Configurable dot colors and styles
- HDR bloom effects for bright direction changes
- Different phosphor types (P7, P11, P15, etc.) with varying persistence
- Bloom/glow effects for overdriven signals
- Color variations based on velocity or signal amplitude
- Scanline effects for enhanced CRT realism
- Adjustable phosphor saturation curves
