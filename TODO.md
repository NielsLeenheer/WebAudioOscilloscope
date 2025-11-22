# TODO

## Generator Improvements

### Path-length-based sample point distribution

Currently, the SVG generator distributes sample points equally across all path segments, regardless of their length. This causes issues:

**Current behavior:**
- Each segment gets `numSamples / pathSegments.length` points
- Example: Smiley Face with 200 total points and 4 segments:
  - Large circle (mouth): 50 points
  - Small circle (left eye): 50 points
  - Small circle (right eye): 50 points
  - Curved line (smile): 50 points

**Problems:**
- Small shapes have very dense point spacing (spatially)
- Large shapes have sparse point spacing (spatially)
- When rendered with time-based segmentation, this creates:
  - Uneven visual dot density between shapes
  - Different drawing speeds (small shapes drawn faster than large ones)
  - Different perceived brightness (faster drawing = dimmer phosphor)

**Proposed solution:**
- Calculate the actual path length of each segment
- Distribute sample points proportionally based on path length
- This ensures:
  - Uniform spatial point density across all shapes
  - All shapes drawn at approximately the same speed
  - Consistent brightness across all shapes

**Implementation location:**
- `src/utils/svgSampler.js:214` - `extractPathPoints()` function
- Calculate length for each segment in `pathSegments`
- Distribute `numSamples` proportionally instead of equally

**References:**
- Current code: `Math.floor(numSamples / pathSegments.length)` (line 221)
- Need to implement: `Math.floor(numSamples * (segmentLength / totalPathLength))`

## Rendering Improvements

### Interpolation between sample points (COMPLETED)

~~Currently limited by sample rate (48kHz = ~0.021ms per point). Temporal resolution cannot go below this.~~

**Implemented solution:**
- ✅ Catmull-Rom spline interpolation between sample points
- ✅ Generate virtual points for smoother curves
- ✅ Allow TIME_SEGMENT values smaller than sample rate
- ✅ Benefits achieved:
  - Smoother rendering with curves that pass through all sample points
  - Finer temporal resolution for segmentation
  - More accurate curve representation
  - Red dots can now exceed blue dot count when TIME_SEGMENT < 0.021ms

**Implementation:**
- `src/workers/physics-worker.js` - Added `catmullRomInterpolate()` and `interpolatePoints()` functions
- Modified `renderTraceAlternative()` to apply interpolation when needed

### Canvas-size and resolution independence

Currently, physics and rendering are dependent on canvas pixel dimensions, causing inconsistent behavior across different display sizes.

**See:** INDEPENDENT-RENDERING.md for complete analysis

**Current problems:**
- Physics simulation operates in pixel space (canvas-dependent)
- Reference velocity = 300 px/s (only valid for specific canvas size)
- Rendering primitives use fixed pixel sizes (1.5px, 2px dots)
- Same signal produces different physics behavior on different canvas sizes

**Proposed solution:**
- Virtual coordinate system with normalized [-1, 1] units
- Two-stage transformation: Signal → Virtual Space → Pixel Space
- Resolution-independent physics parameters
- Scalable rendering primitives (percentages of canvas size)

**Implementation:**
- 5-phase progressive implementation strategy documented in INDEPENDENT-RENDERING.md
- Phase 1: Add conversion layer (backward compatible)
- Phases 2-5: Migrate to virtual units with testing and validation

**Benefits:**
- Portable configuration across display sizes
- Predictable physics behavior
- Responsive design support
- Future-proof for high-DPI displays
