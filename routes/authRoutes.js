const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const db = require('../utils/database'); // 统一导入数据库工具
const { authenticate } = require('../middleware/auth'); // 导入认证中间件

/**
 * 用户注册
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
    try {
        const { 
            username, 
            password, 
            email, 
            real_name, 
            role, 
            student_number, 
            department, 
            phone 
        } = req.body;
        
        if (!username || !password || !real_name) {
            return res.status(400).json({
                success: false,
                error: '用户名、密码和姓名是必填项'
            });
        }
        
        if (role && !['student', 'teacher'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: '角色必须是 student 或 teacher'
            });
        }
        
        const userId = await User.create({
            username,
            password,
            email: email || null,
            real_name,
            role: role || 'student',
            student_number: student_number || null,
            department: department || null,
            phone: phone || null
        });

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description, ip_address)
             VALUES (?, 'register', ?, ?)`,
            [userId, `用户注册: ${username} (${real_name})`, req.ip || null]
        );
        
        res.status(201).json({
            success: true,
            message: '用户注册成功',
            userId: userId
        });
        
    } catch (error) {
        console.error('注册错误:', error);
        
        if (error.message === '用户名已存在') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({
            success: false,
            error: '注册失败，服务器内部错误'
        });
    }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: '用户名和密码不能为空'
            });
        }
        
        // 查找用户
        const user = await User.findByUsername(username);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }
        
        // 检查用户是否激活
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: '用户账户已被禁用，请联系管理员'
            });
        }
        
        // 验证密码
        const passwordValid = await User.verifyPassword(user, password);
        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                error: '用户名或密码错误'
            });
        }
        
        // 更新最后登录时间
        await User.updateLastLogin(user.id);
        
        // 生成JWT令牌
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                real_name: user.real_name,
                role: user.role,
                student_number: user.student_number,
                department: user.department
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        // 记录登录日志
        const pool = db.getPool(); // 获取连接池
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, ip_address, action_description)
             VALUES (?, 'login', ?, ?)`,
            [user.id, req.ip, `用户登录: ${username}`]
        );
        
        // 返回用户信息（排除密码）
        const userResponse = {
            id: user.id,
            username: user.username,
            email: user.email,
            real_name: user.real_name,
            role: user.role,
            student_number: user.student_number,
            department: user.department,
            phone: user.phone,
            created_at: user.created_at,
            last_login_at: user.last_login_at
        };
        
        res.json({
            success: true,
            message: '登录成功',
            token: token,
            user: userResponse
        });
        
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({
            success: false,
            error: '登录失败，服务器内部错误'
        });
    }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.getUserProfile(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }

        res.json({
            success: true,
            user: user
        });

    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({
            success: false,
            error: '获取用户信息失败'
        });
    }
});

/**
 * 刷新令牌
 * POST /api/auth/refresh
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                error: '刷新令牌不能为空'
            });
        }
        
        // 验证刷新令牌（这里简化为重新生成，实际应验证旧的刷新令牌）
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        
        // 获取用户信息
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }
        
        // 生成新的访问令牌
        const newToken = jwt.sign(
            {
                id: user.id,
                username: user.username,
                real_name: user.real_name,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        res.json({
            success: true,
            token: newToken
        });
        
    } catch (error) {
        console.error('刷新令牌错误:', error);
        res.status(401).json({
            success: false,
            error: '刷新令牌失败'
        });
    }
});

/**
 * 修改密码
 * POST /api/auth/change-password
 */
router.post('/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        // 验证输入
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                error: '所有密码字段都是必填项'
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                error: '新密码和确认密码不匹配'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: '新密码至少需要6个字符'
            });
        }
        
        // 从token获取用户ID
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: '未提供认证令牌'
            });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 获取用户
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: '用户不存在'
            });
        }
        
        // 验证当前密码
        const passwordValid = await User.verifyPassword(user, currentPassword);
        if (!passwordValid) {
            return res.status(400).json({
                success: false,
                error: '当前密码错误'
            });
        }
        
        // 更新密码
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        const pool = db.getPool(); // 获取连接池
        await pool.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, user.id]
        );
        
        // 记录日志
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description, ip_address)
             VALUES (?, 'change_password', ?, ?)`,
            [user.id, `修改密码`, req.ip || null]
        );
        
        res.json({
            success: true,
            message: '密码修改成功'
        });
        
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({
            success: false,
            error: '修改密码失败'
        });
    }
});

/**
 * 登出（客户端应删除token，这里主要记录日志）
 * POST /api/auth/logout
 */
router.post('/logout', async (req, res) => {
    try {
        // 记录登出日志（如果有用户信息）
        if (req.user) {
            const pool = db.getPool();
            await pool.execute(
                `INSERT INTO system_logs (user_id, action_type, action_description, ip_address)
                 VALUES (?, 'logout', ?, ?)`,
                [req.user.id, `用户登出`, req.ip || null]
            );
        }
        
        res.json({
            success: true,
            message: '登出成功'
        });
        
    } catch (error) {
        console.error('登出错误:', error);
        res.status(500).json({
            success: false,
            error: '登出失败'
        });
    }
});

module.exports = router;