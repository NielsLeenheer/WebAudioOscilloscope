/**
 * Wave Generator Utility
 * Handles wave generation for oscilloscope visualization
 */

/**
 * Calculate greatest common divisor using Euclidean algorithm
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Greatest common divisor
 */
export function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b !== 0) {
        const temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

/**
 * Generate a single wave value at a given point
 * @param {string} type - Wave type: 'sine', 'square', 'sawtooth', 'triangle'
 * @param {number} cycles - Number of cycles at this point
 * @param {number} phaseShift - Phase shift in degrees (0-360)
 * @param {boolean} invert - Whether to invert the wave
 * @returns {number} Wave value between -1 and 1
 */
export function generateWaveValue(type, cycles, phaseShift = 0, invert = false) {
    // Apply phase shift (convert degrees to cycles)
    const shiftedCycles = cycles + (phaseShift / 360);
    const phase = shiftedCycles * 2 * Math.PI;

    let value;
    switch(type) {
        case 'sine':
            value = Math.sin(phase);
            break;
        case 'square':
            value = Math.sin(phase) >= 0 ? 1 : -1;
            break;
        case 'sawtooth':
            const t = shiftedCycles - Math.floor(shiftedCycles);
            value = 2 * (t - 0.5);
            break;
        case 'triangle':
            const t2 = shiftedCycles - Math.floor(shiftedCycles);
            value = 4 * Math.abs(t2 - 0.5) - 1;
            break;
        default:
            value = 0;
    }

    // Apply inversion
    return invert ? -value : value;
}

/**
 * Generate a complete waveform for a single channel
 * @param {string} waveType - Wave type: 'sine', 'square', 'sawtooth', 'triangle'
 * @param {number} cycles - Number of cycles to generate
 * @param {number} samples - Number of sample points
 * @param {number} phaseShift - Phase shift in degrees (0-360)
 * @param {boolean} invert - Whether to invert the wave
 * @returns {Array<number>} Array of wave values
 */
export function generateWaveform(waveType, cycles, samples, phaseShift = 0, invert = false) {
    const points = [];
    for (let i = 0; i < samples; i++) {
        const t = i / samples;
        points.push(generateWaveValue(waveType, t * cycles, phaseShift, invert));
    }
    return points;
}

/**
 * Generate stereo waveform with independent left and right channels
 * @param {Object} config - Configuration object
 * @param {number} config.leftFrequency - Left channel frequency in Hz
 * @param {number} config.rightFrequency - Right channel frequency in Hz
 * @param {string} config.leftWave - Left channel wave type
 * @param {string} config.rightWave - Right channel wave type
 * @param {number} config.leftPhase - Left channel phase shift in degrees
 * @param {number} config.rightPhase - Right channel phase shift in degrees
 * @param {boolean} config.leftInvert - Whether to invert left channel
 * @param {boolean} config.rightInvert - Whether to invert right channel
 * @param {number} config.samples - Number of sample points (default: 1000)
 * @param {number} config.maxCycles - Maximum cycles to prevent huge patterns (default: 20)
 * @returns {Object} Object containing stereoPoints array and baseFrequency
 */
export function generateStereoWaveform({
    leftFrequency,
    rightFrequency,
    leftWave,
    rightWave,
    leftPhase = 0,
    rightPhase = 0,
    leftInvert = false,
    rightInvert = false,
    samples = 1000,
    maxCycles = 20
}) {
    // Find GCD of both frequencies to use as base frequency
    // This makes both channels independent - they're both relative to the same base
    const baseFrequency = gcd(leftFrequency, rightFrequency);

    // Calculate cycles for each channel independently
    let leftCycles = Math.round(leftFrequency / baseFrequency);
    let rightCycles = Math.round(rightFrequency / baseFrequency);

    // Limit maximum cycles to keep pattern reasonable
    if (leftCycles > maxCycles || rightCycles > maxCycles) {
        const scale = maxCycles / Math.max(leftCycles, rightCycles);
        leftCycles = Math.max(1, Math.round(leftCycles * scale));
        rightCycles = Math.max(1, Math.round(rightCycles * scale));
    }

    // Generate waveforms for each channel
    const leftPoints = generateWaveform(leftWave, leftCycles, samples, leftPhase, leftInvert);
    const rightPoints = generateWaveform(rightWave, rightCycles, samples, rightPhase, rightInvert);

    // Combine left and right into stereo points as [x, y] arrays
    const stereoPoints = leftPoints.map((leftVal, i) => [leftVal, rightPoints[i]]);

    return {
        stereoPoints,
        baseFrequency,
        leftCycles,
        rightCycles
    };
}

/**
 * Available wave types
 */
export const WAVE_TYPES = {
    SINE: 'sine',
    SQUARE: 'square',
    SAWTOOTH: 'sawtooth',
    TRIANGLE: 'triangle'
};
