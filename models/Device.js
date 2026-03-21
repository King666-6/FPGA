const db = require('../utils/database'); // 导入整个工具对象

class Device {
    // 创建设备
    static async create(deviceData) {
        const pool = db.getPool(); // 获取连接池
        const { device_id, device_name, device_type, mac_address, asset_number } = deviceData;
        
        const sql = `
            INSERT INTO devices (device_id, name, device_type, mac_address, asset_number, status)
            VALUES (?, ?, ?, ?, ?, 'offline')
        `;
        
        const [result] = await pool.execute(sql, [
            device_id, device_name, device_type, mac_address, asset_number
        ]);
        
        return result.insertId;
    }
    
    // 根据设备ID查找设备
    static async findByDeviceId(deviceId) {
        const pool = db.getPool(); // 获取连接池
        const sql = `
            SELECT d.*, u.username as student_name, u.real_name as student_full_name
            FROM devices d
            LEFT JOIN device_allocations da ON d.id = da.device_id AND da.allocation_status = 'allocated'
            LEFT JOIN users u ON da.student_id = u.id
            WHERE d.device_id = ?
        `;
        
        const [rows] = await pool.execute(sql, [deviceId]);
        return rows[0] || null;
    }
    
    // 获取用户的所有设备
    static async getUserDevices(userId, role) {
        const pool = db.getPool(); // 获取连接池
        let sql = '';
        let params = [];
        
        if (role === 'student') {
            sql = `
                SELECT d.* 
                FROM devices d
                JOIN device_allocations da ON d.id = da.device_id
                WHERE da.student_id = ? AND da.allocation_status = 'allocated'
                ORDER BY d.last_seen_at DESC
            `;
            params = [userId];
        } else if (role === 'teacher' || role === 'admin') {
            sql = `
                SELECT d.*, u.username as student_name, u.real_name as student_full_name
                FROM devices d
                LEFT JOIN device_allocations da ON d.id = da.device_id AND da.allocation_status = 'allocated'
                LEFT JOIN users u ON da.student_id = u.id
                ORDER BY d.status DESC, d.last_seen_at DESC
            `;
        }
        
        const [rows] = await pool.execute(sql, params);
        return rows;
    }
    
    // 更新设备状态
    static async updateStatus(deviceId, status) {
        const pool = db.getPool(); // 获取连接池
        const sql = `
            UPDATE devices
            SET status = ?, last_seen_at = NOW()
            WHERE device_id = ?
        `;
        
        await pool.execute(sql, [status, deviceId]);
        
        // 记录状态历史
        const historySql = `
            INSERT INTO device_status_history (device_id, status, recorded_at)
            VALUES ((SELECT id FROM devices WHERE device_id = ?), ?, NOW())
        `;
        
        await pool.execute(historySql, [deviceId, status]);
    }
    
    // 更新设备最后在线时间
    static async updateLastSeen(deviceId) {
        const pool = db.getPool(); // 获取连接池
        const sql = `
            UPDATE devices 
            SET last_seen_at = NOW(), status = 'online'
            WHERE device_id = ?
        `;
        
        await pool.execute(sql, [deviceId]);
    }
    
    // 分配设备给学生
    static async allocateToStudent(deviceId, studentId, classId, allocatedBy, notes = '') {
        const pool = db.getPool(); // 获取连接池

        // 首先检查设备是否已分配
        const checkSql = `
            SELECT * FROM device_allocations 
            WHERE device_id = (SELECT id FROM devices WHERE device_id = ?) 
            AND allocation_status = 'allocated'
        `;
        
        const [existing] = await pool.execute(checkSql, [deviceId]);
        
        if (existing.length > 0) {
            throw new Error('设备已被分配');
        }
        
        // 获取设备ID
        const deviceSql = 'SELECT id FROM devices WHERE device_id = ?';
        const [deviceRows] = await pool.execute(deviceSql, [deviceId]);
        
        if (deviceRows.length === 0) {
            throw new Error('设备不存在');
        }
        
        const deviceDbId = deviceRows[0].id;
        
        // 分配设备
        const allocateSql = `
            INSERT INTO device_allocations (device_id, student_id, class_id, allocated_by, notes)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        await pool.execute(allocateSql, [deviceDbId, studentId, classId, allocatedBy, notes]);
        
        // 更新设备状态
        await this.updateStatus(deviceId, 'online');
    }
    
    // 获取所有设备
    static async getAll(filters = {}) {
        const pool = db.getPool(); // 获取连接池
        let sql = `
            SELECT d.*, 
                   u.username as student_name,
                   u.real_name as student_full_name,
                   c.name as allocated_class
            FROM devices d
            LEFT JOIN device_allocations da ON d.id = da.device_id AND da.allocation_status = 'allocated'
            LEFT JOIN users u ON da.student_id = u.id
            LEFT JOIN classes c ON da.class_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (filters.status) {
            sql += ' AND d.status = ?';
            params.push(filters.status);
        }
        
        if (filters.device_type) {
            sql += ' AND d.device_type = ?';
            params.push(filters.device_type);
        }
        
        if (filters.allocated) {
            sql += ' AND da.allocation_status = ?';
            params.push('allocated');
        }
        
        sql += ' ORDER BY d.last_seen_at DESC';

        const [rows] = await pool.execute(sql, params);
        return rows;
    }
    
    // 解除设备分配
    static async deallocateDevice(deviceId) {
        const pool = db.getPool(); // 获取连接池
        
        // 获取设备ID
        const deviceSql = 'SELECT id FROM devices WHERE device_id = ?';
        const [deviceRows] = await pool.execute(deviceSql, [deviceId]);
        
        if (deviceRows.length === 0) {
            throw new Error('设备不存在');
        }
        
        const deviceDbId = deviceRows[0].id;
        
        // 更新设备分配状态
        const sql = `
            UPDATE device_allocations 
            SET allocation_status = 'returned', returned_at = NOW() 
            WHERE device_id = ? AND allocation_status = 'allocated'
        `;
        await pool.execute(sql, [deviceDbId]);
        
        // 更新设备状态
        await this.updateStatus(deviceId, 'offline');
    }
    
    // 批量更新设备状态
    static async batchUpdateStatus(deviceIds, status) {
        const pool = db.getPool(); // 获取连接池
        
        // 获取设备数据库ID
        const deviceSql = 'SELECT id FROM devices WHERE device_id IN (?)';
        const [deviceRows] = await pool.execute(deviceSql, [deviceIds]);
        const deviceDbIds = deviceRows.map(row => row.id);
        
        if (deviceDbIds.length === 0) {
            throw new Error('没有找到要更新的设备');
        }
        
        // 更新设备状态
        const sql = `
            UPDATE devices 
            SET status = ?, last_seen_at = NOW() 
            WHERE id IN (?)
        `;
        await pool.execute(sql, [status, deviceDbIds]);
        
        // 记录状态历史
        const historySql = `
            INSERT INTO device_status_history (device_id, status, recorded_at) 
            VALUES ?
        `;
        const historyValues = deviceDbIds.map(deviceId => [deviceId, status, new Date()]);
        await pool.execute(historySql, [historyValues]);
        
        return deviceDbIds.length;
    }
    
    // 获取设备统计信息
    static async getStats() {
        const pool = db.getPool(); // 获取连接池
        
        const sql = `
            SELECT 
                COUNT(*) as total_devices,
                COUNT(CASE WHEN status = 'online' THEN 1 END) as online_devices,
                COUNT(CASE WHEN status = 'offline' THEN 1 END) as offline_devices,
                COUNT(CASE WHEN status = 'maintenance' THEN 1 END) as maintenance_devices,
                COUNT(CASE WHEN status = 'faulty' THEN 1 END) as faulty_devices,
                COUNT(CASE WHEN da.allocation_status = 'allocated' THEN 1 END) as allocated_devices
            FROM devices d
            LEFT JOIN device_allocations da ON d.id = da.device_id AND da.allocation_status = 'allocated'
        `;
        
        const [rows] = await pool.execute(sql);
        return rows[0] || {};
    }
}

module.exports = Device;