const mysql = require('mysql2/promise');
const winston = require('winston');

// 创建日志记录器
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/database-error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/database-combined.log' 
        })
    ]
});

// 如果是开发环境，添加控制台输出
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// 创建连接池
let pool;

async function createPool() {
    const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '123456',
        database: process.env.DB_NAME || 'fpga_teaching_system',
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: '+08:00', // 中国时区
        charset: 'utf8mb4', // 支持emoji
        dateStrings: true // 返回字符串格式的日期
    };
    
    pool = mysql.createPool(config);
    
    // 监听连接事件
    pool.on('connection', (connection) => {
        logger.info('数据库连接已建立');
    });
    
    pool.on('acquire', (connection) => {
        logger.debug('从连接池获取连接');
    });
    
    pool.on('release', (connection) => {
        logger.debug('连接已释放回连接池');
    });
    
    pool.on('enqueue', () => {
        logger.warn('等待可用连接...');
    });
    
    return pool;
}

/**
 * 执行查询
 */
async function query(sql, params = []) {
    if (!pool) {
        throw new Error('数据库连接池未初始化');
    }
    
    const startTime = Date.now();
    
    try {
        const [rows] = await pool.execute(sql, params);
        const duration = Date.now() - startTime;
        
        logger.debug('SQL查询执行成功', {
            sql: sql,
            params: params,
            duration: duration + 'ms',
            rows: rows.length
        });
        
        return rows;
    } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error('SQL查询执行失败', {
            sql: sql,
            params: params,
            duration: duration + 'ms',
            error: error.message,
            code: error.code
        });
        
        throw error;
    }
}

/**
 * 执行事务
 */
async function transaction(callback) {
    if (!pool) {
        throw new Error('数据库连接池未初始化');
    }
    
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const result = await callback(connection);
        
        await connection.commit();
        
        logger.info('事务提交成功');
        
        return result;
    } catch (error) {
        await connection.rollback();
        
        logger.error('事务回滚', {
            error: error.message
        });
        
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * 健康检查
 */
async function healthCheck() {
    try {
        const [rows] = await pool.execute('SELECT 1 as health');
        return {
            status: 'healthy',
            message: '数据库连接正常',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            message: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * 获取连接池统计信息
 */
function getPoolStats() {
    if (!pool) {
        return null;
    }
    
    return {
        totalConnections: pool._allConnections.length,
        freeConnections: pool._freeConnections.length,
        connectionLimit: pool.config.connectionLimit
    };
}

/**
 * 初始化数据库连接
 */
async function connectDB() {
    try {
        await createPool();
        
        // 测试连接
        await pool.execute('SELECT 1');
        
        logger.info('✅ 数据库连接成功', {
            host: process.env.DB_HOST,
            database: process.env.DB_NAME
        });
        
        return pool;
    } catch (error) {
        logger.error('❌ 数据库连接失败', {
            error: error.message,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME
        });
        
        throw error;
    }
}

module.exports = {
    connectDB,
    getPool: () => pool,
    query,
    transaction,
    healthCheck,
    getPoolStats
};