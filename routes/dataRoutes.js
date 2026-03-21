const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const DataRecord = require('../models/DataRecord');
const Device = require('../models/Device');
const db = require('../utils/database'); 

/**
 * 获取设备数据
 * GET /api/data/device/:deviceId
 */
router.get('/device/:deviceId', authenticate, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { limit = 100, start_time, end_time, format = 'json' } = req.query;
        
        // 验证设备权限
        const device = await Device.findByDeviceId(deviceId);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }
        
        // 检查权限
        if (req.user.role === 'student' && device.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此设备数据'
            });
        }
        
        let data;
        if (start_time || end_time) {
            data = await DataRecord.getDeviceDataByTimeRange(
                deviceId,
                start_time || '2000-01-01',
                end_time || '2100-01-01'
            );
        } else {
            data = await DataRecord.getRecentRecords(deviceId, parseInt(limit));
        }
        
        // 根据格式返回数据
        if (format === 'csv') {
            // 简化的CSV导出
            let csv = 'timestamp,device_id,led_data,switch_data,digit_tube_data,ad_data,da_data\n';
            data.forEach(record => {
                csv += `"${record.timestamp}","${record.device_id}","${record.led_data}","${record.switch_data}","${record.digit_tube_data}","${record.ad_data}","${record.da_data}"\n`;
            });
            
            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', `attachment; filename=device_${deviceId}_data.csv`);
            return res.send(csv);
        }
        
        // 默认返回JSON
        res.json({
            success: true,
            device: {
                id: device.device_id,
                name: device.device_name,
                status: device.status
            },
            data: data,
            count: data.length,
            stats: await DataRecord.getDataStats(deviceId)
        });
        
    } catch (error) {
        console.error('获取设备数据错误:', error);
        res.status(500).json({
            success: false,
            error: '获取设备数据失败'
        });
    }
});

/**
 * 获取实验提交数据
 * GET /api/data/submission/:submissionId
 */
router.get('/submission/:submissionId', authenticate, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { format = 'json', analysis = 'false' } = req.query;
        
        // 获取提交数据
        const data = await DataRecord.getSubmissionRecords(submissionId);
        
        if (data.length === 0) {
            return res.status(404).json({
                success: false,
                error: '未找到实验数据'
            });
        }
        
        // 检查权限（这里需要根据业务逻辑实现）
        // 简化为允许访问
        
        // 根据格式返回数据
        if (format === 'csv') {
            const csv = await DataRecord.exportToCSV(submissionId);
            
            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', `attachment; filename=submission_${submissionId}.csv`);
            return res.send(csv);
        }
        
        const response = {
            success: true,
            submission_id: submissionId,
            data: data,
            count: data.length,
            time_range: {
                start: data[0].timestamp,
                end: data[data.length - 1].timestamp
            }
        };
        
        // 如果需要分析报告
        if (analysis === 'true') {
            response.analysis = await DataRecord.getDataAnalysis(submissionId);
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('获取实验数据错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验数据失败'
        });
    }
});

/**
 * 实时数据上传接口（供ESP32等设备调用）
 * POST /api/data/upload
 */
router.post('/upload', async (req, res) => {
    try {
        const { device_id, data_hex, submission_id, timestamp } = req.body;
        
        if (!device_id || !data_hex) {
            return res.status(400).json({
                success: false,
                error: '设备ID和数据不能为空'
            });
        }
        
        // 验证设备是否存在
        const device = await Device.findByDeviceId(device_id);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }
        
        // 验证设备与实验提交的匹配关系
        if (submission_id) {
            const pool = db.getPool();
            const [submissions] = await pool.execute(
                'SELECT student_id FROM experiment_submissions WHERE id = ?',
                [submission_id]
            );
            
            if (submissions.length > 0 && device.student_id !== submissions[0].student_id) {
                return res.status(403).json({
                    success: false,
                    error: '设备与实验提交不匹配'
                });
            }
        }
        
        // 创建数据记录
        const recordId = await DataRecord.create({
            device_id,
            submission_id,
            hex_data: data_hex,
            timestamp: timestamp ? new Date(timestamp) : new Date()
        });
        
        // 更新设备最后在线时间
        await Device.updateLastSeen(device_id);
        
        // 广播数据到WebSocket（如果有）
        try {
            const { broadcastDeviceData } = require('../utils/socketManager');
            const parsedData = require('../utils/dataParser').parseHexData(data_hex);
            broadcastDeviceData(device_id, parsedData);
        } catch (error) {
            console.error('WebSocket广播失败:', error);
        }
        
        res.json({
            success: true,
            message: '数据上传成功',
            record_id: recordId,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('数据上传错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '数据上传失败'
        });
    }
});

/**
 * 批量上传数据
 * POST /api/data/batch-upload
 */
router.post('/batch-upload', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { device_id, data_array } = req.body;
        
        if (!device_id || !Array.isArray(data_array)) {
            return res.status(400).json({
                success: false,
                error: '设备ID和数据数组不能为空'
            });
        }
        
        // 验证设备
        const device = await Device.findByDeviceId(device_id);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }
        
        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // 批量插入数据
        for (const dataItem of data_array) {
            try {
                await DataRecord.create({
                    device_id,
                    hex_data: dataItem.data_hex,
                    timestamp: dataItem.timestamp ? new Date(dataItem.timestamp) : new Date()
                });
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push({
                    index: data_array.indexOf(dataItem),
                    error: error.message
                });
                console.error('批量上传数据项错误:', error);
            }
        }
        
        // 更新设备状态
        await Device.updateLastSeen(device_id);
        
        res.json({
            success: true,
            message: `批量上传完成，成功 ${successCount} 条，失败 ${errorCount} 条`,
            stats: {
                total: data_array.length,
                success: successCount,
                failed: errorCount
            },
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('批量上传错误:', error);
        res.status(500).json({
            success: false,
            error: '批量上传失败'
        });
    }
});

/**
 * 数据统计分析
 * GET /api/data/analysis/:submissionId
 */
router.get('/analysis/:submissionId', authenticate, async (req, res) => {
    try {
        const { submissionId } = req.params;
        
        const analysis = await DataRecord.getDataAnalysis(submissionId);
        
        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: '未找到分析数据'
            });
        }
        
        res.json({
            success: true,
            analysis: analysis
        });
        
    } catch (error) {
        console.error('数据分析错误:', error);
        res.status(500).json({
            success: false,
            error: '数据分析失败'
        });
    }
});

/**
 * 删除数据（仅管理员）
 * DELETE /api/data/:recordId
 */
router.delete('/:recordId', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { recordId } = req.params;
        
        const pool = db.getPool();
        const [result] = await pool.execute(
            'DELETE FROM experiment_data WHERE id = ?',
            [recordId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: '数据记录不存在'
            });
        }
        
        // 记录日志
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'delete_data', ?)`,
            [req.user.id, `删除数据记录: ${recordId}`]
        );
        
        res.json({
            success: true,
            message: '数据删除成功',
            affected_rows: result.affectedRows
        });
        
    } catch (error) {
        console.error('删除数据错误:', error);
        res.status(500).json({
            success: false,
            error: '删除数据失败'
        });
    }
});

/**
 * 清理旧数据（仅管理员）
 * POST /api/data/cleanup
 */
router.post('/cleanup', authenticate, authorize(['admin']), async (req, res) => {
    try {
        const { days = 30 } = req.body;
        
        const cleanedCount = await DataRecord.cleanupOldData(parseInt(days));
        
        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'cleanup_data', ?)`,
            [req.user.id, `清理 ${days} 天前的数据，共 ${cleanedCount} 条`]
        );
        
        res.json({
            success: true,
            message: `数据清理完成，清理了 ${cleanedCount} 条 ${days} 天前的数据`
        });
        
    } catch (error) {
        console.error('清理数据错误:', error);
        res.status(500).json({
            success: false,
            error: '清理数据失败'
        });
    }
});

/**
 * 获取数据统计信息
 * GET /api/data/stats
 */
router.get('/stats', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const pool = db.getPool();
        const [stats] = await pool.execute(`
            SELECT COUNT(*) as total_records,
                   SUM(LENGTH(raw_hex_data)) as total_bytes,
                   COUNT(DISTINCT device_id) as devices_with_data,
                   COUNT(DISTINCT submission_id) as submissions_with_data
            FROM experiment_data
        `);
        
        res.json({
            success: true,
            stats: stats[0]
        });
    } catch (error) {
        console.error('获取数据统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取统计失败'
        });
    }
});

module.exports = router;