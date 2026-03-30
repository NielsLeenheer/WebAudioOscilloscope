/**
 * Laser Output Module
 * 
 * Provides laser projector output for the oscilloscope via Helios DAC (WebUSB/ILDA).
 */

export { 
    HeliosDevice, 
    HeliosPoint, 
    connectHeliosDevice, 
    getHeliosDevices, 
    isWebUSBSupported,
    HELIOS 
} from './HeliosDac.js';

export { 
    LaserRenderer, 
    TrapezoidCalibration 
} from './LaserRenderer.js';
