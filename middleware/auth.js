const jwt = require('jsonwebtoken');

/**
 * 认证中间件 - 验证JWT令牌
 */
const authenticate = (req, res, next) => {
    // 从请求头获取token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: '访问令牌缺失，请先登录' 
        });
    }
    
    try {
        // 验证token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('JWT验证失败:', error.message);
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                error: '访问令牌已过期，请重新登录' 
            });
        }
        
        return res.status(403).json({ 
            success: false, 
            error: '无效的访问令牌' 
        });
    }
};

/**
 * 授权中间件 - 检查用户角色权限
 */
const authorize = (roles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                error: '用户未认证' 
            });
        }
        
        // 如果roles为空数组，表示所有认证用户都可以访问
        if (roles.length === 0) {
            return next();
        }
        
        // 检查用户角色是否在允许的角色列表中
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足，需要以下角色之一: ' + roles.join(', ') 
            });
        }
        
        next();
    };
};

/**
 * 验证教师身份中间件
 */
const isTeacher = (req, res, next) => {
    if (!req.user || req.user.role !== 'teacher') {
        return res.status(403).json({ 
            success: false, 
            error: '需要教师权限' 
        });
    }
    next();
};

/**
 * 验证学生身份中间件
 */
const isStudent = (req, res, next) => {
    if (!req.user || req.user.role !== 'student') {
        return res.status(403).json({ 
            success: false, 
            error: '需要学生权限' 
        });
    }
    next();
};

/**
 * 验证管理员身份中间件
 */
const isAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ 
            success: false, 
            error: '需要管理员权限' 
        });
    }
    next();
};

module.exports = {
    authenticate,
    authorize,
    isTeacher,
    isStudent,
    isAdmin
};