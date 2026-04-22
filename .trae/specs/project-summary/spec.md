# 网络化FPGA实验教学系统 - 项目总结文档

## 一、项目概述

### 1.1 项目名称

网络化FPGA实验教学系统（FPGA Teaching System v2.0.0）

### 1.2 项目定位

这是一个面向高校FPGA实验教学的**网络化远程实验平台**，实现了教师端对学生FPGA设备的远程管理、实验分配、实时监控和成绩评定的完整教学闭环。

### 1.3 核心价值

* **远程化教学**：学生可通过网络远程操作FPGA硬件设备

* **实时监控**：教师可实时监控所有设备的运行状态和学生实验进度

* **自动化数据采集**：自动采集FPGA引脚波形数据并可视化展示

* **教学管理**：完整的实验创建、分配、提交流程

***

## 二、技术架构

### 2.1 技术栈总览

| 层次       | 技术                    | 说明            |
| -------- | --------------------- | ------------- |
| **后端框架** | Express.js (Node.js)  | RESTful API服务 |
| **实时通信** | Socket.IO             | WebSocket双向通信 |
| **硬件通信** | TCP Server (net模块)    | 与FPGA硬件板卡通信   |
| **数据库**  | MySQL (mysql2)        | 数据持久化存储       |
| **认证授权** | JWT (jsonwebtoken)    | 用户身份验证        |
| **密码加密** | bcrypt                | 用户密码安全存储      |
| **日志系统** | Winston               | 应用日志记录        |
| **定时任务** | node-cron             | 周期性任务调度       |
| **前端**   | 原生HTML/CSS/JavaScript | 学生端和教师端Web界面  |

### 2.2 服务器架构

系统采用**三端口架构**：

```
┌─────────────────────────────────────────────────────────────┐
│                        主进程 (server.js)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 教师端HTTP    │  │ 学生端HTTP    │  │  TCP服务      │      │
│  │ 端口:3000     │  │ 端口:3002     │  │  端口:3001    │      │
│  │ + WebSocket  │  │ + WebSocket  │  │  (FPGA板卡)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              共享中间件 & 路由层                       │   │
│  │  cors / express.json / static files / API routes     │   │
│  └─────────────────────────────────────────────────────┘   │
│                             │                              │
│                             ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    MySQL 数据库                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**三个端口的职责**：

1. **教师端 (3000)**: 提供教师管理界面 + WebSocket实时监控
2. **学生端 (3002)**: 提供学生实验界面 + WebSocket设备控制
3. **TCP端 (3001)**: 接收FPGA硬件板卡的TCP连接，进行二进制数据通信

### 2.3 项目目录结构

```
fpga2/
├── server.js                    # 主入口，启动三个服务器
├── package.json                 # 项目依赖配置
│
├── routes/                      # API路由层
│   ├── authRoutes.js           # 认证路由（登录/注册）
│   ├── deviceRoutes.js         # 设备管理路由
│   ├── experimentRoutes.js     # 实验管理路由
│   ├── dataRoutes.js           # 数据查询路由
│   ├── userRoutes.js           # 用户管理路由
│   └── classRoutes.js          # 班级管理路由
│
├── models/                      # 数据模型层
│   ├── User.js                 # 用户模型
│   ├── Device.js               # 设备模型
│   ├── Experiment.js           # 实验模型
│   ├── DataRecord.js           # 数据记录模型
│   └── Class.js                # 班级模型
│
├── utils/                       # 工具模块
│   ├── database.js             # 数据库连接池
│   ├── socketManager.js        # WebSocket管理
│   ├── tcpServer.js            # TCP服务器核心
│   ├── dataParser.js           # 二进制数据解析器
│   ├── pinConfig.js            # 引脚配置映射
│   └── scheduler.js            # 定时任务调度
│
├── middleware/                  # 中间件
│   ├── auth.js                 # 认证/授权中间件
│   └── errorHandler.js         # 错误处理中间件
│
├── scripts/                     # 脚本
│   ├── fpga1.js                # FPGA模拟客户端V1
│   └── fpga2.js                # FPGA模拟客户端V2
│
└── public/                      # 前端静态资源
    ├── index.html              # 首页
    ├── login.html              # 登录页
    ├── register.html           # 注册页
    ├── student.html            # 学生端页面
    ├── teacher.html            # 教师端页面
    ├── css/                    # 样式文件
    └── js/                     # 前端JS脚本
        ├── auth.js             # 认证逻辑
        ├── socket.js           # WebSocket连接
        ├── student.js          # 学生端逻辑
        └── teacher.js          # 教师端逻辑
```

***

## 三、核心通信流程

### 3.1 整体通信架构图

```
学生浏览器 ◄──WebSocket──► 学生端HTTP(3002) ◄──共享路由/模型──► MySQL
                                                          │
教师浏览器 ◄──WebSocket──► 教师端HTTP(3000) ◄──共享路由/模型──┘
                                                          │
FPGA硬件板卡 ◄────TCP(二进制)────► TCP服务器(3001) ◄────────┘
```

### 3.2 下行指令下发流程（前端 → FPGA板卡）

```
学生在网页点击"开始采集"
        │
        ▼
[前端JS] socket.emit('start_capture', { deviceId, requestedPins, experimentId })
        │
        ▼
[socketManager.js] 收到 start_capture 事件
        │
        ▼
[tcpServer.js] sendCommand(deviceId, { action: 'start_capture', requestedPins, ... })
        │
        ▼
构建 24字节 二进制指令包:
┌────────┬──────────┬────────────┬────────┬──────────┬────────────────┬──────────┐
│帧头2B  │时钟选择2B│设备编号4B  │触发2B  │包数量2B  │保留字节8B      │校验和4B  │
│0xFFFE  │0x0001~   │0x00000000  │0xFF00  │引脚数量  │0xAA...         │SUM&0xFFFFFFFF│
└────────┴──────────┴────────────┴────────┴──────────┴────────────────┴──────────┘
        │
        ▼
通过TCP Socket发送二进制数据到FPGA板卡
```

**关键设计点**：

1. **实验驱动的指令参数**：

   * 引脚数量 (`packetCount`)：根据实验配置的 `target_pins` 数量决定

   * 时钟源 (`clockSelect`)：优先使用实验配置的 `sample_clock`，支持50Hz\~500kHz

   * 设备编号 (`deviceNumber`)：由FPGA板卡注册时上报

2. **指令类型**：

   * `start_capture` / `capture`: 开始采集，包数量 > 0

   * `stop_capture`: 停止采集，包数量 = 0

   * `diagnose`: 故障检测，固定包数量 = 32

### 3.3 上行数据处理流程（FPGA板卡 → 前端）

```
FPGA板卡发送二进制数据
        │
        ▼
[TCP服务器] socket.on('data') 接收数据块
        │
        ▼
识别数据类型：
├── 设备注册包 (8字节): 0xFFFE + 0xCCCC + 设备编号4B
│       → 注册设备到 deviceSocketMap，广播设备上线
│
├── 心跳包 (4字节): 0xFFCCFFCC
│       → 更新最后心跳时间，维持连接
│
└── 数据包 (0xFFFE开头, 长度>4):
        → 交给 DataParser 解析
```

**DataParser 数据解析流程**：

```
DataParser.addData(chunk)
        │
        ▼
解析大包结构:
┌──────────────────────────────────────────────────────────────┐
│ 大包头部(10B)                                                 │
│ ┌────────┬──────────┬────────────┬──────────────────┐        │
│ │帧头2B  │总长度2B  │大包计数2B  │设备编号4B         │        │
│ │0xFFFE  │N×72+10   │顺序序号    │0x000000CC         │        │
│ └────────┴──────────┴────────────┴──────────────────┘        │
│                                                              │
│ 子帧载荷区 (每帧72字节)                                       │
│ ┌──────────────────────────────────────┐                     │
│ │ 子帧1: 帧头6B + 序号2B + 载荷64B     │                     │
│ │ 帧头: 0xFFFECCCCCC                    │                     │
│ │ 载荷: 64字节，>80%为0xFF则判定为高电平 │                     │
│ ├──────────────────────────────────────┤                     │
│ │ 子帧2: ...                            │                     │
│ └──────────────────────────────────────┘                     │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
提取每个引脚的状态值 (0 或 1)
        │
        ▼
触发 'snapshot-ready' 事件
        │
        ▼
[tcpServer.js] parseWaveformData() 按引脚类型分类:
├── LEDs: 指示灯状态
├── Switches: 开关状态
├── Digits: 数码管显示（段选+位选）
├── Buttons: 按钮状态
└── Buzzer: 蜂鸣器状态
        │
        ▼
[socketManager.js] broadcastDeviceData() 广播到前端:
├── 教师端: 接收完整数据（所有引脚）
└── 学生端: 接收过滤后数据（仅实验相关引脚）
        │
        ▼
保存到数据库 experiment_data 表
```

### 3.4 引脚配置体系

系统定义了**54个引脚**，分为6种类型：

| 引脚类型  | ID范围  | 数量  | 示例             |
| ----- | ----- | --- | -------------- |
| LED   | 1-16  | 16个 | LED0\~LED15    |
| 拨码开关  | 17-32 | 16个 | SW0\~SW15      |
| 数码管段选 | 33-39 | 7个  | SEG\_A\~SEG\_G |
| 数码管位选 | 40-47 | 8个  | DIG0\~DIG7     |
| 独立按键  | 48-53 | 6个  | BTN0\~BTN5     |
| 蜂鸣器   | 54    | 1个  | BUZZER         |

**电平判定算法**：

```javascript
// 64字节载荷中，0xFF字节占比 > 80% 判定为高电平(1)
const pinState = (highCount / payload.length) > 0.8 ? 1 : 0;
```

***

## 四、业务逻辑设计

### 4.1 用户角色体系

```
┌─────────────────────────────────────────────────────┐
│                    用户角色                           │
├──────────┬──────────────────────────────────────────┤
│ admin    │ 管理员：全部权限，包括系统管理              │
│ teacher  │ 教师：创建实验、分配设备、监控、评分        │
│ student  │ 学生：做实验、提交数据、查看成绩            │
└──────────┴──────────────────────────────────────────┘
```

**认证流程**：

```
用户登录 → 验证用户名密码 → 生成JWT Token → 前端存储Token
                                        │
                                        ▼
                                WebSocket连接时发送Token认证
                                        │
                                        ▼
                                根据角色加入不同房间(teachers/students)
```

### 4.2 学生侧业务逻辑

```
┌──────────────────────────────────────────────────────────────┐
│                        学生端流程                              │
│                                                              │
│  1. 登录系统                                                  │
│     ↓                                                        │
│  2. 接收教师分配的设备通知 (device_allocated)                   │
│     ↓                                                        │
│  3. 选择实验（公开实验/教师指定）                                │
│     ↓                                                        │
│  4. 开始实验 → 创建提交记录 (status: in_progress)               │
│     ↓                                                        │
│  5. 点击"开始采集" → 下发指令到FPGA → 实时显示波形               │
│     ↓                                                        │
│  6. 波形数据自动保存到数据库                                     │
│     ↓                                                        │
│  7. 完成实验 → 提交波形数据 → (status: submitted)               │
│     ↓                                                        │
│  8. 查看成绩和教师反馈                                          │
└──────────────────────────────────────────────────────────────┘
```

**学生端WebSocket事件**：

| 事件                 | 方向 | 说明     |
| ------------------ | -- | ------ |
| `bind_device`      | 发送 | 绑定设备   |
| `start_capture`    | 发送 | 请求开始采集 |
| `stop_capture`     | 发送 | 请求停止采集 |
| `device_allocated` | 接收 | 设备分配通知 |
| `device-update`    | 接收 | 波形数据更新 |
| `capture-started`  | 接收 | 采集开始确认 |
| `capture-stopped`  | 接收 | 采集停止确认 |

### 4.3 教师侧业务逻辑

```
┌──────────────────────────────────────────────────────────────┐
│                        教师端流程                              │
│                                                              │
│  1. 登录系统                                                  │
│     ↓                                                        │
│  2. 查看设备概览（在线/离线/故障统计）                           │
│     ↓                                                        │
│  3. 创建实验（配置引脚、时钟源、触发条件等）                      │
│     ↓                                                        │
│  4. 分配设备给学生（或批量分配）                                 │
│     ↓                                                        │
│  5. 实时监控所有设备状态和学生实验进度                           │
│     ↓                                                        │
│  6. 查看学生提交的实验数据                                     │
│     ↓                                                        │
│  7. 评分并给出反馈                                             │
│     ↓                                                        │
│  8. 管理班级和学生                                             │
└──────────────────────────────────────────────────────────────┘
```

**教师端实时监控机制**：

```
教师加入 'teachers' 房间
        │
        ▼
接收以下广播事件:
├── global-device-status    # 设备上线/离线/采集状态
├── device-update           # 波形数据更新
├── allocation_updated      # 设备分配变更
└── 其他管理事件
```

### 4.4 设备分配机制

```
教师选择设备和学生 → POST /api/devices/:deviceId/allocate
        │
        ▼
数据库记录分配关系 (device_allocations表)
        │
        ▼
WebSocket通知学生 (device_allocated事件)
        │
        ├── 学生在线 → 立即通知
        └── 学生离线 → 存入pendingNotifications队列，上线后补发
        │
        ▼
广播给其他教师 (allocation_updated事件)
```

**离线通知补偿机制**（修复Bug 1）：

```javascript
// 学生离线时暂存通知
pendingNotifications.set(userIdNum, deviceId);

// 学生上线时检查并补发
const pendingDeviceId = pendingNotifications.get(studentIdNum);
if (pendingDeviceId) {
    socket.emit('device_allocated', { deviceId: pendingDeviceId, ... });
    pendingNotifications.delete(studentIdNum);
}
```

### 4.5 实验数据流转

```
┌─────────────────────────────────────────────────────────────┐
│                    实验数据生命周期                            │
│                                                             │
│  创建实验 → 开始实验 → 采集数据 → 提交数据 → 评分 → 归档       │
│     │          │          │          │         │             │
│     ▼          ▼          ▼          ▼         ▼             │
│  experiments  submissions experiment_data (关联)  score       │
│  表          表          表                      字段          │
│                                                             │
│  关键字段:                                                    │
│  - experiments: target_pins, sample_clock, trigger_condition │
│  - submissions: status (in_progress/submitted/graded)         │
│  - experiment_data: waveforms_json, pin_mapping_json          │
└─────────────────────────────────────────────────────────────┘
```

***

## 五、数据库设计

### 5.1 核心数据表

| 表名                       | 说明      | 关键字段                                                |
| ------------------------ | ------- | --------------------------------------------------- |
| `users`                  | 用户表     | id, username, role, student\_number                 |
| `devices`                | 设备表     | id, device\_id, name, status, device\_type          |
| `device_allocations`     | 设备分配表   | device\_id, student\_id, allocation\_status         |
| `experiments`            | 实验表     | experiment\_code, sample\_clock, target\_pins       |
| `experiment_submissions` | 实验提交表   | student\_id, experiment\_id, status, score          |
| `experiment_data`        | 实验数据表   | submission\_id, waveforms\_json, pin\_mapping\_json |
| `classes`                | 班级表     | class\_code, name, teacher\_id                      |
| `student_classes`        | 学生班级关联表 | student\_id, class\_id                              |
| `device_status_history`  | 设备状态历史表 | device\_id, status, recorded\_at                    |
| `system_logs`            | 系统日志表   | user\_id, action\_type, action\_description         |

### 5.2 关键表关系

```
users (1) ──── (N) experiment_submissions
                   │
                   ├─── (N) experiment_data
                   │
                   └─── experiments (teacher_id)

devices (1) ──── (1) device_allocations ──── (N) users (student)

classes (1) ──── (N) student_classes ──── (N) users
```

***

## 六、关键技术实现

### 6.1 TCP通信协议设计

**协议分层**：

```
┌─────────────────────────────────────────────────────┐
│  应用层: 实验数据、波形数据、设备状态                  │
├─────────────────────────────────────────────────────┤
│  传输层: 大包/子帧结构、帧头识别、校验和               │
├─────────────────────────────────────────────────────┤
│  物理层: TCP Socket 连接                              │
└─────────────────────────────────────────────────────┘
```

**帧类型标识**：

| 帧头              | 类型    | 长度   |
| --------------- | ----- | ---- |
| `0xFFFECCCCCC`  | 设备注册包 | 8字节  |
| `0xFFCCFFCC`    | 心跳包   | 4字节  |
| `0xFFFE` + 长度字段 | 数据大包  | 可变长度 |

### 6.2 心跳保活机制

```javascript
// 服务器端
HEARTBEAT_TIMEOUT = 10000; // 10秒超时检查
setInterval(() => {
    if (elapsed > HEARTBEAT_TIMEOUT) {
        socket.destroy(); // 强制断开
    }
}, 5000);

// 客户端（FPGA模拟器）
setInterval(() => {
    client.write(Buffer.from([0xFF, 0xCC, 0xFF, 0xCC]));
}, 3000); // 每3秒发送心跳
```

### 6.3 WebSocket房间机制

```
教师端Socket.IO:
├── 房间: 'teachers'
│   └── 所有教师/管理员加入
│
学生端Socket.IO:
├── 房间: 'students'
│   └── 所有学生加入
│
数据广播策略:
├── 教师接收: 完整数据（所有引脚波形）
└── 学生接收: 过滤数据（仅实验相关引脚）
```

### 6.4 数据过滤机制

```javascript
// 学生端只接收实验相关的引脚数据
const requestedPinIdSet = new Set(requestedPins.map(p => getPinId(p)));
pinMapping.forEach((pinName, index) => {
    if (requestedPinIdSet.has(getPinId(pinName))) {
        filteredIndices.push(index);
    }
});
```

***

## 七、答辩常见问题准备

### Q1: 系统如何实现远程控制FPGA硬件的？

**答**: 系统通过TCP服务器(端口3001)与FPGA板卡建立长连接。前端通过WebSocket发送控制指令到后端，后端将指令转换为特定格式的二进制数据包，通过TCP连接下发到FPGA板卡。板卡响应后，数据经TCP上传，由DataParser解析后通过WebSocket广播到前端页面。

### Q2: 指令包是如何根据实验内容配置的？

**答**: 每个实验在创建时配置了`target_pins`(目标引脚)、`sample_clock`(采样时钟)等参数。下发指令时，系统优先使用实验配置的时钟源，引脚数量根据请求的引脚列表动态计算。指令包是24字节固定格式：帧头(2B)+时钟选择(2B)+设备编号(4B)+触发信号(2B)+包数量(2B)+保留字节(8B)+校验和(4B)。

### Q3: 上行数据是怎么解析和展示的？

**答**: FPGA板卡上传的是大包格式数据，每个大包包含一个头部和多个子帧。每个子帧72字节，包含6字节帧头、2字节序号、64字节载荷。引脚电平判定采用阈值算法：64字节中超过80%为0xFF则判定为高电平(1)。解析后的数据按引脚类型(LED/开关/数码管/按键/蜂鸣器)分类，通过WebSocket实时推送到前端Canvas波形图展示。

### Q4: 学生端和教师端的核心区别是什么？

**答**:

* **端口分离**: 学生端(3002)和教师端(3000)使用不同端口和独立WebSocket实例

* **权限控制**: 通过JWT角色认证和路由中间件实现

* **数据过滤**: 教师接收完整数据，学生只接收实验相关引脚数据

* **功能差异**: 教师侧重管理和监控，学生侧重实验操作

### Q5: 如果学生掉线后重新连接，设备分配通知会丢失吗？

**答**: 不会。系统实现了离线通知补偿机制。当教师分配设备给学生时，如果学生不在线，通知会暂存到`pendingNotifications`队列。学生重新连接并完成WebSocket认证后，系统会检查并补发暂存的通知。

### Q6: 系统如何保证通信的可靠性？

**答**:

1. **心跳保活**: 客户端每3秒发送心跳，服务器10秒超时检测
2. **数据校验**: 指令包包含校验和字段
3. **帧同步**: 使用特殊帧头(0xFFFE)进行帧同步
4. **防抖处理**: DataParser使用100ms防抖避免重复处理
5. **连接池**: MySQL使用连接池提高数据库访问可靠性

***

## 八、系统特色与创新点

1. **三端口架构**: HTTP/WebSocket/TCP三服务协同工作
2. **实验驱动的硬件控制**: 指令参数由实验配置动态生成
3. **实时波形可视化**: 二进制数据采集→解析→前端展示全链路
4. **离线补偿机制**: 确保关键通知不丢失
5. **数据权限隔离**: 教师/学生数据视图差异化
6. **模块化设计**: 路由-模型-工具三层架构，易于扩展

