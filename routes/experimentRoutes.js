const express = require('express');
const router = express.Router();
const { authenticate, authorize, isTeacher, isStudent } = require('../middleware/auth');
const Experiment = require('../models/Experiment');
const Device = require('../models/Device');
const DataRecord = require('../models/DataRecord');
const db = require('../utils/database');

/**
 * 获取所有实验（根据用户角色过滤）
 * GET /api/experiments
 */
router.get('/', authenticate, async (req, res) => {
    try {
        let experiments;

        if (req.user.role === 'teacher') {
            experiments = await Experiment.getByTeacher(req.user.id, true);
        } else if (req.user.role === 'student') {
            experiments = await Experiment.getPublicExperiments();
        } else if (req.user.role === 'admin') {
            experiments = await Experiment.getByTeacher(req.user.id, true);
        } else {
            experiments = [];
        }

        res.json({
            success: true,
            experiments: experiments
        });

    } catch (error) {
        console.error('获取实验列表错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验列表失败'
        });
    }
});

router.get('/search', authenticate, async (req, res) => {
    try {
        const { keyword, category, difficulty, teacher_id } = req.query;

        const experiments = await Experiment.search(keyword, {
            user_id: req.user.id,
            category,
            difficulty,
            teacher_id
        });

        res.json({
            success: true,
            experiments: experiments,
            count: experiments.length
        });

    } catch (error) {
        console.error('搜索实验错误:', error);
        res.status(500).json({
            success: false,
            error: '搜索实验失败'
        });
    }
});

router.get('/popular', authenticate, async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const experiments = await Experiment.getPopularExperiments(parseInt(limit));

        res.json({
            success: true,
            experiments: experiments
        });

    } catch (error) {
        console.error('获取热门实验错误:', error);
        res.status(500).json({
            success: false,
            error: '获取热门实验失败'
        });
    }
});

router.get('/student/submissions', authenticate, isStudent, async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        const submissions = await Experiment.getStudentSubmissions(req.user.id, {
            status: status
        });

        const submissionsWithStats = await Promise.all(
            submissions.slice(0, limit).map(async (submission) => {
                const stats = await DataRecord.getDataStats(submission.device_id);
                return {
                    ...submission,
                    data_stats: stats
                };
            })
        );

        res.json({
            success: true,
            submissions: submissionsWithStats,
            total: submissions.length
        });

    } catch (error) {
        console.error('获取学生提交记录错误:', error);
        res.status(500).json({
            success: false,
            error: '获取学生提交记录失败'
        });
    }
});

router.get('/students/stats', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const pool = db.getPool();

        const [studentStats] = await pool.execute(`
            SELECT
                u.id as student_id,
                COUNT(es.id) as experiment_count,
                AVG(es.score) as average_score,
                d.name as device_name
            FROM users u
            LEFT JOIN experiment_submissions es ON u.id = es.student_id
            LEFT JOIN device_allocations da ON u.id = da.student_id AND da.allocation_status = 'allocated'
            LEFT JOIN devices d ON da.device_id = d.id
            WHERE u.role = 'student'
            GROUP BY u.id, d.name
        `);

        const statsObj = {};
        studentStats.forEach(stat => {
            statsObj[stat.student_id] = {
                experiment_count: stat.experiment_count,
                average_score: stat.average_score || 0,
                device_name: stat.device_name || '未分配'
            };
        });

        res.json({
            success: true,
            stats: statsObj
        });

    } catch (error) {
        console.error('获取学生统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取学生统计失败'
        });
    }
});

router.get('/submissions', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { time_range = 'all', student_id } = req.query;
        const pool = db.getPool();

        let timeCondition = '';
        switch (time_range) {
            case 'week':
                timeCondition = 'AND es.started_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
                break;
            case 'month':
                timeCondition = 'AND es.started_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
                break;
            case 'today':
                timeCondition = 'AND DATE(es.started_at) = CURDATE()';
                break;
            default:
                timeCondition = '';
                break;
        }
        const studentIdFilter = student_id ? 'AND es.student_id = ?' : '';

        const params = [req.user.id];
        if (student_id) params.push(parseInt(student_id));

        const [submissions] = await pool.execute(`
            SELECT es.*,
                   COALESCE(e.experiment_name, '自由采集') as experiment_name,
                   u.real_name as student_name,
                   u.student_number,
                   d.name as device_name
            FROM experiment_submissions es
            LEFT JOIN experiments e ON es.experiment_id = e.id
            JOIN users u ON es.student_id = u.id
            JOIN devices d ON es.device_id = d.id
            WHERE (e.teacher_id = ? OR es.experiment_id IS NULL)
              ${timeCondition}
              ${studentIdFilter}
            ORDER BY es.started_at DESC
        `, params);

        res.json({
            success: true,
            submissions: submissions
        });

    } catch (error) {
        console.error('获取实验提交数据错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验提交数据失败'
        });
    }
});

router.get('/submissions/active', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const pool = db.getPool();
        const [submissions] = await pool.execute(`
            SELECT es.*,
                   COALESCE(e.experiment_name, '自由采集') as experiment_name,
                   u.real_name as student_name,
                   u.student_number,
                   d.device_id
            FROM experiment_submissions es
            LEFT JOIN experiments e ON es.experiment_id = e.id
            JOIN users u ON es.student_id = u.id
            JOIN devices d ON es.device_id = d.id
            WHERE es.status = 'in_progress'
              AND (e.teacher_id = ? OR es.experiment_id IS NULL)
            ORDER BY es.started_at DESC
        `, [req.user.id]);

        res.json({
            success: true,
            submissions: submissions
        });

    } catch (error) {
        console.error('获取活跃提交错误:', error);
        res.status(500).json({
            success: false,
            error: '获取活跃提交失败'
        });
    }
});

router.get('/submissions/:submissionId', authenticate, async (req, res) => {
    try {
        const { submissionId } = req.params;

        const pool = db.getPool();
        const [submissions] = await pool.execute(
            `SELECT es.*,
                    e.experiment_code, e.experiment_name, e.teacher_id,
                    u.real_name as student_name, u.username as student_username,
                    d.device_id, d.name as device_name
             FROM experiment_submissions es
             LEFT JOIN experiments e ON es.experiment_id = e.id
             JOIN users u ON es.student_id = u.id
             JOIN devices d ON es.device_id = d.id
             WHERE es.id = ?`,
            [submissionId]
        );

        if (submissions.length === 0) {
            return res.status(404).json({
                success: false,
                error: '提交记录不存在'
            });
        }

        const submission = submissions[0];

        if (req.user.role === 'student' && submission.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此提交记录'
            });
        }

        // 对于教师，需要检查权限：如果 experiment_id 不为 NULL，则检查 teacher_id
        if (req.user.role === 'teacher') {
            // 如果 experiment_id 为 NULL（自由采集），教师可能没有权限查看
            // 这里可以根据需要调整策略
            // 修改为：只有当 teacher_id 存在且不等于当前教师时才拒绝
            if (submission.teacher_id && submission.teacher_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: '没有权限查看此提交记录'
                });
            }
            // 如果 experiment_id 为 NULL（teacher_id 为 NULL），允许教师查看
        }

        const data = await DataRecord.getSubmissionRecords(submissionId);

        if (data.length === 0 && submission.device_id) {
            const [fallbackRows] = await pool.execute(
                `SELECT id, timestamp, waveforms_json, pin_mapping_json
                 FROM experiment_data
                 WHERE device_id = ?
                   AND submission_id IS NULL
                   AND timestamp >= DATE_SUB(?, INTERVAL 1 HOUR)
                 ORDER BY timestamp ASC`,
                [submission.device_id, submission.started_at || new Date()]
            );

            if (fallbackRows.length > 0) {
                const fallbackData = fallbackRows.map(row => ({
                    id: row.id,
                    timestamp: row.timestamp,
                    waveforms: DataRecord._safeJsonParse(row.waveforms_json),
                    pin_mapping: DataRecord._safeJsonParse(row.pin_mapping_json) || [],
                    is_fallback: true
                }));
                data.push(...fallbackData);
            }
        }

        res.json({
            success: true,
            submission: submission,
            data: data,
            data_count: data.length,
            pin_mapping: data[0]?.pin_mapping || []
        });

    } catch (error) {
        console.error('获取实验提交详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验提交详情失败'
        });
    }
});

router.get('/submissions/:submissionId/analysis', authenticate, async (req, res) => {
    try {
        const { submissionId } = req.params;

        const pool = db.getPool();
        const [submissions] = await pool.execute(
            `SELECT es.*, e.teacher_id, es.student_id
             FROM experiment_submissions es
             LEFT JOIN experiments e ON es.experiment_id = e.id
             WHERE es.id = ?`,
            [submissionId]
        );

        if (submissions.length === 0) {
            return res.status(404).json({
                success: false,
                error: '提交记录不存在'
            });
        }

        const submission = submissions[0];

        if (req.user.role === 'student' && submission.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此数据分析'
            });
        }

        // 对于教师，如果 experiment_id 不为 NULL，检查 teacher_id
        if (req.user.role === 'teacher') {
            if (submission.experiment_id !== null && submission.teacher_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: '没有权限查看此数据分析'
                });
            }
            // 如果 experiment_id 为 NULL（自由采集），允许教师查看
        }

        const analysis = await DataRecord.getDataAnalysis(submissionId);

        res.json({
            success: true,
            submission_id: submissionId,
            analysis: analysis
        });

    } catch (error) {
        console.error('获取实验数据分析错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验数据分析失败'
        });
    }
});

router.get('/submissions/:submissionId/export', authenticate, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { format = 'csv' } = req.query;

        const pool = db.getPool();
        const [submissions] = await pool.execute(
            `SELECT es.*, e.teacher_id, es.student_id
             FROM experiment_submissions es
             LEFT JOIN experiments e ON es.experiment_id = e.id
             WHERE es.id = ?`,
            [submissionId]
        );

        if (submissions.length === 0) {
            return res.status(404).json({
                success: false,
                error: '提交记录不存在'
            });
        }

        const submission = submissions[0];

        if (req.user.role === 'student' && submission.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限导出此数据'
            });
        }

        // 对于教师，如果 experiment_id 不为 NULL，检查 teacher_id
        if (req.user.role === 'teacher') {
            if (submission.experiment_id !== null && submission.teacher_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: '没有权限导出此数据'
                });
            }
            // 如果 experiment_id 为 NULL（自由采集），允许教师查看
        }

        if (format === 'csv') {
            const csv = await DataRecord.exportToCSV(submissionId);

            if (!csv) {
                return res.status(404).json({
                    success: false,
                    error: '未找到实验数据'
                });
            }

            res.header('Content-Type', 'text/csv');
            res.header('Content-Disposition', `attachment; filename=experiment_${submissionId}.csv`);
            return res.send(csv);
        } else {
            const data = await DataRecord.getSubmissionRecords(submissionId);

            res.json({
                success: true,
                submission_id: submissionId,
                data: data,
                count: data.length
            });
        }

    } catch (error) {
        console.error('导出实验数据错误:', error);
        res.status(500).json({
            success: false,
            error: '导出实验数据失败'
        });
    }
});

router.post('/submissions/create-with-waveform', authenticate, isStudent, async (req, res) => {
    try {
        const { experiment_id, device_id, class_id, pin_mapping, waveforms } = req.body;
        const pool = db.getPool();

        if (!device_id || !waveforms || !Array.isArray(waveforms) || waveforms.length === 0) {
            return res.status(400).json({ success: false, error: '设备ID和波形数据不能为空' });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const deviceDbId = await DataRecord._getOrCreateDevice(device_id);

            let finalExperimentId = experiment_id || null;
            if (finalExperimentId) {
                const [expRows] = await connection.execute(
                    'SELECT id FROM experiments WHERE id = ?',
                    [finalExperimentId]
                );
                if (expRows.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(404).json({ success: false, error: '实验不存在' });
                }
            }

            const [submissionResult] = await connection.execute(
                `INSERT INTO experiment_submissions
                 (student_id, experiment_id, device_id, class_id, status, started_at, submitted_at)
                 VALUES (?, ?, ?, ?, 'submitted', NOW(), NOW())`,
                [req.user.id, finalExperimentId, deviceDbId, class_id || null]
            );
            const submissionId = submissionResult.insertId;

            const channelCount = waveforms.length;
            const sampleCount = waveforms[0]?.length || 0;
            const pinMappingStr = JSON.stringify(pin_mapping || []);
            const waveformsStr = JSON.stringify(waveforms);

            await connection.execute(
                `INSERT INTO experiment_data
                 (submission_id, device_id, timestamp, pin_mapping_json, waveforms_json, sample_count, channel_count)
                 VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
                [submissionId, deviceDbId, pinMappingStr, waveformsStr, sampleCount, channelCount]
            );

            await connection.commit();
            connection.release();

            await pool.execute(
                `INSERT INTO system_logs (user_id, action_type, action_description)
                 VALUES (?, 'submit_waveform', ?)`,
                [req.user.id, `学生提交波形数据: submission_id=${submissionId}, 通道数=${channelCount}, 采样点数=${sampleCount}`]
            );

            res.status(201).json({
                success: true,
                message: '波形数据提交成功',
                data: {
                    submission_id: submissionId,
                    channel_count: channelCount,
                    sample_count: sampleCount
                }
            });

        } catch (innerError) {
            await connection.rollback();
            connection.release();
            throw innerError;
        }

    } catch (error) {
        console.error('提交波形数据错误:', error);
        res.status(500).json({ success: false, error: error.message || '提交波形数据失败' });
    }
});

router.post('/submissions/:submissionId/complete', authenticate, isStudent, async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { code, comments, ai_feedback } = req.body;

        const completed = await Experiment.completeExperiment(
            submissionId,
            req.user.id,
            { code, comments, ai_feedback }
        );

        if (!completed) {
            return res.status(404).json({
                success: false,
                error: '提交记录不存在或没有权限'
            });
        }

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'complete_experiment', ?)`,
            [req.user.id, `完成实验提交: ${submissionId}`]
        );

        res.json({
            success: true,
            message: '实验完成成功'
        });

    } catch (error) {
        console.error('完成实验错误:', error);
        res.status(500).json({
            success: false,
            error: '完成实验失败'
        });
    }
});

router.post('/submissions/:submissionId/grade', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { score, teacher_feedback, status = 'graded' } = req.body;

        if (score === undefined || score === null) {
            return res.status(400).json({
                success: false,
                error: '评分不能为空'
            });
        }

        if (score < 0 || score > 100) {
            return res.status(400).json({
                success: false,
                error: '分数必须在0-100之间'
            });
        }

        const graded = await Experiment.gradeExperiment(
            submissionId,
            req.user.id,
            { score, teacher_feedback, status }
        );

        if (!graded) {
            return res.status(404).json({
                success: false,
                error: '提交记录不存在或没有权限评分'
            });
        }

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'grade_experiment', ?)`,
            [req.user.id, `评分实验提交: ${submissionId}, 分数: ${score}`]
        );

        res.json({
            success: true,
            message: '实验评分成功'
        });

    } catch (error) {
        console.error('评分实验错误:', error);
        res.status(500).json({
            success: false,
            error: '评分实验失败'
        });
    }
});

router.post('/', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const {
            experiment_code,
            experiment_name,
            description,
            category = 'basic',
            difficulty_level = 'medium',
            estimated_duration,
            instructions,
            is_public = false,
            is_classic = false,
            sample_clock_source = 'external',
            trigger_condition = '0x0000',
            sample_length = 32,
            target_pins = []
        } = req.body;

        if (!experiment_code || !experiment_name) {
            return res.status(400).json({
                success: false,
                error: '实验代码和名称不能为空'
            });
        }

        if (target_pins && !Array.isArray(target_pins)) {
            return res.status(400).json({
                success: false,
                error: 'target_pins 必须是数组格式'
            });
        }

        const experimentId = await Experiment.create({
            experiment_code,
            experiment_name,
            description,
            category,
            difficulty_level,
            estimated_duration,
            instructions,
            teacher_id: req.user.id,
            is_public,
            is_classic,
            sample_clock_source,
            trigger_condition,
            sample_length,
            target_pins
        });

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'create_experiment', ?)`,
            [req.user.id, `创建实验: ${experiment_name} (${experiment_code}), 采样配置: 时钟=${sample_clock_source}, 触发=${trigger_condition}, 深度=${sample_length}, 引脚数=${target_pins.length}`]
        );

        res.status(201).json({
            success: true,
            message: '实验创建成功',
            data: {
                experimentId,
                sampleConfig: {
                    sample_clock_source,
                    trigger_condition,
                    sample_length,
                    target_pins_count: target_pins.length
                }
            }
        });

    } catch (error) {
        console.error('创建实验错误:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: '实验代码已存在'
            });
        }
        res.status(500).json({
            success: false,
            error: error.message || '创建实验失败'
        });
    }
});

router.get('/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const experiment = await Experiment.findById(id);

        if (!experiment) {
            return res.status(404).json({
                success: false,
                error: '实验不存在'
            });
        }

        if (req.user.role === 'student' && !experiment.is_public && experiment.teacher_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此实验'
            });
        }

        res.json({
            success: true,
            experiment: experiment
        });

    } catch (error) {
        console.error('获取实验详情错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验详情失败'
        });
    }
});

router.put('/:id', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const updated = await Experiment.update(id, req.user.id, req.body);

        if (!updated) {
            return res.status(404).json({
                success: false,
                error: '实验不存在或没有权限修改'
            });
        }

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'update_experiment', ?)`,
            [req.user.id, `更新实验: ${id}`]
        );

        res.json({
            success: true,
            message: '实验更新成功'
        });

    } catch (error) {
        console.error('更新实验错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '更新实验失败'
        });
    }
});

router.delete('/:id', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await Experiment.delete(id, req.user.id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                error: '实验不存在或没有权限删除'
            });
        }

        const pool = db.getPool();
        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'delete_experiment', ?)`,
            [req.user.id, `删除实验: ${id}`]
        );

        res.json({
            success: true,
            message: '实验删除成功'
        });

    } catch (error) {
        console.error('删除实验错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '删除实验失败'
        });
    }
});

router.post('/:id/start', authenticate, isStudent, async (req, res) => {
    try {
        const { id } = req.params;
        const { device_id, class_id } = req.body;

        if (!device_id) {
            return res.status(400).json({
                success: false,
                error: '请选择设备'
            });
        }

        const device = await Device.findByDeviceId(device_id);
        if (!device) {
            return res.status(404).json({
                success: false,
                error: '设备不存在'
            });
        }

        if (device.student_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限使用此设备'
            });
        }

        const experiment = await Experiment.findById(id);
        if (!experiment) {
            return res.status(404).json({
                success: false,
                error: '实验不存在'
            });
        }

        const pool = db.getPool();
        const [activeSubmissions] = await pool.execute(
            `SELECT id FROM experiment_submissions
             WHERE student_id = ? AND status = 'in_progress'
             LIMIT 1`,
            [req.user.id]
        );

        if (activeSubmissions.length > 0) {
            return res.status(400).json({
                success: false,
                error: '已有进行中的实验，请先完成或取消'
            });
        }

        const submission = await Experiment.startExperiment({
            student_id: req.user.id,
            experiment_id: id,
            device_id: device_id
        });

        await pool.execute(
            `INSERT INTO system_logs (user_id, device_id, action_type, action_description)
             VALUES (?, (SELECT id FROM devices WHERE device_id = ?), 'start_experiment', ?)`,
            [req.user.id, device_id, `开始实验: ${experiment.experiment_name}`]
        );

        res.json({
            success: true,
            message: '实验开始成功',
            submission: submission
        });

    } catch (error) {
        console.error('开始实验错误:', error);
        res.status(500).json({
            success: false,
            error: error.message || '开始实验失败'
        });
    }
});

router.get('/:id/submissions', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        let submissions;

        if (req.user.role === 'teacher') {
            submissions = await Experiment.getExperimentSubmissions(id, req.user.id);
        } else if (req.user.role === 'student') {
            submissions = await Experiment.getStudentSubmissions(req.user.id, {
                experiment_id: id
            });
        }

        res.json({
            success: true,
            submissions: submissions,
            count: submissions.length
        });

    } catch (error) {
        console.error('获取实验提交错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验提交失败'
        });
    }
});

router.get('/:id/stats', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const experiment = await Experiment.findById(id);
        if (!experiment) {
            return res.status(404).json({
                success: false,
                error: '实验不存在'
            });
        }

        if (req.user.role === 'student' && !experiment.is_public && experiment.teacher_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此实验统计'
            });
        }

        const stats = await Experiment.getExperimentStats(id);

        res.json({
            success: true,
            stats: stats
        });

    } catch (error) {
        console.error('获取实验统计错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验统计失败'
        });
    }
});

router.get('/:id/resources', authenticate, async (req, res) => {
    try {
        const { id } = req.params;

        const experiment = await Experiment.findById(id);
        if (!experiment) {
            return res.status(404).json({
                success: false,
                error: '实验不存在'
            });
        }

        if (req.user.role === 'student' && !experiment.is_public && experiment.teacher_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限查看此实验资源'
            });
        }

        const pool = db.getPool();
        const [resources] = await pool.execute(
            `SELECT * FROM experiment_resources
             WHERE experiment_id = ? AND is_active = TRUE
             ORDER BY created_at DESC`,
            [id]
        );

        res.json({
            success: true,
            experiment: {
                id: experiment.id,
                name: experiment.experiment_name,
                code: experiment.experiment_code
            },
            resources: resources
        });

    } catch (error) {
        console.error('获取实验资源错误:', error);
        res.status(500).json({
            success: false,
            error: '获取实验资源失败'
        });
    }
});

router.post('/:id/resources', authenticate, authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, file_url, file_type, file_size } = req.body;

        if (!name || !file_url) {
            return res.status(400).json({
                success: false,
                error: '资源名称和文件URL不能为空'
            });
        }

        const experiment = await Experiment.findById(id);
        if (!experiment || experiment.teacher_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: '没有权限为此实验上传资源'
            });
        }

        const pool = db.getPool();
        const [result] = await pool.execute(
            `INSERT INTO experiment_resources
             (experiment_id, name, description, file_url, file_type, file_size, uploaded_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, name, description, file_url, file_type, file_size, req.user.id]
        );

        await pool.execute(
            `INSERT INTO system_logs (user_id, action_type, action_description)
             VALUES (?, 'upload_experiment_resource', ?)`,
            [req.user.id, `上传实验资源: ${name} (实验ID: ${id})`]
        );

        res.status(201).json({
            success: true,
            message: '实验资源上传成功',
            resourceId: result.insertId
        });

    } catch (error) {
        console.error('上传实验资源错误:', error);
        res.status(500).json({
            success: false,
            error: '上传实验资源失败'
        });
    }
});

module.exports = router;
