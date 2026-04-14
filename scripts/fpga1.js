// fpga_mock.js - 智能模拟 FPGA 硬件，动态适配所有引脚
const net = require('net');

const TCP_PORT = 3001;
const TCP_HOST = '127.0.0.1';

const LARGE_FRAME_HEADER = Buffer.from([0xFF, 0xFE]);
const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);
const PAYLOAD_SIZE = 64;

const client = new net.Socket();

let requestedPins = [];
let isCapturing = false;
let captureInterval = null;
let loopCounter = 0;

function startCapture() {
    if (isCapturing || requestedPins.length === 0) return;

    isCapturing = true;
    console.log(`\n▶️ 开始采集 ${requestedPins.length} 个引脚...`);

    captureInterval = setInterval(() => {
        loopCounter++;
        const seqBuffer = Buffer.alloc(2);
        seqBuffer.writeUInt16BE(loopCounter % 65536);

        const payload = Buffer.alloc(PAYLOAD_SIZE);

        for (let i = 0; i < requestedPins.length && i < 64; i++) {
            const pinName = requestedPins[i];
            const nameUpper = pinName.toUpperCase();
            let pinValue = 0;

            if (nameUpper.includes('LED')) {
                const ledId = parseInt(nameUpper.replace('LED', '')) || 0;
                const isOn = (loopCounter % 16) === ledId;
                pinValue = isOn ? 0xFF : 0x00;
            }
            else if (nameUpper.includes('BTN')) {
                const isPressed = (loopCounter % 20) < 10;
                pinValue = isPressed ? 0xFF : 0x00;
            }
            else if (nameUpper.includes('SW')) {
                const swId = parseInt(nameUpper.replace('SW', '')) || 0;
                const isOn = (swId % 2 === 0);
                pinValue = isOn ? 0xFF : 0x00;
            }
            else if (nameUpper.includes('SEG') || nameUpper.includes('DIG')) {
                pinValue = (loopCounter % 10) < 5 ? 0xFF : 0x00;
            }
            else if (nameUpper.includes('BUZZER')) {
                pinValue = loopCounter % 2 === 0 ? 0xFF : 0x00;
            }
            else {
                pinValue = 0x00;
            }

            payload.writeUInt8(pinValue, i);
        }

        const subFrame = Buffer.concat([FRAME_HEADER, seqBuffer, payload]);

        const totalLength = 10 + subFrame.length * requestedPins.length;
        const largeHeader = Buffer.alloc(10);
        LARGE_FRAME_HEADER.copy(largeHeader, 0);
        largeHeader.writeUInt16BE(totalLength, 2);
        largeHeader.writeUInt16BE(requestedPins.length, 4);
        largeHeader.writeUInt32BE(0x000000CC, 6);

        const frames = [];
        frames.push(largeHeader);
        for (let i = 0; i < requestedPins.length && i < 64; i++) {
            const seqBuf = Buffer.alloc(2);
            seqBuf.writeUInt16BE(i);
            const pld = Buffer.alloc(PAYLOAD_SIZE);
            const pinName = requestedPins[i];
            const nameUpper = pinName.toUpperCase();

            let pv = 0;
            if (nameUpper.includes('LED')) {
                const lid = parseInt(nameUpper.replace('LED', '')) || 0;
                pv = (loopCounter % 16) === lid ? 0xFF : 0x00;
            } else if (nameUpper.includes('SW')) {
                const sid = parseInt(nameUpper.replace('SW', '')) || 0;
                pv = (sid % 2 === 0) ? 0xFF : 0x00;
            } else if (nameUpper.includes('BTN')) {
                pv = (loopCounter % 20) < 10 ? 0xFF : 0x00;
            } else if (nameUpper.includes('SEG') || nameUpper.includes('DIG')) {
                pv = (loopCounter % 10) < 5 ? 0xFF : 0x00;
            } else if (nameUpper.includes('BUZZER')) {
                pv = loopCounter % 2 === 0 ? 0xFF : 0x00;
            }
            pld.fill(pv);

            frames.push(Buffer.concat([FRAME_HEADER, seqBuf, pld]));
        }

        client.write(Buffer.concat(frames));
    }, 200);
}

function stopCapture() {
    if (!isCapturing) return;
    isCapturing = false;
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
    console.log('⏹️ 已停止采集');
}

let dataBuffer = Buffer.alloc(0);

function sendLargePacket(seq) {
    const packetCount = requestedPins.length;
    const subFrameSize = 72;
    const totalLength = 10 + packetCount * subFrameSize;

    const largeHeader = Buffer.alloc(10);
    LARGE_FRAME_HEADER.copy(largeHeader, 0);
    largeHeader.writeUInt16BE(totalLength, 2);
    largeHeader.writeUInt16BE(packetCount, 4);
    largeHeader.writeUInt32BE(0x000000CC, 6);

    const subFrames = [];
    for (let i = 0; i < packetCount; i++) {
        const seqBuf = Buffer.alloc(2);
        seqBuf.writeUInt16BE(i);

        const payload = Buffer.alloc(PAYLOAD_SIZE);
        const pinName = requestedPins[i];
        const nameUpper = pinName.toUpperCase();

        let pv = 0;
        if (nameUpper.includes('LED')) {
            const ledId = parseInt(nameUpper.replace('LED', '')) || 0;
            pv = (seq % 16) === ledId ? 0xFF : 0x00;
        } else if (nameUpper.includes('SW')) {
            const swId = parseInt(nameUpper.replace('SW', '')) || 0;
            pv = (swId % 2 === 0) ? 0xFF : 0x00;
        } else if (nameUpper.includes('BTN')) {
            pv = (seq % 20) < 10 ? 0xFF : 0x00;
        } else if (nameUpper.includes('SEG') || nameUpper.includes('DIG')) {
            pv = (seq % 10) < 5 ? 0xFF : 0x00;
        } else if (nameUpper.includes('BUZZER')) {
            pv = seq % 2 === 0 ? 0xFF : 0x00;
        }
        payload.writeUInt8(pv, 0);

        subFrames.push(Buffer.concat([FRAME_HEADER, seqBuf, payload]));
    }

    return Buffer.concat([largeHeader, ...subFrames]);
}

let captureSeq = 0;
let captureTimer = null;

function startCaptureV2() {
    if (isCapturing || requestedPins.length === 0) return;
    isCapturing = true;
    console.log(`\n▶️ 开始采集 ${requestedPins.length} 个引脚 (大包模式)...`);

    captureTimer = setInterval(() => {
        const packet = sendLargePacket(captureSeq++);
        client.write(packet);
    }, 200);
}

client.connect(TCP_PORT, TCP_HOST, () => {
    console.log(`✅ 已连接到服务器 ${TCP_HOST}:${TCP_PORT}`);

    const regPacket = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0x00, 0x11, 0x22, 0x33]);
    client.write(regPacket);
    console.log('📝 已发送设备注册信息，等待网页端下发采集指令...');
});

client.on('data', (data) => {
    dataBuffer = Buffer.concat([dataBuffer, data]);

    while (dataBuffer.length >= 2) {
        if (dataBuffer[0] === 0xFF && dataBuffer[1] === 0xFE) {
            if (dataBuffer.length >= 8) {
                const ackCheck = dataBuffer.readUInt32BE(4);
                if (ackCheck === 0x00000001) {
                    console.log('[INFO] 收到注册 ACK');
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
                    console.log(`[INFO] 收到指令: 包数量=${cmd.packetCount}`);
                    if (cmd.packetCount > 0) {
                        stopCapture();
                        requestedPins = [];
                        const count = cmd.packetCount;
                        for (let i = 0; i < count; i++) {
                            if (i < 16) requestedPins.push(`LED${i}`);
                            else if (i < 32) requestedPins.push(`SW${i - 16}`);
                            else if (i < 39) requestedPins.push(`SEG_${String.fromCharCode(65 + i - 33)}`);
                            else if (i < 47) requestedPins.push(`DIG${i - 39}`);
                            else if (i < 53) requestedPins.push(`BTN${i - 47}`);
                            else if (i === 53) requestedPins.push('BUZZER');
                        }
                        startCaptureV2();
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

function parseCommand(buffer) {
    if (buffer.length < 24) return null;
    const frameHeader = buffer.readUInt16BE(0);
    if (frameHeader !== 0xFFFE) return null;
    const packetCount = buffer.readUInt16BE(10);
    return { packetCount };
}

client.on('error', (err) => console.error('❌ 连接错误:', err.message));
client.on('close', () => {
    console.log('🔌 连接已断开');
    stopCapture();
});