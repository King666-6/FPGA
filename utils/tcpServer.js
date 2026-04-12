const net = require('net');
const DataParser = require('./dataParser');
const DataRecord = require('../models/DataRecord');
const db = require('../utils/database');
const { broadcastDeviceData, broadcastToTeachers, getSocketByDeviceId } = require('../utils/socketManager');
const { getPinId, validatePinIds, getPinName, getPinType, PIN_TYPE } = require('./pinConfig');

const pool = () => db.getPool();

const deviceSocketMap = new Map();
const socketDeviceMap = new Map();

const FRAME_START = Buffer.from([0xFF, 0xFE]);
const DEFAULT_CLOCK_SELECT = 0x0001;
const DEFAULT_DEVICE_NUMBER = 0xCCCCCCCC;
const RESERVED_BYTES = Buffer.from([0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA]);

const CLOCK_SELECT_MAP = {
    '50Hz': 0x0001,
    '100Hz': 0x0002,
    '1kHz': 0x0003,
    '10kHz': 0x0004,
    '100kHz': 0x0005,
    '500kHz': 0x0006
};

let globalDeviceIdCounter = 1;

function buildCommandBuffer(options = {}) {
    const {
        clockSelect = DEFAULT_CLOCK_SELECT,
        deviceNumber = DEFAULT_DEVICE_NUMBER,
        packetCount = 2,
        requestedPins = []
    } = options;

    const buffer = Buffer.alloc(24);
    let offset = 0;

    buffer.writeUInt16BE(0xFFFE, offset);
    offset += 2;

    buffer.writeUInt16BE(clockSelect, offset);
    offset += 2;

    buffer.writeUInt32BE(deviceNumber, offset);
    offset += 4;

    buffer.writeUInt16BE(0xFF00, offset);
    offset += 2;

    buffer.writeUInt16BE(packetCount, offset);
    offset += 2;

    RESERVED_BYTES.copy(buffer, offset);
    offset += 8;

    let sum = 0;
    for (let i = 0; i < 20; i++) {
        sum += buffer[i];
    }
    buffer.writeUInt32BE(sum & 0xFFFFFFFF, offset);

    return buffer;
}

function parseWaveformData(waveforms, pinMapping) {
    if (!waveforms || !pinMapping || pinMapping.length === 0) {
        return {
            leds: [],
            switches: [],
            digits: [],
            buttons: [],
            buzzer: null,
            adc: [],
            raw: waveforms
        };
    }

    const result = {
        leds: [],
        switches: [],
        digits: [],
        buttons: [],
        buzzer: null,
        adc: [],
        raw: waveforms
    };

    for (let i = 0; i < pinMapping.length; i++) {
        const pinId = pinMapping[i];
        const pinName = getPinName(pinId);
        const pinType = getPinType(pinId);

        if (waveforms[i] && waveforms[i].length > 0) {
            const latestValue = waveforms[i][waveforms[i].length - 1];

            switch (pinType) {
                case PIN_TYPE.LED:
                    result.leds.push({ pin: pinName, id: pinId, value: latestValue });
                    break;
                case PIN_TYPE.SWITCH:
                    result.switches.push({ pin: pinName, id: pinId, value: latestValue });
                    break;
                case PIN_TYPE.DIGIT_SEGMENT:
                case PIN_TYPE.DIGIT_SELECT:
                    result.digits.push({ pin: pinName, id: pinId, value: latestValue });
                    break;
                case PIN_TYPE.BUTTON_INDEPENDENT:
                    result.buttons.push({ pin: pinName, id: pinId, value: latestValue });
                    break;
                case PIN_TYPE.BUZZER:
                    result.buzzer = { pin: pinName, id: pinId, value: latestValue };
                    break;
            }
        }
    }

    return result;
}

class TCPServer {
    constructor(port) {
        this.port = port;
        this.server = null;
        this.clientParsers = new Map();
        this.deviceSocketMap = new Map();
        this.deviceContexts = new Map();
    }

    start() {
        this.server = net.createServer((socket) => {
            const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`[TCP] Client connected: ${clientId}`);

            socket.deviceId = `FPGA_AUTO_${globalDeviceIdCounter++}`;

            const parser = new DataParser(socket.deviceId);
            this.clientParsers.set(socket, parser);

            parser.on('snapshot-ready', async (data) => {
                console.log(`[TCP] [${data.deviceId}] Snapshot received`);

                const deviceId = socket.deviceId || data.deviceId;
                const deviceContext = this.deviceContexts.get(deviceId);
                const pinMappingIds = deviceContext?.pinMapping || [];

                const pinStates = data.pinStates;
                const pinMapping = pinMappingIds.map(id => getPinName(id));
                const waveforms = pinStates.map(state => [state]);

                const parsedData = parseWaveformData(waveforms, pinMappingIds);

                await this.saveCycleData(deviceId, waveforms, pinMappingIds);

                broadcastDeviceData({
                    deviceId: deviceId,
                    type: 'waveform_update',
                    waveforms: waveforms,
                    pinMapping: pinMapping,
                    parsedData: parsedData,
                    timestamp: new Date().toISOString()
                });
            });

            parser.on('parse-error', (error) => {
                console.error(`[ERROR] [${error.deviceId}] Parse error: ${error.message}`, error.details || '');
            });

            socket.on('data', (chunk) => {
                this.handleIncomingData(socket, chunk, parser, clientId);
            });

            socket.on('close', () => {
                console.log(`[TCP] Client disconnected: ${clientId}`);

                if (socket.deviceId) {
                    this.deviceSocketMap.delete(socket.deviceId);
                    this.deviceContexts.delete(socket.deviceId);

                    broadcastToTeachers('global-device-status', {
                        deviceId: socket.deviceId,
                        status: 'offline',
                        action: 'device_offline',
                        timestamp: new Date().toISOString()
                    });
                }

                this.clientParsers.delete(socket);
            });

            socket.on('error', (err) => {
                console.error(`[ERROR] TCP connection error from ${clientId}:`, err.message);
            });
        });

        this.server.listen(this.port, () => {
            console.log(`[TCP] Server listening on port ${this.port}`);
        });

        this.server.on('error', (err) => {
            console.error('[ERROR] TCP server error:', err);
        });
    }

    handleIncomingData(socket, chunk, parser, clientId) {
        if (chunk.length === 8 &&
            chunk[0] === 0xFF && chunk[1] === 0xFE &&
            chunk[2] === 0xCC && chunk[3] === 0xCC) {

            socket.deviceId = 'FPGA_device';
            parser.deviceId = socket.deviceId;
            this.deviceSocketMap.set(socket.deviceId, socket);

            console.log(`[TCP] 设备注册: ${socket.deviceId}`);

            broadcastToTeachers('global-device-status', {
                deviceId: socket.deviceId,
                status: 'online',
                action: 'device_online',
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (chunk.length >= 4 &&
            chunk[0] === 0xFF && chunk[1] === 0xCC &&
            chunk[2] === 0xFF && chunk[3] === 0xCC) {
            return;
        }

        if (chunk[0] === 0xFF && chunk[1] === 0xFE && chunk.length > 4) {
            parser.addData(chunk);
        }
    }

    async saveCycleData(deviceId, waveforms, pinMapping) {
        try {
            const deviceDbId = await DataRecord._getOrCreateDevice(deviceId);
            const deviceContext = this.deviceContexts.get(deviceId);
            const submissionId = deviceContext?.submissionId || null;

            const sql = `
                INSERT INTO experiment_data (submission_id, device_id, timestamp, pin_mapping_json, waveforms_json, sample_count, channel_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const channelCount = waveforms.length;
            const sampleCount = waveforms[0]?.length || 0;

            await pool().execute(sql, [
                submissionId || null,
                deviceDbId,
                new Date(),
                JSON.stringify(pinMapping || []),
                JSON.stringify(waveforms),
                sampleCount,
                channelCount
            ]);
            console.log(`[DB] Data saved for device: ${deviceId}`);
        } catch (error) {
            console.error(`[ERROR] [${deviceId}] Failed to save data: ${error.message}`);
        }
    }

    sendCommand(deviceId, command) {
        const socket = this.deviceSocketMap.get(deviceId);

        if (!socket || socket.destroyed) {
            console.warn(`[WARN] Device ${deviceId} not connected`);
            return false;
        }

        if (typeof command === 'string') {
            socket.write(command + '\n');
            console.log(`[TCP] Sent string command to ${deviceId}: ${command}`);
            return true;
        }

        if (typeof command === 'object') {
            if (command.action === 'start_capture' || command.action === 'capture') {
                const requestedPins = command.requestedPins || [];
                const { validIds, invalidPins } = validatePinIds(requestedPins);

                if (invalidPins.length > 0) {
                    console.warn(`[WARN] Invalid pin names: ${invalidPins.join(', ')}`);
                }

                const packetCount = validIds.length || 2;
                const clockSource = command.clockSource || '50Hz';
                const clockSelect = CLOCK_SELECT_MAP[clockSource] || DEFAULT_CLOCK_SELECT;

                const cmdBuffer = buildCommandBuffer({
                    clockSelect: clockSelect,
                    packetCount: packetCount,
                    requestedPins: validIds
                });

                socket.write(cmdBuffer);

                this.deviceContexts.set(deviceId, {
                    pinMapping: validIds,
                    requestedPinNames: requestedPins,
                    experimentId: command.experimentId || 0,
                    submissionId: command.submissionId || null,
                    lastCommandTime: Date.now()
                });

                const parser = this.clientParsers.get(socket);
                if (parser) {
                    parser.setExpectedPacketCount(packetCount);
                }

                console.log(`[TCP] Sent capture command to ${deviceId}:`);
                console.log(`  - Pins: ${validIds.length} (${validIds.join(', ')})`);
                console.log(`  - Trigger: 0xFF00`);
                console.log(`  - Packet count: ${packetCount}`);
                console.log(`  - Buffer: ${cmdBuffer.toString('hex').toUpperCase()}`);

                return true;

            } else if (command.action === 'stop_capture') {
                const cmdBuffer = buildCommandBuffer({
                    packetCount: 0
                });

                socket.write(cmdBuffer);

                this.deviceContexts.delete(deviceId);

                console.log(`[TCP] Sent stop command to ${deviceId}`);
                return true;

            } else if (command.action === 'diagnose') {
                const cmdBuffer = buildCommandBuffer({
                    packetCount: 32
                });

                socket.write(cmdBuffer);
                console.log(`[TCP] Sent diagnose command to ${deviceId}`);
                return true;
            } else {
                socket.write(JSON.stringify(command) + '\n');
                console.log(`[TCP] Sent JSON command to ${deviceId}:`, command);
                return true;
            }
        }

        return false;
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('[TCP] Server stopped');
                    this.clientParsers.clear();
                    this.deviceSocketMap.clear();
                    this.deviceContexts.clear();
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

let tcpServerInstance = null;

function startTCPServer(port) {
    if (!tcpServerInstance) {
        tcpServerInstance = new TCPServer(port);
        tcpServerInstance.start();
    }
    return tcpServerInstance;
}

function getTCPServer() {
    return tcpServerInstance;
}

module.exports = {
    startTCPServer,
    getTCPServer,
    buildCommandBuffer,
    parseWaveformData
};