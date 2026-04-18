const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Device = require('../models/Device');
const db = require('../utils/database');

// =====================================================
// 静态路由（无参数）- 必须放在参数路由之前
// =====================================================

// 获取所有设备
router.get('/', authenticate, async (req, res) => {
    try {
        const devices = await Device.getUserDevices(req.user.id, req.user.role);
        res.json({
            success: true,
            devices: devices
        });
    } catch (error) {
        console.error('获取设备列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取设备列表失败'
        });
    }
});

// 创建设备（仅教师/管理员）
router.post('/', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const deviceId = await Device.create(req.body);
        res.json({
            success: true,
            message: '设备创建成功',
            deviceId: deviceId
        });
    } catch (error) {
        console.error('创建设备错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '创建设备失败'
        });
    }
});

// 获取设备统计信息
router.get('/stats', authenticate, async (req, res) => {
    try {
        const stats = await Device.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('获取设备统计信息错误:', error);
        res.status(500).json({ success: false, error: error.message || '获取设备统计信息失败' });
    }
});

// 获取设备统计大屏数据（教师专用）
router.get('/overview', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const pool = db.getPool();

        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
                SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline,
                SUM(CASE WHEN status = 'faulty' THEN 1 ELSE 0 END) as faulty,
                SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance,
                0 as fault_count,
                0 as total_power_ons
            FROM devices
        `);

        const [recentDevices] = await pool.execute(`
            SELECT device_id, name, status, last_seen_at
            FROM devices
            ORDER BY last_seen_at DESC
            LIMIT 10
        `);

        const [faultyDevices] = await pool.execute(`
            SELECT device_id, name, asset_number
            FROM devices
            WHERE status = 'faulty'
            ORDER BY last_seen_at DESC
            LIMIT 5
        `);

        const [todayActivity] = await pool.execute(`
            SELECT COUNT(*) as submissions_today
            FROM experiment_submissions
            WHERE DATE(started_at) = CURDATE()
        `);

        res.json({
            success: true,
            data: {
                overview: {
                    total: stats[0].total || 0,
                    online: stats[0].online || 0,
                    offline: stats[0].offline || 0,
                    faulty: stats[0].faulty || 0,
                    maintenance: stats[0].maintenance || 0,
                    totalPowerOns: stats[0].total_power_ons || 0
                },
                recentDevices: recentDevices,
                faultyDevices: faultyDevices,
                todayActivity: {
                    submissions: todayActivity[0].submissions_today || 0
                }
            }
        });
    } catch (error) {
        console.error('获取设备概览错误:', error);
        res.status(500).json({
            success: false,
            error: '获取设备概览失败'
        });
    }
});

// 批量更新设备状态
router.post('/batch/status', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { deviceIds, status } = req.body;
        if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
            return res.status(400).json({ success: false, error: 'deviceIds必须是一个非空数组' });
        }
        const count = await Device.batchUpdateStatus(deviceIds, status);
        res.json({ success: true, message: `已更新${count}个设备的状态`, count: count });
    } catch (error) {
        console.error('批量更新设备状态错误:', error);
        res.status(500).json({ success: false, error: error.message || '批量更新设备状态失败' });
    }
});

// 获取当前 TCP 在线设备列表及分配情况（教师专用）
router.get('/online-assignments', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { getTCPServer } = require('../utils/tcpServer');
        const { getDeviceAssignments } = require('../utils/socketManager');

        const tcpServer = getTCPServer();
        const onlineDeviceIds = tcpServer
            ? Array.from(tcpServer.deviceSocketMap.keys())
            : [];

        const assignments = getDeviceAssignments();

        res.json({
            success: true,
            data: {
                onlineDevices: onlineDeviceIds,
                assignments: assignments
            }
        });
    } catch (error) {
        console.error('获取在线设备分配情况错误:', error);
        res.status(500).json({
            success: false,
            error: '获取在线设备分配情况失败'
        });
    }
});

// =====================================================
// 动态路由（参数路由）- 必须放在最后
// =====================================================

// 获取设备详情
router.get('/:deviceId', authenticate, async (req, res) => {
    try {
        const device = await Device.findByDeviceId(req.params.deviceId);
        
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }
        
        if (req.user.role === 'student' && device.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此设备'
            });
        }
        
        res.json({
            success: true,
            device: device
        });
    } catch (error) {
        console.error('获取设备详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取设备详情失败'
        });
    }
});

// 分配设备（仅教师/管理员）
router.post('/:deviceId/allocate', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { student_id, class_id, notes } = req.body;

        await Device.allocateToStudent(
            req.params.deviceId,
            student_id,
            class_id,
            req.user.id,
            notes
        );

        const socketManager = require('../utils/socketManager');
        socketManager.notifyStudentDeviceAllocated(student_id, req.params.deviceId);

        // 【修复】同时通知两个 IO 实例的 teachers 房间
        const teacherIO = socketManager.getTeacherIO();
        const io = socketManager.getIO();
        const notifyData = {
            deviceId: req.params.deviceId,
            studentId: student_id,
            action: 'allocate',
            timestamp: new Date().toISOString()
        };
        if (teacherIO) teacherIO.to('teachers').emit('allocation_updated', notifyData);
        if (io && io !== teacherIO) io.to('teachers').emit('allocation_updated', notifyData);

        res.json({
            success: true,
            message: '设备分配成功'
        });
    } catch (error) {
        console.error('分配设备错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '分配设备失败'
        });
    }
});

// 发送命令到设备
router.post('/:deviceId/command', authenticate, async (req, res) => {
    try {
        const { command, data } = req.body;
        const deviceId = req.params.deviceId;
        
        const device = await Device.findByDeviceId(deviceId);
        if (!device) {
            return res.status(404).json({ success: false, error: '设备不存在' });
        }
        
        if (req.user.role === 'student' && device.student_id !== req.user.id) {
            return res.status(403).json({ success: false, error: '没有权限控制此设备' });
        }
        
        const tcpServer = require('../utils/tcpServer').getTCPServer();
        if (!tcpServer) {
            return res.status(503).json({ success: false, error: 'TCP服务器未启动' });
        }
        const sent = tcpServer.sendCommand(deviceId, command, data);
        
        if (sent) {
            res.json({ success: true, message: '命令发送成功' });
        } else {
            res.status(400).json({ success: false, error: '设备未连接' });
        }
    } catch (error) {
        console.error('发送命令错误:', error);
        res.status(500).json({ success: false, error: '发送命令失败' });
    }
});

// 解除设备分配
router.post('/:deviceId/deallocate', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        await Device.deallocateDevice(req.params.deviceId);

        const socketManager = require('../utils/socketManager');
        // 【修复】同时通知两个 IO 实例的 teachers 房间
        const teacherIO = socketManager.getTeacherIO();
        const io = socketManager.getIO();
        const notifyData = {
            deviceId: req.params.deviceId,
            studentId: null,
            action: 'deallocate',
            timestamp: new Date().toISOString()
        };
        if (teacherIO) teacherIO.to('teachers').emit('allocation_updated', notifyData);
        if (io && io !== teacherIO) io.to('teachers').emit('allocation_updated', notifyData);

        res.json({ success: true, message: '设备分配已解除' });
    } catch (error) {
        console.error('解除设备分配错误:', error);
        res.status(500).json({ success: false, error: error.message || '解除设备分配失败' });
    }
});

// 下发板卡故障检测指令
router.post('/:deviceId/diagnose', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { deviceId } = req.params;
        
        const device = await Device.findByDeviceId(deviceId);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }

        const tcpServer = require('../utils/tcpServer').getTCPServer();
        if (!tcpServer) {
            return res.status(503).json({
                success: false,
                error: 'TCP服务器未启动'
            });
        }

        const diagnoseCommand = {
            action: 'diagnose',
            deviceId: deviceId,
            timestamp: new Date().toISOString()
        };

        const sent = tcpServer.sendCommand(deviceId, diagnoseCommand);

        if (sent) {
            const pool = db.getPool();
            await pool.execute(
                `INSERT INTO system_logs (user_id, device_id, action_type, action_description)
                 VALUES (?, (SELECT id FROM devices WHERE device_id = ?), 'device_diagnose', ?)`,
                [req.user.id, deviceId, `下发故障检测指令到设备: ${deviceId}`]
            );

            res.json({
                success: true,
                message: '故障检测指令已下发',
                data: {
                    deviceId: deviceId,
                    command: diagnoseCommand
                }
            });
        } else {
            res.status(400).json({
                success: false,
                error: '设备未连接，指令发送失败'
            });
        }
    } catch (error) {
        console.error('下发故障检测指令错误:', error);
        res.status(500).json({
            success: false,
            error: '下发故障检测指令失败'
        });
    }
});

// 获取设备状态历史
router.get('/:deviceId/history', authenticate, async (req, res) => {
    try {
        const device = await Device.findByDeviceId(req.params.deviceId);
        
        if (!device) {
            return res.status(404).json({ success: false, error: '设备不存在' });
        }
        
        if (req.user.role === 'student' && device.student_id !== req.user.id) {
            return res.status(403).json({ success: false, error: '没有权限查看此设备' });
        }
        
        const sql = `
            SELECT status, recorded_at, cpu_usage, memory_usage, temperature
            FROM device_status_history
            WHERE device_id = (SELECT id FROM devices WHERE device_id = ?)
            ORDER BY recorded_at DESC
            LIMIT 100
        `;
        
        const pool = db.getPool();
        const [rows] = await pool.execute(sql, [req.params.deviceId]);
        
        res.json({ success: true, history: rows });
    } catch (error) {
        console.error('获取设备历史错误:', error);
        res.status(500).json({ success: false, error: '获取设备历史失败' });
    }
});

module.exports = router;
