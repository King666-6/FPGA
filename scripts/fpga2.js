const net = require('net');
const { PIN_NAME_TO_ID } = require('../utils/pinConfig');

const TCP_PORT = 3001;
const TCP_HOST = '127.0.0.1';

const LARGE_FRAME_HEADER = Buffer.from([0xFF, 0xFE]);
const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);
const PAYLOAD_SIZE = 64;

const SEGMENT_MAP = {
    0: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 0 },
    1: { a: 0, b: 1, c: 1, d: 0, e: 0, f: 0, g: 0 },
    2: { a: 1, b: 1, c: 0, d: 1, e: 1, f: 0, g: 1 },
    3: { a: 1, b: 1, c: 1, d: 1, e: 0, f: 0, g: 1 },
    4: { a: 0, b: 1, c: 1, d: 0, e: 0, f: 1, g: 1 },
    5: { a: 1, b: 0, c: 1, d: 1, e: 0, f: 1, g: 1 },
    6: { a: 1, b: 0, c: 1, d: 1, e: 1, f: 1, g: 1 },
    7: { a: 1, b: 1, c: 1, d: 0, e: 0, f: 0, g: 0 },
    8: { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 },
    9: { a: 1, b: 1, c: 1, d: 1, e: 0, f: 1, g: 1 }
};

const client = new net.Socket();

let requestedPins = [];
let isCapturing = false;
let captureInterval = null;
let heartbeatTimer = null;

let counter = 0;
let ledPattern = 0;
let swPattern = 0;
let buzzerOn = false;
let scanIndex = 0;

let btnStates = [false, false, false, false, false, false];
let btnTimers = [
    { period: 1200, pressed: 300 },
    { period: 800, pressed: 200 },
    { period: 1500, pressed: 400 },
    { period: 2000, pressed: 500 },
    { period: 1000, pressed: 250 },
    { period: 1800, pressed: 450 }
];
let btnElapsed = [0, 0, 0, 0, 0, 0];

let lastUpdateTime = Date.now();
let lastCounterUpdate = Date.now();
let lastSwUpdate = Date.now();
let lastBuzzerUpdate = Date.now();

function updateSimulationState() {
    const now = Date.now();
    const dt = now - lastUpdateTime;
    lastUpdateTime = now;

    if (now - lastCounterUpdate >= 500) {
        counter = (counter + 1) % 100;
        lastCounterUpdate = now;
    }

    scanIndex = (scanIndex + 1) % 2;

    ledPattern = (ledPattern + 1) % 16;

    if (now - lastSwUpdate >= 2000) {
        swPattern = swPattern === 0xAAAA ? 0x5555 : 0xAAAA;
        lastSwUpdate = now;
    }

    for (let i = 0; i < 6; i++) {
        btnElapsed[i] += dt;
        if (btnElapsed[i] >= btnTimers[i].period) {
            btnElapsed[i] = 0;
        }
        btnStates[i] = btnElapsed[i] < btnTimers[i].pressed;
    }

    buzzerOn = (counter % 15) < 3;
}

function getPinValue(pinName) {
    const name = pinName.toUpperCase();

    if (name.startsWith('LED')) {
        const ledId = parseInt(name.replace('LED', '')) || 0;
        return (ledPattern === ledId) ? 0xFF : 0x00;
    }

    if (name.startsWith('SW')) {
        const swId = parseInt(name.replace('SW', '')) || 0;
        return (swPattern & (1 << swId)) ? 0xFF : 0x00;
    }

    if (name.startsWith('BTN')) {
        const btnId = parseInt(name.replace('BTN', '')) || 0;
        return btnStates[btnId] ? 0xFF : 0x00;
    }

    if (name.startsWith('BUZZER')) {
        return buzzerOn ? 0xFF : 0x00;
    }

    if (name.startsWith('SEG_') || name.startsWith('DIGIT_')) {
        const digitValue = scanIndex === 0 ? counter % 10 : Math.floor(counter / 10);
        const segmentMap = SEGMENT_MAP[digitValue];

        if (name === 'SEG_A') return segmentMap.a ? 0xFF : 0x00;
        if (name === 'SEG_B') return segmentMap.b ? 0xFF : 0x00;
        if (name === 'SEG_C') return segmentMap.c ? 0xFF : 0x00;
        if (name === 'SEG_D') return segmentMap.d ? 0xFF : 0x00;
        if (name === 'SEG_E') return segmentMap.e ? 0xFF : 0x00;
        if (name === 'SEG_F') return segmentMap.f ? 0xFF : 0x00;
        if (name === 'SEG_G') return segmentMap.g ? 0xFF : 0x00;
    }

    if (name.startsWith('DIG')) {
        const digId = parseInt(name.replace('DIG', '')) || 0;
        if (digId === scanIndex) {
            return 0xFF;
        }
        return 0x00;
    }

    return 0x00;
}

function buildPinMapping(packetCount) {
    const pins = [];
    for (let i = 0; i < packetCount; i++) {
        if (i < 16) pins.push(`LED${i}`);
        else if (i < 32) pins.push(`SW${i - 16}`);
        else if (i < 39) pins.push(`SEG_${String.fromCharCode(65 + i - 33)}`);
        else if (i < 47) pins.push(`DIG${i - 39}`);
        else if (i < 53) pins.push(`BTN${i - 47}`);
        else if (i === 53) pins.push('BUZZER');
    }
    return pins;
}

function sendLargePacket(seq) {
    const packetCount = requestedPins.length;
    const subFrameSize = 72;
    const totalLength = 10 + packetCount * subFrameSize;

    const largeHeader = Buffer.alloc(10);
    LARGE_FRAME_HEADER.copy(largeHeader, 0);
    largeHeader.writeUInt16BE(totalLength, 2);
    largeHeader.writeUInt16BE((seq % 0xFFFF) + 1, 4); // 大包顺序序号（1-based，0x0001到0xFFFF循环）
    largeHeader.writeUInt32BE(0x000000CC, 6);

    const subFrames = [];
    for (let i = 0; i < packetCount; i++) {
        const seqBuf = Buffer.alloc(2);
        seqBuf.writeUInt16BE(i);

        const payload = Buffer.alloc(PAYLOAD_SIZE);
        const pinValue = getPinValue(requestedPins[i]);
        payload.fill(pinValue);

        subFrames.push(Buffer.concat([FRAME_HEADER, seqBuf, payload]));
    }

    return Buffer.concat([largeHeader, ...subFrames]);
}

function logCurrentState() {
    const leds = [];
    for (let i = 0; i < 16; i++) {
        leds.push(ledPattern === i ? `[LED${i}]` : ` LED${i} `);
    }

    const sws = [];
    for (let i = 0; i < 16; i++) {
        sws.push((swPattern & (1 << i)) ? '1' : '0');
    }

    const btns = btnStates.map((s, i) => s ? `BTN${i}:1` : `BTN${i}:0`).join(' ');

    const tens = Math.floor(counter / 10);
    const ones = counter % 10;

    console.log(`\n[FPGA2 State] counter=${counter.toString().padStart(2, '0')} (${tens}|${ones}) | LEDs=[${leds.join('')}] | SWs=${sws.join('')} | BTNs=${btns} | BUZZER=${buzzerOn ? 'ON' : 'OFF '}`);
}

function startCapture() {
    if (isCapturing || requestedPins.length === 0) return;

    isCapturing = true;
    console.log(`\n[FPGA2] Starting capture: ${requestedPins.length} pins`);

    let captureSeq = 0;
    captureInterval = setInterval(() => {
        updateSimulationState();

        const packet = sendLargePacket(captureSeq++);
        client.write(packet);

        logCurrentState();
    }, 200);
}

function stopCapture() {
    if (!isCapturing) return;
    isCapturing = false;
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    console.log('[FPGA2] Capture stopped');
}

function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
        client.write(Buffer.from([0xFF, 0xCC, 0xFF, 0xCC]));
    }, 3000);
    console.log('[FPGA2] Heartbeat started (every 3s)');
}

function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        console.log('[FPGA2] Heartbeat stopped');
    }
}

let dataBuffer = Buffer.alloc(0);

function parseCommand(buffer) {
    if (buffer.length < 24) return null;
    const frameHeader = buffer.readUInt16BE(0);
    if (frameHeader !== 0xFFFE) return null;
    const packetCount = buffer.readUInt16BE(10);
    return { packetCount };
}

client.connect(TCP_PORT, TCP_HOST, () => {
    console.log(`[FPGA2] Connected to ${TCP_HOST}:${TCP_PORT}`);

    const regPacket = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0x00, 0x11, 0x22, 0x33]);
    client.write(regPacket);
    console.log('[FPGA2] Registration packet sent, waiting for capture command...');

    startHeartbeat();
});

client.on('data', (data) => {
    dataBuffer = Buffer.concat([dataBuffer, data]);

    while (dataBuffer.length >= 2) {
        if (dataBuffer[0] === 0xFF && dataBuffer[1] === 0xFE) {
            if (dataBuffer.length >= 8) {
                const ackCheck = dataBuffer.readUInt32BE(4);
                if (ackCheck === 0x00000001) {
                    console.log('[FPGA2] Received registration ACK');
                    dataBuffer = dataBuffer.slice(8);
                    continue;
                }
            }

            if (dataBuffer.length >= 4 && dataBuffer[0] === 0xFF && dataBuffer[1] === 0xCC && dataBuffer[2] === 0xFF && dataBuffer[3] === 0xCC) {
                dataBuffer = dataBuffer.slice(4);
                continue;
            }

            if (dataBuffer.length >= 24) {
                const cmd = parseCommand(dataBuffer);
                if (cmd) {
                    console.log(`[FPGA2] Received command: packetCount=${cmd.packetCount}`);
                    if (cmd.packetCount > 0) {
                        stopCapture();
                        requestedPins = buildPinMapping(cmd.packetCount);
                        startCapture();
                    }
                    dataBuffer = dataBuffer.slice(24);
                    continue;
                }
            }

            if (dataBuffer.length < 24) break;
        }

        if (dataBuffer.length > 2) {
            dataBuffer = dataBuffer.slice(1);
        } else {
            break;
        }
    }
});

client.on('error', (err) => {
    console.error('[FPGA2] Connection error:', err.message);
    stopHeartbeat();
});
client.on('close', () => {
    console.log('[FPGA2] Connection closed');
    stopCapture();
    stopHeartbeat();
});

console.log('[FPGA2] FPGA2 simulator starting...');
console.log('[FPGA2] Features: 7-segment display counter, LED water flow, alternating switches, rhythmic buttons, buzzer');
