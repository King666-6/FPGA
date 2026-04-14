const { EventEmitter } = require('events');

const LARGE_FRAME_HEADER = Buffer.from([0xFF, 0xFE]);
const LARGE_HEADER_SIZE = 10;
const FRAME_HEADER = Buffer.from([0xFF, 0xFE, 0xCC, 0xCC, 0xCC, 0xCC]);
const FRAME_LENGTH = 72;
const PAYLOAD_LENGTH = 64;

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

        while (this.buffer.length >= LARGE_HEADER_SIZE) {
            const headerIndex = this.buffer.indexOf(LARGE_FRAME_HEADER);

            if (headerIndex === -1) {
                this.buffer = Buffer.alloc(0);
                break;
            }

            if (headerIndex > 0) {
                this.buffer = this.buffer.slice(headerIndex);
            }

            if (this.buffer.length < LARGE_HEADER_SIZE) {
                break;
            }

            const totalLength = this.buffer.readUInt16BE(2);

            if (totalLength < LARGE_HEADER_SIZE) {
                this.buffer = this.buffer.slice(LARGE_HEADER_SIZE);
                continue;
            }

            if (this.buffer.length < totalLength) {
                break;
            }

            const largePacket = this.buffer.slice(0, totalLength);
            this.buffer = this.buffer.slice(totalLength);

            this.addLargePacket(largePacket);
        }
    }

    addLargePacket(chunk) {
        const totalLength = chunk.readUInt16BE(2);
        if (chunk.length !== totalLength) {
            this.emit('parse-error', {
                deviceId: this.deviceId,
                message: `大包长度不匹配：期望${totalLength}，实际${chunk.length}`
            });
            return;
        }

        const packetCount = chunk.readUInt16BE(4);
        const deviceNumber = chunk.slice(6, 10);

        if (this.expectedTotalPackets !== null && packetCount !== this.expectedTotalPackets) {
            console.warn(`⚠️ [${this.deviceId}] 大包计数(${packetCount})与期望(${this.expectedTotalPackets})不一致`);
        }

        const payloadStart = LARGE_HEADER_SIZE;
        const expectedSubframes = Math.floor((totalLength - LARGE_HEADER_SIZE) / FRAME_LENGTH);

        for (let i = 0; i < expectedSubframes; i++) {
            const offset = payloadStart + i * FRAME_LENGTH;

            if (offset + FRAME_LENGTH > chunk.length) {
                break;
            }

            const subFrame = chunk.slice(offset, offset + FRAME_LENGTH);
            const subHeader = subFrame.slice(0, 6);

            if (!subHeader.equals(FRAME_HEADER)) {
                continue;
            }

            const sequence = subFrame.readUInt16BE(6);
            const payload = subFrame.slice(8, 72);
            let highCount = 0;
            for (let b = 0; b < payload.length; b++) {
                if (payload[b] === 0xFF) highCount++;
            }
            const pinState = (highCount / payload.length) > 0.8 ? 1 : 0;

            this.packetCache.set(sequence, pinState);
        }

        if (this.packetCache.size > 0) {
            this._emitSnapshot();
        }
    }

    _emitSnapshot() {
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = null;
        }

        try {
            const sequences = Array.from(this.packetCache.keys()).sort((a, b) => a - b);
            const pinStates = sequences.map(seq => this.packetCache.get(seq));

            this.emit('snapshot-ready', {
                deviceId: this.deviceId,
                pinStates: pinStates
            });
        } catch (error) {
            this.emit('parse-error', {
                deviceId: this.deviceId,
                message: `处理快照数据失败: ${error.message}`
            });
        }

        this._resetCache();
    }

    _resetCache() {
        this.packetCache.clear();
    }
}

module.exports = DataParser;