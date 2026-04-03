/**
 * Bluetooth Heart Rate connector
 *
 * Supports three levels of data:
 * 1. BPM only — any BLE HR device or Colmi ring
 * 2. BPM + RR-intervals — standard BLE HR devices (Polar H7, Garmin, etc.)
 * 3. Raw ECG stream — Polar H10 via proprietary PMD service (130 Hz, µV)
 */

// --- Standard BLE Heart Rate ---

const HR_SERVICE_UUID = 0x180d;
const HR_MEASUREMENT_UUID = 0x2a37;

// --- Polar H10 PMD (Measurement Data) ---

const PMD_SERVICE  = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
const PMD_CP_CHAR  = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8'; // control point (write + notify)
const PMD_DATA_CHAR = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8'; // data (notify)

// Start ECG: 130 Hz, 14-bit resolution
const PMD_START_ECG = new Uint8Array([0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0e, 0x00]);
const PMD_STOP_ECG  = new Uint8Array([0x03, 0x00]);

// --- Colmi Ring Protocol ---

const COLMI_UART_SERVICE  = '6e40fff0-b5a3-f393-e0a9-e50e24dcca9e';
const COLMI_RX_CHAR       = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const COLMI_TX_CHAR       = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const COLMI_CMD_START_REAL_TIME = 0x69;
const COLMI_CMD_STOP_REAL_TIME  = 0x6a;
const COLMI_READING_HEART_RATE  = 0x01;
const COLMI_ACTION_START        = 0x01;
const COLMI_ACTION_CONTINUE     = 0x03;
const COLMI_RESTART_INTERVAL_MS = 25000;

// --- Logging ---

const LOG_PREFIX = '[BLE-HR]';

function log(...args) {
    console.log(LOG_PREFIX, ...args);
}

function logHex(label, data) {
    const bytes = data instanceof DataView
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ');
    log(label, hex, `(${bytes.length} bytes)`);
}

function colmiMakePacket(command, subData = []) {
    const packet = new Uint8Array(16);
    packet[0] = command;
    for (let i = 0; i < subData.length && i < 14; i++) {
        packet[i + 1] = subData[i];
    }
    let sum = 0;
    for (let i = 0; i < 15; i++) sum += packet[i];
    packet[15] = sum & 0xff;
    return packet;
}

/**
 * Capabilities detected after connection.
 * @typedef {{ hr: boolean, rr: boolean, ecg: boolean }} BLECapabilities
 */

/**
 * Event-based heart rate connector with three data tiers.
 *
 * Callbacks:
 *   onHeartRate(bpm)                  — all devices
 *   onRRInterval(rrMs)               — standard BLE HR devices (H7 etc.)
 *   onECGData(samples: number[])     — Polar H10 only (µV at 130 Hz)
 *   onStatusChange(status)
 *   onDisconnect()
 */
export class BluetoothHeartRate {
    constructor() {
        this.device = null;
        this.server = null;
        this.deviceType = null; // 'standard' | 'colmi' | 'polar-ecg'
        this._colmiKeepAlive = null;
        this._colmiRestart = null;
        this._colmiRxChar = null;
        this._pmdCpChar = null;
        this._ecgStreaming = false;
        this._autoReconnect = false;
        this._reconnecting = false;

        /** @type {BLECapabilities} */
        this.capabilities = { hr: false, rr: false, ecg: false };

        /** @type {(bpm: number) => void} */
        this.onHeartRate = null;

        /** @type {(rrMs: number) => void} */
        this.onRRInterval = null;

        /** @type {(samples: number[]) => void} */
        this.onECGData = null;

        /** @type {() => void} */
        this.onDisconnect = null;

        /** @type {(status: string) => void} */
        this.onStatusChange = null;

        this._handleDisconnect = this._handleDisconnect.bind(this);
    }

    get connected() {
        return this.server?.connected ?? false;
    }

    get deviceName() {
        return this.device?.name ?? null;
    }

    // ---------------------------------------------------------------
    // Connect
    // ---------------------------------------------------------------

    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth is not supported in this browser');
        }

        this._setStatus('Scanning...');

        try {
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { services: [HR_SERVICE_UUID] },
                    { services: [COLMI_UART_SERVICE] },
                    { namePrefix: 'R0' },
                ],
                optionalServices: [HR_SERVICE_UUID, COLMI_UART_SERVICE, PMD_SERVICE],
            });
        } catch (err) {
            this._setStatus('Cancelled');
            throw err;
        }

        log('Device selected:', this.device.name || '(unnamed)', '| ID:', this.device.id);
        this.device.addEventListener('gattserverdisconnected', this._handleDisconnect);
        this._autoReconnect = true;

        await this._connectGATT();
    }

    async _connectGATT() {
        this._setStatus(this._reconnecting ? 'Reconnecting...' : 'Connecting...');

        this.server = await this.device.gatt.connect();
        log('GATT connected');

        // Reset capabilities
        this.capabilities = { hr: false, rr: false, ecg: false };

        // 1. Try standard HR service (works for H7, H10, Garmin, Decathlon, etc.)
        let hasStandardHR = false;
        try {
            log('Trying standard HR service (0x180D)...');
            const hrService = await this.server.getPrimaryService(HR_SERVICE_UUID);
            log('Found standard HR service');
            hasStandardHR = true;
            await this._startStandardHR(hrService);
        } catch (err) {
            log('Standard HR service not found:', err.message);
        }

        // 2. Detect Polar H10 by device name — don't probe PMD service during
        //    connect as even getPrimaryService() can crash the H10's GATT connection.
        //    ECG streaming is started on demand via startECG().
        if (hasStandardHR && this.device.name?.startsWith('Polar H10')) {
            log('Polar H10 detected by name — ECG available on demand via startECG()');
            this.capabilities.ecg = true;
        }

        // 3. Fallback to Colmi if no standard HR
        if (!hasStandardHR) {
            try {
                log('Trying Colmi UART service...');
                const uartService = await this.server.getPrimaryService(COLMI_UART_SERVICE);
                log('Found Colmi UART service');
                this.deviceType = 'colmi';
                await this._startColmiHR(uartService);
            } catch (err2) {
                log('Colmi UART service not found:', err2.message);
                this.disconnect();
                throw new Error('Device does not support heart rate monitoring');
            }
        }

        this._reconnecting = false;
        log('Setup complete, device type:', this.deviceType, 'capabilities:', this.capabilities);
        this._setStatus(`Connected: ${this.device.name || 'Unknown device'}`);
    }

    // ---------------------------------------------------------------
    // Disconnect
    // ---------------------------------------------------------------

    disconnect() {
        this._autoReconnect = false;
        this._reconnecting = false;
        this._stopColmiTimers();

        if (this.device) {
            this.device.removeEventListener('gattserverdisconnected', this._handleDisconnect);
        }

        // Stop Colmi
        if (this._colmiRxChar && this.connected) {
            try {
                this._colmiRxChar.writeValueWithoutResponse(
                    colmiMakePacket(COLMI_CMD_STOP_REAL_TIME, [COLMI_READING_HEART_RATE])
                );
            } catch { /* best effort */ }
        }

        // Stop Polar ECG
        if (this._pmdCpChar && this._ecgStreaming && this.connected) {
            try {
                this._pmdCpChar.writeValue(PMD_STOP_ECG);
            } catch { /* best effort */ }
        }

        if (this.server?.connected) {
            this.device.gatt.disconnect();
        }

        this.device = null;
        this.server = null;
        this.deviceType = null;
        this._colmiRxChar = null;
        this._pmdCpChar = null;
        this._ecgStreaming = false;
        this.capabilities = { hr: false, rr: false, ecg: false };
        this._setStatus('Disconnected');
    }

    // ---------------------------------------------------------------
    // Standard BLE Heart Rate (H7, H10, Garmin, Decathlon, etc.)
    // Parses BPM, sensor contact, energy expended, and RR-intervals
    // ---------------------------------------------------------------

    async _startStandardHR(service) {
        const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID);
        log('Standard HR: got measurement characteristic, starting notifications...');
        await characteristic.startNotifications();
        log('Standard HR: notifications started, waiting for data...');

        this.capabilities.hr = true;

        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const dv = event.target.value;
            logHex('Standard HR notification:', dv);

            const flags = dv.getUint8(0);
            let offset = 1;

            // Heart rate value (8-bit or 16-bit)
            const hrIs16Bit = flags & 0x01;
            const bpm = hrIs16Bit ? dv.getUint16(offset, true) : dv.getUint8(offset);
            offset += hrIs16Bit ? 2 : 1;

            // Sensor contact (bits 1-2)
            const contactSupported = (flags >> 1) & 0x01;
            const contactDetected  = (flags >> 2) & 0x01;
            if (contactSupported) {
                log('Standard HR: contact', contactDetected ? 'detected' : 'NOT detected');
            }

            // Energy expended (bit 3)
            if (flags & 0x08) {
                const energy = dv.getUint16(offset, true);
                offset += 2;
                log('Standard HR: energy expended', energy, 'kJ');
            }

            // RR-intervals (bit 4) — one or more 16-bit values in 1/1024 sec
            if (flags & 0x10) {
                this.capabilities.rr = true;
                while (offset + 1 < dv.byteLength) {
                    const rrRaw = dv.getUint16(offset, true);
                    offset += 2;
                    const rrMs = (rrRaw / 1024) * 1000;
                    log('Standard HR: RR-interval', rrMs.toFixed(1), 'ms');
                    if (this.onRRInterval) {
                        this.onRRInterval(rrMs);
                    }
                }
            }

            log('Standard HR: bpm=' + bpm, 'flags=0x' + flags.toString(16));
            if (bpm > 0 && this.onHeartRate) {
                this.onHeartRate(bpm);
            }
        });
    }

    // ---------------------------------------------------------------
    // Polar H10 raw ECG via PMD service (130 Hz, µV samples)
    // ---------------------------------------------------------------

    /**
     * Start raw ECG streaming on a Polar H10.
     * Call this after connect() — only works if capabilities.ecg is true.
     */
    async startECG() {
        if (!this.capabilities.ecg) {
            throw new Error('ECG not available on this device');
        }
        if (this._ecgStreaming) {
            log('Polar ECG: already streaming');
            return;
        }
        log('Polar ECG: getting PMD service...');
        const pmdService = await this.server.getPrimaryService(PMD_SERVICE);
        log('Polar ECG: starting stream...');
        await this._startPolarECG(pmdService);
        this.deviceType = 'polar-ecg';
        log('Polar ECG: streaming active');
    }

    async _startPolarECG(service) {
        // Get characteristics one at a time with delays —
        // the H10 drops the connection if GATT operations are too rapid
        log('Polar ECG: getting control point characteristic...');
        this._pmdCpChar = await service.getCharacteristic(PMD_CP_CHAR);
        log('Polar ECG: got CP characteristic');

        await new Promise(r => setTimeout(r, 250));

        log('Polar ECG: getting data characteristic...');
        const dataChar = await service.getCharacteristic(PMD_DATA_CHAR);
        log('Polar ECG: got data characteristic');

        await new Promise(r => setTimeout(r, 250));

        // Subscribe to control point notifications first (for responses)
        log('Polar ECG: subscribing to CP notifications...');
        await this._pmdCpChar.startNotifications();
        this._pmdCpChar.addEventListener('characteristicvaluechanged', (event) => {
            const dv = event.target.value;
            logHex('Polar PMD CP response:', dv);
            if (dv.byteLength >= 4) {
                const responseCode = dv.getUint8(0);
                const opCode = dv.getUint8(1);
                const measType = dv.getUint8(2);
                const status = dv.getUint8(3);
                log(`Polar PMD CP: response=0x${responseCode.toString(16)} op=0x${opCode.toString(16)} type=${measType} status=${status}`);
                if (status !== 0) {
                    log('Polar PMD CP: command failed, status:', status);
                }
            }
        });

        await new Promise(r => setTimeout(r, 250));

        // Subscribe to ECG data notifications
        log('Polar ECG: subscribing to data notifications...');
        await dataChar.startNotifications();
        dataChar.addEventListener('characteristicvaluechanged', (event) => {
            this._handlePolarECGData(event.target.value);
        });

        await new Promise(r => setTimeout(r, 250));

        // Send start ECG command
        log('Polar ECG: sending start ECG command...');
        logHex('Polar ECG: start packet:', PMD_START_ECG);
        await this._pmdCpChar.writeValue(PMD_START_ECG);
        this._ecgStreaming = true;
        log('Polar ECG: streaming started (130 Hz)');
    }

    _handlePolarECGData(dataView) {
        if (dataView.byteLength < 10) return;

        const measType = dataView.getUint8(0);
        if (measType !== 0x00) {
            log('Polar ECG: unexpected measurement type:', measType);
            return;
        }

        // Bytes 1-8: timestamp (uint64 nanoseconds) — skip for now
        // Byte 9: frame type (lower 7 bits)
        const frameType = dataView.getUint8(9) & 0x7f;

        if (frameType !== 0) {
            log('Polar ECG: unexpected frame type:', frameType);
            return;
        }

        // Parse 3-byte signed samples (microvolts)
        const samples = [];
        for (let i = 10; i + 2 < dataView.byteLength; i += 3) {
            let sample = dataView.getUint8(i)
                       | (dataView.getUint8(i + 1) << 8)
                       | (dataView.getUint8(i + 2) << 16);
            // Sign extension for 24-bit
            if (sample & 0x800000) sample -= 0x1000000;
            samples.push(sample);
        }

        if (samples.length > 0 && this.onECGData) {
            this.onECGData(samples);
        }
    }

    // ---------------------------------------------------------------
    // Colmi Ring
    // ---------------------------------------------------------------

    async _startColmiHR(service) {
        log('Colmi: getting TX characteristic (notifications)...');
        const txChar = await service.getCharacteristic(COLMI_TX_CHAR);
        log('Colmi: starting notifications on TX...');
        await txChar.startNotifications();
        log('Colmi: notifications started');
        txChar.addEventListener('characteristicvaluechanged', (event) => {
            this._handleColmiNotification(event.target.value);
        });

        log('Colmi: getting RX characteristic (write)...');
        this._colmiRxChar = await service.getCharacteristic(COLMI_RX_CHAR);
        log('Colmi: got RX characteristic');

        this.capabilities.hr = true;

        await this._colmiSendStart();

        let keepAliveCount = 0;
        this._colmiKeepAlive = setInterval(async () => {
            if (!this.connected) {
                this._stopColmiTimers();
                return;
            }
            try {
                keepAliveCount++;
                const continuePacket = colmiMakePacket(COLMI_CMD_START_REAL_TIME, [
                    COLMI_READING_HEART_RATE,
                    COLMI_ACTION_CONTINUE,
                ]);
                log(`Colmi: sending CONTINUE packet #${keepAliveCount}`);
                await this._colmiRxChar.writeValueWithoutResponse(continuePacket);
            } catch (err) {
                log('Colmi: CONTINUE packet failed:', err.message);
            }
        }, 2000);

        this._colmiRestart = setInterval(async () => {
            if (!this.connected || !this._colmiRxChar) return;
            try {
                log('Colmi: restarting measurement session to prevent timeout');
                await this._colmiSendStart();
            } catch (err) {
                log('Colmi: restart failed:', err.message);
            }
        }, COLMI_RESTART_INTERVAL_MS);
    }

    async _colmiSendStart() {
        const startPacket = colmiMakePacket(COLMI_CMD_START_REAL_TIME, [
            COLMI_READING_HEART_RATE,
            COLMI_ACTION_START,
        ]);
        logHex('Colmi: sending START packet:', startPacket);
        await this._colmiRxChar.writeValueWithoutResponse(startPacket);
        log('Colmi: START packet sent');
    }

    _handleColmiNotification(dataView) {
        logHex('Colmi notification:', dataView);

        if (dataView.byteLength < 4) {
            log('Colmi: notification too short, ignoring');
            return;
        }

        const cmd = dataView.getUint8(0);
        const type = dataView.getUint8(1);
        const error = dataView.getUint8(2);
        const value = dataView.getUint8(3);

        log(`Colmi: cmd=0x${cmd.toString(16)} type=0x${type.toString(16)} error=${error} value=${value}`);

        if (cmd === COLMI_CMD_START_REAL_TIME && type === COLMI_READING_HEART_RATE) {
            if (error !== 0) {
                log('Colmi: error response, code:', error);
                return;
            }
            if (value === 0) {
                log('Colmi: sensor not ready yet (value=0)');
                return;
            }
            log('Colmi: heart rate =', value, 'BPM');
            if (this.onHeartRate) {
                this.onHeartRate(value);
            }
        } else {
            log(`Colmi: unhandled notification - cmd=0x${cmd.toString(16)} type=0x${type.toString(16)}`);
        }
    }

    // ---------------------------------------------------------------
    // Timers & reconnect
    // ---------------------------------------------------------------

    _stopColmiTimers() {
        if (this._colmiKeepAlive) {
            clearInterval(this._colmiKeepAlive);
            this._colmiKeepAlive = null;
        }
        if (this._colmiRestart) {
            clearInterval(this._colmiRestart);
            this._colmiRestart = null;
        }
    }

    async _handleDisconnect() {
        log('Device disconnected (gattserverdisconnected event)');
        this._stopColmiTimers();
        this._ecgStreaming = false;
        this.server = null;
        this._colmiRxChar = null;
        this._pmdCpChar = null;

        // Notify immediately so the UI stops drawing
        if (this.onDisconnect) this.onDisconnect();

        if (this._autoReconnect && this.device) {
            this._reconnecting = true;
            this._setStatus('Reconnecting...');
            log('Auto-reconnecting in 1s...');

            await new Promise(r => setTimeout(r, 1000));

            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    log(`Reconnect attempt ${attempt}/5`);
                    await this._connectGATT();
                    return;
                } catch (err) {
                    log(`Reconnect attempt ${attempt} failed:`, err.message);
                    if (attempt < 5) {
                        this._setStatus(`Reconnecting (${attempt + 1}/5)...`);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }

            log('Auto-reconnect failed after 5 attempts');
            this._reconnecting = false;
            this.deviceType = null;
            this.capabilities = { hr: false, rr: false, ecg: false };
            this._setStatus('Disconnected');
        } else {
            this.deviceType = null;
            this.capabilities = { hr: false, rr: false, ecg: false };
            this._setStatus('Disconnected');
        }
    }

    _setStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    }
}
