const db = require('../utils/database');
const pool = () => db.getPool();

class DataRecord {
    static async create(recordData) {
        const {
            device_id,
            parsed_data,
            timestamp = new Date()
        } = recordData;

        if (!parsed_data || !parsed_data.waveforms) {
            throw new Error('创建数据记录失败：parsed_data 或 parsed_data.waveforms 未提供。');
        }

        const deviceDbId = await DataRecord._getOrCreateDevice(device_id);
        
        const sql = `
            INSERT INTO experiment_data (device_id, timestamp, waveforms_json, pin_mapping_json)
            VALUES (?, ?, ?, ?)
        `;

        const [result] = await pool().execute(sql, [
            deviceDbId,
            timestamp,
            JSON.stringify(parsed_data.waveforms),
            JSON.stringify(recordData.parsed_data?.pinMapping || [])
        ]);

        return result.insertId;
    }

    static async _getOrCreateDevice(deviceIdStr) {
        const [rows] = await pool().execute(
            'SELECT id FROM devices WHERE device_id = ?',
            [deviceIdStr]
        );
        
        if (rows.length > 0) {
            return rows[0].id;
        }
        
        const [insertResult] = await pool().execute(
            `INSERT INTO devices (device_id, name, device_type, status) VALUES (?, ?, ?, 'online')`,
            [deviceIdStr, `自动设备 ${deviceIdStr}`, 'FPGA_AUTO']
        );
        
        console.log(`📝 自动创建设备: ${deviceIdStr}`);
        
        return insertResult.insertId;
    }

    static async getRecentRecords(deviceId, limit = 100) {
        try {
            const deviceDbId = await DataRecord._getOrCreateDevice(deviceId);
            
            const [rows] = await pool().execute(
                `SELECT id, timestamp, waveforms_json
                 FROM experiment_data
                 WHERE device_id = ?
                 ORDER BY timestamp DESC
                 LIMIT ?`,
                [deviceDbId, limit]
            );

            return rows.map(row => ({
                id: row.id,
                timestamp: row.timestamp,
                waveforms: DataRecord._safeJsonParse(row.waveforms_json)
            }));
        } catch (error) {
            console.error('获取最近记录失败:', error);
            return [];
        }
    }

    static _safeJsonParse(jsonString) {
        if (!jsonString) return null;
        // 如果已经是对象，直接返回
        if (typeof jsonString !== 'string') {
            return jsonString;
        }
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error('JSON 解析失败:', e.message, '原始数据:', typeof jsonString === 'string' ? jsonString.substring(0, 100) : jsonString);
            return null;
        }
    }

    static async getSubmissionRecords(submissionId) {
        try {
            const [rows] = await pool().execute(
                `SELECT id, timestamp, waveforms_json, pin_mapping_json
                 FROM experiment_data
                 WHERE submission_id = ?
                 ORDER BY timestamp ASC`,
                [submissionId]
            );

            return rows.map(row => ({
                id: row.id,
                timestamp: row.timestamp,
                waveforms: DataRecord._safeJsonParse(row.waveforms_json),
                pin_mapping: DataRecord._safeJsonParse(row.pin_mapping_json) || []
            }));
        } catch (error) {
            console.error('获取提交记录失败:', error);
            return [];
        }
    }

    static async getDataStats(deviceId) {
        try {
            const deviceDbId = await DataRecord._getOrCreateDevice(deviceId);
            
            const [rows] = await pool().execute(
                `SELECT 
                    COUNT(*) as total_records,
                    MIN(timestamp) as first_record,
                    MAX(timestamp) as last_record
                 FROM experiment_data 
                 WHERE device_id = ?`,
                [deviceDbId]
            );

            return rows[0] || { total_records: 0 };
        } catch (error) {
            console.error('获取数据统计失败:', error);
            return { total_records: 0 };
        }
    }

    static async getDataAnalysis(submissionId) {
        try {
            const records = await DataRecord.getSubmissionRecords(submissionId);

            if (records.length === 0) {
                return null;
            }

            let totalHighCount = 0;
            let totalLowCount = 0;

            records.forEach(record => {
                if (record.waveforms) {
                    record.waveforms.forEach(channel => {
                        channel.forEach(v => {
                            if (v === 1) totalHighCount++;
                            else totalLowCount++;
                        });
                    });
                }
            });

            return {
                total_records: records.length,
                total_high: totalHighCount,
                total_low: totalLowCount,
                high_ratio: totalHighCount / (totalHighCount + totalLowCount) || 0,
                first_timestamp: records[0]?.timestamp,
                last_timestamp: records[records.length - 1]?.timestamp
            };
        } catch (error) {
            console.error('获取数据分析失败:', error);
            return null;
        }
    }

    static async exportToCSV(submissionId) {
        try {
            const records = await DataRecord.getSubmissionRecords(submissionId);
            
            if (records.length === 0) {
                return '';
            }

            const headers = ['timestamp'];
            for (let ch = 0; ch < 32; ch++) {
                headers.push(`CH${ch}`);
            }
            
            const csvRows = [headers.join(',')];
            
            records.forEach(record => {
                const row = [record.timestamp];
                
                if (record.waveforms && record.waveforms.length > 0) {
                    for (let ch = 0; ch < 32; ch++) {
                        const channelData = record.waveforms[ch];
                        if (channelData && channelData.length > 0) {
                            row.push(channelData[channelData.length - 1]);
                        } else {
                            row.push(0);
                        }
                    }
                } else {
                    row.push(...Array(32).fill(0));
                }
                
                csvRows.push(row.join(','));
            });

            return csvRows.join('\n');
        } catch (error) {
            console.error('导出CSV失败:', error);
            return '';
        }
    }

    static async cleanupOldData(daysToKeep = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const [result] = await pool().execute(
            `DELETE FROM experiment_data 
             WHERE timestamp < ?`,
            [cutoffDate]
        );

        console.log(`清理了 ${result.affectedRows} 条旧数据（早于 ${cutoffDate.toISOString()}）`);
        return result.affectedRows;
    }
}

module.exports = DataRecord;
