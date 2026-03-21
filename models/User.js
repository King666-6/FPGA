const db = require('../utils/database');
const bcrypt = require('bcrypt');

class User {
    static async create(userData) {
        const { username, password, email, real_name, role, student_number, department, phone } = userData;
        
        const existingUser = await this.findByUsername(username);
        if (existingUser) {
            throw new Error('用户名已存在');
        }
        
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        const pool = db.getPool();
        const sql = `
            INSERT INTO users (username, password_hash, email, real_name, role, student_number, department, phone)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(sql, [
            username, passwordHash, email, real_name, role, student_number, department, phone
        ]);
        
        return result.insertId;
    }
    
    static async findByUsername(username) {
        const pool = db.getPool();
        const sql = 'SELECT * FROM users WHERE username = ?';
        const [rows] = await pool.execute(sql, [username]);
        return rows[0] || null;
    }
    
    static async findById(id) {
        const pool = db.getPool();
        const sql = 'SELECT * FROM users WHERE id = ?';
        const [rows] = await pool.execute(sql, [id]);
        return rows[0] || null;
    }

    static async findByStudentNumber(studentNumber) {
        const pool = db.getPool();
        const sql = 'SELECT * FROM users WHERE student_number = ?';
        const [rows] = await pool.execute(sql, [studentNumber]);
        return rows[0] || null;
    }
    
    static async verifyPassword(user, password) {
        return await bcrypt.compare(password, user.password_hash);
    }
    
    static async updateLastLogin(id) {
        const pool = db.getPool();
        const sql = 'UPDATE users SET last_login_at = NOW() WHERE id = ?';
        await pool.execute(sql, [id]);
    }

    static async getUserProfile(id) {
        const pool = db.getPool();

        const userSql = `
            SELECT id, username, email, real_name, role, student_number, department, phone,
                   created_at, last_login_at, is_active
            FROM users WHERE id = ?
        `;
        
        const [userRows] = await pool.execute(userSql, [id]);
        
        if (userRows.length === 0) {
            return null;
        }
        
        const user = userRows[0];
        
        if (user.role === 'student') {
            const devicesSql = `
                SELECT d.id, d.device_id, d.name, d.status, da.allocation_status
                FROM device_allocations da
                JOIN devices d ON da.device_id = d.id
                WHERE da.student_id = ? AND da.allocation_status = 'allocated'
            `;
            
            const [devices] = await pool.execute(devicesSql, [id]);
            user.devices = devices;
            
            const classesSql = `
                SELECT c.id, c.class_code, c.name, c.semester
                FROM student_classes sc
                JOIN classes c ON sc.class_id = c.id
                WHERE sc.student_id = ? AND sc.status = 'enrolled'
            `;
            
            const [classes] = await pool.execute(classesSql, [id]);
            user.classes = classes;
        }
        
        if (user.role === 'teacher') {
            const classesSql = `
                SELECT id, class_code, name, semester, description
                FROM classes WHERE teacher_id = ?
            `;
            
            const [classes] = await pool.execute(classesSql, [id]);
            user.classes = classes;
        }
        
        return user;
    }
    
    static async searchUsers(query, role = null) {
        const pool = db.getPool();

        let sql = `
            SELECT id, username, real_name, student_number, department, role
            FROM users WHERE is_active = TRUE
        `;
        
        const params = [];
        
        if (role) {
            sql += ' AND role = ?';
            params.push(role);
        }
        
        if (query) {
            sql += ' AND (username LIKE ? OR real_name LIKE ? OR student_number LIKE ?)';
            const likeQuery = `%${query}%`;
            params.push(likeQuery, likeQuery, likeQuery);
        }
        
        sql += ' ORDER BY real_name';
        
        const [rows] = await pool.execute(sql, params);
        return rows;
    }
}

module.exports = User;
