const net = require('net');

const TCP_HOST = '127.0.0.1';
const TCP_PORT = 3001;

const LARGE_FRAME_HEADER = Buffer.from([0xFF, 0xFE]);
const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);

const SEGMENT_PATTERNS = [
    0x3F,
    0x06,
    0x5B,
    0x4F,
    0x66,
    0x6D,
    0x7D,
    0x07,
    0x7F,
    0x6F
];

let client = null;
let heartbeatInterval = null;
let sendTimer = null;
let deviceNumber = 0x000000CC;
let packetCounter = 0;
let globalCounter = 0;

const PIN_COUNT = 54;
const PAYLOAD_SIZE = 64;

function calculateChecksum(buffer, length) {
    let sum = 0;
    for (let i = 0; i < length; i++) {
        sum += buffer[i];
    }
    return sum & 0xFFFFFFFF;
}

function parseCommand(buffer) {
    if (buffer.length < 24) {
        return null;
    }

    const frameHeader = buffer.readUInt16BE(0);
    if (frameHeader !== 0xFFFE) {
        return null;
    }

    const clockSelect = buffer.readUInt16BE(2);
    deviceNumber = buffer.readUInt32BE(4);
    const triggerCondition = buffer.readUInt16BE(8);
    const packetCount = buffer.readUInt16BE(10);

    return {
        clockSelect,
        deviceNumber,
        triggerCondition,
        packetCount
    };
}

function createLargePacket(seq, packetCount) {
    const totalLength = 10 + packetCount * 72;

    const largeHeader = Buffer.alloc(10);
    LARGE_FRAME_HEADER.copy(largeHeader, 0);
    largeHeader.writeUInt16BE(totalLength, 2);
    largeHeader.writeUInt16BE(packetCount, 4);
    largeHeader.writeUInt32BE(deviceNumber, 6);

    const subFrames = [];
    for (let subSeq = 0; subSeq < packetCount; subSeq++) {
        const seqBuffer = Buffer.alloc(2);
        seqBuffer.writeUInt16BE(subSeq);

        const payload = Buffer.alloc(PAYLOAD_SIZE);
        const pinBase = subSeq;

        globalCounter++;
        const counter = globalCounter;

        if (pinBase >= 0 && pinBase < 16) {
            const ledIndex = pinBase;
            const isOn = (counter % 16) === ledIndex;
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else if (pinBase >= 16 && pinBase < 32) {
            const swIndex = pinBase - 16;
            const isOn = (swIndex % 2 === 0);
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else if (pinBase >= 32 && pinBase < 39) {
            const segIndex = pinBase - 32;
            const digitValue = Math.floor(counter / 30) % 10;
            const pattern = SEGMENT_PATTERNS[digitValue];
            const isOn = (pattern >> segIndex) & 1;
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else if (pinBase >= 39 && pinBase < 47) {
            const digIndex = pinBase - 39;
            const digitCounter = Math.floor(counter / 30) % 8;
            const isOn = digIndex === digitCounter;
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else if (pinBase >= 47 && pinBase < 53) {
            const btnIndex = pinBase - 47;
            const pressPeriod = 100;
            const holdDuration = 5;
            const phase = counter % pressPeriod;
            const isPressed = phase < holdDuration;
            const pressedBtn = Math.floor(counter / pressPeriod) % 6;
            const isOn = btnIndex === pressedBtn && isPressed;
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else if (pinBase === 53) {
            const isOn = counter % 2 === 0;
            payload.writeUInt8(isOn ? 0xFF : 0x00, 0);
        }
        else {
            payload.writeUInt8(0x00, 0);
        }

        const subFrame = Buffer.concat([FRAME_HEADER, seqBuffer, payload]);
        subFrames.push(subFrame);
    }

    return Buffer.concat([largeHeader, ...subFrames]);
}

function sendDataFrames(triggerCondition, packetCount) {
    if (sendTimer) {
        clearInterval(sendTimer);
    }

    console.log(`[INFO] 触发条件: 0x${triggerCondition.toString(16).toUpperCase().padStart(4, '0')}`);
    console.log(`[INFO] 包数量: ${packetCount}`);
    console.log(`[INFO] 大包模式: ${packetCount} 个子帧`);

    sendTimer = setInterval(() => {
        const packet = createLargePacket(0, packetCount);
        client.write(packet);
    }, 200);
}

function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(() => {
        if (client && !client.destroyed) {
            const hb = Buffer.from([0xFF, 0xCC, 0xFF, 0xCC]);
            client.write(hb);
        }
    }, 5000);
}

let commandBuffer = Buffer.alloc(0);

function handleIncomingData(data) {
    try {
        commandBuffer = Buffer.concat([commandBuffer, data]);

        while (commandBuffer.length >= 2) {
            if (commandBuffer[0] === 0xFF && commandBuffer[1] === 0xFE) {
                if (commandBuffer.length >= 8) {
                    const ackCheck = commandBuffer.readUInt32BE(4);
                    if (ackCheck === 0x00000001) {
                        console.log(`[INFO] 收到注册 ACK`);
                        commandBuffer = commandBuffer.slice(8);
                        continue;
                    }
                }

                if (commandBuffer.length >= 4 &&
                    commandBuffer[0] === 0xFF && commandBuffer[1] === 0xCC &&
                    commandBuffer[2] === 0xFF && commandBuffer[3] === 0xCC) {
                    commandBuffer = commandBuffer.slice(4);
                    continue;
                }

                if (commandBuffer.length >= 24) {
                    const cmd = parseCommand(commandBuffer);

                    if (cmd) {
                        console.log(`[INFO] 解析指令: 触发条件=0x${cmd.triggerCondition.toString(16).toUpperCase()}, 包数量=${cmd.packetCount}`);

                        if (cmd.packetCount > 0) {
                            sendDataFrames(cmd.triggerCondition, cmd.packetCount);
                        }

                        commandBuffer = commandBuffer.slice(24);
                        continue;
                    }
                }

                if (commandBuffer.length < 24) {
                    break;
                }
            }

            if (commandBuffer.length > 2) {
                commandBuffer = commandBuffer.slice(1);
            } else {
                break;
            }
        }

        if (commandBuffer.length > 100) {
            commandBuffer = commandBuffer.slice(-24);
        }
    } catch (err) {
        console.error(`[ERROR] 处理接收数据异常: ${err.message}`);
        commandBuffer = Buffer.alloc(0);
    }
}

function connect() {
    client = new net.Socket();

    client.connect(TCP_PORT, TCP_HOST, () => {
        console.log(`[INFO] 已连接到服务器 ${TCP_HOST}:${TCP_PORT}`);

        const regPacket = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0x00, 0x11, 0x22, 0x33]);
        client.write(regPacket);
        console.log(`[INFO] 已发送注册包`);

        startHeartbeat();
    });

    client.on('data', (data) => {
        handleIncomingData(data);
    });

    client.on('error', (err) => {
        console.error(`[ERROR] 连接错误: ${err.message}`);
    });

    client.on('close', () => {
        console.log('[INFO] 连接已关闭');
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        if (sendTimer) {
            clearInterval(sendTimer);
            sendTimer = null;
        }
        setTimeout(connect, 3000);
    });
}

connect();