// 📁 utils/scheduler.js - 定时任务管理器
const cron = require('node-cron');
const DataRecord = require('../models/DataRecord');

class Scheduler {
    constructor() {
        this.jobs = [];
    }
    
    // 初始化所有定时任务
    init() {
        this.setupDataCleanup();
        console.log('✅ 所有定时任务已初始化');
    }
    
    // 设置数据清理任务
    setupDataCleanup() {
        // 每天凌晨2点执行数据清理
        const job = cron.schedule('0 2 * * *', async () => {
            console.log('⏰ 开始执行数据清理任务...');
            try {
                // 清理30天前的数据
                const cleanedCount = await DataRecord.cleanupOldData(30);
                console.log(`✅ 数据清理完成，共清理了 ${cleanedCount} 条旧数据`);
            } catch (error) {
                console.error('❌ 数据清理任务失败:', error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Shanghai' // 设置时区
        });
        
        this.jobs.push(job);
        console.log('✅ 数据清理任务已设置，将在每天凌晨2点执行');
    }
    
    // 添加自定义定时任务
    addJob(name, cronExpression, task) {
        const job = cron.schedule(cronExpression, async () => {
            console.log(`⏰ 开始执行定时任务: ${name}`);
            try {
                await task();
                console.log(`✅ 定时任务完成: ${name}`);
            } catch (error) {
                console.error(`❌ 定时任务失败: ${name}`, error);
            }
        }, {
            scheduled: true,
            timezone: 'Asia/Shanghai'
        });
        
        this.jobs.push(job);
        console.log(`✅ 自定义定时任务已添加: ${name}`);
        return job;
    }
    
    // 停止所有定时任务
    stopAll() {
        this.jobs.forEach(job => {
            job.stop();
        });
        console.log('✅ 所有定时任务已停止');
    }
    
    // 获取所有定时任务状态
    getStatus() {
        return this.jobs.map((job, index) => ({
            id: index,
            status: job.running ? 'running' : 'stopped',
            nextInvocation: job.nextInvocation()
        }));
    }
}

// 创建单例实例
const scheduler = new Scheduler();

module.exports = scheduler;