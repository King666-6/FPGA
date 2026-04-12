// 📁 models/Experiment.js - 实验管理模型
const db = require('../utils/database');

class Experiment {
    // 创建实验
    static async create(experimentData) {
        const pool = db.getPool();
        const {
            experiment_code,
            experiment_name,
            description,
            category = 'basic',
            difficulty_level = 'medium',
            estimated_duration,
            teacher_id,
            is_public = false,
            is_classic = false,
            sample_clock_source = 'external',
            trigger_condition = '0x0000',
            sample_length = 32,
            target_pins = []
        } = experimentData;

        const sql = `
            INSERT INTO experiments (
                experiment_code, experiment_name, description, category, difficulty_level,
                estimated_duration, teacher_id, is_public, is_classic,
                sample_clock, trigger_condition, packet_count, target_pins
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await pool.execute(sql, [
            experiment_code,
            experiment_name,
            description,
            category,
            difficulty_level,
            estimated_duration,
            teacher_id,
            is_public,
            is_classic,
            sample_clock_source,
            trigger_condition,
            sample_length,
            JSON.stringify(target_pins)
        ]);

        return result.insertId;
    }

    // 根据ID查找实验
    static async findById(id) {
        const pool = db.getPool();
        const sql = `
            SELECT e.*, u.real_name as teacher_name, u.username as teacher_username
            FROM experiments e
            JOIN users u ON e.teacher_id = u.id
            WHERE e.id = ?
        `;

        const [rows] = await pool.execute(sql, [id]);
        if (rows.length > 0) {
            const exp = rows[0];
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        }
        return rows[0] || null;
    }

    // 根据实验代码查找
    static async findByCode(experimentCode) {
        const pool = db.getPool();
        const sql = `SELECT * FROM experiments WHERE experiment_code = ?`;
        const [rows] = await pool.execute(sql, [experimentCode]);
        return rows[0] || null;
    }

    // 获取教师创建的所有实验
    static async getByTeacher(teacherId, includePublic = true) {
        const pool = db.getPool();
        let sql = `
            SELECT e.*,
                   COUNT(DISTINCT es.id) as submission_count,
                   COUNT(DISTINCT CASE WHEN es.status = 'submitted' THEN es.id END) as completed_count
            FROM experiments e
            LEFT JOIN experiment_submissions es ON e.id = es.experiment_id
            WHERE (e.teacher_id = ?
        `;

        if (includePublic) {
            sql += ' OR e.is_public = TRUE';
        }

        sql += ') GROUP BY e.id ORDER BY e.created_at DESC';

        const [rows] = await pool.execute(sql, [teacherId]);
        
        rows.forEach(exp => {
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        });
        
        return rows;
    }

    // 获取所有公开实验
    static async getPublicExperiments() {
        const pool = db.getPool();
        const sql = `
            SELECT e.*, u.real_name as teacher_name
            FROM experiments e
            JOIN users u ON e.teacher_id = u.id
            WHERE e.is_public = TRUE
            ORDER BY e.created_at DESC
        `;

        const [rows] = await pool.execute(sql);
        
        rows.forEach(exp => {
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        });
        
        return rows;
    }

    // 获取经典实验
    static async getClassicExperiments() {
        const pool = db.getPool();
        const sql = `
            SELECT e.*, u.real_name as teacher_name
            FROM experiments e
            JOIN users u ON e.teacher_id = u.id
            WHERE e.is_classic = TRUE
            ORDER BY e.created_at DESC
        `;

        const [rows] = await pool.execute(sql);
        
        rows.forEach(exp => {
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        });
        
        return rows;
    }

    // 开始实验
    static async startExperiment(submissionData) {
        const pool = db.getPool();
        const { student_id, experiment_id, device_id, class_id } = submissionData;

        const [deviceRows] = await pool.execute(
            'SELECT id FROM devices WHERE device_id = ?',
            [device_id]
        );

        if (deviceRows.length === 0) {
            throw new Error('设备不存在');
        }

        const deviceDbId = deviceRows[0].id;

        const sql = `
            INSERT INTO experiment_submissions
            (student_id, experiment_id, device_id, class_id, status, started_at)
            VALUES (?, ?, ?, ?, 'in_progress', NOW())
        `;

        const [result] = await pool.execute(sql, [
            student_id,
            experiment_id,
            deviceDbId,
            class_id || null
        ]);

        return {
            id: result.insertId,
            student_id,
            experiment_id,
            device_id,
            status: 'in_progress'
        };
    }

    // 完成实验
    static async completeExperiment(submissionId, studentId, data = {}) {
        const pool = db.getPool();
        const sql = `
            UPDATE experiment_submissions
            SET status = 'submitted',
                submitted_at = NOW()
            WHERE id = ? AND student_id = ?
        `;
        const [result] = await pool.execute(sql, [
            submissionId,
            studentId
        ]);
        return result.affectedRows > 0;
    }

    // 评分实验
    static async gradeExperiment(submissionId, teacherId, gradeData) {
        const pool = db.getPool();
        const { score, teacher_feedback, status = 'graded' } = gradeData;

        const sql = `
            UPDATE experiment_submissions
            SET status = ?,
                score = ?,
                teacher_feedback = ?,
                graded_at = NOW()
            WHERE id = ?
              AND EXISTS (
                  SELECT 1 FROM experiments e
                  WHERE e.id = experiment_submissions.experiment_id
                    AND e.teacher_id = ?
              )
        `;

        const [result] = await pool.execute(sql, [
            status,
            score,
            teacher_feedback,
            submissionId,
            teacherId
        ]);

        return result.affectedRows > 0;
    }

    // 获取学生实验记录
    static async getStudentSubmissions(studentId, filters = {}) {
        const pool = db.getPool();
        let sql = `
            SELECT es.*,
                   e.experiment_code,
                   e.experiment_name,
                   e.target_pins,
                   d.device_id,
                   d.name as device_name,
                   u.real_name as teacher_name
            FROM experiment_submissions es
            JOIN experiments e ON es.experiment_id = e.id
            JOIN devices d ON es.device_id = d.id
            JOIN users u ON e.teacher_id = u.id
            WHERE es.student_id = ?
        `;

        const params = [studentId];

        if (filters.status) {
            sql += ' AND es.status = ?';
            params.push(filters.status);
        }

        if (filters.experiment_id) {
            sql += ' AND es.experiment_id = ?';
            params.push(filters.experiment_id);
        }

        sql += ' ORDER BY es.started_at DESC';

        const [rows] = await pool.execute(sql, params);

        rows.forEach(row => {
            if (row.target_pins && typeof row.target_pins === 'string') {
                row.target_pins = JSON.parse(row.target_pins);
            }
        });

        return rows;
    }

    // 获取实验的所有提交记录
    static async getExperimentSubmissions(experimentId, teacherId = null) {
        const pool = db.getPool();
        let sql = `
            SELECT es.*,
                   u.real_name as student_name,
                   u.username as student_username,
                   u.student_number as student_id,
                   d.device_id,
                   d.name as device_name
            FROM experiment_submissions es
            JOIN users u ON es.student_id = u.id
            JOIN devices d ON es.device_id = d.id
            WHERE es.experiment_id = ?
        `;

        const params = [experimentId];

        if (teacherId) {
            sql += ' AND EXISTS (SELECT 1 FROM experiments e WHERE e.id = ? AND e.teacher_id = ?)';
            params.push(experimentId, teacherId);
        }

        sql += ' ORDER BY es.started_at DESC';

        const [rows] = await pool.execute(sql, params);
        return rows;
    }

    // 获取实验统计信息
    static async getExperimentStats(experimentId) {
        const pool = db.getPool();
        const sql = `
            SELECT
                COUNT(*) as total_submissions,
                COUNT(CASE WHEN status = 'submitted' THEN 1 END) as submitted_count,
                COUNT(CASE WHEN status = 'graded' THEN 1 END) as graded_count,
                COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
                AVG(score) as average_score,
                MIN(score) as min_score,
                MAX(score) as max_score
            FROM experiment_submissions
            WHERE experiment_id = ?
        `;

        const [rows] = await pool.execute(sql, [experimentId]);
        const experiment = await this.findById(experimentId);

        return {
            experiment: experiment,
            stats: rows[0] || null
        };
    }

    // 更新实验信息
    static async update(id, teacherId, updateData) {
        const pool = db.getPool();
        
        const [expRows] = await pool.execute(
            'SELECT teacher_id FROM experiments WHERE id = ?',
            [id]
        );
        
        if (expRows.length === 0) {
            throw new Error('实验不存在');
        }
        
        if (Number(expRows[0].teacher_id) !== Number(teacherId)) {
            throw new Error('没有权限修改此实验');
        }

        const FIELD_MAP = {
            'experiment_name': 'experiment_name',
            'description': 'description',
            'category': 'category',
            'difficulty_level': 'difficulty_level',
            'estimated_duration': 'estimated_duration',
            'is_public': 'is_public',
            'is_classic': 'is_classic',
            'sample_clock_source': 'sample_clock',
            'trigger_condition': 'trigger_condition',
            'sample_length': 'packet_count',
            'target_pins': 'target_pins'
        };

        const updates = [];
        const params = [];

        for (const [key, value] of Object.entries(updateData)) {
            const dbColumn = FIELD_MAP[key];
            if (dbColumn) {
                updates.push(`${dbColumn} = ?`);
                if (key === 'target_pins' && Array.isArray(value)) {
                    params.push(JSON.stringify(value));
                } else {
                    params.push(value);
                }
            }
        }

        if (updates.length === 0) {
            throw new Error('没有有效的更新字段');
        }

        params.push(id);

        const sql = `UPDATE experiments SET ${updates.join(', ')} WHERE id = ?`;
        const [result] = await pool.execute(sql, params);
        return result.affectedRows > 0;
    }

    // 删除实验
    static async delete(id, teacherId) {
        const pool = db.getPool();
        const [experiment] = await pool.execute(
            'SELECT teacher_id FROM experiments WHERE id = ?',
            [id]
        );

        if (experiment.length === 0) {
            throw new Error('实验不存在');
        }

        const [result] = await pool.execute('DELETE FROM experiments WHERE id = ?', [id]);
        return result.affectedRows > 0;
    }

    // 搜索实验
    static async search(keyword, filters = {}) {
        const pool = db.getPool();
        let sql = `
            SELECT e.*, u.real_name as teacher_name
            FROM experiments e
            JOIN users u ON e.teacher_id = u.id
            WHERE (e.is_public = TRUE OR e.teacher_id = ?)
        `;

        const params = [filters.user_id || null];

        if (keyword) {
            sql += ' AND (e.experiment_name LIKE ? OR e.description LIKE ? OR e.experiment_code LIKE ?)';
            const likeKeyword = `%${keyword}%`;
            params.push(likeKeyword, likeKeyword, likeKeyword);
        }

        if (filters.category) {
            sql += ' AND e.category = ?';
            params.push(filters.category);
        }

        if (filters.difficulty) {
            sql += ' AND e.difficulty_level = ?';
            params.push(filters.difficulty);
        }

        if (filters.teacher_id) {
            sql += ' AND e.teacher_id = ?';
            params.push(filters.teacher_id);
        }

        if (filters.is_classic) {
            sql += ' AND e.is_classic = TRUE';
        }

        sql += ' ORDER BY e.created_at DESC';

        const [rows] = await pool.execute(sql, params);
        
        rows.forEach(exp => {
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        });
        
        return rows;
    }

    // 获取热门实验
    static async getPopularExperiments(limit = 10) {
        const pool = db.getPool();
        const sql = `
            SELECT e.*,
                   COUNT(es.id) as submission_count,
                   u.real_name as teacher_name
            FROM experiments e
            LEFT JOIN experiment_submissions es ON e.id = es.experiment_id
            JOIN users u ON e.teacher_id = u.id
            WHERE e.is_public = TRUE
            GROUP BY e.id
            ORDER BY submission_count DESC, e.created_at DESC
            LIMIT ?
        `;

        const [rows] = await pool.execute(sql, [limit]);
        
        rows.forEach(exp => {
            if (exp.target_pins && typeof exp.target_pins === 'string') {
                exp.target_pins = JSON.parse(exp.target_pins);
            }
        });
        
        return rows;
    }
}

module.exports = Experiment;
