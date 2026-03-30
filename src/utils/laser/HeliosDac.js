/**
 * Helios Laser DAC WebUSB Driver
 * 
 * Based on helios_dac.js by Paul van Dinther (https://github.com/dinther/helios_dac-for-browser)
 * Original SDK by Gitle Mikkelsen (https://bitlasers.com/helios-laser-dac/)
 * 
 * The Helios DAC connects to show lasers via the standard ILDA interface
 * and is controlled via USB using the WebUSB API.
 */

// Constants
const HELIOS_SDK_VERSION = 6;
const HELIOS_MAX_POINTS = 0x1000; // 4096
const HELIOS_MAX_RATE = 0xFFFF;   // 65535 pps
const HELIOS_MIN_RATE = 7;

const HELIOS_SUCCESS = 1;
const HELIOS_FAIL = 0;
const HELIOS_ERROR = -1;

const HELIOS_FLAGS_DEFAULT = 0;
const HELIOS_FLAGS_START_IMMEDIATELY = (1 << 0);
const HELIOS_FLAGS_SINGLE_MODE = (1 << 1);

// USB properties
const HELIOS_VID = 0x1209;
const HELIOS_PID = 0xE500;

const MAX_GET_STATUS_RETRIES = 3;

const EP_BULK_OUT = 0x02;
const EP_BULK_IN = 0x81;
const EP_INT_OUT = 0x06;
const EP_INT_IN = 0x03;

// Commands
const HELIOS_STOP_COMMAND = 0x01;
const HELIOS_GET_STATUS_COMMAND = 0x03;
const HELIOS_GET_FIRMWARE_VERSION_COMMAND = 0x04;
const HELIOS_GET_NAME_COMMAND = 0x05;
const HELIOS_SET_NAME_COMMAND = 0x06;
const HELIOS_SET_SHUTTER_COMMAND = 0x02;

// Response codes
const HELIOS_STATUS_RESPONSE_CODE = 0x83;
const HELIOS_FIRMWARE_VERSION_RESPONSE_CODE = 0x84;
const HELIOS_GET_NAME_RESPONSE_CODE = 0x85;

/**
 * Represents a single laser point with position and color
 */
export class HeliosPoint {
    /**
     * @param {number} x - X coordinate (0-4095)
     * @param {number} y - Y coordinate (0-4095)
     * @param {number} r - Red intensity (0-255)
     * @param {number} g - Green intensity (0-255)
     * @param {number} b - Blue intensity (0-255)
     * @param {number} i - Overall intensity (0-255), defaults based on color
     */
    constructor(x = 0, y = 0, r = 0, g = 0, b = 0, i) {
        this.x = Math.max(0, Math.min(4095, Math.round(x)));
        this.y = Math.max(0, Math.min(4095, Math.round(y)));
        this.r = Math.max(0, Math.min(255, Math.round(r)));
        this.g = Math.max(0, Math.min(255, Math.round(g)));
        this.b = Math.max(0, Math.min(255, Math.round(b)));
        this.i = (i === undefined) ? ((r | g | b) === 0 ? 0 : 255) : Math.max(0, Math.min(255, Math.round(i)));
    }

    /**
     * Create a blanking point (laser off)
     */
    static blank(x, y) {
        return new HeliosPoint(x, y, 0, 0, 0, 0);
    }

    /**
     * Check if this is a blanking point
     */
    isBlank() {
        return this.i === 0 || (this.r === 0 && this.g === 0 && this.b === 0);
    }
}

/**
 * Check if WebUSB is supported
 */
export function isWebUSBSupported() {
    return 'usb' in navigator;
}

/**
 * Request connection to a Helios DAC device
 * Shows the browser's USB device picker
 */
export async function connectHeliosDevice() {
    console.log('[Helios] connectHeliosDevice() called');
    if (!isWebUSBSupported()) {
        throw new Error('WebUSB is not supported in this browser');
    }

    console.log('[Helios] Requesting USB device with VID:', HELIOS_VID.toString(16), 'PID:', HELIOS_PID.toString(16));
    const usbDevice = await navigator.usb.requestDevice({
        filters: [{ vendorId: HELIOS_VID, productId: HELIOS_PID }]
    });
    console.log('[Helios] Device selected:', usbDevice);

    if (usbDevice) {
        console.log('[Helios] Creating HeliosDevice wrapper');
        return new HeliosDevice(usbDevice);
    }
    console.log('[Helios] No device selected');
    return null;
}

/**
 * Get all previously authorized Helios devices
 */
export async function getHeliosDevices() {
    if (!isWebUSBSupported()) {
        return [];
    }

    const devices = await navigator.usb.getDevices();
    const heliosDevices = [];

    for (const usbDevice of devices) {
        if (usbDevice.vendorId === HELIOS_VID && usbDevice.productId === HELIOS_PID) {
            heliosDevices.push(new HeliosDevice(usbDevice));
        }
    }

    return heliosDevices;
}

/**
 * Helios DAC Device class
 */
export class HeliosDevice {
    #running = false;
    #firmwareVersion = 0;
    #name = '';
    #pps = 30000;
    #statusListeners = new Set();
    
    // Endpoint numbers (auto-detected during connect)
    #epBulkOut = EP_BULK_OUT;
    #epBulkIn = EP_BULK_IN;
    #epIntOut = EP_INT_OUT;
    #epIntIn = EP_INT_IN;

    constructor(usbDevice, pps = 30000) {
        this.usbDevice = usbDevice;
        this.frameReady = false;
        this.closed = true;
        this.#pps = pps;
        this.onFrame = null;
        this.onError = null;
        this.onStatusChange = null;
        this.frameBuffer = new Uint8Array(HELIOS_MAX_POINTS * 7 + 5);
    }

    #dataViewToString(dataView, offset = 1) {
        let o = Math.min(offset, dataView.byteLength);
        let result = '';
        for (let i = o; i < dataView.byteLength; i++) {
            if (dataView.getUint8(i) === 0) return result;
            result += String.fromCharCode(dataView.getUint8(i));
        }
        return result;
    }

    #emitStatus(status, data = {}) {
        if (this.onStatusChange) {
            this.onStatusChange({ status, ...data });
        }
    }

    /**
     * Connect to the device
     */
    async connect() {
        try {
            this.#emitStatus('connecting');
            console.log('[Helios] Opening USB device...');
            await this.usbDevice.open();
            console.log('[Helios] Device opened successfully');
            
            // Log device configuration info
            console.log('[Helios] Device configurations:', this.usbDevice.configurations);
            
            console.log('[Helios] Selecting configuration 1...');
            await this.usbDevice.selectConfiguration(1);
            console.log('[Helios] Configuration 1 selected');
            
            // Log available interfaces and endpoints
            const config = this.usbDevice.configuration;
            console.log('[Helios] Active configuration:', config);
            if (config) {
                for (const iface of config.interfaces) {
                    console.log(`[Helios] Interface ${iface.interfaceNumber}:`, iface);
                    for (const alt of iface.alternates) {
                        console.log(`[Helios]   Alternate ${alt.alternateSetting}:`, {
                            interfaceClass: alt.interfaceClass,
                            interfaceSubclass: alt.interfaceSubclass,
                            interfaceProtocol: alt.interfaceProtocol,
                            endpoints: alt.endpoints.map(ep => ({
                                endpointNumber: ep.endpointNumber,
                                address: '0x' + (ep.direction === 'in' ? (0x80 | ep.endpointNumber) : ep.endpointNumber).toString(16),
                                direction: ep.direction,
                                type: ep.type,
                                packetSize: ep.packetSize
                            }))
                        });
                    }
                }
            }
            
            console.log('[Helios] Claiming interface 0...');
            await this.usbDevice.claimInterface(0);
            console.log('[Helios] Interface 0 claimed');
            
            console.log('[Helios] Selecting alternate interface 0, setting 1...');
            await this.usbDevice.selectAlternateInterface(0, 1);
            console.log('[Helios] Alternate interface selected');
            
            // Auto-detect endpoints from the selected alternate interface
            this.#detectEndpoints();
            
            console.log('[Helios] Initializing device...');
            await this.init();
            console.log('[Helios] Device initialized - Name:', this.#name, 'Firmware:', this.#firmwareVersion);
            
            this.#emitStatus('connected', { 
                name: this.#name, 
                firmwareVersion: this.#firmwareVersion 
            });
            return HELIOS_SUCCESS;
        } catch (error) {
            console.error('[Helios] Connect failed:', error);
            this.#emitStatus('error', { error: error.message });
            if (this.onError) this.onError(error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Initialize device after connection
     */
    async init() {
        this.closed = false;
        
        // Try to get firmware version and name, but don't fail if they're not available
        // Some devices may not respond to these queries but still work for sending frames
        const fwResult = await this.#getFirmwareVersion();
        const nameResult = await this.#getName();
        
        console.log('[Helios] Init complete - firmware:', this.#firmwareVersion, 'name:', this.#name || '(unnamed)');
        
        // Even if we couldn't get firmware/name, the device may still work
        // Only the frame sending is essential
    }

    /**
     * Detect and configure endpoints from the device's interface
     */
    #detectEndpoints() {
        const config = this.usbDevice.configuration;
        if (!config) return;
        
        const iface = config.interfaces[0];
        if (!iface) return;
        
        // Use the currently selected alternate (should be 1)
        const alt = iface.alternate;
        if (!alt || !alt.endpoints) return;
        
        console.log('[Helios] Detecting endpoints from alternate', alt.alternateSetting);
        
        // Categorize endpoints by type and direction
        const bulkOut = [];
        const bulkIn = [];
        const intOut = [];
        const intIn = [];
        
        for (const ep of alt.endpoints) {
            const num = ep.endpointNumber;
            console.log(`[Helios] Found endpoint ${num}: ${ep.direction} ${ep.type} (packetSize: ${ep.packetSize})`);
            
            if (ep.type === 'bulk') {
                if (ep.direction === 'out') bulkOut.push(num);
                else bulkIn.push(num);
            } else if (ep.type === 'interrupt') {
                if (ep.direction === 'out') intOut.push(num);
                else intIn.push(num);
            }
        }
        
        // Assign endpoints (prefer first found, fallback to defaults)
        if (bulkOut.length > 0) this.#epBulkOut = bulkOut[0];
        if (bulkIn.length > 0) this.#epBulkIn = bulkIn[0];
        if (intOut.length > 0) this.#epIntOut = intOut[0];
        if (intIn.length > 0) this.#epIntIn = intIn[0];
        
        console.log('[Helios] Endpoint assignment:', {
            bulkOut: '0x' + this.#epBulkOut.toString(16),
            bulkIn: '0x' + this.#epBulkIn.toString(16),
            intOut: '0x' + this.#epIntOut.toString(16),
            intIn: '0x' + this.#epIntIn.toString(16)
        });
    }

    /**
     * Send a control command and receive response
     * Note: Always read at least 32 bytes (interrupt endpoint packet size) to avoid babble errors
     */
    async sendControl(buffer, receiveLength) {
        // Always request at least 32 bytes (interrupt endpoint packet size) to avoid babble errors
        const actualReceiveLength = Math.max(receiveLength, 32);
        console.log(`[Helios] sendControl: command=0x${buffer[0].toString(16)}, sending to EP ${this.#epIntOut}, expecting ${actualReceiveLength} bytes from EP ${this.#epIntIn}`);
        try {
            await this.usbDevice.transferOut(this.#epIntOut, buffer);
            console.log('[Helios] transferOut succeeded');
            
            // Small delay to give device time to process command
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const result = await this.usbDevice.transferIn(this.#epIntIn, actualReceiveLength);
            console.log('[Helios] transferIn result:', result, 'byteLength:', result.data?.byteLength);
            return result;
        } catch (error) {
            console.error('[Helios] Error in control transfer:', error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Send a frame of points to the laser
     * @param {HeliosPoint[]} points - Array of points (max 4096)
     * @param {number} pps - Points per second (7-65535)
     * @param {boolean} singleShot - Play frame only once
     * @param {boolean} interruptFrame - Start immediately without waiting for current frame
     */
    async sendFrame(points = null, pps = null, singleShot = false, interruptFrame = false) {
        if (this.closed) return HELIOS_ERROR;
        if (points == null || points.length === 0) return HELIOS_ERROR;
        if (points.length > HELIOS_MAX_POINTS) return HELIOS_ERROR;

        let bufPos = 0;
        pps = pps !== null ? Math.min(Math.max(HELIOS_MIN_RATE, pps), HELIOS_MAX_RATE) : this.#pps;
        
        let ppsActual = pps;
        let numOfPointsActual = points.length;

        // Work around for protocol bug: certain frame sizes cause issues
        if (((points.length - 45) % 64) === 0) {
            numOfPointsActual--;
            ppsActual = Math.round(pps * (numOfPointsActual / points.length));
        }

        let flags = HELIOS_FLAGS_DEFAULT;
        if (singleShot) flags |= HELIOS_FLAGS_SINGLE_MODE;
        if (interruptFrame) flags |= HELIOS_FLAGS_START_IMMEDIATELY;

        // Pack points into buffer (7 bytes per point)
        for (let i = 0; i < numOfPointsActual; i++) {
            const point = points[i];
            this.frameBuffer[bufPos++] = point.x >> 4;
            this.frameBuffer[bufPos++] = ((point.x & 0x0F) << 4) | (point.y >> 8);
            this.frameBuffer[bufPos++] = point.y & 0xFF;
            this.frameBuffer[bufPos++] = point.r;
            this.frameBuffer[bufPos++] = point.g;
            this.frameBuffer[bufPos++] = point.b;
            this.frameBuffer[bufPos++] = point.i;
        }

        // Append frame metadata
        this.frameBuffer[bufPos++] = ppsActual & 0xFF;
        this.frameBuffer[bufPos++] = ppsActual >> 8;
        this.frameBuffer[bufPos++] = numOfPointsActual & 0xFF;
        this.frameBuffer[bufPos++] = numOfPointsActual >> 8;
        this.frameBuffer[bufPos++] = flags;

        try {
            await this.usbDevice.transferOut(this.#epBulkOut, this.frameBuffer.slice(0, bufPos));
            return HELIOS_SUCCESS;
        } catch (error) {
            console.error('[Helios] Error sending frame:', error);
            if (this.onError) this.onError(error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Start the playback loop
     */
    async start() {
        if (this.closed) return HELIOS_ERROR;
        this.#emitStatus('playing');
        this.#playloop();
        return HELIOS_SUCCESS;
    }

    async #playloop() {
        this.#running = true;
        while (!this.closed && this.#running) {
            const ready = await this.getStatus();
            if (ready === HELIOS_SUCCESS) {
                if (this.onFrame) {
                    try {
                        await this.onFrame(this);
                    } catch (error) {
                        console.error('Error in frame callback:', error);
                        if (this.onError) this.onError(error);
                    }
                }
            }
        }
    }

    async #getFirmwareVersion() {
        if (this.closed) return HELIOS_ERROR;

        const buffer = new Uint8Array(2);
        buffer[0] = HELIOS_GET_FIRMWARE_VERSION_COMMAND;
        buffer[1] = 0;

        let retry = 3;
        console.log('[Helios] Getting firmware version...');
        try {
            while (retry > 0) {
                console.log(`[Helios] Firmware version attempt ${4 - retry}/3`);
                const result = await this.sendControl(buffer, 2);
                console.log('[Helios] Firmware response:', result);
                if (result && result.status === 'ok' && 
                    result.data && 
                    result.data.byteLength >= 2) {
                    console.log('[Helios] Response bytes:', result.data.getUint8(0), result.data.getUint8(1));
                    if (result.data.getUint8(0) === HELIOS_FIRMWARE_VERSION_RESPONSE_CODE) {
                        this.#firmwareVersion = result.data.getUint8(1);
                        console.log('[Helios] Firmware version:', this.#firmwareVersion);
                        return this.#firmwareVersion;
                    }
                }
                retry--;
            }
            console.log('[Helios] Failed to get firmware version after 3 attempts');
            return HELIOS_ERROR;
        } catch (error) {
            console.error('[Helios] Error getting firmware version:', error);
            return HELIOS_ERROR;
        }
    }

    async #getName() {
        if (this.closed) return HELIOS_ERROR;

        const buffer = new Uint8Array(2);
        buffer[0] = HELIOS_GET_NAME_COMMAND;
        buffer[1] = 0;

        let retry = 3;
        console.log('[Helios] Getting device name...');
        try {
            while (retry > 0) {
                console.log(`[Helios] Name attempt ${4 - retry}/3`);
                const result = await this.sendControl(buffer, 32);
                console.log('[Helios] Name response:', result);
                if (result && result.status === 'ok' && 
                    result.data && 
                    result.data.byteLength >= 3) {
                    console.log('[Helios] Response first byte:', result.data.getUint8(0));
                    if (result.data.getUint8(0) === HELIOS_GET_NAME_RESPONSE_CODE) {
                        this.#name = this.#dataViewToString(result.data, 1);
                        console.log('[Helios] Device name:', this.#name);
                        return this.#name;
                    }
                }
                retry--;
            }
            console.log('[Helios] Failed to get name after 3 attempts');
            return HELIOS_ERROR;
        } catch (error) {
            console.error('[Helios] Error getting name:', error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Get device status - returns HELIOS_SUCCESS (1) if ready for new frame
     * This is called frequently for frame pacing, so minimal logging
     */
    async getStatus() {
        if (this.closed) return HELIOS_ERROR;

        const buffer = new Uint8Array(2);
        buffer[0] = HELIOS_GET_STATUS_COMMAND;
        buffer[1] = 0;

        try {
            const result = await this.sendControlQuiet(buffer, 32);
            if (result && result.status === 'ok' && 
                result.data && 
                result.data.byteLength >= 2 &&
                result.data.getUint8(0) === HELIOS_STATUS_RESPONSE_CODE) {
                if (result.data.getUint8(1) === 1) {
                    return HELIOS_SUCCESS;
                }
            }
            return HELIOS_FAIL;
        } catch (error) {
            return HELIOS_ERROR;
        }
    }

    /**
     * Send control without logging (for frequent calls like getStatus)
     */
    async sendControlQuiet(buffer, receiveLength) {
        const actualReceiveLength = Math.max(receiveLength, 32);
        try {
            await this.usbDevice.transferOut(this.#epIntOut, buffer);
            await new Promise(resolve => setTimeout(resolve, 2));
            return await this.usbDevice.transferIn(this.#epIntIn, actualReceiveLength);
        } catch (error) {
            return HELIOS_ERROR;
        }
    }

    /**
     * Control the laser shutter
     * @param {number} level - 0 = closed, 1 = open
     */
    async setShutter(level) {
        if (this.closed) return HELIOS_ERROR;

        const buffer = new Uint8Array(2);
        buffer[0] = HELIOS_SET_SHUTTER_COMMAND;
        buffer[1] = level;

        try {
            const result = await this.sendControl(buffer, 2);
            return result.status === 'ok' ? HELIOS_SUCCESS : HELIOS_FAIL;
        } catch (error) {
            console.error('Error setting shutter:', error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Stop playback
     */
    async stop() {
        if (this.closed) return HELIOS_ERROR;

        this.#running = false;

        const buffer = new Uint8Array(2);
        buffer[0] = HELIOS_STOP_COMMAND;
        buffer[1] = 0;

        let retry = 3;
        try {
            while (retry > 0) {
                const result = await this.sendControl(buffer, 2);
                if (result.status === 'ok') {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    this.#emitStatus('stopped');
                    return HELIOS_SUCCESS;
                }
                retry--;
            }
            return HELIOS_ERROR;
        } catch (error) {
            console.error('Error stopping device:', error);
            return HELIOS_ERROR;
        }
    }

    /**
     * Close the device connection
     */
    async close() {
        if (this.closed) return;

        try {
            await this.stop();
            await new Promise(resolve => setTimeout(resolve, 100));
            await this.usbDevice.close();
            this.closed = true;
            this.#emitStatus('disconnected');
        } catch (error) {
            console.error('Error closing device:', error);
        }
    }

    // Property getters and setters
    get pps() {
        return this.#pps;
    }

    set pps(value) {
        this.#pps = Math.min(Math.max(HELIOS_MIN_RATE, value), HELIOS_MAX_RATE);
    }

    get name() {
        return this.#name;
    }

    get firmwareVersion() {
        return this.#firmwareVersion;
    }

    get manufacturerName() {
        return this.usbDevice?.manufacturerName || 'Helios';
    }

    get productName() {
        return this.usbDevice?.productName || 'Laser DAC';
    }

    get isConnected() {
        return !this.closed;
    }

    get isRunning() {
        return this.#running;
    }
}

// Export constants for external use
export const HELIOS = {
    MAX_POINTS: HELIOS_MAX_POINTS,
    MAX_RATE: HELIOS_MAX_RATE,
    MIN_RATE: HELIOS_MIN_RATE,
    SUCCESS: HELIOS_SUCCESS,
    FAIL: HELIOS_FAIL,
    ERROR: HELIOS_ERROR,
    VID: HELIOS_VID,
    PID: HELIOS_PID
};
