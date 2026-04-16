// WebSocket连接管理（使用socket.io）
class WebSocketManager {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.listeners = {};
        
        this.initialize();
    }
    
    initialize() {
        this.connect();
        
        // 页面卸载时断开连接
        window.addEventListener('beforeunload', () => {
            this.disconnect();
        });
    }
    
    connect() {
        const wsUrl = `${window.location.protocol}//${window.location.host}`;
        this.socket = io(wsUrl);
        
        this.socket.on('connect', () => {
            console.log('WebSocket连接已建立');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus('connected');
            this.authenticate();
        });
        
        this.socket.on('message', (data) => {
            try {
                this.handleMessage(data);
            } catch (error) {
                console.error('解析WebSocket消息失败:', error);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log('WebSocket连接已关闭');
            this.updateConnectionStatus('disconnected');
            this.attemptReconnect();
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('WebSocket连接错误:', error);
            this.updateConnectionStatus('disconnected');
        });
        
        // 监听特定事件
        this.socket.on('device-update', (data) => this.handleDeviceUpdate(data));
        this.socket.on('device-status', (data) => this.handleDeviceStatus(data));
        this.socket.on('collection-status', (data) => this.handleCollectionStatus(data));
        this.socket.on('authenticated', (data) => console.log('认证成功:', data));
        this.socket.on('authentication_failed', (data) => console.error('认证失败:', data));
    }
    
    authenticate() {
        const token = sessionStorage.getItem('token');
        const user = JSON.parse(sessionStorage.getItem('user') || '{}');
        
        if (token && user.id) {
            this.send('authenticate', { token });
        }
    }
    
    send(type, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(type, data);
        }
    }
    
    handleMessage(message) {
        const { type, data } = message;
        
        // 触发对应类型的监听器
        if (this.listeners[type]) {
            this.listeners[type].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`处理消息 ${type} 时出错:`, error);
                }
            });
        }
    }
    
    handleDeviceUpdate(data) {
        if (window.studentDashboard) {
            window.studentDashboard.handleWaveformData(data);
        }
    }
    
    handleDeviceStatus(data) {
        if (window.studentDashboard && data.deviceId === window.studentDashboard.deviceId) {
            window.studentDashboard.updateDeviceStatus(data.status);
        }
    }
    
    handleCollectionStatus(data) {
        console.log('采集状态更新:', data);
    }
    
    on(type, callback) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }
    
    off(type, callback) {
        if (this.listeners[type]) {
            this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
        }
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.updateConnectionStatus('connecting');
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        } else {
            console.error('达到最大重连次数，停止重连');
        }
    }
    
    updateConnectionStatus(status) {
        const dot = document.getElementById('wsDot');
        const text = document.getElementById('wsStatus');
        
        if (dot && text) {
            dot.className = 'ws-dot';
            dot.classList.add(status);
            
            const statusTexts = {
                'connected': 'WebSocket已连接',
                'connecting': 'WebSocket连接中...',
                'disconnected': 'WebSocket未连接'
            };
            
            text.textContent = statusTexts[status] || status;
        }
    }
}

// 全局WebSocket实例
window.wsManager = new WebSocketManager();

// 为student.js提供访问
if (window.studentDashboard) {
    window.wsManager.on('device-update', (data) => {
        window.studentDashboard.handleDeviceUpdate(data);
    });
}