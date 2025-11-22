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

### Interpolation between sample points (IN PROGRESS)

Currently limited by sample rate (48kHz = ~0.021ms per point). Temporal resolution cannot go below this.

**Proposed solution:**
- Implement Catmull-Rom spline interpolation between sample points
- Generate virtual points for smoother curves
- Allow TIME_SEGMENT values smaller than sample rate
- Benefits:
  - Smoother rendering
  - Finer temporal resolution for segmentation
  - More accurate curve representation

**Implementation location:**
- `src/workers/physics-worker.js` - `renderTraceAlternative()` function
