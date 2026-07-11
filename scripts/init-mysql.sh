#!/bin/bash
# init-mysql.sh - Initialize MySQL database with RMS schema
set -e

echo "Waiting for MySQL to be ready..."
sleep 5

echo "Creating database schema..."
mysql -u root -prms123456 rms <<'EOF'
-- Users
INSERT IGNORE INTO users (id, username, display_name, email, role_labels, password_hash, created_at) VALUES
(1, 'admin', '系统管理员', 'admin@rms.local', 'admin', '$2b$10$uGX.fzb/AuBaoF82ZMwaU.dHxuTqPlj3Kze4LtEYUPqFqHY25JBDm', NOW()),
(100009, 'kennyjin', 'KennyJin', 'kenny@rms.local', 'project_receiver,requirement_handler', '$2b$10$uGX.fzb/AuBaoF82ZMwaU.dHxuTqPlj3Kze4LtEYUPqFqHY25JBDm', NOW());

-- Projects
INSERT IGNORE INTO projects (id, name, description, created_at) VALUES
(10, 'RMS系统项目', 'RMS系统主项目', NOW());

-- System config
INSERT IGNORE INTO system_config (`key`, value, category, description, type, sort_order) VALUES
('system_name', 'RMS 需求管理系统', 'general', '系统名称', 'text', 1),
('company_name', 'My Company', 'general', '公司名称', 'text', 2),
('db_type', 'mysql', 'database', '数据库类型', 'select:sqlite|SQLite,mysql|MySQL', 10),
('mysql_host', 'mysql', 'database', 'MySQL 主机', 'text', 11),
('mysql_port', '3306', 'database', 'MySQL 端口', 'number', 12),
('mysql_user', 'rms', 'database', 'MySQL 用户名', 'text', 13),
('mysql_password', 'rms123456', 'database', 'MySQL 密码', 'password', 14),
('mysql_database', 'rms', 'database', 'MySQL 数据库名', 'text', 15),
('enable_registration', 'false', 'auth', '开放注册', 'boolean', 20),
('default_role', 'login_only', 'auth', '默认角色', 'text', 21),
('password_min_length', '6', 'auth', '密码最小长度', 'number', 22),
('session_expire_days', '7', 'auth', '会话超时天数', 'number', 23),
('req_statuses', 'received_not_evaluated,evaluated_not_scheduled,scheduled,in_progress,completed,verified,closed', 'requirement', '需求状态', 'textarea', 30),
('req_priorities', 'high,medium,low', 'requirement', '需求优先级', 'textarea', 31),
('req_categories', 'project,adhoc', 'requirement', '需求分类', 'textarea', 32),
('page_size', '20', 'display', '每页条数', 'number', 40),
('chart_default_range', '6', 'display', '图表默认范围（月）', 'number', 41),
('notification_enabled', 'true', 'notification', '启用通知', 'boolean', 50),
('email_enabled', 'false', 'notification', '启用邮件通知', 'boolean', 51),
('llm_enabled', 'false', 'llm', '启用LLM', 'boolean', 60),
('llm_api_url', 'https://api.stepfun.com/v1/chat/completions', 'llm', 'LLM API地址', 'text', 61),
('llm_model', 'step-2-16k', 'llm', 'LLM模型', 'text', 62),
('llm_max_tokens', '2048', 'llm', '最大Token数', 'number', 63),
('llm_temperature', '0.7', 'llm', 'Temperature', 'number', 64),
('openclaw_enabled', 'true', 'openclaw', '启用OpenClaw', 'boolean', 70),
('openclaw_gateway_url', 'http://openclaw:18789', 'openclaw', 'Gateway地址', 'text', 71),
('openclaw_gateway_token', '6a322a73cad83d1d3a457efe69ad0e96a2f0173eb5ae3c3d', 'openclaw', 'Gateway Token', 'password', 72),
('openclaw_default_model', 'step-3.7-flash', 'openclaw', '默认模型', 'text', 73),
('memcache_enabled', 'true', 'memcache', '启用Memcache', 'boolean', 80),
('memcache_host', 'memcached', 'memcache', 'Memcache地址', 'text', 81),
('memcache_port', '11211', 'memcache', 'Memcache端口', 'number', 82),
('memcache_ttl_days', '30', 'memcache', '会话TTL（天）', 'number', 83),
('feishu_enabled', 'false', 'feishu', '启用飞书登录', 'boolean', 90),
('dingtalk_enabled', 'false', 'dingtalk', '启用钉钉登录', 'boolean', 91),
('wecom_enabled', 'false', 'wecom', '启用企业微信', 'boolean', 92),
('sprint_active_count_limit', '3', 'sprint', '活跃Sprint限制', 'number', 100),
('default_user_capacity_hours', '8', 'sprint', '每日标准工时', 'number', 101),
('dup_similarity_threshold', '0.7', 'duplicate', '相似度阈值', 'number', 110),
('dup_check_on_create', '1', 'duplicate', '创建时检查', 'boolean', 111),
('dup_fuzz_min_len', '4', 'duplicate', '最小触发长度', 'number', 112),
('estimation_hours_per_day', '8', 'estimation', '人/天换算（小时）', 'number', 120),
('team_velocity_sp', '20', 'estimation', '团队周容量(SP)', 'number', 121);

-- SLA rules
INSERT IGNORE INTO system_config (`key`, value, category, description, type, sort_order) VALUES
('sla_rules_high', '{"approachingPct":50,"overdueGraceDays":0,"escalateAfterDays":2}', 'sla', '高优先级SLA规则', 'text', 130),
('sla_rules_medium', '{"approachingPct":70,"overdueGraceDays":1,"escalateAfterDays":3}', 'sla', '中优先级SLA规则', 'text', 131),
('sla_rules_low', '{"approachingPct":90,"overdueGraceDays":2,"escalateAfterDays":5}', 'sla', '低优先级SLA规则', 'text', 132);

-- Roles
INSERT IGNORE INTO roles (id, name, description, permissions) VALUES
(1, 'admin', '系统管理员', 'admin'),
(2, 'manager', '项目经理', 'manage'),
(3, 'user', '普通用户', 'read');

-- User roles
INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (1, 1), (100009, 1);

-- Project access
INSERT IGNORE INTO user_project_access (user_id, project_id) VALUES (1, 10), (100009, 10);

SELECT 'RMS database initialized successfully!' AS status;
EOF

echo "MySQL initialization complete!"
