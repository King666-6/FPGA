const { EventEmitter } = require('events');

const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);
const FRAME_LENGTH = 72;
const PAYLOAD_LENGTH = 64;
const BITS_PER_PAYLOAD = PAYLOAD_LENGTH * 8;

class DataParser extends EventEmitter {
    constructor(deviceId) {
        super();
        this.deviceId = deviceId;
        this.buffer = Buffer.alloc(0);
        this.packetCache = new Map();
        this.debounceTimeout = null;
        this.DEBOUNCE_DELAY = 100;
        this.expectedTotalPackets = null;
    }

    setExpectedPacketCount(count) {
        this.expectedTotalPackets = count;
        console.log(`📋 [${this.deviceId}] 设置期望包数: ${count}`);
    }

    getExpectedPacketCount() {
        return this.expectedTotalPackets;
    }

    addData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._processBuffer();
        this._resetDebounceTimer();
    }

    _resetDebounceTimer() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
        }
        
        if (this.packetCache.size > 0) {
            this.debounceTimeout = setTimeout(() => {
                if (this.packetCache.size > 0) {
                    console.log(`⏱️ [${this.deviceId}] 防抖超时，主动处理缓存数据`);
                    this._processFullCycle();
                }
            }, this.DEBOUNCE_DELAY);
        }
    }

    _processBuffer() {
        while (this.buffer.length >= FRAME_LENGTH) {
            const headerIndex = this.buffer.indexOf(FRAME_HEADER);

            if (headerIndex === -1) {
                this.buffer = this.buffer.slice(this.buffer.length - FRAME_HEADER.length + 1);
                return;
            }

            if (headerIndex > 0) {
                this.buffer = this.buffer.slice(headerIndex);
            }

            if (this.buffer.length < FRAME_LENGTH) {
                return;
            }

            const frame = this.buffer.slice(0, FRAME_LENGTH);
            this.buffer = this.buffer.slice(FRAME_LENGTH);

            this._cacheFrame(frame);
        }
    }

    _cacheFrame(frame) {
        const sequence = frame.readUInt16BE(6);

        if (this.expectedTotalPackets !== null) {
            if (sequence === 0 && this.packetCache.size > 0) {
                this._processFullCycle();
            }
            this.packetCache.set(sequence, this._parsePayloadToBits(frame.slice(8, FRAME_LENGTH)));
            
            if (this.packetCache.size === this.expectedTotalPackets) {
                console.log(`✅ [${this.deviceId}] 已收到全部 ${this.expectedTotalPackets} 个数据包，触发完整周期处理`);
                this._processFullCycle();
            }
        } else {
            if (sequence === 0 && this.packetCache.size > 0) {
                this._processFullCycle();
            }
            const payload = frame.slice(8, FRAME_LENGTH);
            const bitArray = this._parsePayloadToBits(payload);
            this.packetCache.set(sequence, bitArray);
        }
    }

    _parsePayloadToBits(payload) {
        const bits = new Array(BITS_PER_PAYLOAD);
        for (let byteIndex = 0; byteIndex < PAYLOAD_LENGTH; byteIndex++) {
            const byteValue = payload[byteIndex];
            for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
                const bitPosition = bitIndex;
                const bitValue = (byteValue >> bitPosition) & 1;
                bits[byteIndex * 8 + bitIndex] = bitValue;
            }
        }
        return bits;
    }

    _processFullCycle() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }
        
        try {
            const waveforms = [];
            const maxSequence = Math.max(...this.packetCache.keys());

            for (let seq = 0; seq <= maxSequence; seq++) {
                const bitArray = this.packetCache.get(seq);
                if (bitArray) {
                    waveforms.push(bitArray);
                } else {
                    // 缺失的数据填充全0占位数组
                    waveforms.push(new Array(BITS_PER_PAYLOAD).fill(0));
                }
            }

            this.emit('full-cycle-ready', {
                deviceId: this.deviceId,
                waveforms: waveforms,
            });
        } catch (error) {
            this.emit('parse-error', {
                deviceId: this.deviceId,
                message: `处理完整周期数据失败: ${error.message}`,
            });
        }
        this._resetCache();
    }

    _resetCache() {
        this.packetCache.clear();
    }
}

module.exports = DataParser;
