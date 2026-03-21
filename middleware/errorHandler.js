// 📁 middleware/errorHandler.js - 统一错误处理中间件

// 自定义错误类
class AppError extends Error {
    constructor(statusCode, message, errorCode = null) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = true; // 标记为可操作错误
        
        Error.captureStackTrace(this, this.constructor);
    }
}

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
    // 设置默认值
    let statusCode = err.statusCode || 500;
    let message = err.message || '服务器内部错误';
    
    // 开发环境显示详细错误信息
    let responseError = {
        success: false,
        error: message,
        errorCode: err.errorCode
    };
    
    // 在开发环境中显示堆栈信息
    if (process.env.NODE_ENV === 'development') {
        responseError.stack = err.stack;
    }
    
    // 日志记录
    console.error(`❌ 错误: ${message}`, {
        statusCode,
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        errorCode: err.errorCode,
        stack: err.stack
    });
    
    // 特殊错误类型处理
    if (err.name === 'ValidationError') {
        statusCode = 400;
        responseError.error = '数据验证失败';
        responseError.details = err.details;
    }
    
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        responseError.error = '无效的认证令牌';
        responseError.errorCode = 'INVALID_TOKEN';
    }
    
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        responseError.error = '认证令牌已过期';
        responseError.errorCode = 'EXPIRED_TOKEN';
    }
    
    // 数据库错误
    if (err.code && err.code.startsWith('ER_')) {
        statusCode = 400;
        responseError.error = '数据库操作失败';
        responseError.errorCode = err.code;
    }
    
    // 返回错误响应
    res.status(statusCode).json(responseError);
};

// 请求验证中间件
const validateRequest = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body);
        if (error) {
            return next(new AppError(400, error.details[0].message, 'VALIDATION_ERROR'));
        }
        req.validatedBody = value;
        next();
    };
};

module.exports = {
    AppError,
    errorHandler,
    validateRequest
};