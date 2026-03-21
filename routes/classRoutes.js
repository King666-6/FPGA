// 📁 routes/classRoutes.js - 班级管理路由
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const Class = require('../models/Class');
const db = require('../utils/database');

/**
 * 获取当前登录教师名下的所有班级列表及班级人数统计
 * GET /api/classes
 */
router.get('/', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const classes = await Class.getTeacherClasses(req.user.id);
        res.json({
            success: true,
            data: classes,
            count: classes.length
        });
    } catch (error) {
        console.error('获取班级列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取班级列表失败'
        });
    }
});

/**
 * 创建一个新班级
 * POST /api/classes
 */
router.post('/', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { name, class_code, course_code, semester, description } = req.body;

        if (!name || !class_code) {
            return res.status(400).json({
                success: false,
                error: '班级名称和班级代码不能为空'
            });
        }

        const classId = await Class.create({
            name,
            class_code,
            teacher_id: req.user.id,
            course_code: course_code || null,
            semester: semester || '2024-1',
            description: description || null
        });

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'create_class', ?)`,
            [req.user.id, `创建班级: ${name} (${class_code})`]
        );

        res.status(201).json({
            success: true,
            message: '班级创建成功',
            data: { classId }
        });
    } catch (error) {
        console.error('创建班级错误:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: '班级代码已存在'
            });
        }
        res.status(500).json({
            success: false,
            error: error.message || '创建班级失败'
        });
    }
});

/**
 * 获取教师的所有班级（别名路由）
 * GET /api/classes/my-classes
 */
router.get('/my-classes', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const classes = await Class.getTeacherClasses(req.user.id);
        res.json({
            success: true,
            data: classes,
            count: classes.length
        });
    } catch (error) {
        console.error('获取班级列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取班级列表失败'
        });
    }
});

/**
 * 获取班级详情
 * GET /api/classes/:classId
 */
router.get('/:classId', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const classInfo = await Class.findById(req.params.classId);
        
        if (!classInfo) {
            return res.status(404).json({
                success: false,
                error: '班级不存在'
            });
        }

        // 验证权限
        if (classInfo.teacher_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此班级'
            });
        }

        // 获取班级统计
        const stats = await Class.getClassStats(req.params.classId, req.user.id);

        res.json({
            success: true,
            data: {
                ...classInfo,
                stats
            }
        });
    } catch (error) {
        console.error('获取班级详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取班级详情失败'
        });
    }
});

/**
 * 获取班级学生列表
 * GET /api/classes/:classId/students
 */
router.get('/:classId/students', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { page, pageSize, search, status } = req.query;
        const filters = {
            page: page ? parseInt(page) : 1,
            pageSize: pageSize ? parseInt(pageSize) : 20,
            search: search || '',
            status: status || null
        };

        const students = await Class.getClassStudents(req.params.classId, req.user.id, filters);
        
        res.json({
            success: true,
            data: students,
            pagination: {
                page: filters.page,
                pageSize: filters.pageSize,
                count: students.length
            }
        });
    } catch (error) {
        console.error('获取班级学生列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取班级学生列表失败'
        });
    }
});

/**
 * 添加学生到班级
 * POST /api/classes/:classId/students
 */
router.post('/:classId/students', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!studentId) {
            return res.status(400).json({
                success: false,
                error: '学生ID不能为空'
            });
        }

        await Class.addStudentToClass(req.params.classId, studentId, req.user.id);

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'add_student_to_class', ?)`,
            [req.user.id, `添加学生ID:${studentId}到班级ID:${req.params.classId}`]
        );

        res.json({
            success: true,
            message: '学生添加成功'
        });
    } catch (error) {
        console.error('添加学生到班级错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '添加学生到班级失败'
        });
    }
});

/**
 * 从班级删除学生
 * DELETE /api/classes/:classId/students/:studentId
 */
router.delete('/:classId/students/:studentId', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        await Class.removeStudentFromClass(req.params.classId, req.params.studentId, req.user.id);

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'remove_student_from_class', ?)`,
            [req.user.id, `从班级ID:${req.params.classId}移除学生ID:${req.params.studentId}`]
        );

        res.json({
            success: true,
            message: '学生删除成功'
        });
    } catch (error) {
        console.error('从班级删除学生错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '从班级删除学生失败'
        });
    }
});

/**
 * 批量添加学生到班级
 * POST /api/classes/:classId/students/batch
 */
router.post('/:classId/students/batch', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { studentIds } = req.body;

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'studentIds必须是数组且不能为空'
            });
        }

        await Class.batchAddStudentsToClass(req.params.classId, studentIds, req.user.id);

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'batch_add_students_to_class', ?)`,
            [req.user.id, `批量添加${studentIds.length}名学生到班级ID:${req.params.classId}`]
        );

        res.json({
            success: true,
            message: `成功添加${studentIds.length}名学生`
        });
    } catch (error) {
        console.error('批量添加学生到班级错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '批量添加学生到班级失败'
        });
    }
});

/**
 * 更新班级信息
 * PUT /api/classes/:classId
 */
router.put('/:classId', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { name, course_code, semester, description } = req.body;

        const updated = await Class.update(req.params.classId, req.user.id, {
            name,
            course_code,
            semester,
            description
        });

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: '班级不存在或没有权限修改'
            });
        }

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'update_class', ?)`,
            [req.user.id, `更新班级ID:${req.params.classId}`]
        );

        res.json({
            success: true,
            message: '班级信息更新成功'
        });
    } catch (error) {
        console.error('更新班级信息错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '更新班级信息失败'
        });
    }
});

/**
 * 删除班级
 * DELETE /api/classes/:classId
 */
router.delete('/:classId', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        await Class.delete(req.params.classId, req.user.id);

        // 记录日志
        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'delete_class', ?)`,
            [req.user.id, `删除班级ID:${req.params.classId}`]
        );

        res.json({
            success: true,
            message: '班级删除成功'
        });
    } catch (error) {
        console.error('删除班级错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '删除班级失败'
        });
    }
});

/**
 * 获取班级统计信息
 * GET /api/classes/:classId/stats
 */
router.get('/:classId/stats', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const stats = await Class.getClassStats(req.params.classId, req.user.id);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('获取班级统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取班级统计失败'
        });
    }
});

module.exports = router;
