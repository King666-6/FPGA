const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function initializeDatabase() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    });

    console.log('开始初始化数据库...');

    try {
        // 创建数据库
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log('✅ 数据库创建/验证成功');

        // 使用数据库
        await connection.query(`USE ${process.env.DB_NAME}`);

        // 读取并执行SQL文件
        const fs = require('fs');
        const path = require('path');
        
        const sqlPath = path.join(__dirname, './database_new.sql');
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');
        
        // 分割SQL语句并执行
        const sqlStatements = sqlContent.split(';').filter(stmt => stmt.trim());
        
        for (const statement of sqlStatements) {
            try {
                await connection.query(statement);
            } catch (error) {
                console.error('执行SQL错误:', error.message);
                console.error('SQL语句:', statement);
            }
        }

        console.log('✅ 数据库表创建成功');

        // 创建默认管理员账户
        const saltRounds = 10;
        const adminPassword = await bcrypt.hash('admin123', saltRounds);
        
        await connection.query(`
            INSERT IGNORE INTO users (username, password_hash, real_name, role, email)
            VALUES (?, ?, ?, ?, ?)
        `, ['admin', adminPassword, '系统管理员', 'admin', 'admin@fpga.edu']);

        console.log('✅ 默认管理员账户创建成功');
        console.log('👤 管理员账号: admin / admin123');

    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
    } finally {
        await connection.end();
        console.log('✨ 数据库初始化完成');
    }
}

initializeDatabase();