// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const User = require('../models/User');
const db = require('../utils/database');

// 搜索用户
router.get('/search', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { query, role } = req.query;
        const users = await User.searchUsers(query, role);
        res.json({
            success: true,
            users: users
        });
    } catch (error) {
        console.error('搜索用户错误:', error);
        res.status(500).json({
            success: false,
            error: '搜索用户失败'
        });
    }
});

// 获取用户详情
router.get('/:id', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.getUserProfile(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }
        
        // 权限检查：教师只能查看自己班级的学生
        if (req.user.role === 'teacher') {
            // 这里需要添加班级权限检查逻辑
        }
        
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('获取用户详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取用户详情失败'
        });
    }
});

// 更新用户信息（仅教师/管理员）
router.put('/:id', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            student_number, 
            real_name, 
            username, 
            email, 
            department, 
            phone,
            class_id, 
            is_active 
        } = req.body;
        
        const pool = db.getPool();
        
        const [userResult] = await pool.execute(
            `UPDATE users 
             SET student_number = ?, real_name = ?, username = ?, email = ?, 
                 department = ?, phone = ?, is_active = ?
             WHERE id = ?`,
            [student_number, real_name, username, email, department, phone, is_active, id]
        );
        
        if (userResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: '用户不存在或没有权限修改'
            });
        }
        
        // 如果提供了班级ID，更新学生-班级关联
        if (class_id) {
            // 先删除现有关联
            await pool.execute(
                `DELETE FROM student_classes WHERE student_id = ?`,
                [id]
            );
            
            // 添加新关联
            await pool.execute(
                `INSERT INTO student_classes (student_id, class_id) VALUES (?, ?)`,
                [id, class_id]
            );
        }
        
        // 记录日志
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'update_user', ?)`,
            [req.user.id, `更新用户信息: ID ${id}`]
        );
        
        res.json({
            success: true,
            message: '用户信息更新成功'
        });
        
    } catch (error) {
        console.error('更新用户信息错误:', error);
        res.status(500).json({
            success: false,
            error: '更新用户信息失败'
        });
    }
});

module.exports = router;