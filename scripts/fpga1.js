// fpga_mock.js - 智能模拟 FPGA 硬件，动态适配所有引脚
const net = require('net');

const TCP_PORT = 3001;
const TCP_HOST = '127.0.0.1';

const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);
const PAYLOAD_SIZE = 64;

const client = new net.Socket();

let requestedPins = [];
let isCapturing = false;
let captureInterval = null;
let loopCounter = 0;

// 生成针对不同部件的模拟波形
function createMockPacket(seqIndex, pinName) {
    const seqBuffer = Buffer.alloc(2);
    seqBuffer.writeUInt16BE(seqIndex);
    const payload = Buffer.alloc(PAYLOAD_SIZE);

    const nameUpper = typeof pinName === 'string' ? pinName.toUpperCase() : '';

    if (nameUpper.includes('BTN')) {
        // 按键模拟：按下2秒，松开2秒
        const isPressed = (loopCounter % 20) < 10; 
        payload.fill(isPressed ? 0xFF : 0x00);
    } 
    else if (nameUpper.includes('LED')) {
        // LED模拟：跑马灯效果，根据引脚序号错开闪烁
        // 从 "LED5" 提取出数字 5
        const ledId = parseInt(nameUpper.replace('LED', '')) || 0;
        const isOn = ((loopCounter + ledId) % 10) < 5;
        payload.fill(isOn ? 0xFF : 0x00);
    } 
    else if (nameUpper.includes('SW')) {
        // 开关模拟：固定状态，奇数开，偶数关，偶尔整体翻转
        const swId = parseInt(nameUpper.replace('SW', '')) || 0;
        const globalFlip = (Math.floor(loopCounter / 30) % 2) === 0;
        const isOn = globalFlip ? (swId % 2 === 0) : (swId % 2 !== 0);
        payload.fill(isOn ? 0xFF : 0x00);
    } 
    else if (nameUpper.includes('DIGIT')) {
        // 数码管模拟：亮灭交替效果
        const isOn = (loopCounter % 10) < 5;
        payload.fill(isOn ? 0xFF : 0x00);
    } 
    else {
        // 默认模拟波形：前一半低电平，后一半高电平
        payload.fill(0x00, 0, 32);
        payload.fill(0xFF, 32, 64);
    }

    return Buffer.concat([FRAME_HEADER, seqBuffer, payload]);
}

function startCapture() {
    if (isCapturing || requestedPins.length === 0) return;

    isCapturing = true;
    console.log(`\n▶️ 开始采集 ${requestedPins.length} 个引脚...`);
    
    // 每 200 毫秒生成并发送一轮完整的数据包
    captureInterval = setInterval(() => {
        loopCounter++;
        for (let i = 0; i < requestedPins.length; i++) {
            const packet = createMockPacket(i, requestedPins[i]);
            client.write(packet);
        }
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

let dataBuffer = '';

client.connect(TCP_PORT, TCP_HOST, () => {
    console.log(`✅ 已连接到服务器 ${TCP_HOST}:${TCP_PORT}`);
    
    // 连接后先发送注册包
    const registerMsg = JSON.stringify({
        type: 'register',
        deviceId: 'demo_device'
    });
    client.write(registerMsg + '\n');
    console.log('📝 已发送设备注册信息，等待网页端下发采集指令...');
});

client.on('data', (data) => {
    dataBuffer += data.toString();

    let newlineIndex;
    while ((newlineIndex = dataBuffer.indexOf('\n')) !== -1) {
        const line = dataBuffer.slice(0, newlineIndex);
        dataBuffer = dataBuffer.slice(newlineIndex + 1);

        if (line.trim()) {
            try {
                const command = JSON.parse(line);
                if (command.action === 'start_capture' && command.requestedPins) {
                    requestedPins = command.requestedPins;
                    startCapture();
                } else if (command.action === 'stop_capture') {
                    stopCapture();
                }
            } catch (e) {
                console.warn('⚠️ 解析指令失败:', e.message);
            }
        }
    }
});

client.on('error', (err) => console.error('❌ 连接错误:', err.message));
client.on('close', () => {
    console.log('🔌 连接已断开');
    stopCapture();
});