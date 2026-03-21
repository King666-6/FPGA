// 📁 models/Class.js - 班级管理模型
const db = require('../utils/database');
const pool = () => db.getPool();

class Class {
    // 创建班级
    static async create(classData) {
        const { name, class_code, teacher_id, course_code, semester, description } = classData;
        const sql = `
            INSERT INTO classes (name, class_code, teacher_id, course_code, semester, description) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool().execute(sql, [name, class_code, teacher_id, course_code, semester, description]);
        return result.insertId;
    }

    // 根据ID查找班级
    static async findById(id) {
        const sql = `SELECT * FROM classes WHERE id = ?`;
        const [rows] = await pool().execute(sql, [id]);
        return rows[0] || null;
    }

    // 根据班级代码查找
    static async findByClassCode(classCode) {
        const sql = `SELECT * FROM classes WHERE class_code = ?`;
        const [rows] = await pool().execute(sql, [classCode]);
        return rows[0] || null;
    }

    // 获取教师管理的所有班级
    static async getTeacherClasses(teacherId) {
        const sql = `
            SELECT c.*, COUNT(DISTINCT sc.student_id) as student_count 
            FROM classes c
            LEFT JOIN student_classes sc ON c.id = sc.class_id AND sc.status = 'enrolled'
            WHERE c.teacher_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `;
        const [rows] = await pool().execute(sql, [teacherId]);
        return rows;
    }

    // 添加学生到班级
    static async addStudentToClass(classId, studentId, teacherId) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [classId, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限管理此班级');
        }

        const sql = `
            INSERT INTO student_classes (class_id, student_id, status) 
            VALUES (?, ?, 'enrolled') 
            ON DUPLICATE KEY UPDATE status = 'enrolled'
        `;
        await pool().execute(sql, [classId, studentId]);
    }

    // 从班级移除学生
    static async removeStudentFromClass(classId, studentId, teacherId) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [classId, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限管理此班级');
        }

        const sql = `DELETE FROM student_classes WHERE class_id = ? AND student_id = ?`;
        await pool().execute(sql, [classId, studentId]);
    }

    // 批量添加学生到班级
    static async batchAddStudentsToClass(classId, studentIds, teacherId) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [classId, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限管理此班级');
        }

        const values = studentIds.map(studentId => [classId, studentId]);
        const sql = `
            INSERT INTO student_classes (class_id, student_id, status) VALUES ? 
            ON DUPLICATE KEY UPDATE status = 'enrolled'
        `;
        await pool().execute(sql, [values]);
    }

    // 获取班级学生列表
    static async getClassStudents(classId, teacherId, filters = {}) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [classId, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限查看此班级');
        }

        let sql = `
            SELECT u.id, u.username, u.real_name, u.student_number, u.department, u.email,
                   sc.enrolled_at, sc.status as enrollment_status
            FROM student_classes sc
            JOIN users u ON sc.student_id = u.id
            WHERE sc.class_id = ?
        `;
        const params = [classId];

        if (filters.search) {
            sql += ` AND (u.username LIKE ? OR u.real_name LIKE ? OR u.student_number LIKE ?)`;
            const searchPattern = `%${filters.search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (filters.status) {
            sql += ` AND sc.status = ?`;
            params.push(filters.status);
        }

        sql += ` ORDER BY u.real_name ASC`;

        if (filters.page && filters.pageSize) {
            const offset = (filters.page - 1) * filters.pageSize;
            sql += ` LIMIT ? OFFSET ?`;
            params.push(parseInt(filters.pageSize), offset);
        }

        const [rows] = await pool().execute(sql, params);
        return rows;
    }

    // 获取学生在哪些班级
    static async getStudentClasses(studentId) {
        const sql = `
            SELECT c.*, sc.status as enrollment_status, sc.enrolled_at
            FROM student_classes sc
            JOIN classes c ON sc.class_id = c.id
            WHERE sc.student_id = ? AND sc.status = 'enrolled'
            ORDER BY sc.enrolled_at DESC
        `;
        const [rows] = await pool().execute(sql, [studentId]);
        return rows;
    }

    // 更新班级信息
    static async update(id, teacherId, updateData) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [id, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限修改此班级');
        }

        const allowedFields = ['name', 'course_code', 'semester', 'description'];
        const updates = [];
        const params = [];

        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key)) {
                updates.push(`${key} = ?`);
                params.push(value);
            }
        }

        if (updates.length === 0) {
            throw new Error('没有有效的更新字段');
        }

        params.push(id);
        const sql = `UPDATE classes SET ${updates.join(', ')} WHERE id = ?`;
        await pool().execute(sql, params);

        return true;
    }

    // 删除班级
    static async delete(id, teacherId) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [id, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限删除此班级');
        }

        const sql = `DELETE FROM classes WHERE id = ?`;
        await pool().execute(sql, [id]);
        return true;
    }

    // 获取班级统计信息
    static async getClassStats(classId, teacherId) {
        const verifySql = `SELECT id FROM classes WHERE id = ? AND teacher_id = ?`;
        const [verify] = await pool().execute(verifySql, [classId, teacherId]);
        if (verify.length === 0) {
            throw new Error('没有权限查看此班级');
        }

        const sql = `
            SELECT 
                COUNT(DISTINCT sc.student_id) as total_students,
                COUNT(DISTINCT CASE WHEN sc.status = 'enrolled' THEN sc.student_id END) as enrolled_students,
                COUNT(DISTINCT da.device_id) as allocated_devices,
                COUNT(DISTINCT es.id) as experiment_submissions
            FROM classes c
            LEFT JOIN student_classes sc ON c.id = sc.class_id
            LEFT JOIN device_allocations da ON c.id = da.class_id AND da.allocation_status = 'allocated'
            LEFT JOIN experiment_submissions es ON c.id = es.class_id
            WHERE c.id = ?
        `;
        const [rows] = await pool().execute(sql, [classId]);
        return rows[0] || {};
    }
}

module.exports = Class;
