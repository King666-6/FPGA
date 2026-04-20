// 动态获取API基础地址，而非硬编码localhost:3000
const API_BASE = window.location.origin + '/api';

// =====================================================
// 波形可视化类（移植自 student.js）
// =====================================================
class WaveformVisualizer {
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
        } else {
            const dpr = window.devicePixelRatio || 1;
            const { width, height } = this.canvas.getBoundingClientRect();
            this.ctx.clearRect(0, 0, width * dpr, height * dpr);
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
// 全局状态管理
// =====================================================
class TeacherApp {
    constructor() {
        this.currentModule = 'dashboard';
        this.socket = null;
        this.modules = {};
        this.user = null;
        this.teacherWaveform = null;
        this.currentWaveSource = 'live';

        this.init();
    }

    async init() {
        try {
            await this.checkAuth();
            this.initSocket();
            this.initModules();
            this.bindEvents();
            this.loadDashboardData();
            this.initGlobalDeviceUpdateListener();
        } catch (error) {
            console.error('初始化失败:', error);
            if (error.message === 'Unauthorized') {
                window.location.href = 'login.html';
            }
        }
    }

    async checkAuth() {
        const token = sessionStorage.getItem('token');
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
        // 修复Bug 2：动态获取WebSocket连接地址，而非硬编码localhost:3000
        const wsUrl = window.location.origin;
        
        this.socket = io(wsUrl);
        
        this.socket.on('connect', () => {
            console.log('WebSocket 已连接');
            this.updateConnectionStatus(true);
            
            // 认证
            const token = sessionStorage.getItem('token');
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

        // 监听分配结果
        this.socket.on('assign_result', (data) => {
            if (data.success) {
                console.log(`[WS] 设备分配结果: ${data.deviceId} -> ${data.userId}`);
                this.loadDeviceAssignments();
            }
        });

        // 监听 allocation_updated 事件，刷新设备分配 UI
        this.socket.on('allocation_updated', (data) => {
            console.log(`[WS] 收到 allocation_updated: deviceId=${data.deviceId}, action=${data.action}`);
            this.loadDeviceAssignments();
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

        this.teacherWaveform = new WaveformVisualizer('teacherWaveformCanvas');
    }

    updateTeacherWaveformFilters(pinMapping) {
        if (!pinMapping || pinMapping.length === 0) return;
        const filterContainer = document.getElementById('teacherWaveformFilters');
        if (!filterContainer) return;

        const lastMapping = filterContainer.dataset.lastMapping;
        const mappingStr = JSON.stringify(pinMapping);
        if (lastMapping === mappingStr) return;

        filterContainer.dataset.lastMapping = mappingStr;
        filterContainer.innerHTML = '';
        const visibility = [];

        pinMapping.forEach((pinName, index) => {
            const label = document.createElement('label');
            label.className = 'filter-label checked';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.dataset.index = index;

            visibility.push(true);

            checkbox.addEventListener('change', () => {
                const idx = parseInt(checkbox.dataset.index, 10);
                const currentVisibility = [...this.teacherWaveform.getChannelVisibility()];
                currentVisibility[idx] = checkbox.checked;
                label.classList.toggle('checked', checkbox.checked);
                this.teacherWaveform.setChannelVisibility(currentVisibility);
            });

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + pinName));
            filterContainer.appendChild(label);
        });

        this.teacherWaveform.setChannelVisibility(visibility);
    }

    addDeviceToWaveformSelect(deviceId) {
        const sel = document.getElementById('waveformDeviceSelect');
        if (!sel || sel.querySelector(`option[value="${deviceId}"]`)) return;
        const opt = document.createElement('option');
        opt.value = deviceId;
        opt.textContent = deviceId;
        sel.appendChild(opt);
    }

    removeDeviceFromWaveformSelect(deviceId) {
        const sel = document.getElementById('waveformDeviceSelect');
        sel?.querySelector(`option[value="${deviceId}"]`)?.remove();
    }

    initGlobalDeviceUpdateListener() {
        this.socket.on('device-update', (data) => {
            if (this.currentWaveSource === 'live' && data.waveforms) {
                const selectedDevice = document.getElementById('waveformDeviceSelect')?.value;
                if (selectedDevice && selectedDevice !== 'all' && selectedDevice !== data.deviceId) {
                    return;
                }

                if (this.teacherWaveform.canvas.width === 0) {
                    this.teacherWaveform.resizeCanvas();
                }
                this.updateTeacherWaveformFilters(data.pinMapping);
                this.teacherWaveform.appendWaveform(data.waveforms, data.pinMapping);
            }
        });
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
            sessionStorage.removeItem('token');
            window.location.href = 'login.html';
        });

        // 模态框关闭
        document.getElementById('modalClose')?.addEventListener('click', () => {
            document.getElementById('modalOverlay').style.display = 'none';
        });

        // 波形数据源切换（实时/历史）
        document.querySelectorAll('input[name="waveSource"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.currentWaveSource = e.target.value;
                const historyInputs = document.querySelectorAll('#replayWaveformFile');
                historyInputs.forEach(el => el.style.display =
                    this.currentWaveSource === 'history' ? 'inline-block' : 'none');

                const deviceSelect = document.getElementById('waveformDeviceSelect');
                const sourceControls = document.querySelector('.waveform-source-controls');
                let monitorLabel = null;
                if (sourceControls) {
                    sourceControls.querySelectorAll('label').forEach(l => {
                        if (l.textContent.includes('监控设备')) monitorLabel = l;
                    });
                }
                const clearBtn = document.getElementById('clearWaveformBtn');
                if (this.currentWaveSource === 'history') {
                    if (deviceSelect) deviceSelect.style.display = 'none';
                    if (monitorLabel) monitorLabel.style.display = 'none';
                    if (clearBtn) clearBtn.style.display = 'none';
                } else {
                    if (deviceSelect) deviceSelect.style.display = '';
                    if (monitorLabel) monitorLabel.style.display = '';
                    if (clearBtn) clearBtn.style.display = '';
                }

                this.teacherWaveform.resetView();
                this.teacherWaveform._lastPinMapping = null;
                this.teacherWaveform.channelVisibility = [];

                const filterContainer = document.getElementById('teacherWaveformFilters');
                if (filterContainer) {
                    filterContainer.dataset.lastMapping = '';
                    filterContainer.innerHTML = '';
                }
            });
        });

        document.getElementById('clearWaveformBtn')?.addEventListener('click', () => {
            this.teacherWaveform.resetView();
            const filterContainer = document.getElementById('teacherWaveformFilters');
            if (filterContainer) {
                filterContainer.innerHTML = '';
                filterContainer.dataset.lastMapping = '';
            }
        });

        document.getElementById('replayWaveformFile')?.addEventListener('change', (e) => {
            const fileInput = e.target;
            if (!fileInput?.files?.length) return;

            const file = fileInput.files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const exportData = JSON.parse(e.target.result);

                    if (!exportData.waveforms || !Array.isArray(exportData.waveforms)) {
                        alert('文件格式错误：缺少 waveforms 字段');
                        return;
                    }

                    const waveforms = exportData.waveforms;
                    const pinMapping = exportData.pin_mapping || [];

                    if (waveforms.length === 0) {
                        alert('文件中没有波形数据');
                        return;
                    }

                    this.teacherWaveform.resetView();
                    this.updateTeacherWaveformFilters(pinMapping);
                    this.teacherWaveform.appendWaveform(waveforms, pinMapping);

                    console.log(`[历史回放] 已加载: ${file.name} | ${waveforms.length}通道 | ${waveforms[0]?.length || 0}采样点`);

                } catch (parseError) {
                    console.error('解析波形文件失败:', parseError);
                    alert('文件解析失败，请确认是有效的波形 JSON 文件');
                }
            };

            reader.onerror = () => alert('文件读取失败');
            reader.readAsText(file);

            fileInput.value = '';
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

    async loadDeviceAssignments() {
        try {
            const response = await this.apiCall('/devices/online-assignments');
            if (!response.success) return;

            const { onlineDevices, assignments } = response.data;
            const tbody = document.getElementById('assignmentTableBody');
            if (!tbody) return;

            if (onlineDevices.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3">暂无在线设备</td></tr>';
                return;
            }

            const studentsRes = await this.apiCall('/users/search?role=student&limit=100');
            const students = studentsRes.users || [];

            tbody.innerHTML = onlineDevices.map(deviceId => {
                const assignedUserId = assignments[deviceId];
                const assignedStudent = students.find(s => s.id === assignedUserId);
                const assignedText = assignedStudent
                    ? `${assignedStudent.real_name || assignedStudent.username} (ID:${assignedUserId})`
                    : '<span style="color:#999;">未分配</span>';

                return `
                    <tr>
                        <td>${deviceId}</td>
                        <td>${assignedText}</td>
                        <td>
                            <select data-device-id="${deviceId}" class="assignment-select">
                                <option value="">-- 未分配 --</option>
                                ${students.map(s => `
                                    <option value="${s.id}" ${s.id === assignedUserId ? 'selected' : ''}>
                                        ${s.real_name || s.username} (ID:${s.id})
                                    </option>
                                `).join('')}
                            </select>
                            <button class="btn btn-small" onclick="window.teacherApp.assignDevice('${deviceId}', this.previousElementSibling.value)">分配</button>
                        </td>
                    </tr>
                `;
            }).join('');

            document.getElementById('refreshAssignmentBtn')?.addEventListener('click', () => {
                this.loadDeviceAssignments();
            });

        } catch (error) {
            console.error('加载设备分配信息失败:', error);
        }
    }

    async assignDevice(deviceId, userId) {
        userId = userId || null;
        if (this.socket) {
            this.socket.emit('assign_device_to_student', { deviceId, userId });
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
        return sessionStorage.getItem('token');
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
        this.app.loadDeviceAssignments();
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

        if (action === 'device_online') {
            this.devices.set(deviceId, {
                deviceId,
                status,
                lastSeen: data.timestamp,
                isCapturing: false
            });
            window.teacherApp.addDeviceToWaveformSelect(deviceId);
        } else if (action === 'device_offline') {
            window.teacherApp.removeDeviceFromWaveformSelect(deviceId);
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
    }

    createDeviceCard(device) {
        const statusClass = this.getStatusClass(device.status);
        const statusText = this.getStatusText(device.status);
        const captureStatus = device.isCapturing ? '🔴 采集中' : '';

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

    onShow() {
        if (this.app.teacherWaveform) {
            setTimeout(() => {
                this.app.teacherWaveform.resizeCanvas();
                this.app.teacherWaveform.redraw();
            }, 50);
        }
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
            sample_clock_source: formData.get('sample_clock_source') || '50Hz',
            trigger_condition: formData.get('trigger_condition') || '0x0000',
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
                        <span>📌 ${exp.packet_count || exp.sample_length || 32}包</span>
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
                    <div class="form-group">
                        <label for="expClock">采样时钟来源</label>
                        <select id="expClock" name="sample_clock_source">
                            <option value="50Hz" ${(exp.sample_clock || exp.sample_clock_source) === '50Hz' ? 'selected' : ''}>50Hz</option>
                            <option value="100Hz" ${(exp.sample_clock || exp.sample_clock_source) === '100Hz' ? 'selected' : ''}>100Hz</option>
                            <option value="1kHz" ${(exp.sample_clock || exp.sample_clock_source) === '1kHz' ? 'selected' : ''}>1kHz</option>
                            <option value="10kHz" ${(exp.sample_clock || exp.sample_clock_source) === '10kHz' ? 'selected' : ''}>10kHz</option>
                            <option value="100kHz" ${(exp.sample_clock || exp.sample_clock_source) === '100kHz' ? 'selected' : ''}>100kHz</option>
                            <option value="500kHz" ${(exp.sample_clock || exp.sample_clock_source) === '500kHz' ? 'selected' : ''}>500kHz</option>
                        </select>
                    </div>
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
                                ${['BTN0','BTN1','BTN2','BTN3','BTN4','BTN5'].map(btn =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${btn}" ${(exp.target_pins || []).includes(btn) ? 'checked' : ''}> ${btn}</label>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="pins-category">
                            <span class="pins-category-title">7段数码管段选</span>
                            <div class="pins-options">
                                ${['SEG_A','SEG_B','SEG_C','SEG_D','SEG_E','SEG_F','SEG_G'].map(seg =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${seg}" ${(exp.target_pins || []).includes(seg) ? 'checked' : ''}> ${seg}</label>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="pins-category">
                            <span class="pins-category-title">7段数码管位选</span>
                            <div class="pins-options">
                                ${['DIG0','DIG1','DIG2','DIG3','DIG4','DIG5','DIG6','DIG7'].map(dig =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${dig}" ${(exp.target_pins || []).includes(dig) ? 'checked' : ''}> ${dig}</label>`
                                ).join('')}
                            </div>
                        </div>
                        <div class="pins-category">
                            <span class="pins-category-title">蜂鸣器</span>
                            <div class="pins-options">
                                ${['BUZZER'].map(buzzer =>
                                    `<label class="pin-checkbox"><input type="checkbox" name="target_pins" value="${buzzer}" ${(exp.target_pins || []).includes(buzzer) ? 'checked' : ''}> ${buzzer}</label>`
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
            sample_clock_source: formData.get('sample_clock_source'),
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
                    <button class="btn btn-small btn-success" onclick="window.teacherApp.modules.classes.generateWaveformFile(${sub.id}, '${sub.started_at || ''}')">💾 生成文件</button>
                </div>
            `).join('');
        } catch (error) {
            console.error('加载提交记录失败:', error);
            container.innerHTML = '<div class="student-empty">加载失败</div>';
        }
    }

    async generateWaveformFile(submissionId, startedAt) {
        const btn = event.currentTarget;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '生成中...';

        try {
            const result = await this.app.apiCall(`/experiments/submissions/${submissionId}`);

            if (!result.success) {
                alert('获取波形数据失败：' + result.error);
                return;
            }

            const dataRecord = result.data?.[0];
            if (!dataRecord || !dataRecord.waveforms || dataRecord.waveforms.length === 0) {
                alert('该提交记录暂无波形数据');
                return;
            }

            const waveforms = dataRecord.waveforms;
            const pinMapping = (dataRecord.pin_mapping && dataRecord.pin_mapping.length > 0)
                ? dataRecord.pin_mapping
                : (result.pin_mapping || []);

            const exportData = {
                version: '1.0',
                submission_id: submissionId,
                started_at: startedAt,
                exported_at: new Date().toISOString(),
                channel_count: waveforms.length,
                sample_count: waveforms[0]?.length || 0,
                pin_mapping: pinMapping,
                waveforms: waveforms
            };

            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const fileName = `waveform_submission_${submissionId}_${dateStr}.json`;

            const jsonStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            btn.textContent = '✅ 已生成';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('生成波形文件失败:', error);
            alert('生成文件失败：' + error.message);
            btn.disabled = false;
            btn.textContent = originalText;
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
