const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;
let teacherIO = null;
let studentIO = null;
const connectedUsers = new Map();
const boundDevices = new Map();
const deviceOnlineStatus = new Map();
const deviceToStudentSocket = new Map();
const deviceRequestedPins = new Map();
const deviceStudentAssignment = new Map();
const teacherUserIdToSocket = new Map();  
const studentUserIdToSocket = new Map();  

// 待通知队列：学生离线时暂存设备分配通知，待其上线后立即发送
const pendingNotifications = new Map();   

let tcpServerModule = null;

function setTCPServer(tcpServer) {
    tcpServerModule = tcpServer;
}

function setupSocket(server, serverType = 'default') {
    let corsOrigins = process.env.WEBSOCKET_ORIGIN || "http://localhost:3000";
    if (typeof corsOrigins === 'string' && corsOrigins.includes(',')) {
        corsOrigins = corsOrigins.split(',').map(origin => origin.trim());
    }
    
    const serverIO = socketIO(server, {
        cors: {
            origin: corsOrigins,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    if (serverType === 'teacher') {
        teacherIO = serverIO;
    } else if (serverType === 'student') {
        studentIO = serverIO;
    }
    
    io = serverIO;
    
    io.on('connection', async (socket) => {
        console.log('🔗 客户端连接:', socket.id);
        
        // 存储 socket 关联的用户信息
        socket.user = null;
        socket.userRole = null;
        
        // =====================================================
        // 设备绑定 - 学生端功能
        // =====================================================
        socket.on('bind_device', async (data) => {
            let deviceId = data.deviceId || 'FPGA_device';

            if (tcpServerModule) {
                const tcpMap = tcpServerModule.deviceSocketMap;
                if (!tcpMap.has(deviceId) && tcpMap.size > 0) {
                    const firstRealId = tcpMap.keys().next().value;
                    console.log(`[WS] bind_device: '${deviceId}' 未找到，自动映射到 '${firstRealId}'`);
                    deviceId = firstRealId;
                }
            }

            boundDevices.set(socket.id, deviceId);
            deviceToStudentSocket.set(deviceId, socket.id);

            socket.emit('device-bound', {
                deviceId: deviceId,
                message: '设备绑定成功'
            });

            console.log(`📱 客户端 ${socket.id} 绑定了设备: ${deviceId}`);
        });

        // =====================================================
        // 开始采集 - 学生端功能
        // =====================================================
        socket.on('start_capture', async (data) => {
            const deviceId = data.deviceId || 'FPGA_device';
            const requestedPins = data.requestedPins || [];
            const experimentId = data.experimentId || 0;
            const clockSource = data.clockSource || '50Hz';
            const submissionId = data.submissionId || null;

            console.log(`🎬 收到开始采集请求: deviceId=${deviceId}, pins=${requestedPins.length}, experimentId=${experimentId}, clockSource=${clockSource}, submissionId=${submissionId}`);

            deviceRequestedPins.set(deviceId, requestedPins);

            if (tcpServerModule) {
                await tcpServerModule.sendCommand(deviceId, {
                    action: 'start_capture',
                    requestedPins: requestedPins,
                    experimentId: experimentId,
                    clockSource: clockSource,
                    submissionId: submissionId
                });
            }

            broadcastToTeachers('global-device-status', {
                deviceId: deviceId,
                status: 'capturing',
                action: 'start_capture',
                requestedPins: requestedPins,
                timestamp: new Date().toISOString()
            });

            socket.emit('capture-started', {
                deviceId: deviceId,
                message: '采集已开始'
            });
        });

        // =====================================================
        // 停止采集 - 学生端功能
        // =====================================================
        socket.on('stop_capture', async (data) => {
            let deviceId = data.deviceId || 'FPGA_device';

            if (tcpServerModule) {
                const tcpMap = tcpServerModule.deviceSocketMap;
                if (!tcpMap.has(deviceId) && tcpMap.size > 0) {
                    const firstRealId = tcpMap.keys().next().value;
                    console.log(`[WS] stop_capture: '${deviceId}' 未找到，自动映射到 '${firstRealId}'`);
                    deviceId = firstRealId;
                }
            }

            console.log(`⏹️ 收到停止采集请求: deviceId=${deviceId}`);

            deviceRequestedPins.delete(deviceId);

            if (tcpServerModule) {
                await tcpServerModule.sendCommand(deviceId, {
                    action: 'stop_capture'
                });
            }

            broadcastToTeachers('global-device-status', {
                deviceId: deviceId,
                status: 'online',
                action: 'stop_capture',
                timestamp: new Date().toISOString()
            });

            socket.emit('capture-stopped', {
                deviceId: deviceId,
                message: '采集已停止'
            });
        });

        // =====================================================
        // 解绑设备 - 学生端功能
        // =====================================================
        socket.on('unbind_device', async (data) => {
            const deviceId = data.deviceId;
            const socketDeviceId = boundDevices.get(socket.id);
            if (socketDeviceId) {
                deviceToStudentSocket.delete(socketDeviceId);
            }
            boundDevices.delete(socket.id);

            console.log(`📱 客户端 ${socket.id} 解绑了设备: ${deviceId}`);
        });
        
        // =====================================================
        // Socket 认证 - 通用功能
        // =====================================================
        socket.on('authenticate', async (tokenData) => {
            try {
                const token = typeof tokenData === 'string' ? tokenData : tokenData.token;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                socket.user = decoded;
                socket.userRole = decoded.role;
                socket.userId = decoded.id;
                connectedUsers.set(socket.id, decoded);
                
                // 根据用户角色加入不同的房间
                if (decoded.role === 'teacher' || decoded.role === 'admin') {
                    socket.join('teachers');
                    console.log(`👨‍🏫 教师 ${decoded.username} 加入教师监控房间`);
                    
                    // 教师连接时，发送当前所有在线设备列表
                    const onlineDevices = getOnlineDevicesList();
                    socket.emit('global-device-status', {
                        type: 'initial',
                        devices: onlineDevices,
                        message: '当前在线设备列表'
                    });
                } else if (decoded.role === 'student') {
                    socket.join('students');
                    // 统一类型：用户ID转换为Number确保Map查询一致
                    const studentIdNum = Number(decoded.id);
                    studentUserIdToSocket.set(studentIdNum, socket.id);
                    console.log(`👨‍🎓 学生 ${decoded.username} 加入学生房间`);
                    
                    // 学生认证成功后，直接使用socket.emit发送待通知和设备分配
                    // 1. 检查待通知队列：如果该学生有暂存的设备分配通知，直接发送并清除
                    const pendingDeviceId = pendingNotifications.get(studentIdNum);
                    if (pendingDeviceId) {
                        socket.emit('device_allocated', {
                            deviceId: pendingDeviceId,
                            userId: decoded.id,
                            timestamp: new Date().toISOString()
                        });
                        pendingNotifications.delete(studentIdNum);
                        console.log(`[WS] 已补发 pending 通知: userId=${decoded.id}, deviceId=${pendingDeviceId}`);
                    }
                    
                    // 2. 检查设备分配表：如果该学生已被分配设备，主动推送分配通知
                    // 统一类型比较
                    for (const [deviceId, assignedUserId] of deviceStudentAssignment) {
                        if (Number(assignedUserId) === studentIdNum) {
                            socket.emit('device_allocated', {
                                deviceId: deviceId,
                                userId: decoded.id,
                                timestamp: new Date().toISOString()
                            });
                            console.log(`[WS] 已推送已有分配: userId=${decoded.id}, deviceId=${deviceId}`);
                            break; // 每个学生目前只分配一个设备，找到第一个即可
                        }
                    }
                }
                
                socket.emit('authenticated', {
                    message: '认证成功',
                    user: {
                        id: decoded.id,
                        username: decoded.username,
                        role: decoded.role
                    }
                });
                
                console.log(`✅ 用户 ${decoded.username} (${decoded.role}) 认证成功`);
            } catch (error) {
                socket.emit('authentication_failed', { error: '认证失败' });
                console.error('❌ 认证失败:', error.message);
            }
        });

        // =====================================================
        // 设备上线通知 - 教师广播功能
        // =====================================================
        socket.on('device_online', async (data) => {
            const deviceId = data.deviceId;
            
            // 更新设备在线状态
            deviceOnlineStatus.set(deviceId, {
                deviceId: deviceId,
                status: 'online',
                lastSeen: new Date().toISOString(),
                ...data
            });
            
            // 向所有教师广播设备上线消息
            broadcastToTeachers('global-device-status', {
                deviceId: deviceId,
                status: 'online',
                action: 'device_online',
                timestamp: new Date().toISOString()
            });
            
            console.log(`📶 设备上线: ${deviceId}`);
        });

        // =====================================================
        // 设备断开连接 - 教师广播功能
        // =====================================================
        socket.on('device_offline', async (data) => {
            const deviceId = data.deviceId;
            
            // 更新设备离线状态
            if (deviceOnlineStatus.has(deviceId)) {
                const deviceInfo = deviceOnlineStatus.get(deviceId);
                deviceInfo.status = 'offline';
                deviceInfo.lastSeen = new Date().toISOString();
            }
            
            // 向所有教师广播设备离线消息
            broadcastToTeachers('global-device-status', {
                deviceId: deviceId,
                status: 'offline',
                action: 'device_offline',
                timestamp: new Date().toISOString()
            });
            
            console.log(`📴 设备离线: ${deviceId}`);
        });

        // =====================================================
        // 设备分配 - 教师专用功能
        // =====================================================
        socket.on('assign_device_to_student', (data) => {
            const { deviceId, userId } = data;
            if (userId) {
                // 【修复B】统一类型：用户ID转换为Number确保Map操作一致
                const userIdNum = Number(userId);
                deviceStudentAssignment.set(deviceId, userIdNum);
                console.log(`[WS] 教师分配设备 ${deviceId} -> 学生userId: ${userId}`);

                const studentSocketId = studentUserIdToSocket.get(userIdNum);
                if (studentSocketId && studentIO) {
                    // 【修复C】统一事件名称为device_allocated
                    studentIO.to(studentSocketId).emit('device_allocated', { 
                        deviceId: deviceId,
                        userId: userId,
                        timestamp: new Date().toISOString()
                    });
                    console.log(`[WS] 已通知学生 userId=${userId} 设备已分配: ${deviceId}`);
                } else {
                    console.warn(`[WARN] 学生 userId=${userId} 尚未建立 WS 连接`);
                    // 修复Bug 1：如果学生不在线，将通知存入待通知队列
                    pendingNotifications.set(userIdNum, deviceId);
                    console.log(`[WS] 学生离线，暂存设备分配通知: userId=${userId}, deviceId=${deviceId}`);
                }
            } else {
                deviceStudentAssignment.delete(deviceId);
                console.log(`[WS] 解除设备 ${deviceId} 的分配`);
            }
            socket.emit('assign_result', { success: true, deviceId, userId });
        });
        
        // =====================================================
        // 断开连接处理
        // =====================================================
        socket.on('disconnect', () => {
            console.log('🔗 客户端断开连接:', socket.id);
            
            // 从连接用户中移除
            if (socket.user) {
                connectedUsers.delete(socket.id);

                // 如果是教师断开，从在线列表中移除
                if (socket.userRole === 'teacher' || socket.userRole === 'admin') {
                    console.log(`👨‍🏫 教师 ${socket.user.username} 已断开连接`);
                }

                // 如果是学生断开，清理 studentUserIdToSocket
                if (socket.userRole === 'student') {
                    // 【修复B】统一类型：用户ID转换为Number确保Map操作一致
                    studentUserIdToSocket.delete(Number(socket.user.id));
                }
            }
            
            // 如果学生断开，解绑设备
            const boundDeviceId = boundDevices.get(socket.id);
            if (boundDeviceId) {
                boundDevices.delete(socket.id);
                
                // 向教师广播设备解绑状态
                broadcastToTeachers('global-device-status', {
                    deviceId: boundDeviceId,
                    status: 'unbound',
                    action: 'student_disconnected',
                    timestamp: new Date().toISOString()
                });
            }
        });
    });
    
    return io;
}

// =====================================================
// 向所有教师广播消息
// =====================================================
function broadcastToTeachers(event, data) {
    // 使用 teacherIO 向教师广播
    if (teacherIO) {
        teacherIO.to('teachers').emit(event, data);
        console.log(`📢 教师广播 [${event}]: deviceId=${data.deviceId}, status=${data.status}`);
    } else if (io) {
        io.to('teachers').emit(event, data);
        console.log(`📢 教师广播 [${event}]: deviceId=${data.deviceId}, status=${data.status}`);
    }
}

// =====================================================
// 获取当前所有在线设备列表
// =====================================================
function getOnlineDevicesList() {
    const devices = [];
    for (const [deviceId, info] of deviceOnlineStatus) {
        if (info.status !== 'offline') {
            devices.push(info);
        }
    }
    return devices;
}

// =====================================================
// 广播设备数据 - 发送给所有客户端
// =====================================================
function broadcastDeviceData(data) {
    if (!io && !teacherIO && !studentIO) {
        console.error('❌ WebSocket未初始化，无法广播');
        return;
    }

    const { deviceId, type, waveforms, pinMapping } = data;

    const requestedPins = deviceRequestedPins.get(deviceId);
    const isFiltered = requestedPins && requestedPins.length > 0;

    let filteredWaveforms = waveforms;
    let filteredPinMapping = pinMapping;

    if (isFiltered && waveforms && pinMapping) {
        const { getPinId } = require('./pinConfig');
        const filteredIndices = [];

        const requestedPinIdSet = new Set(
            requestedPins.map(p => getPinId(p)).filter(id => id !== null)
        );

        pinMapping.forEach((pinName, index) => {
            const pinId = getPinId(pinName);
            if (pinId !== null && requestedPinIdSet.has(pinId)) {
                filteredIndices.push(index);
            } else if (pinId === null) {
                console.warn(`[WARN] Unknown pin in pinMapping: ${pinName}`);
            }
        });

        filteredIndices.sort((a, b) => a - b);

        filteredWaveforms = filteredIndices.map(idx => waveforms[idx] || []);
        filteredPinMapping = filteredIndices.map(idx => pinMapping[idx]);

        console.log(`[FILTER] [${deviceId}] 过滤通道: ${waveforms.length} -> ${filteredWaveforms.length} 通道`);
        console.log(`[FILTER] [${deviceId}] 保留的引脚: ${filteredPinMapping.join(', ')}`);
    }

    const filteredData = {
        ...data,
        waveforms: filteredWaveforms,
        pinMapping: filteredPinMapping
    };

    if (teacherIO) {
        const teacherData = {
            ...data,
            waveforms: waveforms,
            pinMapping: pinMapping
        };
        teacherIO.to('teachers').emit('device-update', teacherData);
    }
    if (studentIO && studentIO !== teacherIO) {
        const assignedUserId = deviceStudentAssignment.get(deviceId);
        let studentSocketId = null;
        if (assignedUserId) {
            // 修复Bug 1：只查询学生专用的socket映射
            // 【修复B】统一类型：用户ID转换为Number确保Map查询一致
            studentSocketId = studentUserIdToSocket.get(Number(assignedUserId));
        } else {
            studentSocketId = deviceToStudentSocket.get(deviceId);
        }
        if (studentSocketId) {
            studentIO.to(studentSocketId).emit('device-update', filteredData);
        }
    }
    if (io && io !== teacherIO && io !== studentIO) {
        io.emit('device-update', filteredData);
    }

    console.log(`📡 BROADCAST [${deviceId}] 波形数据已通过 WebSocket 广播。` + (filteredPinMapping ? ` (引脚数: ${filteredPinMapping.length})` : ''));
}

// =====================================================
// 广播设备状态 - 通用
// =====================================================
function broadcastDeviceStatus(deviceId, status) {
    if (io) {
        io.emit('device-status', {
            deviceId: deviceId,
            status: status,
            timestamp: new Date()
        });
    }
}

// =====================================================
// 教师专用：获取所有设备状态
// =====================================================
function getTeacherDashboardData() {
    return {
        devices: getOnlineDevicesList(),
        totalConnected: connectedUsers.size,
        timestamp: new Date().toISOString()
    };
}

function getIO() {
    return io;
}

function getTeacherIO() {
    return teacherIO;
}

function getStudentIO() {
    return studentIO;
}

function getDeviceAssignments() {
    const result = {};
    for (const [deviceId, userId] of deviceStudentAssignment) {
        result[deviceId] = userId;
    }
    return result;
}

function notifyStudentDeviceAllocated(userId, deviceId) {
    // 【修复B】统一类型：用户ID转换为Number确保Map查询一致
    const userIdNum = Number(userId);
    const studentSocketId = studentUserIdToSocket.get(userIdNum);
    if (studentSocketId) {
        // 【修复A】优先用 studentIO，因为学生一定连的是 3002 端口
        const targetIO = studentIO || io;
        if (targetIO) {
            targetIO.to(studentSocketId).emit('device_allocated', {
                deviceId: deviceId,
                userId: userId,
                timestamp: new Date().toISOString()
            });
            console.log(`[WS] 已通知学生 userId=${userId}: deviceId=${deviceId}`);
            return true;
        }
    }
    // 学生离线，存入 pending
    // 【修复B】统一类型
    pendingNotifications.set(userIdNum, deviceId);
    console.warn(`[WARN] 学生 userId=${userId} 尚未建立 WS 连接`);
    console.log(`[WS] 学生离线，暂存设备分配通知: userId=${userId}, deviceId=${deviceId}`);
    return false;
}

module.exports = setupSocket;
module.exports.broadcastDeviceData = broadcastDeviceData;
module.exports.broadcastDeviceStatus = broadcastDeviceStatus;
module.exports.broadcastToTeachers = broadcastToTeachers;
module.exports.getTeacherDashboardData = getTeacherDashboardData;
module.exports.getIO = getIO;
module.exports.getTeacherIO = getTeacherIO;
module.exports.getStudentIO = getStudentIO;
module.exports.setTCPServer = setTCPServer;
module.exports.getDeviceAssignments = getDeviceAssignments;
module.exports.notifyStudentDeviceAllocated = notifyStudentDeviceAllocated;
