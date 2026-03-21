-- =====================================================
-- FPGA 网络化实验教学系统 - 完整数据库建表脚本
-- 作者: 数据库架构设计
-- 版本: 2.0
-- =====================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS fpga_teaching_system DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE fpga_teaching_system;

-- =====================================================
-- 1. 用户表 (核心表)
-- =====================================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL COMMENT '用户名(登录账号)',
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt加密后的密码',
    role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student' COMMENT '用户角色',
    real_name VARCHAR(100) NOT NULL COMMENT '真实姓名',
    student_number VARCHAR(20) NULL COMMENT '学号(学生用)',
    email VARCHAR(100) NULL COMMENT '电子邮箱',
    phone VARCHAR(20) NULL COMMENT '联系电话',
    department VARCHAR(100) NULL COMMENT '院系/专业',
    avatar_url VARCHAR(255) NULL COMMENT '头像URL',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否激活',
    last_login_at TIMESTAMP NULL COMMENT '最后登录时间',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_username (username),
    UNIQUE KEY uk_student_number (student_number),
    UNIQUE KEY uk_email (email),
    INDEX idx_role (role),
    INDEX idx_real_name (real_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- =====================================================
-- 2. 班级表
-- =====================================================
CREATE TABLE classes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL COMMENT '班级名称',
    class_code VARCHAR(20) NOT NULL COMMENT '班级代码(唯一)',
    teacher_id INT NOT NULL COMMENT '班主任/授课教师ID',
    course_code VARCHAR(20) NULL COMMENT '课程代码',
    semester VARCHAR(20) NOT NULL COMMENT '学期(如: 2024-1)',
    description TEXT NULL COMMENT '班级描述',
    max_students INT NOT NULL DEFAULT 50 COMMENT '最大学生数',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_class_code (class_code),
    INDEX idx_teacher (teacher_id),
    INDEX idx_semester (semester),
    
    FOREIGN KEY (teacher_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='班级表';

-- =====================================================
-- 3. 学生-班级关联表 (多对多)
-- =====================================================
CREATE TABLE student_classes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL COMMENT '学生ID',
    class_id INT NOT NULL COMMENT '班级ID',
    enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '入班时间',
    status ENUM('enrolled', 'suspended', 'dropped', 'graduated') NOT NULL DEFAULT 'enrolled' COMMENT '状态',
    notes TEXT NULL COMMENT '备注',
    
    UNIQUE KEY uk_student_class (student_id, class_id),
    INDEX idx_student (student_id),
    INDEX idx_class (class_id),
    INDEX idx_status (status),
    
    FOREIGN KEY (student_id) REFERENCES users(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生班级关联表';

-- =====================================================
-- 4. 设备表 (核心表)
-- =====================================================
CREATE TABLE devices (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id VARCHAR(50) NOT NULL COMMENT '设备唯一标识(如MAC地址/序列号)',
    name VARCHAR(100) NOT NULL COMMENT '设备名称',
    device_type VARCHAR(50) NOT NULL DEFAULT 'FPGA_ARTIX7' COMMENT '设备型号',
    mac_address VARCHAR(20) NULL COMMENT 'MAC地址',
    ip_address VARCHAR(45) NULL COMMENT 'IP地址',
    firmware_version VARCHAR(20) NULL COMMENT '固件版本',
    hardware_version VARCHAR(20) NULL COMMENT '硬件版本',
    
    -- 资产信息
    asset_number VARCHAR(50) NULL COMMENT '资产编号',
    manufacturer VARCHAR(100) NULL COMMENT '制造商',
    purchase_date DATE NULL COMMENT '购置日期',
    warranty_expiry DATE NULL COMMENT '保修到期',
    
    -- 状态管理
    status ENUM('online', 'offline', 'maintenance', 'faulty', 'allocated') NOT NULL DEFAULT 'offline' COMMENT '设备状态',
    is_available BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否可用',
    
    -- 当前使用者
    current_user_id INT NULL COMMENT '当前使用者ID',
    allocated_at TIMESTAMP NULL COMMENT '分配时间',
    
    -- 统计信息
    total_usage_hours DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '总使用时长(小时)',
    power_on_count INT NOT NULL DEFAULT 0 COMMENT '上电次数',
    last_power_on_time TIMESTAMP NULL COMMENT '最近上电时间',
    last_seen_at TIMESTAMP NULL COMMENT '最后在线时间',
    
    -- 故障信息
    fault_count INT NOT NULL DEFAULT 0 COMMENT '故障次数',
    last_fault_time TIMESTAMP NULL COMMENT '最近故障时间',
    fault_description TEXT NULL COMMENT '故障描述',
    
    -- 其他
    location VARCHAR(100) NULL COMMENT '存放位置',
    notes TEXT NULL COMMENT '备注',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_device_id (device_id),
    UNIQUE KEY uk_mac_address (mac_address),
    INDEX idx_status (status),
    INDEX idx_current_user (current_user_id),
    
    FOREIGN KEY (current_user_id) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备表';

-- =====================================================
-- 5. 实验表 (核心表 - 包含FPGA硬件参数)
-- =====================================================
CREATE TABLE experiments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    experiment_code VARCHAR(20) NOT NULL COMMENT '实验代码(唯一)',
    experiment_name VARCHAR(200) NOT NULL COMMENT '实验名称',
    description TEXT NULL COMMENT '实验描述',
    instructions TEXT NULL COMMENT '实验指导书/步骤',
    
    -- 分类信息
    category ENUM('basic', 'advanced', 'project') NOT NULL DEFAULT 'basic' COMMENT '实验类别',
    difficulty_level ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'medium' COMMENT '难度等级',
    tags VARCHAR(255) NULL COMMENT '标签(逗号分隔)',
    
    -- 时间和权限
    estimated_duration INT NOT NULL DEFAULT 60 COMMENT '预计时长(分钟)',
    is_public BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否公开(其他教师可见)',
    is_classic BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否经典实验',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    
    -- 创建者
    teacher_id INT NOT NULL COMMENT '创建教师ID',
    
    -- =====================================================
    -- FPGA 硬件协议配置字段 (关键!)
    -- =====================================================
    sample_clock VARCHAR(10) NOT NULL DEFAULT 'external' COMMENT '采样时钟: external(外部引脚)/internal(内部时钟)',
    trigger_condition VARCHAR(50) NOT NULL DEFAULT '0x0000' COMMENT '触发条件: 0x0000=任意, 0x00XX=单引脚, 0xXXXX=多引脚按位或',
    packet_count INT NOT NULL DEFAULT 32 COMMENT '采集包数量: 1-65536',
    target_pins JSON NULL COMMENT '目标引脚列表: ["LED0","BTN1","SW2","DIGIT_0"]',
    pin_mapping_config JSON NULL COMMENT '引脚映射配置',
    
    -- 高级配置
    sampling_rate VARCHAR(20) NULL COMMENT '采样率配置',
    pre_trigger_packets INT NULL COMMENT '预触发包数',
    post_trigger_packets INT NULL COMMENT '后触发包数',
    
    -- 统计
    submission_count INT NOT NULL DEFAULT 0 COMMENT '提交次数',
    avg_score DECIMAL(5,2) NULL COMMENT '平均分',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_experiment_code (experiment_code),
    INDEX idx_teacher (teacher_id),
    INDEX idx_category (category),
    INDEX idx_difficulty (difficulty_level),
    INDEX idx_is_classic (is_classic),
    
    FOREIGN KEY (teacher_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实验表';

-- =====================================================
-- 6. 实验提交记录表
-- =====================================================
CREATE TABLE experiment_submissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    student_id INT NOT NULL COMMENT '学生ID',
    experiment_id INT NOT NULL COMMENT '实验ID',
    class_id INT NULL COMMENT '班级ID(可选)',
    device_id INT NULL COMMENT '使用的设备ID',
    
    -- 时间和状态
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
    submitted_at TIMESTAMP NULL COMMENT '提交时间',
    graded_at TIMESTAMP NULL COMMENT '批改时间',
    status ENUM('in_progress', 'saved', 'submitted', 'grading', 'graded', 'returned', 'failed') NOT NULL DEFAULT 'in_progress' COMMENT '状态',
    
    -- 成绩
    score DECIMAL(5,2) NULL COMMENT '得分(0-100)',
    max_score DECIMAL(5,2) NOT NULL DEFAULT 100 COMMENT '满分',
    grade_level CHAR(1) NULL COMMENT '等级(A/B/C/D/F)',
    
    -- 反馈
    teacher_feedback TEXT NULL COMMENT '教师反馈',
    auto_evaluation JSON NULL COMMENT '自动评测结果',
    
    -- 数据统计
    total_data_points INT NOT NULL DEFAULT 0 COMMENT '数据点总数',
    waveform_samples INT NOT NULL DEFAULT 0 COMMENT '波形采样数',
    capture_duration_ms INT NULL COMMENT '采集时长(毫秒)',
    
    -- 文件路径
    code_file_path VARCHAR(255) NULL COMMENT '代码文件路径',
    waveform_file_path VARCHAR(255) NULL COMMENT '波形数据文件路径',
    report_file_path VARCHAR(255) NULL COMMENT '实验报告路径',
    
    -- IP信息
    client_ip VARCHAR(45) NULL COMMENT '客户端IP',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_student (student_id),
    INDEX idx_experiment (experiment_id),
    INDEX idx_class (class_id),
    INDEX idx_device (device_id),
    INDEX idx_status (status),
    INDEX idx_submitted_at (submitted_at),
    
    FOREIGN KEY (student_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实验提交记录表';

-- =====================================================
-- 7. 波形数据表 (关键修复! submission_id允许为空)
-- =====================================================
CREATE TABLE experiment_data (
    id INT PRIMARY KEY AUTO_INCREMENT,
    
    -- 关键关联字段 (submission_id 允许为空!)
    submission_id INT NULL COMMENT '实验提交ID(自由采集时为空)',
    device_id INT NOT NULL COMMENT '设备ID',
    
    -- 时间戳
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '采集时间',
    
    -- 引脚映射 (JSON格式)
    pin_mapping_json JSON NOT NULL COMMENT '引脚映射: ["LED0","BTN1","SW2",...]',
    
    -- 波形数据 (JSON格式 - 支持大容量)
    waveforms_json JSON NOT NULL COMMENT '波形数据: [[0,1,0,...], [1,1,1,...], ...]',
    
    -- 解析后的数据 (便于前端直接使用)
    led_states JSON NULL COMMENT 'LED状态: [1,0,1,1,...]',
    switch_states JSON NULL COMMENT '开关状态: [0,1,0,0,...]',
    button_states JSON NULL COMMENT '按键状态: [0,0,1,0,...]',
    digit_values JSON NULL COMMENT '数码管值: [{"digit":0,"value":"0"},...]',
    buzzer_state BOOLEAN NULL COMMENT '蜂鸣器状态',
    
    -- 原始数据
    raw_hex_data TEXT NULL COMMENT '原始十六进制数据',
    
    -- 元数据
    sample_count INT NOT NULL DEFAULT 0 COMMENT '采样点数',
    channel_count INT NOT NULL DEFAULT 0 COMMENT '通道数',
    data_size_kb DECIMAL(10,2) NULL COMMENT '数据大小(KB)',
    
    -- 触发信息
    trigger_pin VARCHAR(20) NULL COMMENT '触发引脚',
    trigger_time DATETIME NULL COMMENT '触发时间点',
    pre_trigger_samples INT NULL COMMENT '预触发采样数',
    
    -- 备注
    notes TEXT NULL COMMENT '备注',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_device (device_id),
    INDEX idx_timestamp (timestamp),
    INDEX idx_submission (submission_id),
    INDEX idx_device_timestamp (device_id, timestamp),
    
    FOREIGN KEY (submission_id) REFERENCES experiment_submissions(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='波形数据表';

-- =====================================================
-- 8. 设备分配表
-- =====================================================
CREATE TABLE device_allocations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL COMMENT '设备ID',
    student_id INT NOT NULL COMMENT '学生ID',
    class_id INT NULL COMMENT '班级ID(可选)',
    allocated_by INT NOT NULL COMMENT '分配人ID',
    
    allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '分配时间',
    expected_return_at DATETIME NULL COMMENT '预计归还时间',
    returned_at TIMESTAMP NULL COMMENT '实际归还时间',
    
    allocation_status ENUM('allocated', 'in_use', 'returned', 'overdue', 'lost') NOT NULL DEFAULT 'allocated' COMMENT '分配状态',
    
    purpose VARCHAR(100) NULL COMMENT '使用目的',
    notes TEXT NULL COMMENT '备注',
    
    INDEX idx_device (device_id),
    INDEX idx_student (student_id),
    INDEX idx_class (class_id),
    INDEX idx_status (allocation_status),
    
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (allocated_by) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备分配表';

-- =====================================================
-- 9. 设备状态历史表
-- =====================================================
CREATE TABLE device_status_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL COMMENT '设备ID',
    status VARCHAR(20) NOT NULL COMMENT '状态',
    
    -- 性能指标
    cpu_usage DECIMAL(5,2) NULL COMMENT 'CPU使用率%',
    memory_usage DECIMAL(5,2) NULL COMMENT '内存使用率%',
    temperature DECIMAL(5,2) NULL COMMENT '温度(°C)',
    network_latency INT NULL COMMENT '网络延迟(ms)',
    connection_quality VARCHAR(20) NULL COMMENT '连接质量',
    
    -- 电压/电流
    voltage_mv INT NULL COMMENT '电压(mV)',
    current_ma INT NULL COMMENT '电流(mA)',
    
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_device (device_id),
    INDEX idx_recorded_at (recorded_at),
    INDEX idx_device_recorded (device_id, recorded_at),
    
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备状态历史表';

-- =====================================================
-- 10. 系统日志表
-- =====================================================
CREATE TABLE system_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NULL COMMENT '操作用户ID',
    device_id INT NULL COMMENT '相关设备ID',
    
    action_type VARCHAR(50) NOT NULL COMMENT '操作类型',
    action_module VARCHAR(50) NULL COMMENT '所属模块',
    action_description TEXT NULL COMMENT '操作描述',
    
    -- 请求信息
    ip_address VARCHAR(45) NULL COMMENT 'IP地址',
    user_agent TEXT NULL COMMENT '浏览器/客户端信息',
    request_method VARCHAR(10) NULL COMMENT '请求方法',
    request_path VARCHAR(255) NULL COMMENT '请求路径',
    
    -- 响应信息
    response_status INT NULL COMMENT '响应状态码',
    response_time_ms INT NULL COMMENT '响应时间(毫秒)',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user (user_id),
    INDEX idx_device (device_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at),
    
    FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统日志表';

-- =====================================================
-- 11. 实验资源表
-- =====================================================
CREATE TABLE experiment_resources (
    id INT PRIMARY KEY AUTO_INCREMENT,
    experiment_id INT NOT NULL COMMENT '实验ID',
    name VARCHAR(200) NOT NULL COMMENT '资源名称',
    description TEXT NULL COMMENT '资源描述',
    
    file_url VARCHAR(500) NOT NULL COMMENT '文件URL/路径',
    file_type VARCHAR(50) NULL COMMENT '文件类型',
    file_size BIGINT NULL COMMENT '文件大小(字节)',
    mime_type VARCHAR(100) NULL COMMENT 'MIME类型',
    
    download_count INT NOT NULL DEFAULT 0 COMMENT '下载次数',
    is_active BOOLEAN NOT NULL DEFAULT TRUE COMMENT '是否启用',
    
    uploaded_by INT NOT NULL COMMENT '上传人ID',
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_experiment (experiment_id),
    INDEX idx_file_type (file_type),
    
    FOREIGN KEY (experiment_id) REFERENCES experiments(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) 
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实验资源表';

-- =====================================================
-- 12. 设备故障记录表
-- =====================================================
CREATE TABLE device_fault_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL COMMENT '设备ID',
    
    fault_type VARCHAR(100) NULL COMMENT '故障类型',
    fault_code VARCHAR(50) NULL COMMENT '故障代码',
    fault_description TEXT NULL COMMENT '故障描述',
    
    severity ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium' COMMENT '严重程度',
    status ENUM('reported', 'investigating', 'repairing', 'fixed', 'cannot_fix', 'scrapped') NOT NULL DEFAULT 'reported' COMMENT '处理状态',
    
    reported_by INT NULL COMMENT '报告人ID',
    reported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报告时间',
    
    assigned_to INT NULL COMMENT '指派给ID',
    assigned_at TIMESTAMP NULL COMMENT '指派时间',
    
    fixed_by INT NULL COMMENT '修复人ID',
    fixed_at TIMESTAMP NULL COMMENT '修复时间',
    fix_description TEXT NULL COMMENT '修复描述',
    
    repair_cost DECIMAL(10,2) NULL COMMENT '维修费用',
    
    INDEX idx_device (device_id),
    INDEX idx_status (status),
    INDEX idx_reported_at (reported_at),
    
    FOREIGN KEY (device_id) REFERENCES devices(id) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (reported_by) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备故障记录表';

-- =====================================================
-- 插入测试数据 (Mock Data)
-- =====================================================

-- 1. 用户数据 (密码均为 123456 的 bcrypt 哈希)
INSERT INTO users (username, password_hash, role, real_name, student_number, email, department, is_active) VALUES
-- 管理员
('admin', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin', '系统管理员', NULL, 'admin@fpga.edu', '信息中心', TRUE),
-- 教师
('teacher1', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '张伟教授', NULL, 'zhangwei@fpga.edu', '电子信息学院', TRUE),
('teacher2', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'teacher', '李敏副教授', NULL, 'limin@fpga.edu', '计算机学院', TRUE),
-- 学生
('student001', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '王小明', '202401001', 'wangxm@student.fpga.edu', '电子信息2024级1班', TRUE),
('student002', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '李小红', '202401002', 'lixh@student.fpga.edu', '电子信息2024级1班', TRUE),
('student003', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '赵小刚', '202401003', 'zhaoxg@student.fpga.edu', '电子信息2024级2班', TRUE),
('student004', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '钱小丽', '202401004', 'qianxl@student.fpga.edu', '计算机2024级1班', TRUE),
('student005', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'student', '孙小强', '202401005', 'sunxq@student.fpga.edu', '电子信息2024级1班', TRUE);

-- 2. 班级数据
INSERT INTO classes (name, class_code, teacher_id, course_code, semester, description, max_students) VALUES
('FPGA基础实验班', 'EE101', 2, 'EE101', '2024-1', 'FPGA编程基础课程,学习Verilog基础和基本数字电路', 40),
('数字系统设计班', 'EE201', 2, 'EE201', '2024-1', '高级数字系统设计,状态机、总线、接口设计', 35),
('嵌入式系统实验班', 'EE301', 3, 'EE301', '2024-1', '嵌入式系统设计与实现', 30);

-- 3. 学生-班级关联
INSERT INTO student_classes (student_id, class_id, status) VALUES
(4, 1, 'enrolled'),
(5, 1, 'enrolled'),
(6, 1, 'enrolled'),
(6, 2, 'enrolled'),
(7, 2, 'enrolled'),
(8, 1, 'enrolled'),
(8, 3, 'enrolled');

-- 4. 设备数据
INSERT INTO devices (device_id, name, device_type, mac_address, ip_address, status, is_available, asset_number, manufacturer, location, power_on_count) VALUES
('FPGA-001', 'Artix-7开发板1', 'FPGA_ARTIX7', '00:11:22:33:44:55', '192.168.1.101', 'online', TRUE, 'ASSET-FPGA-001', 'Xilinx', '实验室A区101', 128),
('FPGA-002', 'Artix-7开发板2', 'FPGA_ARTIX7', '00:11:22:33:44:56', '192.168.1.102', 'online', TRUE, 'ASSET-FPGA-002', 'Xilinx', '实验室A区102', 95),
('FPGA-003', 'Artix-7开发板3', 'FPGA_ARTIX7', '00:11:22:33:44:57', '192.168.1.103', 'offline', TRUE, 'ASSET-FPGA-003', 'Xilinx', '实验室A区103', 67),
('FPGA-004', 'Nexys4开发板', 'FPGA_NEXYS4', '00:11:22:33:44:58', '192.168.1.104', 'online', FALSE, 'ASSET-NEXYS-004', 'Digilent', '实验室B区201', 45),
('FPGA-005', 'DE10-Standard开发板', 'FPGA_DE10', '00:11:22:33:44:59', '192.168.1.105', 'faulty', FALSE, 'ASSET-DE10-005', 'Intel', '维修中', 203),
('FPGA-006', 'Artix-7开发板6', 'FPGA_ARTIX7', '00:11:22:33:44:5A', '192.168.1.106', 'online', TRUE, 'ASSET-FPGA-006', 'Xilinx', '实验室A区106', 12);

-- 5. 实验数据 (包含FPGA硬件参数)
INSERT INTO experiments (
    experiment_code, experiment_name, description, category, difficulty_level, 
    estimated_duration, teacher_id, is_public, is_classic,
    sample_clock, trigger_condition, packet_count, target_pins
) VALUES
-- 基础实验
('EXP-B001', '流水灯实验', '使用Verilog实现LED流水灯效果,理解时钟分频和移位操作', 
 'basic', 'easy', 60, 2, TRUE, TRUE,
 'external', '0x0000', 8, '["LED0","LED1","LED2","LED3","LED4","LED5","LED6","LED7"]'),

('EXP-B002', '按键检测实验', '检测FPGA开发板上的按键输入,理解输入信号消抖',
 'basic', 'easy', 45, 2, TRUE, TRUE,
 'external', '0x0001', 16, '["BTN0","BTN1","BTN2","BTN3","LED0"]'),

('EXP-B003', '拨码开关控制实验', '使用拨码开关控制LED状态,理解输入输出映射',
 'basic', 'easy', 45, 2, TRUE, FALSE,
 'external', '0x0010', 8, '["SW0","SW1","SW2","SW3","SW4","SW5","SW6","SW7","LED0"]'),

('EXP-B004', '数码管静态显示', '在数码管上静态显示数字,理解数码管编码',
 'basic', 'medium', 90, 2, TRUE, FALSE,
 'internal', '0x0000', 16, '["DIGIT_0","DIGIT_1","DIGIT_2","DIGIT_3"]'),

('EXP-B005', '蜂鸣器演奏实验', '控制蜂鸣器播放简单旋律,理解PWM声音调制',
 'basic', 'medium', 90, 2, TRUE, FALSE,
 'external', '0x0002', 32, '["BTN0","BTN1","BUZZER","LED0","LED1"]'),

-- 高级实验
('EXP-A001', '按键矩阵扫描', '4x4矩阵键盘扫描检测,理解行列扫描原理',
 'advanced', 'medium', 120, 2, TRUE, TRUE,
 'external', '0x0001', 64, '["ROW0","ROW1","ROW2","ROW3","COL0","COL1","COL2","COL3","LED0"]'),

('EXP-A002', '数码管动态显示', '多位数码管动态扫描显示,理解时间复用',
 'advanced', 'medium', 120, 2, TRUE, FALSE,
 'internal', '0x0000', 32, '["DIGIT_0","DIGIT_1","DIGIT_2","DIGIT_3","DIGIT_4","DIGIT_5","DIGIT_6","DIGIT_7"]'),

('EXP-A003', '状态机设计', '使用状态机实现序列检测器,理解状态机设计方法',
 'advanced', 'hard', 180, 2, TRUE, FALSE,
 'external', '0x0001', 128, '["BTN0","BTN1","LED0","LED1","LED2","LED3"]'),

-- 项目实验
('EXP-P001', '综合设计: 电子密码锁', '综合运用按键、数码管、蜂鸣器设计电子密码锁',
 'project', 'hard', 360, 2, FALSE, TRUE,
 'external', '0x0001', 256, '["BTN0","BTN1","BTN2","BTN3","SW0","SW1","SW2","SW3","DIGIT_0","DIGIT_1","DIGIT_2","DIGIT_3","BUZZER","LED0","LED1"]'),

('EXP-P002', '综合设计: 波形发生器', '设计任意波形发生器,理解D/A转换和信号生成',
 'project', 'hard', 360, 3, FALSE, FALSE,
 'internal', '0x0001', 512, '["SW0","SW1","SW2","SW3","BTN0","BTN1","LED0","LED1","DAC0","DAC1"]');

-- 6. 实验提交记录
INSERT INTO experiment_submissions (
    student_id, experiment_id, class_id, device_id, status, 
    score, grade_level, teacher_feedback, total_data_points, 
    started_at, submitted_at
) VALUES
(4, 1, 1, 1, 'graded', 92, 'A', '代码规范,波形正确,实验报告完整', 512, 
 '2024-10-15 14:00:00', '2024-10-15 15:30:00'),
(5, 1, 1, 2, 'graded', 85, 'B', '波形正确,报告需要更详细', 512, 
 '2024-10-15 14:30:00', '2024-10-15 16:00:00'),
(6, 2, 1, 1, 'graded', 90, 'A', '消抖处理很好', 1024, 
 '2024-10-16 09:00:00', '2024-10-16 10:15:00'),
(6, 6, 2, 1, 'submitted', NULL, NULL, NULL, 2048, 
 '2024-10-17 14:00:00', NULL),
(7, 7, 2, 2, 'in_progress', NULL, NULL, NULL, 0, 
 '2024-10-18 10:00:00', NULL),
(8, 1, 1, 6, 'graded', 95, 'A', '优秀!所有要求都满足', 512, 
 '2024-10-18 15:00:00', '2024-10-18 16:45:00');

-- 7. 波形数据 (关键! submission_id 允许为空)
INSERT INTO experiment_data (
    submission_id, device_id, timestamp, pin_mapping_json, waveforms_json,
    led_states, switch_states, button_states, sample_count, channel_count
) VALUES
-- 有提交的波形数据
(1, 1, '2024-10-15 15:25:00', 
 '["LED0","LED1","LED2","LED3"]',
 '[[0,1,1,1,0,0,1,1,0,1,1,0,0,1,1,0],[1,0,0,1,1,1,0,0,1,0,0,1,1,0,0,1],[1,1,0,0,1,1,1,0,0,1,1,0,0,1,1,0],[0,0,1,1,0,0,1,1,1,0,0,1,1,0,0,1]]',
 '[1,0,0,1]', '[0,1,0,1,0,1,0,1]', '[0,0,1,0]', 16, 4),

(2, 2, '2024-10-15 15:50:00',
 '["LED0","LED1","LED2","LED3"]',
 '[[0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0],[0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]]',
 '[1,1,0,1]', '[1,0,1,0,1,0,1,0]', '[1,0,0,1]', 16, 4),

-- 自由采集数据 (submission_id = NULL)
(NULL, 1, '2024-10-18 09:30:00',
 '["BTN0","BTN1","BTN2","BTN3","SW0","SW1","SW2","SW3"]',
 '[[0,0,0,1,1,1,1,0,0,0,1,1,1,1,0,0],[0,1,1,0,0,1,1,0,0,1,1,0,0,1,1,0],[1,0,0,1,1,0,0,1,1,0,0,1,1,0,0,1],[0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],[0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0]]',
 '[0,1,0,1]', '[0,1,0,1,0,1,0,1]', '[0,1,0,1]', 16, 8),

(NULL, 6, '2024-10-18 16:30:00',
 '["LED0","LED1","LED2","LED3","LED4","LED5","LED6","LED7"]',
 '[[0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],[0,0,1,1,0,0,1,1,0,0,1,1,0,0,1,1],[1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0],[0,0,0,1,1,1,1,0,0,0,0,1,1,1,1,0],[1,0,0,0,0,1,1,1,1,0,0,0,0,1,1,1],[0,1,1,0,0,0,1,1,1,0,0,1,1,0,0,1],[0,0,1,1,1,0,0,0,1,1,1,0,0,0,1,1]]',
 '[0,1,0,1,0,1,0,1]', NULL, NULL, 16, 8);

-- 8. 设备分配记录
INSERT INTO device_allocations (device_id, student_id, class_id, allocated_by, allocation_status, allocated_at, returned_at) VALUES
(1, 4, 1, 2, 'returned', '2024-10-15 08:00:00', '2024-10-15 18:00:00'),
(2, 5, 1, 2, 'returned', '2024-10-15 08:30:00', '2024-10-15 18:30:00'),
(4, 6, 2, 3, 'allocated', '2024-10-17 09:00:00', NULL),
(6, 8, 1, 2, 'returned', '2024-10-18 14:00:00', '2024-10-18 18:00:00');

-- 9. 设备状态历史
INSERT INTO device_status_history (device_id, status, cpu_usage, memory_usage, temperature, network_latency, voltage_mv, current_ma, recorded_at) VALUES
(1, 'online', 15.5, 32.1, 42.5, 2, 3300, 450, '2024-10-18 09:00:00'),
(1, 'online', 18.2, 34.5, 43.2, 3, 3300, 470, '2024-10-18 10:00:00'),
(1, 'online', 12.8, 30.2, 41.8, 2, 3300, 440, '2024-10-18 11:00:00'),
(2, 'online', 22.5, 40.1, 45.8, 4, 3300, 520, '2024-10-18 09:30:00'),
(6, 'online', 10.2, 28.5, 38.9, 1, 3300, 380, '2024-10-18 16:00:00');

-- 10. 系统日志
INSERT INTO system_logs (user_id, action_type, action_module, action_description, ip_address, created_at) VALUES
(2, 'create_experiment', 'experiments', '创建实验: 流水灯实验 (EXP-B001)', '192.168.1.50', '2024-09-01 10:00:00'),
(2, 'create_class', 'classes', '创建班级: FPGA基础实验班 (EE101)', '192.168.1.50', '2024-09-01 09:30:00'),
(4, 'start_experiment', 'submissions', '开始实验: 流水灯实验', '192.168.1.101', '2024-10-15 14:00:00'),
(4, 'submit_experiment', 'submissions', '提交实验: 流水灯实验, 得分92分', '192.168.1.101', '2024-10-15 15:30:00'),
(1, 'login', 'auth', '用户登录: admin', '192.168.1.50', '2024-10-18 08:00:00');

-- =====================================================
-- 验证查询
-- =====================================================
SELECT '=== 用户统计 ===' as info, COUNT(*) as total FROM users
UNION ALL
SELECT '教师数量', COUNT(*) FROM users WHERE role = 'teacher'
UNION ALL
SELECT '学生数量', COUNT(*) FROM users WHERE role = 'student'
UNION ALL
SELECT '=== 班级统计 ===' as info, COUNT(*) as total FROM classes
UNION ALL
SELECT '=== 设备统计 ===' as info, COUNT(*) as total FROM devices
UNION ALL
SELECT '在线设备', COUNT(*) FROM devices WHERE status = 'online'
UNION ALL
SELECT '=== 实验统计 ===' as info, COUNT(*) as total FROM experiments
UNION ALL
SELECT '提交记录', COUNT(*) FROM experiment_submissions
UNION ALL
SELECT '波形数据', COUNT(*) FROM experiment_data;

-- =====================================================
-- 完成提示
-- =====================================================
SELECT '✅ 数据库初始化完成!' as message;
