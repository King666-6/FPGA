const express = require('express');
const http = require('http');
const net = require('net');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const setupSocket = require('./utils/socketManager');
const { startTCPServer, getTCPServer } = require('./utils/tcpServer');
const { setTCPServer } = require('./utils/socketManager');
const { connectDB } = require('./utils/database');
const scheduler = require('./utils/scheduler');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const experimentRoutes = require('./routes/experimentRoutes');
const dataRoutes = require('./routes/dataRoutes');
const userRoutes = require('./routes/userRoutes');
const classRoutes = require('./routes/classRoutes');

const createApiMiddleware = () => {
    const router = express.Router();
    
    router.use('/api/auth', authRoutes);
    router.use('/api/devices', deviceRoutes);
    router.use('/api/experiments', experimentRoutes);
    router.use('/api/data', dataRoutes);
    router.use('/api/users', userRoutes);
    router.use('/api/classes', classRoutes);
    
    return router;
};

const teacherApp = express();
const teacherServer = http.createServer(teacherApp);

const studentApp = express();
const studentServer = http.createServer(studentApp);

const sharedMiddleware = [
    cors(),
    express.json(),
    express.urlencoded({ extended: true }),
    express.static(path.join(__dirname, 'public')),
    createApiMiddleware()
];

sharedMiddleware.forEach(middleware => {
    teacherApp.use(middleware);
    studentApp.use(middleware);
});

teacherApp.use(errorHandler);
studentApp.use(errorHandler);

teacherApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

teacherApp.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

teacherApp.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

studentApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

studentApp.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

studentApp.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

setupSocket(teacherServer, 'teacher');
setupSocket(studentServer, 'student');

connectDB().then(() => {
    const TEACHER_PORT = process.env.TEACHER_PORT || 3000;
    const STUDENT_PORT = process.env.STUDENT_PORT || 3002;
    const TCP_PORT = process.env.TCP_PORT || 3001;
    
    scheduler.init();
    
    teacherServer.listen(TEACHER_PORT, () => {
        console.log(`✅ 教师端服务器运行在 http://localhost:${TEACHER_PORT}`);
        console.log(`📡 教师端WebSocket服务器已启动`);
    });
    
    studentServer.listen(STUDENT_PORT, () => {
        console.log(`✅ 学生端服务器运行在 http://localhost:${STUDENT_PORT}`);
    });
    
    const tcpServer = startTCPServer(TCP_PORT);
    setTCPServer(tcpServer);
    console.log(`🔗 TCP服务器已关联到WebSocket管理器`);
}).catch(err => {
    console.error('❌ 数据库连接失败:', err);
    process.exit(1);
});

module.exports = { teacherApp, studentApp };
