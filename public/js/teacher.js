// 📁 public/js/teacher.js - 教师端主入口
const API_BASE = window.location.port === '3000' 
    ? 'http://localhost:3000/api' 
    : 'http://localhost:3000/api';

// =====================================================
// 全局状态管理
// =====================================================
class TeacherApp {
    constructor() {
        this.currentModule = 'dashboard';
        this.socket = null;
        this.modules = {};
        this.user = null;
        
        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            this.initSocket();
            this.initModules();
            this.bindEvents();
            this.loadDashboardData();
        } catch (error) {
            console.error('初始化失败:', error);
            if (error.message === 'Unauthorized') {
                window.location.href = 'login.html';
            }
        }
    }

    async checkAuth() {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Unauthorized');
        }

        const response = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Unauthorized');
        }

        const data = await response.json();
        this.user = data.user;
        this.updateUserUI();
    }

    updateUserUI() {
        const userName = this.user?.real_name || this.user?.username || '教师';
        document.getElementById('userName').textContent = userName;
        document.getElementById('sidebarUserName').textContent = userName;
    }

    initSocket() {
        const wsUrl = window.location.port === '3002' 
            ? 'http://localhost:3002' 
            : 'http://localhost:3000';
        
        this.socket = io(wsUrl);
        
        this.socket.on('connect', () => {
            console.log('WebSocket 已连接');
            this.updateConnectionStatus(true);
            
            // 认证
            const token = localStorage.getItem('token');
            this.socket.emit('authenticate', token);
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket 已断开');
            this.updateConnectionStatus(false);
        });

        this.socket.on('authenticated', (data) => {
            console.log('Socket 认证成功:', data);
        });

        // 监听全局设备状态变化
        this.socket.on('global-device-status', (data) => {
            console.log('收到全局设备状态:', data);
            if (this.modules.deviceMonitor) {
                this.modules.deviceMonitor.handleStatusUpdate(data);
            }
            if (this.modules.dashboard) {
                this.modules.dashboard.handleStatusUpdate(data);
            }
        });
    }

    updateConnectionStatus(connected) {
        const dot = document.getElementById('wsStatusDot');
        const text = document.getElementById('wsStatusText');
        
        if (connected) {
            dot?.classList.add('online');
            text.textContent = '已连接';
        } else {
            dot?.classList.remove('online');
            text.textContent = '连接断开';
        }
    }

    initModules() {
        this.modules.dashboard = new DashboardModule(this);
        this.modules.deviceMonitor = new DeviceMonitorModule(this);
        this.modules.experimentBuilder = new ExperimentBuilderModule(this);
        this.modules.classManager = new ClassManagerModule(this);
        this.modules.classes = this.modules.classManager;
        this.modules.devices = this.modules.deviceMonitor;
        this.modules.experiments = this.modules.experimentBuilder;
    }

    bindEvents() {
        // 侧边栏导航
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const module = item.dataset.module;
                this.switchModule(module);
            });
        });

        // 退出登录
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        });

        // 模态框关闭
        document.getElementById('modalClose')?.addEventListener('click', () => {
            document.getElementById('modalOverlay').style.display = 'none';
            if (this.modules.deviceMonitor) {
                this.modules.deviceMonitor.closeObserveModal();
            }
        });

        // 哈希路由
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (hash) {
                this.switchModule(hash);
            }
        });

        // 初始路由
        const hash = window.location.hash.slice(1);
        if (hash) {
            this.switchModule(hash);
        }
    }

    switchModule(moduleName) {
        // 更新导航状态
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.module === moduleName);
        });

        // 显示对应模块
        document.querySelectorAll('.content-module').forEach(module => {
            module.style.display = 'none';
        });

        const targetModule = document.getElementById(`${moduleName}-module`);
        if (targetModule) {
            targetModule.style.display = 'block';
        }

        this.currentModule = moduleName;

        // 调用模块的 onShow 方法
        const module = this.modules[moduleName];
        if (module && typeof module.onShow === 'function') {
            module.onShow();
        }
    }

    async loadDashboardData() {
        if (this.modules.dashboard) {
            await this.modules.dashboard.loadData();
        }
    }

    getToken() {
        return localStorage.getItem('token');
    }

    async apiCall(endpoint, options = {}) {
        const token = this.getToken();
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...options.headers
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: '请求失败' }));
            throw new Error(error.error || '请求失败');
        }

        return response.json();
    }
}

// =====================================================
// 控制台主页模块
// =====================================================
class DashboardModule {
    constructor(app) {
        this.app = app;
    }

    async loadData() {
        try {
            // 加载设备概览
            const overviewRes = await this.app.apiCall('/devices/overview');
            if (overviewRes.success) {
                this.updateDeviceStats(overviewRes.data.overview);
                this.updateTodayActivity(overviewRes.data.todayActivity);
            }

            // 加载统计数据
            const [classesRes, experimentsRes] = await Promise.all([
                this.app.apiCall('/classes').catch(() => ({ success: true, data: [] })),
                this.app.apiCall('/experiments').catch(() => ({ success: true, data: [] }))
            ]);

            if (classesRes.success) {
                const totalStudents = classesRes.data.reduce((sum, cls) => sum + (cls.student_count || 0), 0);
                document.getElementById('statTotalStudents').textContent = totalStudents;
            }

            if (experimentsRes.success) {
                document.getElementById('statExperiments').textContent = experimentsRes.experiments?.length || 0;
                this.renderExperimentList(experimentsRes.experiments);
            }

            this.bindEvents();
        } catch (error) {
            console.error('加载仪表盘数据失败:', error);
        }
    }

    bindEvents() {
        const refreshBtn = document.getElementById('refreshExperimentsBtn');
        if (refreshBtn && !refreshBtn.hasAttribute('data-bound')) {
            refreshBtn.setAttribute('data-bound', 'true');
            refreshBtn.addEventListener('click', () => this.loadExperimentList());
        }
    }

    async loadExperimentList() {
        try {
            const experimentsRes = await this.app.apiCall('/experiments');
            if (experimentsRes.success) {
                this.renderExperimentList(experimentsRes.experiments);
            }
        } catch (error) {
            console.error('加载实验列表失败:', error);
        }
    }

    renderExperimentList(experiments) {
        const tbody = document.getElementById('experimentTableBody');
        if (!tbody) return;

        if (!experiments || experiments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-loading">暂无实验数据</td></tr>';
            return;
        }

        const difficultyMap = {
            'easy': { text: '简单', class: 'difficulty-easy' },
            'medium': { text: '中等', class: 'difficulty-medium' },
            'hard': { text: '困难', class: 'difficulty-hard' }
        };

        const categoryMap = {
            'basic': '基础',
            'advanced': '高级',
            'project': '项目'
        };

        tbody.innerHTML = experiments.map(exp => {
            const difficulty = difficultyMap[exp.difficulty_level] || { text: exp.difficulty_level, class: '' };
            const category = categoryMap[exp.category] || exp.category || '-';
            const pinConfig = exp.target_pins?.join(', ') || '-';
            const createdAt = exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '-';

            return `
                <tr>
                    <td>${exp.id || '-'}</td>
                    <td>${exp.experiment_name || '-'}</td>
                    <td><span class="${difficulty.class}">${difficulty.text}</span></td>
                    <td>${exp.estimated_duration || '-'}</td>
                    <td>${category}</td>
                    <td>${pinConfig}</td>
                    <td>${createdAt}</td>
                </tr>
            `;
        }).join('');
    }

    updateDeviceStats(overview) {
        document.getElementById('statTotalDevices').textContent = overview.total || 0;
        document.getElementById('statOnlineDevices').textContent = overview.online || 0;
    }

    updateTodayActivity(activity) {
        document.getElementById('todaySubmissions').textContent = activity?.submissions || 0;
    }

    handleStatusUpdate(data) {
        // 实时更新设备状态
        this.loadData();
    }

    onShow() {
        this.loadData();
    }
}

// =====================================================
// 旁观者波形可视化类（完整版 - 移植自 student.js）
// =====================================================
class ObserveVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id ${canvasId} not found.`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');

        this.offsetX = 0;
        this.scaleX = 1;
        this.isDragging = false;
        this.lastMouseX = 0;

        this.labelAreaWidth = 80;

        this.historyWaveforms = [];
        this.maxHistoryPoints = 5000;
        this.lastDataLength = 0;

        this.channelVisibility = [];
        this.minChannelHeight = 40;

        this._lastPinMapping = null;

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.bindEvents();
    }

    setChannelVisibility(visibilityArray) {
        this.channelVisibility = visibilityArray;
        this.redraw();
    }

    getVisibleChannelIndices() {
        const indices = [];
        for (let i = 0; i < this.channelVisibility.length; i++) {
            if (this.channelVisibility[i]) {
                indices.push(i);
            }
        }
        return indices;
    }

    getChannelVisibility() {
        return this.channelVisibility;
    }

    bindEvents() {
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        this.canvas.addEventListener('click', () => {});
    }

    handleWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseRelX = mouseX - this.labelAreaWidth;

        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.1, Math.min(50, this.scaleX * zoomFactor));

        const scalePoint = (mouseRelX / this.scaleX) + this.offsetX;
        this.offsetX = scalePoint - (mouseRelX / newScale);
        this.scaleX = newScale;

        this.redraw();
    }

    handleMouseDown(e) {
        if (e.button !== 0) return;
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.canvas.style.cursor = 'grabbing';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.lastMouseX;
        this.offsetX += deltaX / this.scaleX;
        this.lastMouseX = e.clientX;

        this.redraw();
    }

    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
    }

    resetView() {
        this.offsetX = 0;
        this.scaleX = 1;
        this.historyWaveforms = [];
        this.redraw();
    }

    resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.canvas.offsetWidth * dpr;
        this.canvas.height = this.canvas.offsetHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.redraw();
    }

    redraw() {
        if (this.historyWaveforms.length > 0) {
            this.draw(this.historyWaveforms, this._lastPinMapping);
        }
    }

    draw(waveforms, pinMapping) {
        if (!this.ctx || !waveforms || waveforms.length === 0) return;

        this._lastWaveforms = waveforms;
        this._lastPinMapping = pinMapping;

        const { width, height } = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, width, height);

        const visibleIndices = this.getVisibleChannelIndices();
        const numVisibleChannels = visibleIndices.length;

        if (numVisibleChannels === 0) return;

        const channelHeight = Math.max(height / numVisibleChannels, this.minChannelHeight);
        const canvasHeight = numVisibleChannels * channelHeight;

        this.canvas.style.height = canvasHeight + 'px';

        const dpr = window.devicePixelRatio || 1;
        this.canvas.height = canvasHeight * dpr;

        const signalAmplitude = channelHeight * 0.4;

        this.ctx.strokeStyle = '#00E676';
        this.ctx.lineWidth = 1.5;
        this.ctx.font = '12px monospace';
        this.ctx.fillStyle = '#B2DFDB';

        visibleIndices.forEach((originalIndex, visibleIndex) => {
            const channelData = waveforms[originalIndex];
            if (!channelData || channelData.length === 0) return;

            const yBase = (visibleIndex + 0.5) * channelHeight;

            const labelText = pinMapping?.[originalIndex] || `CH ${originalIndex}`;
            this.ctx.fillStyle = '#00E676';
            this.ctx.fillText(labelText, 8, yBase + 4);

            this.ctx.beginPath();

            const firstX = this.labelAreaWidth + (0 - this.offsetX) * this.scaleX;
            const firstY = yBase - (channelData[0] - 0.5) * signalAmplitude;
            this.ctx.moveTo(firstX, firstY);

            for (let j = 1; j < channelData.length; j++) {
                const x = this.labelAreaWidth + (j - this.offsetX) * this.scaleX;
                const yPrev = yBase - (channelData[j - 1] - 0.5) * signalAmplitude;
                const yCurr = yBase - (channelData[j] - 0.5) * signalAmplitude;

                this.ctx.lineTo(x, yPrev);
                this.ctx.lineTo(x, yCurr);
            }
            this.ctx.stroke();
        });

        this.drawGrid(width, canvasHeight, numVisibleChannels);
    }

    appendWaveform(newWaveforms, pinMapping) {
        if (!newWaveforms || newWaveforms.length === 0) return;

        if (this.historyWaveforms.length === 0) {
            this.historyWaveforms = newWaveforms.map(ch => [...(ch || [])]);
        } else {
            for (let i = 0; i < newWaveforms.length; i++) {
                if (newWaveforms[i] && newWaveforms[i].length > 0) {
                    if (!this.historyWaveforms[i]) {
                        this.historyWaveforms[i] = [];
                    }
                    this.historyWaveforms[i] = this.historyWaveforms[i].concat(newWaveforms[i]);
                }
            }
        }

        for (let i = 0; i < this.historyWaveforms.length; i++) {
            if (this.historyWaveforms[i] && this.historyWaveforms[i].length > this.maxHistoryPoints) {
                this.historyWaveforms[i] = this.historyWaveforms[i].slice(-this.maxHistoryPoints);
            }
        }

        this._lastPinMapping = pinMapping;

        if (!this.isDragging) {
            const totalLength = this.historyWaveforms[0]?.length || 0;
            if (totalLength > this.lastDataLength) {
                this.offsetX = Math.max(0, totalLength - 200);
            }
            this.lastDataLength = totalLength;
        }

        this.redraw();
    }

    drawGrid(width, height, numChannels) {
        const channelHeight = height / numChannels;

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        this.ctx.font = '10px monospace';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';

        for (let i = 0; i <= numChannels; i++) {
            const y = i * channelHeight;
            this.ctx.beginPath();
            this.ctx.moveTo(this.labelAreaWidth, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }

        const gridSpacing = 50 * this.scaleX;
        if (gridSpacing > 10) {
            const startX = Math.floor(this.offsetX / 50) * 50;
            for (let x = startX; x < this.offsetX + width / this.scaleX; x += 50) {
                const screenX = this.labelAreaWidth + (x - this.offsetX) * this.scaleX;
                if (screenX > this.labelAreaWidth && screenX < width) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(screenX, 0);
                    this.ctx.lineTo(screenX, height);
                    this.ctx.stroke();

                    this.ctx.fillText(x.toString(), screenX + 2, 12);
                }
            }
        }
    }
}

// =====================================================
// 设备监控大厅模块
// =====================================================
class DeviceMonitorModule {
    constructor(app) {
        this.app = app;
        this.devices = new Map();
        this.filter = 'all';
        this.observingDeviceId = null;
        this.observeHandler = null;
        this.observeVisualizer = null;

        this.init();
    }

    init() {
        const filter = document.getElementById('deviceStatusFilter');
        filter?.addEventListener('change', (e) => {
            this.filter = e.target.value;
            this.render();
        });
    }

    handleStatusUpdate(data) {
        const { deviceId, status, action, requestedPins } = data;
        
        if (action === 'device_online' || action === 'device_offline') {
            this.devices.set(deviceId, {
                deviceId,
                status,
                lastSeen: data.timestamp,
                isCapturing: false
            });
        } else if (action === 'start_capture') {
            const device = this.devices.get(deviceId) || { deviceId };
            device.status = 'capturing';
            device.isCapturing = true;
            device.requestedPins = requestedPins;
            device.lastSeen = data.timestamp;
            this.devices.set(deviceId, device);
        } else if (action === 'stop_capture') {
            const device = this.devices.get(deviceId) || { deviceId };
            device.status = 'online';
            device.isCapturing = false;
            device.lastSeen = data.timestamp;
            this.devices.set(deviceId, device);
        }

        this.render();
    }

    render() {
        const grid = document.getElementById('deviceGrid');
        const countEl = document.getElementById('deviceCount');
        
        if (!grid) return;

        let devicesArray = Array.from(this.devices.values());
        
        // 筛选
        if (this.filter !== 'all') {
            devicesArray = devicesArray.filter(d => d.status === this.filter);
        }

        countEl.textContent = devicesArray.length;

        if (devicesArray.length === 0) {
            grid.innerHTML = `
                <div class="device-empty">
                    <span class="empty-icon">📱</span>
                    <p>暂无设备</p>
                    <p class="empty-hint">等待设备连接...</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = devicesArray.map(device => this.createDeviceCard(device)).join('');

        // 绑定卡片按钮事件
        grid.querySelectorAll('.diagnose-btn').forEach(btn => {
            btn.addEventListener('click', () => this.diagnoseDevice(btn.dataset.deviceId));
        });

        grid.querySelectorAll('.observe-btn').forEach(btn => {
            btn.addEventListener('click', () => this.openObserveModal(btn.dataset.deviceId));
        });
    }

    createDeviceCard(device) {
        const statusClass = this.getStatusClass(device.status);
        const statusText = this.getStatusText(device.status);
        const captureStatus = device.isCapturing ? '🔴 采集中' : '';
        const observeBtn = device.status === 'capturing'
            ? `<button class="btn btn-small btn-info observe-btn" data-device-id="${device.deviceId}">📺 旁观</button>`
            : '';

        return `
            <div class="device-card ${statusClass}">
                <div class="device-header">
                    <div class="device-status-dot ${statusClass}"></div>
                    <span class="device-status-text">${statusText}</span>
                </div>
                <div class="device-body">
                    <div class="device-icon">📱</div>
                    <div class="device-name">${device.deviceId}</div>
                    <div class="device-info">
                        <span>资产编号: ${device.assetNumber || '-'}</span>
                        <span>引脚数: ${device.requestedPins?.length || '-'}</span>
                    </div>
                    <div class="device-capture-status">${captureStatus}</div>
                </div>
                <div class="device-footer">
                    <button class="btn btn-small diagnose-btn" data-device-id="${device.deviceId}">故障检测</button>
                    ${observeBtn}
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        switch (status) {
            case 'online': return 'status-online';
            case 'capturing': return 'status-capturing';
            case 'offline': return 'status-offline';
            case 'faulty': return 'status-faulty';
            default: return 'status-offline';
        }
    }

    getStatusText(status) {
        switch (status) {
            case 'online': return '在线';
            case 'capturing': return '采集中';
            case 'offline': return '离线';
            case 'faulty': return '故障';
            default: return '未知';
        }
    }

    async diagnoseDevice(deviceId) {
        if (!confirm(`确定要对设备 ${deviceId} 进行故障检测吗？`)) {
            return;
        }

        try {
            const result = await this.app.apiCall(`/devices/${deviceId}/diagnose`, {
                method: 'POST'
            });

            if (result.success) {
                alert(`故障检测指令已下发到设备 ${deviceId}`);
            } else {
                alert(`发送失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    openObserveModal(deviceId) {
        this.observingDeviceId = deviceId;

        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = `📺 旁观设备: ${deviceId}`;
        body.innerHTML = `
            <div id="observePanel" class="f-layout" style="pointer-events:none;">
                <div class="f-topbar" style="padding:8px;background:#1a1a2e;border-radius:6px;margin-bottom:10px;">
                    <span style="color:#00E676;font-weight:bold;">📺 旁观模式 - ${deviceId}</span>
                </div>

                <div class="f-digits" id="obs-digit-container" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;justify-content:center;"></div>

                <div class="f-io-panel" style="display:flex;gap:10px;margin-bottom:10px;">
                    <div class="f-left">
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">💡 LED</span>
                            <div id="obs-led-container" class="f-leds" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
                        </div>
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">🔌 开关</span>
                            <div id="obs-switch-container" class="f-switches" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
                        </div>
                    </div>
                    <div class="f-right">
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">🔘 独立按键</span>
                            <div id="obs-btn-container" class="f-buttons" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
                        </div>
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">🔢 矩阵按键</span>
                            <div id="obs-matrix-container" class="f-matrix"></div>
                        </div>
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">🔊 蜂鸣器</span>
                            <div id="obs-buzzer-container" class="f-buzzer"></div>
                        </div>
                        <div class="f-section" style="background:#222;padding:8px;border-radius:4px;">
                            <span class="f-section-label" style="color:#aaa;">🔘 A7按键</span>
                            <div id="obs-a7btn-container" class="f-buttons"></div>
                        </div>
                    </div>
                </div>

                <div id="obs-waveform-filters" class="waveform-filters" style="margin-bottom:10px;"></div>

                <div style="background:#1a1a2e;border-radius:6px;padding:8px;overflow-y:auto;max-height:300px;">
                    <canvas id="observeWaveformCanvas" style="width:100%;min-height:200px;"></canvas>
                </div>
            </div>
            <style>
                .obs-led { width:14px;height:14px;border-radius:50%;background:#444;margin:2px;cursor:default; }
                .obs-led.on { background:#0f0;box-shadow:0 0 6px #0f0; }
                .obs-switch { width:16px;height:10px;background:#444;margin:2px;border-radius:2px;cursor:default; }
                .obs-switch.on { background:#f80; }
                .obs-btn-indep { width:40px;height:24px;background:#333;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;cursor:default;border:2px solid #555; }
                .obs-btn-indep.on { background:#4CAF50;border-color:#4CAF50; }
                .obs-matrix-grid { display:grid;grid-template-columns:auto repeat(4,20px);gap:2px;font-size:9px; }
                .obs-matrix-label { display:flex;align-items:center;justify-content:center;color:#666; }
                .obs-matrix-cell { width:20px;height:16px;background:#333;border-radius:2px;cursor:default; }
                .obs-matrix-cell.on { background:#FF9800; }
                .obs-buzzer-icon { width:30px;height:30px;background:#444;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:default;border:2px solid #555; }
                .obs-buzzer-icon.on { background:#f44336;border-color:#f44336;animation:obs-buzzer-pulse 0.3s infinite; }
                @keyframes obs-buzzer-pulse { 0%,100%{transform:scale(1);} 50%{transform:scale(1.1);} }
                .obs-digit { width:24px;height:36px;background:#222;border-radius:3px;position:relative;margin:2px; }
                .obs-digit .segment { position:absolute;background:#333; }
                .obs-digit .segment.on { background:#f00; }
                .obs-segment-a { width:14px;height:3px;top:2px;left:2px; }
                .obs-segment-b { width:3px;height:14px;top:2px;right:2px; }
                .obs-segment-c { width:3px;height:14px;bottom:8px;right:2px; }
                .obs-segment-d { width:14px;height:3px;bottom:2px;left:2px; }
                .obs-segment-e { width:3px;height:14px;bottom:8px;left:2px; }
                .obs-segment-f { width:3px;height:14px;top:2px;left:2px; }
                .obs-segment-g { width:14px;height:3px;top:16px;left:2px; }
                .f-leds, .f-switches, .f-buttons { display:flex;flex-wrap:wrap;gap:4px;margin-top:6px; }
                .f-matrix { margin-top:6px; }
                .f-buzzer { margin-top:6px; }
                .waveform-filters { display:flex;flex-wrap:wrap;gap:6px; }
                .filter-label { background:#333;padding:3px 8px;border-radius:3px;font-size:11px;color:#aaa;cursor:default; }
                .filter-label.checked { background:#00E676;color:#000; }
            </style>
        `;

        modal.style.display = 'flex';

        this.initObservePanel();

        this.observeVisualizer = new ObserveVisualizer('observeWaveformCanvas');

        this.observeHandler = (data) => {
            if (data.deviceId !== this.observingDeviceId) return;
            if (data.type === 'waveform_update' && data.waveforms) {
                this.observeVisualizer.appendWaveform(data.waveforms, data.pinMapping);
                this.mapWaveformsToUI(data.waveforms, data.pinMapping);
                this.updateObserveFilters(data.pinMapping);
            }
        };

        this.app.socket.on('device-update', this.observeHandler);
    }

    closeObserveModal() {
        if (this.observeHandler) {
            this.app.socket.off('device-update', this.observeHandler);
            this.observeHandler = null;
        }
        this.observingDeviceId = null;
        if (this.observeVisualizer) {
            this.observeVisualizer.resetView();
            this.observeVisualizer = null;
        }
    }

    initObservePanel() {
        const ledContainer = document.getElementById('obs-led-container');
        const switchContainer = document.getElementById('obs-switch-container');
        const btnContainer = document.getElementById('obs-btn-container');
        const matrixContainer = document.getElementById('obs-matrix-container');
        const buzzerContainer = document.getElementById('obs-buzzer-container');
        const a7btnContainer = document.getElementById('obs-a7btn-container');
        const digitContainer = document.getElementById('obs-digit-container');

        ledContainer.innerHTML = '';
        switchContainer.innerHTML = '';
        btnContainer.innerHTML = '';
        matrixContainer.innerHTML = '';
        buzzerContainer.innerHTML = '';
        a7btnContainer.innerHTML = '';
        digitContainer.innerHTML = '';

        for (let i = 0; i < 32; i++) {
            const led = document.createElement('div');
            led.id = `obs-led${i}`;
            led.className = 'obs-led off';
            led.innerHTML = `<span style="font-size:8px;color:#888;">${i}</span>`;
            ledContainer.appendChild(led);
        }

        for (let i = 0; i < 32; i++) {
            const sw = document.createElement('div');
            sw.id = `obs-sw${i}`;
            sw.className = 'obs-switch off';
            sw.innerHTML = `<span style="font-size:8px;color:#888;">${i}</span>`;
            switchContainer.appendChild(sw);
        }

        for (let i = 0; i < 4; i++) {
            const btn = document.createElement('div');
            btn.id = `obs-btn${i}`;
            btn.className = 'obs-btn-indep off';
            btn.textContent = `${i}`;
            btnContainer.appendChild(btn);
        }

        const matrixGrid = document.createElement('div');
        matrixGrid.className = 'obs-matrix-grid';
        matrixGrid.innerHTML = '<div class="obs-matrix-label"></div><div class="obs-matrix-label">0</div><div class="obs-matrix-label">1</div><div class="obs-matrix-label">2</div><div class="obs-matrix-label">3</div>';
        for (let row = 0; row < 4; row++) {
            const rowLabel = document.createElement('div');
            rowLabel.className = 'obs-matrix-label';
            rowLabel.textContent = `${row}`;
            matrixGrid.appendChild(rowLabel);
            for (let col = 0; col < 4; col++) {
                const cell = document.createElement('div');
                cell.id = `obs-matrix_${row}_${col}`;
                cell.className = 'obs-matrix-cell off';
                matrixGrid.appendChild(cell);
            }
        }
        matrixContainer.appendChild(matrixGrid);

        const buzzer = document.createElement('div');
        buzzer.id = 'obs-buzzer100';
        buzzer.className = 'obs-buzzer-icon off';
        buzzer.textContent = '🔊';
        buzzerContainer.appendChild(buzzer);

        for (let i = 101; i <= 102; i++) {
            const btn = document.createElement('div');
            btn.id = `obs-a7btn${i}`;
            btn.className = 'obs-btn-indep off';
            btn.textContent = `A7-${i}`;
            a7btnContainer.appendChild(btn);
        }

        for (let i = 0; i < 8; i++) {
            const digit = document.createElement('div');
            digit.id = `obs-digit${i}`;
            digit.className = 'obs-digit';
            digit.innerHTML = `
                <div class="segment obs-segment-a" data-segment="a"></div>
                <div class="segment obs-segment-b" data-segment="b"></div>
                <div class="segment obs-segment-c" data-segment="c"></div>
                <div class="segment obs-segment-d" data-segment="d"></div>
                <div class="segment obs-segment-e" data-segment="e"></div>
                <div class="segment obs-segment-f" data-segment="f"></div>
                <div class="segment obs-segment-g" data-segment="g"></div>
            `;
            digitContainer.appendChild(digit);
        }
    }

    calculateInstantState(channelData) {
        if (!channelData || channelData.length === 0) {
            return false;
        }

        const lastPointsCount = Math.min(10, channelData.length);
        const lastPoints = channelData.slice(-lastPointsCount);

        let zerosCount = 0;
        let onesCount = 0;

        for (let i = 0; i < lastPoints.length; i++) {
            if (lastPoints[i] === 1) {
                onesCount++;
            } else if (lastPoints[i] === 0) {
                zerosCount++;
            }
        }

        if (onesCount > zerosCount) {
            return true;
        } else if (zerosCount > onesCount) {
            return false;
        } else {
            return channelData[channelData.length - 1] === 1;
        }
    }

    mapWaveformsToUI(waveforms, pinMapping) {
        if (!waveforms || !Array.isArray(waveforms)) {
            return;
        }

        if (!pinMapping || !Array.isArray(pinMapping)) {
            console.warn('[Observe UI Warning] pinMapping undefined or not array');
            return;
        }

        for (let index = 0; index < waveforms.length; index++) {
            const channelData = waveforms[index];
            if (!channelData || channelData.length === 0) continue;

            let pinInfo = pinMapping[index];
            let pinName;
            if (typeof pinInfo === 'string') {
                pinName = pinInfo;
            } else if (pinInfo && typeof pinInfo === 'object') {
                pinName = pinInfo.name || pinInfo.pin || pinInfo.pinName;
            }

            if (!pinName) continue;

            const isOn = this.calculateInstantState(channelData);

            if (pinName.match(/^LED\d+$/i)) {
                const ledIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                const el = document.getElementById(`obs-led${ledIndex}`);
                if (el) {
                    el.classList.toggle('on', isOn);
                    el.classList.toggle('off', !isOn);
                }
            } else if (pinName.match(/^SW\d+$/i)) {
                const swIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                const el = document.getElementById(`obs-sw${swIndex}`);
                if (el) {
                    el.classList.toggle('on', isOn);
                    el.classList.toggle('off', !isOn);
                }
            } else if (pinName.match(/^BTN\d+$/i) || pinName.match(/^KEY\d+$/i)) {
                const btnIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                if (btnIndex >= 0 && btnIndex <= 3) {
                    const el = document.getElementById(`obs-btn${btnIndex}`);
                    if (el) {
                        el.classList.toggle('on', isOn);
                        el.classList.toggle('off', !isOn);
                    }
                }
            } else if (pinName.match(/^A7_BTN\d+$/i)) {
                const a7Index = parseInt(pinName.substring(6), 10);
                if (!isNaN(a7Index)) {
                    const mappedId = a7Index === 0 ? 101 : (a7Index === 1 ? 102 : 101 + a7Index);
                    const el = document.getElementById(`obs-a7btn${mappedId}`);
                    if (el) {
                        el.classList.toggle('on', isOn);
                        el.classList.toggle('off', !isOn);
                    }
                }
            } else if (pinName.match(/^DIGIT_\d+_[A-Ga-g]$/)) {
                const digitMatch = pinName.match(/^DIGIT_(\d+)_([A-Ga-g])$/);
                if (digitMatch) {
                    const digitIndex = parseInt(digitMatch[1], 10);
                    const segmentName = digitMatch[2].toLowerCase();
                    const digitEl = document.getElementById(`obs-digit${digitIndex}`);
                    if (digitEl) {
                        const segmentEl = digitEl.querySelector(`.obs-segment-${segmentName}`);
                        if (segmentEl) {
                            segmentEl.classList.toggle('on', isOn);
                            segmentEl.classList.toggle('off', !isOn);
                        }
                    }
                }
            } else if (pinName.match(/^ROW\d+$/i)) {
                const rowIndex = parseInt(pinName.substring(3), 10);
                if (!isNaN(rowIndex)) {
                    for (let col = 0; col < 4; col++) {
                        const cellEl = document.getElementById(`obs-matrix_${rowIndex}_${col}`);
                        if (cellEl) {
                            cellEl.classList.toggle('on', isOn);
                            cellEl.classList.toggle('off', !isOn);
                        }
                    }
                }
            } else if (pinName.match(/^COL\d+$/i)) {
                const colIndex = parseInt(pinName.substring(3), 10);
                if (!isNaN(colIndex)) {
                    for (let row = 0; row < 4; row++) {
                        const cellEl = document.getElementById(`obs-matrix_${row}_${colIndex}`);
                        if (cellEl) {
                            cellEl.classList.toggle('on', isOn);
                            cellEl.classList.toggle('off', !isOn);
                        }
                    }
                }
            } else if (pinName.match(/^BUZZER$/i)) {
                const buzzerEl = document.getElementById('obs-buzzer100');
                if (buzzerEl) {
                    buzzerEl.classList.toggle('on', isOn);
                    buzzerEl.classList.toggle('off', !isOn);
                }
            }
        }
    }

    updateObserveFilters(pinMapping) {
        const filterContainer = document.getElementById('obs-waveform-filters');
        if (!filterContainer || !pinMapping) return;

        if (filterContainer.dataset.initialized === 'true') return;

        filterContainer.innerHTML = '';
        const visibility = [];

        pinMapping.forEach((pinName, index) => {
            const label = document.createElement('label');
            label.className = 'filter-label checked';
            label.textContent = pinName;
            visibility.push(true);
            filterContainer.appendChild(label);
        });

        if (this.observeVisualizer) {
            this.observeVisualizer.setChannelVisibility(visibility);
        }
        filterContainer.dataset.initialized = 'true';
    }

    mapWaveformsToPanel(waveforms, pinMapping) {
        this.mapWaveformsToUI(waveforms, pinMapping);
    }

    onShow() {
        // 切换到设备监控时加载概览数据
        this.app.apiCall('/devices/overview')
            .then(res => {
                if (res.success && res.data.overview) {
                    const overview = res.data.overview;
                    // 更新设备列表
                    overview.recentDevices?.forEach(device => {
                        this.handleStatusUpdate({
                            deviceId: device.device_id,
                            status: device.status,
                            timestamp: device.last_seen
                        });
                    });
                }
            })
            .catch(err => console.error('加载设备列表失败:', err));
    }
}

// =====================================================
// 实验发布中心模块
// =====================================================
class ExperimentBuilderModule {
    constructor(app) {
        this.app = app;
        this.experiments = [];
        
        this.init();
    }

    init() {
        const createBtn = document.getElementById('createExperimentBtn');
        const cancelBtn = document.getElementById('cancelExperimentBtn');
        const form = document.getElementById('experimentForm');

        createBtn?.addEventListener('click', () => this.showForm());
        cancelBtn?.addEventListener('click', () => this.hideForm());
        form?.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    showForm() {
        document.getElementById('experimentBuilder').style.display = 'block';
        document.getElementById('experimentsList').style.display = 'none';
        document.getElementById('experimentForm').reset();
        document.getElementById('experimentFormTitle').textContent = '创建新实验';
    }

    hideForm() {
        document.getElementById('experimentBuilder').style.display = 'none';
        document.getElementById('experimentsList').style.display = 'block';
    }

    async handleSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        const experimentData = {
            experiment_code: formData.get('experiment_code'),
            experiment_name: formData.get('experiment_name'),
            description: formData.get('description') || '',
            category: formData.get('category') || 'basic',
            difficulty_level: formData.get('difficulty_level') || 'medium',
            estimated_duration: parseInt(formData.get('estimated_duration')) || 60,
            instructions: formData.get('description') || '',
            sample_clock_source: formData.get('sample_clock_source') || 'external',
            trigger_condition: formData.get('trigger_condition') || '0x0000',
            sample_length: parseInt(formData.get('sample_length')) || 32,
            is_public: formData.get('is_public') === 'true',
            is_classic: formData.get('is_classic') === 'true'
        };

        if (!experimentData.experiment_code) {
            experimentData.experiment_code = 'EXP_' + Date.now();
        }

        const selectedPins = [];
        form.querySelectorAll('input[name="target_pins"]:checked').forEach(cb => {
            selectedPins.push(cb.value);
        });
        experimentData.target_pins = selectedPins;

        if (selectedPins.length === 0) {
            alert('请至少选择一个目标引脚');
            return;
        }

        try {
            const result = await this.app.apiCall('/experiments', {
                method: 'POST',
                body: JSON.stringify(experimentData)
            });

            if (result.success) {
                alert('实验创建成功！');
                this.hideForm();
                this.loadExperiments();
            } else {
                alert(`创建失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async loadExperiments() {
        const list = document.getElementById('experimentsList');
        
        try {
            const result = await this.app.apiCall('/experiments');
            
            if (!result.success) {
                list.innerHTML = '<div class="experiments-error">加载失败</div>';
                return;
            }

            this.experiments = result.experiments || [];

            if (this.experiments.length === 0) {
                list.innerHTML = `
                    <div class="experiment-empty">
                        <span class="empty-icon">🧪</span>
                        <p>暂无实验</p>
                        <p class="empty-hint">点击上方按钮创建第一个实验</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = this.experiments.map(exp => this.createExperimentCard(exp)).join('');

        } catch (error) {
            console.error('加载实验列表失败:', error);
            list.innerHTML = '<div class="experiments-error">加载失败</div>';
        }
    }

    createExperimentCard(exp) {
        const categoryClass = exp.category === 'basic' ? 'category-basic' :
                             exp.category === 'advanced' ? 'category-advanced' : 'category-project';
        const difficultyClass = `difficulty-${exp.difficulty_level}`;
        const publicLabel = exp.is_public
            ? '<span class="experiment-public" style="background:#28a745;padding:2px 6px;border-radius:3px;font-size:11px;">公开</span>'
            : '<span class="experiment-private" style="background:#666;padding:2px 6px;border-radius:3px;font-size:11px;">私有</span>';
        const targetPinsDisplay = exp.target_pins && exp.target_pins.length > 0
            ? exp.target_pins.slice(0, 5).join(', ') + (exp.target_pins.length > 5 ? '...' : '')
            : '-';

        return `
            <div class="experiment-card">
                <div class="experiment-header">
                    <span class="experiment-code">${exp.experiment_code}</span>
                    <span class="experiment-category ${categoryClass}">${exp.category}</span>
                    ${exp.is_classic ? '<span class="experiment-classic">⭐ 经典</span>' : ''}
                    ${publicLabel}
                </div>
                <div class="experiment-body">
                    <h3 class="experiment-name">${exp.experiment_name}</h3>
                    <p class="experiment-desc">${exp.description || '暂无描述'}</p>
                    <div class="experiment-meta">
                        <span class="difficulty ${difficultyClass}">${exp.difficulty_level}</span>
                        <span>⏱️ ${exp.estimated_duration || 60}分钟</span>
                        <span>📌 ${exp.sample_length || 32}包</span>
                    </div>
                    <div class="experiment-pins" style="margin-top:8px;font-size:12px;color:#888;">
                        目标引脚: ${targetPinsDisplay}
                    </div>
                </div>
                <div class="experiment-footer">
                    <span class="experiment-date">创建于: ${new Date(exp.created_at).toLocaleDateString()}</span>
                    <div style="margin-top:8px;">
                        <button class="btn btn-small" onclick="window.teacherApp.modules.experimentBuilder.showEditModal(${exp.id})">✏️ 编辑</button>
                        <button class="btn btn-small btn-danger" onclick="window.teacherApp.modules.experimentBuilder.deleteExperiment(${exp.id})">🗑️ 删除</button>
                    </div>
                </div>
            </div>
        `;
    }

    async showEditModal(experimentId) {
        const exp = this.experiments.find(e => e.id === experimentId);
        if (!exp) {
            alert('实验不存在');
            return;
        }

        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = '编辑实验';
        body.innerHTML = `
            <form id="editExperimentForm" class="experiment-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>实验代码</label>
                        <input type="text" name="experiment_code" value="${exp.experiment_code}" readonly style="background:#eee;">
                    </div>
                    <div class="form-group">
                        <label for="expName">实验名称 <span class="required">*</span></label>
                        <input type="text" id="expName" name="experiment_name" value="${exp.experiment_name}" required>
                    </div>
                </div>

                <div class="form-group">
                    <label for="expDescription">实验描述</label>
                    <textarea id="expDescription" name="description" rows="3">${exp.description || ''}</textarea>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="expCategory">实验类别</label>
                        <select id="expCategory" name="category">
                            <option value="basic" ${exp.category === 'basic' ? 'selected' : ''}>基础实验</option>
                            <option value="advanced" ${exp.category === 'advanced' ? 'selected' : ''}>高级实验</option>
                            <option value="project" ${exp.category === 'project' ? 'selected' : ''}>项目实验</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="expDifficulty">难度等级</label>
                        <select id="expDifficulty" name="difficulty_level">
                            <option value="easy" ${exp.difficulty_level === 'easy' ? 'selected' : ''}>简单</option>
                            <option value="medium" ${exp.difficulty_level === 'medium' ? 'selected' : ''}>中等</option>
                            <option value="hard" ${exp.difficulty_level === 'hard' ? 'selected' : ''}>困难</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="expDuration">预计时长(分钟)</label>
                        <input type="number" id="expDuration" name="estimated_duration" value="${exp.estimated_duration || 60}" min="15" max="240">
                    </div>
                </div>

                <div class="form-group">
                    <label for="sampleLength">采样深度(包数量)</label>
                    <input type="number" id="sampleLength" name="sample_length" value="${exp.sample_length || 32}" min="1" max="65536">
                </div>

                <div class="form-group">
                    <label>目标引脚配置</label>
                    <div class="pins-selector" id="editPinsSelector">
                        <div class="pins-category">
                            <span class="pins-category-title">LED</span>
                            <div class="pins-options">
                                ${['LED0','LED1','LED2','LED3','LED4','LED5','LED6','LED7','LED8','LED9','LED10','LED11','LED12','LED13','LED14','LED15'].map(led =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${led}" ${(exp.target_pins || []).includes(led) ? 'checked' : ''}> ${led}</label>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="pins-category">
                            <span class="pins-category-title">SW</span>
                            <div class="pins-options">
                                ${['SW0','SW1','SW2','SW3','SW4','SW5','SW6','SW7','SW8','SW9','SW10','SW11','SW12','SW13','SW14','SW15'].map(sw =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${sw}" ${(exp.target_pins || []).includes(sw) ? 'checked' : ''}> ${sw}</label>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="pins-category">
                            <span class="pins-category-title">BTN</span>
                            <div class="pins-options">
                                ${['BTN0','BTN1','BTN2','BTN3'].map(btn =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${btn}" ${(exp.target_pins || []).includes(btn) ? 'checked' : ''}> ${btn}</label>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="is_public" value="true" ${exp.is_public ? 'checked' : ''}>
                            <span>发布为公开实验</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" name="is_classic" value="true" ${exp.is_classic ? 'checked' : ''}>
                            <span>标记为经典实验</span>
                        </label>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">保存修改</button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalOverlay').style.display='none'">取消</button>
                </div>
            </form>
        `;

        modal.style.display = 'flex';

        body.querySelector('#editExperimentForm')?.addEventListener('submit', (e) => this.handleEditSubmit(e, experimentId));
    }

    async handleEditSubmit(e, experimentId) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        const experimentData = {
            experiment_name: formData.get('experiment_name'),
            description: formData.get('description'),
            category: formData.get('category'),
            difficulty_level: formData.get('difficulty_level'),
            estimated_duration: parseInt(formData.get('estimated_duration')),
            sample_length: parseInt(formData.get('sample_length')),
            is_public: formData.get('is_public') === 'true',
            is_classic: formData.get('is_classic') === 'true'
        };

        const selectedPins = [];
        form.querySelectorAll('input[name="target_pins"]:checked').forEach(cb => {
            selectedPins.push(cb.value);
        });
        experimentData.target_pins = selectedPins;

        if (selectedPins.length === 0) {
            alert('请至少选择一个目标引脚');
            return;
        }

        try {
            const result = await this.app.apiCall(`/experiments/${experimentId}`, {
                method: 'PUT',
                body: JSON.stringify(experimentData)
            });

            if (result.success) {
                alert('实验更新成功！');
                document.getElementById('modalOverlay').style.display = 'none';
                this.loadExperiments();
            } else {
                alert(`更新失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async deleteExperiment(experimentId) {
        if (!confirm('确定要删除这个实验吗？此操作不可恢复。')) {
            return;
        }

        try {
            const result = await this.app.apiCall(`/experiments/${experimentId}`, {
                method: 'DELETE'
            });

            if (result.success) {
                alert('实验删除成功！');
                this.loadExperiments();
            } else {
                alert(`删除失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    onShow() {
        this.loadExperiments();
    }
}

// =====================================================
// 班级学情管理模块
// =====================================================
class ClassManagerModule {
    constructor(app) {
        this.app = app;
        this.classes = [];
        
        this.init();
    }

    init() {
        const createBtn = document.getElementById('createClassBtn');
        createBtn?.addEventListener('click', () => this.showCreateModal());
    }

    async loadClasses() {
        const grid = document.getElementById('classesGrid');
        
        try {
            const result = await this.app.apiCall('/classes');
            
            if (!result.success) {
                grid.innerHTML = '<div class="class-error">加载失败</div>';
                return;
            }

            this.classes = result.data || [];

            if (this.classes.length === 0) {
                grid.innerHTML = `
                    <div class="class-empty">
                        <span class="empty-icon">👥</span>
                        <p>暂无班级</p>
                        <p class="empty-hint">点击上方按钮创建第一个班级</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = this.classes.map(cls => this.createClassCard(cls)).join('');

        } catch (error) {
            console.error('加载班级列表失败:', error);
            grid.innerHTML = '<div class="class-error">加载失败</div>';
        }
    }

    createClassCard(cls) {
        return `
            <div class="class-card" data-class-id="${cls.id || cls.class_id}">
                <div class="class-header">
                    <h3 class="class-name">${cls.name}</h3>
                    <span class="class-code">${cls.class_code}</span>
                </div>
                <div class="class-body">
                    <div class="class-stat">
                        <span class="class-stat-value">${cls.student_count || 0}</span>
                        <span class="class-stat-label">学生</span>
                    </div>
                    <div class="class-info">
                        <span>课程: ${cls.course_code || '-'}</span>
                        <span>学期: ${cls.semester || '-'}</span>
                    </div>
                </div>
                <div class="class-footer">
                    <button class="btn btn-small" onclick="window.teacherApp.modules.classes.showManageStudentsModal(${cls.id || cls.class_id}, '${cls.name}')">👥 管理学生</button>
                    <button class="btn btn-small btn-secondary" onclick="window.teacherApp.modules.classes.showEditModal(${cls.id || cls.class_id})">✏️ 编辑</button>
                </div>
            </div>
        `;
    }

    showEditModal(classId) {
        const cls = this.classes.find(c => (c.id || c.class_id) == classId);
        if (!cls) return;

        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = '编辑班级';
        body.innerHTML = `
            <form id="editClassForm" class="class-form">
                <div class="form-group">
                    <label>班级名称 <span class="required">*</span></label>
                    <input type="text" name="name" required value="${cls.name || ''}">
                </div>
                <div class="form-group">
                    <label>班级代码 <span class="required">*</span></label>
                    <input type="text" name="class_code" required value="${cls.class_code || ''}">
                </div>
                <div class="form-group">
                    <label>课程代码</label>
                    <input type="text" name="course_code" value="${cls.course_code || ''}">
                </div>
                <div class="form-group">
                    <label>学期</label>
                    <input type="text" name="semester" value="${cls.semester || ''}">
                </div>
                <div class="form-group">
                    <label>描述</label>
                    <textarea name="description" rows="3">${cls.description || ''}</textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">保存</button>
                    <button type="button" class="btn btn-danger" onclick="window.teacherApp.modules.classes.deleteClass(${classId})">删除班级</button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalOverlay').style.display='none'">取消</button>
                </div>
            </form>
        `;

        modal.style.display = 'flex';
        
        body.querySelector('form')?.addEventListener('submit', (e) => this.handleEditClass(e, classId));
    }

    async handleEditClass(e, classId) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        const classData = {
            name: formData.get('name'),
            class_code: formData.get('class_code'),
            course_code: formData.get('course_code'),
            semester: formData.get('semester'),
            description: formData.get('description')
        };

        try {
            const result = await this.app.apiCall(`/classes/${classId}`, {
                method: 'PUT',
                body: JSON.stringify(classData)
            });

            if (result.success) {
                alert('班级更新成功！');
                document.getElementById('modalOverlay').style.display = 'none';
                this.loadClasses();
            } else {
                alert(`更新失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async deleteClass(classId) {
        if (!confirm('确定要删除这个班级吗？此操作不可恢复。')) {
            return;
        }

        try {
            const result = await this.app.apiCall(`/classes/${classId}`, {
                method: 'DELETE'
            });

            if (result.success) {
                alert('班级删除成功！');
                this.loadClasses();
            } else {
                alert(`删除失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async showManageStudentsModal(classId, className) {
        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = `管理学生 - ${className}`;
        body.innerHTML = `
            <div class="student-management">
                <div class="add-student-form">
                    <h4>添加学生</h4>
                    <form id="addStudentForm" class="inline-form">
                        <input type="text" name="username" placeholder="学生用户名" required>
                        <button type="submit" class="btn btn-primary btn-small">添加</button>
                    </form>
                </div>
                <div class="student-list-container">
                    <div id="classStudentsList" class="students-loading">加载中...</div>
                </div>
            </div>
            <style>
                .student-management { padding: 10px 0; }
                .add-student-form { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
                .add-student-form h4 { margin: 0 0 10px 0; }
                .inline-form { display: flex; gap: 10px; align-items: center; }
                .inline-form input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
                .student-list-container { max-height: 400px; overflow-y: auto; }
                .student-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f0f0f0; }
                .student-item:hover { background: #f8f9fa; }
                .student-info { display: flex; flex-direction: column; }
                .student-name { font-weight: 500; }
                .student-username { font-size: 12px; color: #666; }
                .student-empty { text-align: center; padding: 40px; color: #999; }
                .btn-remove { color: #dc3545; background: none; border: none; cursor: pointer; padding: 5px 10px; }
                .btn-remove:hover { background: #fee; border-radius: 4px; }
            </style>
        `;

        modal.style.display = 'flex';
        
        body.querySelector('#addStudentForm')?.addEventListener('submit', (e) => this.handleAddStudent(e, classId));
        
        await this.loadClassStudents(classId);
    }

    async loadClassStudents(classId) {
        const list = document.getElementById('classStudentsList');
        if (!list) return;

        try {
            const result = await this.app.apiCall(`/classes/${classId}/students`);
            
            if (!result.success) {
                list.innerHTML = '<div class="student-empty">加载失败</div>';
                return;
            }

            const students = result.data || [];
            
            if (students.length === 0) {
                list.innerHTML = '<div class="student-empty">暂无学生，请添加</div>';
                return;
            }

            list.innerHTML = students.map(student => `
                <div class="student-item" data-student-id="${student.id || student.user_id}">
                    <div class="student-info">
                        <span class="student-name">${student.real_name || student.username || '学生'}</span>
                        <span class="student-username">${student.username || ''}</span>
                    </div>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-small btn-info" onclick="window.teacherApp.modules.classes.viewStudentSubmissions(${student.id || student.user_id}, '${student.real_name || student.username || '学生'}')">📊 查看提交</button>
                        <button class="btn-remove" onclick="window.teacherApp.modules.classes.removeStudent(${classId}, ${student.id || student.user_id})">移除</button>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('加载学生列表失败:', error);
            list.innerHTML = '<div class="student-empty">加载失败</div>';
        }
    }

    async handleAddStudent(e, classId) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const username = formData.get('username');

        try {
            const searchResult = await this.app.apiCall(`/users/search?query=${encodeURIComponent(username)}&role=student`);

            if (!searchResult.success || !searchResult.users || searchResult.users.length === 0) {
                alert(`未找到用户名为 ${username} 的学生`);
                return;
            }

            const studentId = searchResult.users[0].id;

            const result = await this.app.apiCall(`/classes/${classId}/students`, {
                method: 'POST',
                body: JSON.stringify({ studentId: studentId })
            });

            if (result.success) {
                alert('学生添加成功！');
                form.reset();
                await this.loadClassStudents(classId);
                this.loadClasses();
            } else {
                alert(`添加失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async removeStudent(classId, studentId) {
        if (!confirm('确定要移除这个学生吗？')) {
            return;
        }

        try {
            const result = await this.app.apiCall(`/classes/${classId}/students/${studentId}`, {
                method: 'DELETE'
            });

            if (result.success) {
                await this.loadClassStudents(classId);
                this.loadClasses();
            } else {
                alert(`移除失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    async viewStudentSubmissions(studentId, studentName) {
        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = `学生提交记录 - ${studentName}`;
        body.innerHTML = `
            <div id="submissionListContainer">
                <div class="submissions-loading">加载中...</div>
            </div>
        `;

        modal.style.display = 'flex';

        try {
            const result = await this.app.apiCall(`/experiments/submissions?student_id=${studentId}&time_range=all`);

            const container = document.getElementById('submissionListContainer');

            if (!result.success || !result.submissions || result.submissions.length === 0) {
                container.innerHTML = '<div class="student-empty">暂无提交记录</div>';
                return;
            }

            container.innerHTML = result.submissions.map(sub => `
                <div class="student-item">
                    <div class="student-info">
                        <span class="student-name">${sub.experiment_name || '实验' + sub.experiment_id}</span>
                        <span class="student-username">
                            状态: ${sub.status} | 
                            开始: ${sub.started_at ? new Date(sub.started_at).toLocaleString() : '-'}
                        </span>
                    </div>
                    <button class="btn btn-small btn-info" onclick="window.teacherApp.modules.classes.viewSubmissionWaveform(${sub.id})">📈 查看波形</button>
                </div>
            `).join('');
        } catch (error) {
            console.error('加载提交记录失败:', error);
            container.innerHTML = '<div class="student-empty">加载失败</div>';
        }
    }

    async viewSubmissionWaveform(submissionId) {
        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = `波形详情 - 提交 #${submissionId}`;
        body.innerHTML = `
            <div id="waveformViewerContainer">
                <div class="submissions-loading">加载波形数据...</div>
            </div>
        `;

        modal.style.display = 'flex';

        try {
            const result = await this.app.apiCall(`/experiments/submissions/${submissionId}`);

            const container = document.getElementById('waveformViewerContainer');

            if (!result.success || !result.data || result.data.length === 0) {
                container.innerHTML = '<div class="student-empty">暂无波形数据</div>';
                return;
            }

            const waveforms = result.data[0].waveforms;
            const pinMapping = result.pin_mapping || [];

            if (!waveforms || !Array.isArray(waveforms) || waveforms.length === 0) {
                container.innerHTML = '<div class="student-empty">波形数据格式错误</div>';
                return;
            }

            container.innerHTML = `
                <div style="margin-bottom:15px;">
                    <strong>通道数:</strong> ${waveforms.length} | 
                    <strong>采样点数:</strong> ${waveforms[0]?.length || 0}
                </div>
                <div style="background:#1a1a2e;border-radius:6px;padding:8px;overflow-y:auto;max-height:400px;">
                    <canvas id="replayWaveformCanvas" style="width:100%;min-height:300px;"></canvas>
                </div>
            `;

            const visualizer = new ObserveVisualizer('replayWaveformCanvas');
            visualizer.appendWaveform(waveforms, pinMapping);

        } catch (error) {
            console.error('加载波形失败:', error);
            container.innerHTML = '<div class="student-empty">加载失败</div>';
        }
    }

    showCreateModal() {
        const modal = document.getElementById('modalOverlay');
        const title = document.getElementById('modalTitle');
        const body = document.getElementById('modalBody');

        title.textContent = '创建班级';
        body.innerHTML = `
            <form id="createClassForm" class="class-form">
                <div class="form-group">
                    <label>班级名称 <span class="required">*</span></label>
                    <input type="text" name="name" required placeholder="例如: FPGA基础实验班">
                </div>
                <div class="form-group">
                    <label>班级代码 <span class="required">*</span></label>
                    <input type="text" name="class_code" required placeholder="例如: EE101">
                </div>
                <div class="form-group">
                    <label>课程代码</label>
                    <input type="text" name="course_code" placeholder="例如: EE101">
                </div>
                <div class="form-group">
                    <label>学期</label>
                    <input type="text" name="semester" placeholder="例如: 2024-1">
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">创建</button>
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalOverlay').style.display='none'">取消</button>
                </div>
            </form>
        `;

        modal.style.display = 'flex';
        
        body.querySelector('form')?.addEventListener('submit', (e) => this.handleCreateClass(e));
    }

    async handleCreateClass(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        const classData = {
            name: formData.get('name'),
            class_code: formData.get('class_code'),
            course_code: formData.get('course_code'),
            semester: formData.get('semester')
        };

        try {
            const result = await this.app.apiCall('/classes', {
                method: 'POST',
                body: JSON.stringify(classData)
            });

            if (result.success) {
                alert('班级创建成功！');
                document.getElementById('modalOverlay').style.display = 'none';
                this.loadClasses();
            } else {
                alert(`创建失败: ${result.error}`);
            }
        } catch (error) {
            alert(`错误: ${error.message}`);
        }
    }

    onShow() {
        this.loadClasses();
    }
}

// =====================================================
// 启动应用
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    window.teacherApp = new TeacherApp();
});
