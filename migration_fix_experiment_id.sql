USE fpga_teaching_system;

-- 获取外键名称
SET @fk_name = NULL;

SELECT CONSTRAINT_NAME INTO @fk_name
FROM information_schema.KEY_COLUMN_USAGE 
WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'experiment_submissions' 
  AND COLUMN_NAME = 'experiment_id' 
  AND REFERENCED_TABLE_NAME IS NOT NULL
LIMIT 1;

-- 修改字段允许 NULL
ALTER TABLE experiment_submissions 
    MODIFY COLUMN experiment_id INT NULL COMMENT '实验ID（自由采集时为NULL）';

-- 如果有外键，删除它
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE experiment_submissions DROP FOREIGN KEY ', @fk_name),
    'SELECT \"没有找到外键，跳过删除\" as info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加新的外键约束
ALTER TABLE experiment_submissions 
    ADD CONSTRAINT fk_submission_experiment
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

SELECT '迁移完成' as message;
