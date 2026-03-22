// 学生页面功能 - 简化版：直接接收WebSocket数据并显示

// 动态生成虚拟面板部件
function initVirtualPanel() {
    // 生成 32 个 LED: led1 到 led32
    const ledContainer = document.getElementById('led-container');
    if (ledContainer) {
        let ledHtml = '';
        for (let i = 1; i <= 32; i++) {
            ledHtml += `<div class="led off" id="led${i}" data-index="${i - 1}"><span class="led-index">${i}</span></div>`;
        }
        ledContainer.innerHTML = ledHtml;
    }

    // 生成 32 个拨码开关: sw1 到 sw32
    const switchContainer = document.getElementById('switch-container');
    if (switchContainer) {
        let switchHtml = '';
        for (let i = 1; i <= 32; i++) {
            switchHtml += `<div class="switch off" id="sw${i}" data-index="${i - 1}"><span class="switch-label">${i}</span></div>`;
        }
        switchContainer.innerHTML = switchHtml;
    }

    // 生成 16 个数码管: digit1 到 digit16 (每个包含 a-g 7个段落)
    const digitContainer = document.getElementById('digit-container');
    if (digitContainer) {
        let digitHtml = '';
        for (let i = 1; i <= 16; i++) {
            digitHtml += `<div class="digit" id="digit${i}" data-index="${i - 1}"><span class="digit-value">0</span>`;
            digitHtml += `<div class="segment segment-a"></div>`;
            digitHtml += `<div class="segment segment-b"></div>`;
            digitHtml += `<div class="segment segment-c"></div>`;
            digitHtml += `<div class="segment segment-d"></div>`;
            digitHtml += `<div class="segment segment-e"></div>`;
            digitHtml += `<div class="segment segment-f"></div>`;
            digitHtml += `<div class="segment segment-g"></div>`;
            digitHtml += `<div class="segment segment-dp"></div>`;
            digitHtml += `</div>`;
        }
        digitContainer.innerHTML = digitHtml;
    }

    // 生成 4 个独立按键: btn0 到 btn3
    const btnContainer = document.getElementById('btn-container');
    if (btnContainer) {
        let btnHtml = '';
        for (let i = 0; i <= 3; i++) {
            btnHtml += `<div class="btn-indep off" id="btn${i}">${i}</div>`;
        }
        btnContainer.innerHTML = btnHtml;
    }

    // 生成 4x4 矩阵按键: matrix_0_0 到 matrix_3_3
    const matrixContainer = document.getElementById('matrix-container');
    if (matrixContainer) {
        let matrixHtml = '<div class="f-matrix-grid">';
        matrixHtml += '<div class="matrix-label"></div>';
        matrixHtml += '<div class="matrix-label">0</div>';
        matrixHtml += '<div class="matrix-label">1</div>';
        matrixHtml += '<div class="matrix-label">2</div>';
        matrixHtml += '<div class="matrix-label">3</div>';

        for (let row = 0; row < 4; row++) {
            matrixHtml += `<div class="matrix-label">${row}</div>`;
            for (let col = 0; col < 4; col++) {
                matrixHtml += `<div class="matrix-cell off" id="matrix_${row}_${col}"></div>`;
            }
        }
        matrixHtml += '</div>';
        matrixContainer.innerHTML = matrixHtml;
    }

    // 生成 1 个蜂鸣器: buzzer100
    const buzzerContainer = document.getElementById('buzzer-container');
    if (buzzerContainer) {
        buzzerContainer.innerHTML = '<div class="buzzer-icon off" id="buzzer100">🔊</div>';
    }

    // 生成 2 个 A7 独立按键: a7btn101 和 a7btn102
    const a7btnContainer = document.getElementById('a7btn-container');
    if (a7btnContainer) {
        let a7btnHtml = '';
        for (let i = 101; i <= 102; i++) {
            a7btnHtml += `<div class="btn-indep off" id="a7btn${i}">A7-${i}</div>`;
        }
        a7btnContainer.innerHTML = a7btnHtml;
    }

    console.log('虚拟面板初始化完成');
}

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

class StudentDashboard {
    constructor() {
        this.waveformVisualizer = new WaveformVisualizer('waveformCanvas');
        this.socket = null;
        this.connected = false;
        this.isCapturing = false;
        this.isRecording = false;
        this.recordBuffer = null;
        this.recordPinMapping = null;
        this.boundDeviceId = null;
        this.selectedExperiment = null;
        this.activeCapturePins = null;
        this.experiments = [];

        this.initUI();
        this.initPanels();
        this.bindControlButtons();
        this.initCustomCaptureModal();
    }

    initUI() {
        document.getElementById('userName').textContent = 'FPGA演示';
        this.updateConnectionStatus('disconnected');
        this.updateButtonStates();
        
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.disconnect();
        });
    }

    bindControlButtons() {
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('startCaptureBtn').addEventListener('click', () => this.startCapture());
        document.getElementById('customCaptureBtn').addEventListener('click', () => this.openCustomCaptureModal());
        document.getElementById('pauseCaptureBtn').addEventListener('click', () => this.pauseCapture());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());

        document.getElementById('experimentSelect').addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            if (selectedValue === '') {
                this.selectedExperiment = null;
            } else {
                this.selectedExperiment = this.experiments.find(exp => exp.id == selectedValue);
            }
        });

        document.getElementById('startRecordBtn')?.addEventListener('click', () => this.toggleRecord());
        document.getElementById('submitWaveformBtn')?.addEventListener('click', () => this.submitWaveform());
    }

    async loadExperiments() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.warn('No token found, cannot load experiments');
            return;
        }

        try {
            const response = await fetch('/api/experiments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success && result.experiments) {
                this.experiments = result.experiments;
                const select = document.getElementById('experimentSelect');
                result.experiments.forEach(exp => {
                    const option = document.createElement('option');
                    option.value = exp.id;
                    option.textContent = `${exp.experiment_code} - ${exp.experiment_name}`;
                    select.appendChild(option);
                });
                select.disabled = false;
            }
        } catch (error) {
            console.warn('加载实验列表失败:', error);
        }
    }

    updateButtonStates() {
        const connectBtn = document.getElementById('connectBtn');
        const startCaptureBtn = document.getElementById('startCaptureBtn');
        const customCaptureBtn = document.getElementById('customCaptureBtn');
        const pauseCaptureBtn = document.getElementById('pauseCaptureBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');

        connectBtn.disabled = this.connected;
        startCaptureBtn.disabled = !this.connected || this.isCapturing;
        customCaptureBtn.disabled = !this.connected || this.isCapturing;
        pauseCaptureBtn.disabled = !this.isCapturing;
        disconnectBtn.disabled = !this.connected && !this.isCapturing;

        const startRecordBtn = document.getElementById('startRecordBtn');
        if (startRecordBtn) {
            startRecordBtn.disabled = !this.isCapturing;
        }
    }

    initPanels() {
        const ledPanel = document.getElementById('led-container');
        ledPanel.innerHTML = '';
        for (let i = 1; i <= 32; i++) {
            const led = document.createElement('div');
            led.className = 'led off';
            led.id = `led${i}`;
            led.dataset.index = i - 1;
            ledPanel.appendChild(led);
        }
        
        const switchPanel = document.getElementById('switch-container');
        switchPanel.innerHTML = '';
        for (let i = 1; i <= 32; i++) {
            const switchEl = document.createElement('div');
            switchEl.className = 'switch off';
            switchEl.id = `sw${i}`;
            switchEl.dataset.index = i - 1;
            const label = document.createElement('span');
            label.className = 'switch-label';
            label.textContent = `${i}`;
            switchEl.appendChild(label);
            switchPanel.appendChild(switchEl);
        }
        
        const digitPanel = document.getElementById('digit-container');
        digitPanel.innerHTML = '';
        const digitSegments = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
        for (let i = 1; i <= 16; i++) {
            const digit = document.createElement('div');
            digit.className = 'digit';
            digit.id = `digit${i}`;
            digit.dataset.index = i - 1;
            digitSegments.forEach(segment => {
                const seg = document.createElement('div');
                seg.className = `segment segment-${segment}`;
                digit.appendChild(seg);
            });
            digitPanel.appendChild(digit);
        }
        
        const btnPanel = document.getElementById('btn-container');
        if (btnPanel) {
            btnPanel.innerHTML = '';
            for (let i = 0; i <= 3; i++) {
                const btnEl = document.createElement('div');
                btnEl.className = 'btn-indep off';
                btnEl.id = `btn${i}`;
                btnEl.textContent = `${i}`;
                btnPanel.appendChild(btnEl);
            }
        }
        
        const matrixPanel = document.getElementById('matrix-container');
        if (matrixPanel) {
            matrixPanel.innerHTML = '';
            const grid = document.createElement('div');
            grid.className = 'f-matrix-grid';
            grid.innerHTML = '<div class="matrix-label"></div><div class="matrix-label">0</div><div class="matrix-label">1</div><div class="matrix-label">2</div><div class="matrix-label">3</div>';
            for (let row = 0; row < 4; row++) {
                const rowLabel = document.createElement('div');
                rowLabel.className = 'matrix-label';
                rowLabel.textContent = `${row}`;
                grid.appendChild(rowLabel);
                for (let col = 0; col < 4; col++) {
                    const cell = document.createElement('div');
                    cell.className = 'matrix-cell off';
                    cell.id = `matrix_${row}_${col}`;
                    grid.appendChild(cell);
                }
            }
            matrixPanel.appendChild(grid);
        }
        
        const buzzerPanel = document.getElementById('buzzer-container');
        if (buzzerPanel) {
            buzzerPanel.innerHTML = '';
            const buzzer = document.createElement('div');
            buzzer.className = 'buzzer-icon off';
            buzzer.id = 'buzzer100';
            buzzer.textContent = '🔊';
            buzzerPanel.appendChild(buzzer);
        }

        const a7btnPanel = document.getElementById('a7btn-container');
        if (a7btnPanel) {
            a7btnPanel.innerHTML = '';
            for (let i = 101; i <= 102; i++) {
                const btnEl = document.createElement('div');
                btnEl.className = 'btn-indep off';
                btnEl.id = `a7btn${i}`;
                btnEl.textContent = `A7-${i}`;
                a7btnPanel.appendChild(btnEl);
            }
        }
    }

    initCustomCaptureModal() {
        const keypadContainer = document.getElementById('keypadChannels');
        const ledContainer = document.getElementById('ledChannels');
        const switchContainer = document.getElementById('switchChannels');
        const digitContainer = document.getElementById('digitChannels');

        const btn0 = document.createElement('label');
        btn0.className = 'channel-label';
        btn0.innerHTML = '<input type="checkbox" value="BTN0"> BTN0';
        keypadContainer.appendChild(btn0);

        for (let i = 0; i < 16; i++) {
            const led = document.createElement('label');
            led.className = 'channel-label';
            led.innerHTML = `<input type="checkbox" value="LED${i}"> LED${i}`;
            ledContainer.appendChild(led);
        }

        for (let i = 0; i < 16; i++) {
            const sw = document.createElement('label');
            sw.className = 'channel-label';
            sw.innerHTML = `<input type="checkbox" value="SW${i}"> SW${i}`;
            switchContainer.appendChild(sw);
        }

        const digitSegments = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'];
        for (let i = 0; i < 8; i++) {
            digitSegments.forEach(seg => {
                const digit = document.createElement('label');
                digit.className = 'channel-label';
                digit.innerHTML = `<input type="checkbox" value="DIGIT_${i}_${seg}"> DIGIT_${i}_${seg}`;
                digitContainer.appendChild(digit);
            });
        }
        
        const btnPanelContainer = document.getElementById('btnChannels');
        if (btnPanelContainer) {
            for (let i = 0; i < 4; i++) {
                const btn = document.createElement('label');
                btn.className = 'channel-label';
                btn.innerHTML = `<input type="checkbox" value="BTN${i}"> BTN${i}`;
                btnPanelContainer.appendChild(btn);
            }
            for (let i = 0; i < 2; i++) {
                const btn = document.createElement('label');
                btn.className = 'channel-label';
                btn.innerHTML = `<input type="checkbox" value="A7_BTN${i}"> A7_BTN${i}`;
                btnPanelContainer.appendChild(btn);
            }
        }
        
        const matrixContainer = document.getElementById('matrixChannels');
        if (matrixContainer) {
            for (let row = 0; row < 4; row++) {
                const rowLabel = document.createElement('label');
                rowLabel.className = 'channel-label';
                rowLabel.innerHTML = `<input type="checkbox" value="ROW${row}"> ROW${row}`;
                matrixContainer.appendChild(rowLabel);
            }
            for (let col = 0; col < 4; col++) {
                const colLabel = document.createElement('label');
                colLabel.className = 'channel-label';
                colLabel.innerHTML = `<input type="checkbox" value="COL${col}"> COL${col}`;
                matrixContainer.appendChild(colLabel);
            }
        }
        
        const buzzerContainer = document.getElementById('buzzerChannels');
        if (buzzerContainer) {
            const buzzer = document.createElement('label');
            buzzer.className = 'channel-label';
            buzzer.innerHTML = '<input type="checkbox" value="BUZZER"> BUZZER';
            buzzerContainer.appendChild(buzzer);
        }

        const allCheckboxes = document.querySelectorAll('#customCaptureModal input[type="checkbox"]');
        allCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => this.handleCheckboxChange());
        });

        document.getElementById('cancelCaptureBtn').addEventListener('click', () => this.closeCustomCaptureModal());
        document.getElementById('confirmCaptureBtn').addEventListener('click', () => this.confirmCustomCapture());
    }

    handleCheckboxChange() {
        const allCheckboxes = document.querySelectorAll('#customCaptureModal input[type="checkbox"]');
        const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;

        document.getElementById('selectedCount').textContent = checkedCount;

        allCheckboxes.forEach(cb => {
            if (checkedCount >= 64 && !cb.checked) {
                cb.disabled = true;
                cb.parentElement.classList.add('disabled');
            } else {
                cb.disabled = false;
                cb.parentElement.classList.remove('disabled');
            }
        });
    }

    openCustomCaptureModal() {
        const modal = document.getElementById('customCaptureModal');
        modal.classList.add('show');

        const allCheckboxes = document.querySelectorAll('#customCaptureModal input[type="checkbox"]');
        allCheckboxes.forEach(cb => {
            cb.checked = false;
            cb.disabled = false;
        });
        document.getElementById('selectedCount').textContent = '0';
    }

    closeCustomCaptureModal() {
        const modal = document.getElementById('customCaptureModal');
        modal.classList.remove('show');
    }

    confirmCustomCapture() {
        const allCheckboxes = document.querySelectorAll('#customCaptureModal input[type="checkbox"]');
        const selectedPins = Array.from(allCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (selectedPins.length === 0) {
            alert('请至少选择一个采集通道');
            return;
        }

        this.closeCustomCaptureModal();
        this.startCustomCapture(selectedPins);
    }

    startCustomCapture(pins) {
        if (!this.socket || !this.connected) return;

        console.log('发送自定义采集指令, pins:', pins);

        this.activeCapturePins = pins;
        this.applyPanelFilter(pins);

        this.socket.emit('start_capture', {
            deviceId: this.boundDeviceId || 'demo_device',
            requestedPins: pins
        });

        this.isCapturing = true;
        this.updateButtonStates();
        this.updateConnectionStatus('capturing');

        console.log('发送 start_capture (自定义) 指令');
    }

    updateConnectionStatus(status) {
        const dot = document.getElementById('wsDot');
        const text = document.getElementById('wsStatus');
        
        if (dot) {
            dot.className = 'ws-dot ' + status;
        }
        
        const statusTexts = {
            'connected': '已连接 - 等待绑定设备...',
            'device-bound': '已绑定设备 - 可以开始采集',
            'capturing': '采集中...',
            'connecting': '连接中...',
            'disconnected': '未连接'
        };
        
        if (text) {
            text.textContent = statusTexts[status] || status;
        }
    }

    connect() {
        this.updateConnectionStatus('connecting');
        
        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.socket = io(wsUrl, {
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.updateConnectionStatus('connected');
            this.updateButtonStates();
            
            this.socket.emit('bind_device', { deviceId: 'demo_device' });
            console.log('发送 bind_device 事件');
            this.loadExperiments();
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.handleDisconnect();
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.updateConnectionStatus('disconnected');
            this.updateButtonStates();
        });

        this.socket.on('device-bound', (data) => {
            console.log('Device bound:', data);
            this.boundDeviceId = data.deviceId;
            this.updateConnectionStatus('device-bound');
            this.updateButtonStates();
        });

        this.socket.on('capture-started', (data) => {
            console.log('Capture started:', data);
            this.isCapturing = true;
            this.updateButtonStates();
        });

        this.socket.on('capture-stopped', (data) => {
            console.log('Capture stopped:', data);
            this.isCapturing = false;
            this.updateButtonStates();
        });

        this.socket.on('device-update', (data) => {
            console.log('Received device-update:', data.deviceId, data.type, data);
            
            if (!this.isCapturing) {
                console.log('跳过数据: 未在采集状态');
                return;
            }
            
            if (data.type === 'waveform_update' && data.waveforms) {
                console.log('波形数据:', JSON.stringify(data.waveforms));
                console.log('引脚映射:', data.pinMapping);
                this.handleWaveformData(data);
            }
        });
    }

    startCapture() {
        if (!this.socket || !this.connected) return;

        let requestedPins;
        let experimentId = 0;

        if (this.selectedExperiment) {
            requestedPins = this.selectedExperiment.target_pins || [];
            experimentId = this.selectedExperiment.id;
        } else {
            requestedPins = ['BTN0'];
            for (let i = 0; i <= 15; i++) {
                requestedPins.push(`LED${i}`);
            }
            for (let i = 0; i <= 15; i++) {
                requestedPins.push(`SW${i}`);
            }
            const digitSegments = ['DIGIT_A', 'DIGIT_B', 'DIGIT_C', 'DIGIT_D', 'DIGIT_E', 'DIGIT_F', 'DIGIT_G'];
            requestedPins.push(...digitSegments);
            for (let i = 0; i <= 7; i++) {
                requestedPins.push(`DIG${i}`);
            }
        }

        this.activeCapturePins = requestedPins;
        this.applyPanelFilter(requestedPins);

        this.socket.emit('start_capture', {
            deviceId: this.boundDeviceId || 'demo_device',
            requestedPins: requestedPins,
            experimentId: experimentId
        });

        this.isCapturing = true;
        this.updateButtonStates();
        this.updateConnectionStatus('capturing');

        console.log('发送 start_capture 指令');
    }

    pauseCapture() {
        if (!this.socket || !this.connected) return;

        this.socket.emit('stop_capture', {
            deviceId: this.boundDeviceId || 'demo_device'
        });

        console.log('发送 stop_capture 指令');
        this.isCapturing = false;
        this.activeCapturePins = null;
        this.applyPanelFilter(null);
        this.updateButtonStates();
    }

    toggleRecord() {
        if (!this.isRecording) {
            this.isRecording = true;
            this.recordBuffer = this.waveformVisualizer.historyWaveforms.map(ch => [...(ch || [])]);
            this.recordPinMapping = this.waveformVisualizer._lastPinMapping ?
                [...this.waveformVisualizer._lastPinMapping] : [...(this.activeCapturePins || [])];

            const btn = document.getElementById('startRecordBtn');
            btn.textContent = '⏹ 停止记录';
            btn.classList.remove('btn-warning');
            btn.classList.add('btn-danger');

            document.getElementById('submitWaveformBtn').hidden = true;
            console.log('[Record] 开始录制，初始通道数:', this.recordBuffer.length);
        } else {
            this.isRecording = false;
            const currentWaveforms = this.waveformVisualizer.historyWaveforms;
            const newWaveforms = currentWaveforms.map((ch, i) => {
                const startLen = this.recordBuffer[i]?.length || 0;
                return (ch || []).slice(startLen);
            });

            this.recordBuffer = newWaveforms;
            const btn = document.getElementById('startRecordBtn');
            btn.textContent = '⏺ 开始记录';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-warning');

            const totalSamples = this.recordBuffer[0]?.length || 0;
            document.getElementById('submitWaveformBtn').hidden = false;
            console.log('[Record] 停止录制，采集样本数:', totalSamples);
            if (totalSamples === 0) {
                alert('录制时间太短，未采集到有效数据');
                document.getElementById('submitWaveformBtn').hidden = true;
            }
        }
    }

    async submitWaveform() {
        if (!this.recordBuffer || this.recordBuffer.length === 0) {
            alert('没有可提交的波形数据，请先录制');
            return;
        }
        const totalSamples = this.recordBuffer[0]?.length || 0;
        if (totalSamples === 0) {
            alert('波形数据为空，请重新录制');
            return;
        }
        if (!confirm(`确认提交波形数据？\n通道数：${this.recordBuffer.length}\n采样点数：${totalSamples}`)) return;

        const token = localStorage.getItem('token');
        const submitBtn = document.getElementById('submitWaveformBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';

        try {
            const payload = {
                device_id: this.boundDeviceId || 'demo_device',
                experiment_id: this.selectedExperiment?.id || null,
                class_id: null,
                pin_mapping: this.recordPinMapping || this.activeCapturePins || [],
                waveforms: this.recordBuffer
            };
            const response = await fetch('/api/experiments/submissions/create-with-waveform', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.success) {
                alert(`✅ 波形提交成功！\n提交ID: ${result.data.submission_id}`);
                this.recordBuffer = null;
                this.recordPinMapping = null;
                submitBtn.hidden = true;
                document.getElementById('startRecordBtn').textContent = '⏺ 开始记录';
                document.getElementById('startRecordBtn').classList.remove('btn-danger');
                document.getElementById('startRecordBtn').classList.add('btn-warning');
            } else {
                alert('提交失败：' + result.error);
            }
        } catch (error) {
            console.error('提交波形失败:', error);
            alert('提交失败，请检查网络连接');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '📤 提交波形';
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.emit('unbind_device', { deviceId: this.boundDeviceId });
            this.socket.disconnect();
        }
        this.handleDisconnect();
    }

    handleDisconnect() {
        this.connected = false;
        this.isCapturing = false;
        this.boundDeviceId = null;
        this.updateConnectionStatus('disconnected');
        this.updateButtonStates();
        this.clearWaveform();
    }

    clearWaveform() {
        this.waveformVisualizer.draw([], null);
        const ledPanel = document.getElementById('led-container');
        const switchPanel = document.getElementById('switch-container');
        
        ledPanel?.querySelectorAll('.led').forEach(led => {
            led.classList.remove('on');
            led.classList.add('off');
        });
        
        switchPanel?.querySelectorAll('.switch').forEach(sw => {
            sw.classList.remove('on');
            sw.classList.add('off');
        });
        
        const digitPanel = document.getElementById('digit-container');
        digitPanel?.querySelectorAll('.segment').forEach(seg => {
            seg.classList.remove('on');
            seg.classList.add('off');
        });
        
        const btnPanel = document.getElementById('btn-container');
        btnPanel?.querySelectorAll('.btn-indep').forEach(btn => {
            btn.classList.remove('on');
            btn.classList.add('off');
        });
        
        const matrixPanel = document.getElementById('matrix-container');
        matrixPanel?.querySelectorAll('.matrix-cell').forEach(cell => {
            cell.classList.remove('on');
            cell.classList.add('off');
        });
        
        const buzzerEl = document.getElementById('buzzer100');
        if (buzzerEl) {
            buzzerEl.classList.remove('on');
            buzzerEl.classList.add('off');
        }

        this.applyPanelFilter(null);
    }

    handleWaveformData(data) {
        try {
            const waveforms = data.waveforms;
            const pinMapping = data.pinMapping;
            
            if (waveforms && Array.isArray(waveforms)) {
                const isFirstData = this.waveformVisualizer.historyWaveforms.length === 0;
                
                if (isFirstData) {
                    this.applyPanelFilter(this.activeCapturePins);
                }
                
                if (pinMapping && Array.isArray(pinMapping)) {
                    this.updateWaveformFilters(pinMapping);
                }
                
                this.waveformVisualizer.appendWaveform(waveforms, pinMapping);
                this.mapWaveformsToUI(waveforms, pinMapping);
            }
            
            document.getElementById('wsStatus').textContent = 
                `已连接 - 接收数据: ${data.deviceId}`;
        } catch (err) {
            console.error('[ERROR] handleWaveformData 异常:', err.message);
        }
    }

    updateWaveformFilters(pinMapping) {
        const filterContainer = document.getElementById('waveform-filters');
        if (!filterContainer) return;
        
        if (filterContainer.dataset.initialized === 'true') return;
        
        filterContainer.innerHTML = '';
        const visibility = [];
        const activePins = this.activeCapturePins;
        
        pinMapping.forEach((pinName, index) => {
            let isActive = true;
            let isEnabled = true;
            
            if (activePins !== null) {
                isActive = activePins.includes(pinName);
                isEnabled = isActive;
            }
            
            const label = document.createElement('label');
            label.className = 'filter-label' + (isActive ? ' checked' : '');
            if (!isEnabled) {
                label.classList.add('disabled');
            }
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isActive;
            checkbox.disabled = !isEnabled;
            checkbox.dataset.index = index;
            
            visibility.push(isActive);
            
            checkbox.addEventListener('change', () => {
                const idx = parseInt(checkbox.dataset.index, 10);
                visibility[idx] = checkbox.checked;
                label.classList.toggle('checked', checkbox.checked);
                
                this.waveformVisualizer.setChannelVisibility(visibility);
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(pinName));
            filterContainer.appendChild(label);
        });
        
        this.waveformVisualizer.setChannelVisibility(visibility);
        filterContainer.dataset.initialized = 'true';
    }

    applyPanelFilter(activePins) {
        const sections = document.querySelectorAll('.f-section');
        
        if (activePins === null) {
            sections.forEach(section => {
                section.style.opacity = '1';
                section.style.pointerEvents = 'auto';
            });
            return;
        }
        
        const hasLED = activePins.some(pin => pin.startsWith('LED'));
        const hasSW = activePins.some(pin => pin.startsWith('SW'));
        const hasBTN = activePins.some(pin => pin.match(/^(BTN|KEY)/i));
        const hasDIGIT = activePins.some(pin => pin.match(/^(DIGIT|SEG|DIG)/i));
        const hasMATRIX = activePins.some(pin => pin.match(/^(ROW|COL)/i));
        const hasBUZZER = activePins.some(pin => pin.match(/^(BUZZER|BEEP)/i));
        const hasA7 = activePins.some(pin => pin.startsWith('A7_BTN'));
        
        sections.forEach(section => {
            const containerId = section.querySelector('[id$="-container"]')?.id || '';
            
            let shouldShow = false;
            if (containerId === 'led-container' && hasLED) shouldShow = true;
            else if (containerId === 'switch-container' && hasSW) shouldShow = true;
            else if (containerId === 'btn-container' && hasBTN) shouldShow = true;
            else if (containerId === 'digit-container' && hasDIGIT) shouldShow = true;
            else if (containerId === 'matrix-container' && hasMATRIX) shouldShow = true;
            else if (containerId === 'buzzer-container' && hasBUZZER) shouldShow = true;
            else if (containerId === 'a7btn-container' && hasA7) shouldShow = true;
            
            section.style.opacity = shouldShow ? '1' : '0.25';
            section.style.pointerEvents = shouldShow ? 'auto' : 'none';
        });
    }

    mapWaveformsToUI(waveforms, pinMapping) {
        if (!waveforms || !Array.isArray(waveforms)) {
            console.log('waveforms 不是数组:', waveforms);
            return;
        }

        if (!pinMapping || !Array.isArray(pinMapping)) {
            console.warn('%c⚠️ [UI Warning] pinMapping 未定义或不是数组，数据可能不同步!', 'color: yellow; font-weight: bold;');
            console.warn(' waveforms 长度:', waveforms.length, '| pinMapping:', pinMapping);
        } else if (pinMapping.length !== waveforms.length) {
            console.warn(`%c⚠️ [UI Warning] pinMapping 长度 (${pinMapping.length}) 与 waveforms 长度 (${waveforms.length}) 不匹配!`, 'color: yellow; font-weight: bold;');
        }

        console.log(`%c[UI Update] 共有 ${waveforms.length} 个通道数据`, 'color: cyan; font-weight: bold;');

        for (let index = 0; index < waveforms.length; index++) {
            const channelData = waveforms[index];
            if (!channelData || channelData.length === 0) continue;

            let pinInfo;
            if (pinMapping && Array.isArray(pinMapping)) {
                pinInfo = pinMapping[index];
            }
            
            let pinName;
            if (typeof pinInfo === 'string') {
                pinName = pinInfo;
            } else if (pinInfo && typeof pinInfo === 'object') {
                pinName = pinInfo.name || pinInfo.pin || pinInfo.pinName;
            }

            if (!pinName) {
                console.log(`通道 ${index} 没有引脚名称, pinInfo:`, pinInfo);
                continue;
            }

            const isOn = this.calculateInstantState(channelData);

            console.log(`%c  [${pinName}] isOn=${isOn}`, isOn ? 'color: #4CAF50;' : 'color: #F44336;');

            let elementFound = false;

            if (pinName === 'BTN0' || pinName === 'btn0') {
                const btnEl = document.getElementById('btn0');
                if (btnEl) {
                    btnEl.classList.toggle('on', isOn);
                    btnEl.classList.toggle('off', !isOn);
                    elementFound = true;
                } else {
                    console.warn(`%c  ⚠️ 未找到 id="btn0"`, 'color: orange;');
                }
            }
            else if (pinName.startsWith('LED')) {
                const ledIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                if (!isNaN(ledIndex)) {
                    const ledEl = document.querySelector(`.led[data-index="${ledIndex}"]`);
                    if (ledEl) {
                        ledEl.classList.toggle('on', isOn);
                        ledEl.classList.toggle('off', !isOn);
                        elementFound = true;
                    } else {
                        console.warn(`%c  ⚠️ 未找到 .led[data-index="${ledIndex}"]`, 'color: orange;');
                    }
                }
            }
            else if (pinName.startsWith('SW') || pinName.startsWith('switch')) {
                const swIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                if (!isNaN(swIndex)) {
                    const switchEl = document.querySelector(`.switch[data-index="${swIndex}"]`);
                    if (switchEl) {
                        switchEl.classList.toggle('on', isOn);
                        switchEl.classList.toggle('off', !isOn);
                        elementFound = true;
                    } else {
                        console.warn(`%c  ⚠️ 未找到 .switch[data-index="${swIndex}"]`, 'color: orange;');
                    }
                }
            }
            else if (pinName.startsWith('DIGIT_')) {
                const digitMatch = pinName.match(/^DIGIT_(\d+)_([A-Ga-g]|DPdp)$/);
                const simpleMatch = pinName.match(/^DIGIT_([A-Ga-g]|DPdp)$/);

                if (digitMatch) {
                    const digitIndex = parseInt(digitMatch[1], 10);
                    const segmentName = digitMatch[2].toLowerCase();

                    const digitEl = document.querySelector(`.digit[data-index="${digitIndex}"]`);
                    if (digitEl) {
                        const segmentEl = digitEl.querySelector(`.segment-${segmentName}`);
                        if (segmentEl) {
                            segmentEl.classList.toggle('on', isOn);
                            segmentEl.classList.toggle('off', !isOn);
                            elementFound = true;
                        } else {
                            console.warn(`%c  ⚠️ 未找到 .segment-${segmentName} in .digit[data-index="${digitIndex}"]`, 'color: orange;');
                        }
                    } else {
                        console.warn(`%c  ⚠️ 未找到 .digit[data-index="${digitIndex}"]`, 'color: orange;');
                    }
                } else if (simpleMatch) {
                    const segmentName = simpleMatch[1].toLowerCase();
                    document.querySelectorAll('.digit').forEach(digitEl => {
                        const segmentEl = digitEl.querySelector(`.segment-${segmentName}`);
                        if (segmentEl) {
                            segmentEl.classList.toggle('on', isOn);
                            segmentEl.classList.toggle('off', !isOn);
                            elementFound = true;
                        }
                    });
                } else {
                    console.warn(`%c  ⚠️ DIGIT 格式不匹配: ${pinName}`, 'color: orange;');
                }
            }
            else if (pinName.match(/^(BTN|KEY|btn|key)\d$/i)) {
                const btnIndex = parseInt(pinName.replace(/\D/g, ''), 10);
                if (!isNaN(btnIndex) && btnIndex >= 0 && btnIndex <= 3) {
                    const btnEl = document.getElementById(`btn${btnIndex}`);
                    if (btnEl) {
                        btnEl.classList.toggle('on', isOn);
                        btnEl.classList.toggle('off', !isOn);
                        elementFound = true;
                    } else {
                        console.warn(`%c  ⚠️ 未找到 id="btn${btnIndex}"`, 'color: orange;');
                    }
                }
            }
            else if (pinName.startsWith('A7_BTN')) {
                const a7Index = parseInt(pinName.substring(6), 10);
                if (!isNaN(a7Index)) {
                    const mappedId = a7Index === 0 ? 101 : (a7Index === 1 ? 102 : 101 + a7Index);
                    const btnEl = document.getElementById(`a7btn${mappedId}`);
                    if (btnEl) {
                        btnEl.classList.toggle('on', isOn);
                        btnEl.classList.toggle('off', !isOn);
                        elementFound = true;
                    } else {
                        console.warn(`%c  ⚠️ 未找到 id="a7btn${mappedId}"`, 'color: orange;');
                    }
                }
            }
            else if (pinName.startsWith('ROW')) {
                const rowIndex = parseInt(pinName.substring(3), 10);
                if (!isNaN(rowIndex)) {
                    for (let col = 0; col < 4; col++) {
                        const cellEl = document.getElementById(`matrix_${rowIndex}_${col}`);
                        if (cellEl) {
                            cellEl.classList.toggle('on', isOn);
                            cellEl.classList.toggle('off', !isOn);
                            elementFound = true;
                        }
                    }
                    if (!elementFound) {
                        console.warn(`%c  ⚠️ 未找到矩阵 ROW${rowIndex} 元素`, 'color: orange;');
                    }
                }
            }
            else if (pinName.startsWith('COL')) {
                const colIndex = parseInt(pinName.substring(3), 10);
                if (!isNaN(colIndex)) {
                    for (let row = 0; row < 4; row++) {
                        const cellEl = document.getElementById(`matrix_${row}_${colIndex}`);
                        if (cellEl) {
                            cellEl.classList.toggle('on', isOn);
                            cellEl.classList.toggle('off', !isOn);
                            elementFound = true;
                        }
                    }
                    if (!elementFound) {
                        console.warn(`%c  ⚠️ 未找到矩阵 COL${colIndex} 元素`, 'color: orange;');
                    }
                }
            }
            else if (pinName === 'BUZZER' || pinName === 'buzzer') {
                const buzzerEl = document.getElementById('buzzer100');
                if (buzzerEl) {
                    buzzerEl.classList.toggle('on', isOn);
                    buzzerEl.classList.toggle('off', !isOn);
                    elementFound = true;
                } else {
                    console.warn(`%c  ⚠️ 未找到 id="buzzer100"`, 'color: orange;');
                }
            }
            else {
                console.log(`%c  ⏭️ 未匹配 pinName: ${pinName}`, 'color: #999;');
            }
        }
        
        console.log('%c[UI Update] 完成', 'color: cyan;');
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
}

document.addEventListener('DOMContentLoaded', () => {
    initVirtualPanel();
    new StudentDashboard();
});
