const net = require('net');

const TCP_HOST = '127.0.0.1';
const TCP_PORT = 3001;

const REG_MAGIC = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC]);
const MOCK_MAC = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB]);

const FRAME_HEADER_6B = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);

const CMD_FRAME_HEADER = 0xFFFE;
const HEARTBEAT = 0xAA;

let client = null;
let heartbeatInterval = null;
let sendTimer = null;
let deviceNumber = 0x00000000;
let packetCounter = 0;

let globalCounter = 0;

const SEGMENT_PATTERNS = [
    0x3F, // 0: a,b,c,d,e,f
    0x06, // 1: b,c
    0x5B, // 2: a,b,d,e,g
    0x4F, // 3: a,b,c,d,g
    0x66, // 4: b,c,f,g
    0x6D, // 5: a,c,d,f,g
    0x7D, // 6: a,c,d,e,f,g
    0x07, // 7: a,b,c
    0x7F, // 8: a,b,c,d,e,f,g
    0x6F  // 9: a,b,c,d,f,g
];

function createRegistrationPacket() {
    const packet = Buffer.alloc(16);
    REG_MAGIC.copy(packet, 0);
    MOCK_MAC.copy(packet, 4);
    return packet;
}

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
    if (frameHeader !== CMD_FRAME_HEADER) {
        console.warn(`[WARN] 帧头校验失败: 期望 0xFFFE, 实际 0x${frameHeader.toString(16).toUpperCase().padStart(4, '0')}`);
        return null;
    }

    const clockSelect = buffer.readUInt16BE(2);
    deviceNumber = buffer.readUInt32BE(4);
    const triggerCondition = buffer.readUInt16BE(8);
    const packetCount = buffer.readUInt16BE(10);

    const receivedSum = buffer.readUInt32BE(20);
    const calculatedSum = calculateChecksum(buffer, 20);

    if (receivedSum !== calculatedSum) {
        console.warn(`[WARN] 校验和校验失败: 期望 0x${calculatedSum.toString(16).toUpperCase()}, 实际 0x${receivedSum.toString(16).toUpperCase()}`);
        return null;
    }

    return {
        clockSelect,
        deviceNumber,
        triggerCondition,
        packetCount
    };
}

function setBitInByte(byte, bitPos, value) {
    if (value) {
        return byte | (1 << bitPos);
    } else {
        return byte & ~(1 << bitPos);
    }
}

function createWaveformData(seq, triggerPin, packetCount) {
    const payload = Buffer.alloc(64);

    globalCounter++;
    const counter = globalCounter;

    for (let byteIdx = 0; byteIdx < 64; byteIdx++) {
        let byteValue = 0;

        for (let bitIdx = 0; bitIdx < 8; bitIdx++) {
            const pinNum = byteIdx * 8 + bitIdx + 1;
            let pinValue = 0;

            if (pinNum >= 1 && pinNum <= 32) {
                const ledIndex = pinNum - 1;

                if (ledIndex < 8) {
                    const shiftPosition = counter % 8;
                    pinValue = (ledIndex === shiftPosition) ? 1 : 0;
                } else if (ledIndex >= 8 && ledIndex < 16) {
                    const switchIndex = ledIndex - 8;
                    const togglePeriod = 50;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + switchIndex) % 2);
                } else if (ledIndex >= 16 && ledIndex < 24) {
                    const switchIndex = ledIndex - 16;
                    const togglePeriod = 75;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + switchIndex) % 2);
                } else {
                    const switchIndex = ledIndex - 24;
                    const togglePeriod = 100;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + switchIndex) % 2);
                }
            }
            else if (pinNum >= 33 && pinNum <= 64) {
                const swIndex = pinNum - 33;

                if (swIndex < 4) {
                    const togglePeriod = 60;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + swIndex) % 2);
                }
                else if (swIndex >= 4 && swIndex < 8) {
                    const togglePeriod = 80;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + swIndex) % 2);
                }
                else if (swIndex >= 8 && swIndex < 16) {
                    const togglePeriod = 40;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + swIndex) % 2);
                }
                else {
                    const togglePeriod = 120;
                    const toggleCounter = Math.floor(counter / togglePeriod) % 2;
                    pinValue = ((toggleCounter + swIndex) % 2);
                }
            }
            else if (pinNum >= 65 && pinNum <= 71) {
                const segmentIndex = pinNum - 65;
                const digitUpdatePeriod = 30;
                const digitCounter = Math.floor(counter / digitUpdatePeriod) % 10;
                const currentDigit = digitCounter;
                const pattern = SEGMENT_PATTERNS[currentDigit];
                pinValue = (pattern >> segmentIndex) & 1;
            }
            else if (pinNum >= 72 && pinNum <= 79) {
                const digitSelectIndex = pinNum - 72;
                const digitUpdatePeriod = 30;
                const digitCounter = Math.floor(counter / digitUpdatePeriod) % 8;
                const activeDigit = digitCounter;
                pinValue = (digitSelectIndex === activeDigit) ? 1 : 0;
            }
            else if (pinNum >= 80 && pinNum <= 87) {
                const digitSelectIndex = pinNum - 80;
                const digitUpdatePeriod = 30;
                const digitCounter = Math.floor(counter / digitUpdatePeriod) % 8;
                const activeDigit = digitCounter;
                pinValue = (digitSelectIndex === activeDigit) ? 1 : 0;
            }
            else if (pinNum >= 88 && pinNum <= 91) {
                const btnIndex = pinNum - 88;
                const pressPeriod = 100;
                const holdDuration = 5;
                const phase = counter % pressPeriod;
                const isPressed = phase < holdDuration;
                const pressedBtn = Math.floor(counter / pressPeriod) % 4;
                pinValue = (btnIndex === pressedBtn && isPressed) ? 1 : 0;
            }
            else if (pinNum >= 92 && pinNum <= 95) {
                const colIndex = pinNum - 92;
                const scanPeriod = 32;
                const phase = counter % scanPeriod;
                const pressedBtn = Math.floor(phase / 8);
                const pressedRow = Math.floor(pressedBtn / 4);
                const pressedCol = pressedBtn % 4;
                pinValue = (colIndex === pressedCol) ? 0 : 1;
            }
            else if (pinNum >= 96 && pinNum <= 99) {
                const rowIndex = pinNum - 96;
                const scanPeriod = 32;
                const phase = counter % scanPeriod;
                const pressedBtn = Math.floor(phase / 8);
                const pressedRow = Math.floor(pressedBtn / 4);
                const pressedCol = pressedBtn % 4;
                pinValue = (rowIndex === pressedRow) ? 0 : 1;
            }
            else if (pinNum === 100) {
                pinValue = (counter % 2);
            }
            else if (pinNum >= 101 && pinNum <= 102) {
                const a7Index = pinNum - 101;
                const pressPeriod = 150;
                const holdDuration = 8;
                const phase = counter % pressPeriod;
                const isPressed = phase < holdDuration;
                const pressedBtn = Math.floor(counter / pressPeriod) % 2;
                pinValue = (a7Index === pressedBtn && isPressed) ? 1 : 0;
            }

            if (pinValue) {
                byteValue = setBitInByte(byteValue, bitIdx, true);
            }
        }

        payload.writeUInt8(byteValue, byteIdx);
    }

    return payload;
}

function sendDataFrames(triggerCondition, packetCount) {
    const pinId = triggerCondition & 0x00FF;

    if (sendTimer) {
        clearInterval(sendTimer);
    }

    console.log(`[INFO] 触发条件: 0x${triggerCondition.toString(16).toUpperCase().padStart(4, '0')} (引脚ID: ${pinId})`);
    console.log(`[INFO] 包数量: ${packetCount}`);
    console.log(`[INFO] 已发送设备 ${deviceNumber.toString(16).toUpperCase()} 的 ${packetCount} 个模拟包`);

    let cycleCount = 0;

    sendTimer = setInterval(() => {
        const seqBuffer = Buffer.alloc(2);
        seqBuffer.writeUInt16BE(cycleCount);

        const waveformData = createWaveformData(cycleCount, pinId, packetCount);

        const frame = Buffer.concat([FRAME_HEADER_6B, seqBuffer, waveformData]);

        client.write(frame);

        cycleCount++;

    }, 100);
}

function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        if (client && !client.destroyed) {
            const hb = Buffer.from([HEARTBEAT]);
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
                    if (ackCheck === 0x00000000) {
                        console.log(`[INFO] 收到注册 ACK: ${commandBuffer.slice(0, 8).toString('hex').toUpperCase()}`);
                        commandBuffer = commandBuffer.slice(8);
                        continue;
                    }
                }
                
                if (commandBuffer.length >= 24) {
                    const cmd = parseCommand(commandBuffer);
                    
                    if (cmd) {
                        console.log(`[INFO] 解析指令成功: 时钟=0x${cmd.clockSelect.toString(16).toUpperCase()}, 设备号=0x${cmd.deviceNumber.toString(16).toUpperCase()}, 触发条件=0x${cmd.triggerCondition.toString(16).toUpperCase()}, 包数量=${cmd.packetCount}`);
                        
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
        
        const regPacket = createRegistrationPacket();
        client.write(regPacket);
        console.log(`[INFO] 已发送注册包: ${regPacket.toString('hex').toUpperCase()}`);
        
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
