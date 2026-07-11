-- Table: access_tokens
CREATE TABLE `access_tokens` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int NOT NULL,
 `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `token_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
 `prefix` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
 `last_used_at` datetime DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_user` (`user_id`),
 KEY `idx_hash` (`token_hash`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: api_rate_limit_log
CREATE TABLE `api_rate_limit_log` (
 `id` int NOT NULL AUTO_INCREMENT,
 `token_id` int NOT NULL,
 `window_start` datetime NOT NULL,
 `request_count` int NOT NULL DEFAULT '1',
 PRIMARY KEY (`id`),
 UNIQUE KEY `token_id_window_start` (`token_id`,`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: attachments
CREATE TABLE `attachments` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `filename` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
 `filepath` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
 `filesize` int DEFAULT NULL,
 `mimetype` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `uploaded_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `uploaded_by` (`uploaded_by`),
 CONSTRAINT `attachments_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `attachments_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: audit_logs
CREATE TABLE `audit_logs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int DEFAULT NULL,
 `username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `detail` text COLLATE utf8mb4_unicode_ci,
 `ip_address` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `user_agent` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_user` (`user_id`),
 KEY `idx_action` (`action`),
 KEY `idx_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=1001012 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: comments
CREATE TABLE `comments` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `user_id` int NOT NULL,
 `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `user_id` (`user_id`),
 CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=100005 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: field_access_logs
CREATE TABLE `field_access_logs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int NOT NULL,
 `entity` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `entity_id` int NOT NULL,
 `field_name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `action` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `ip_address` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: field_visibility_policies
CREATE TABLE `field_visibility_policies` (
 `id` int NOT NULL AUTO_INCREMENT,
 `entity` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `field_name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `visible_to_roles` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `visible_to_users` text COLLATE utf8mb4_unicode_ci,
 `redact_strategy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mask',
 `description` text COLLATE utf8mb4_unicode_ci,
 `enabled` int NOT NULL DEFAULT '1',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `entity_field_name` (`entity`(191),`field_name`(191))
) ENGINE=InnoDB AUTO_INCREMENT=100372 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: instance_edges
CREATE TABLE `instance_edges` (
 `id` int NOT NULL AUTO_INCREMENT,
 `instance_id` int NOT NULL,
 `from_node` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `to_node` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `condition_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'always',
 `condition_value` text COLLATE utf8mb4_unicode_ci,
 `label` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: instance_logs
CREATE TABLE `instance_logs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `instance_id` int NOT NULL,
 `from_node` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `to_node` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `actor_id` int DEFAULT NULL,
 `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `detail` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=46 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: instance_nodes
CREATE TABLE `instance_nodes` (
 `id` int NOT NULL AUTO_INCREMENT,
 `instance_id` int NOT NULL,
 `node_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `label` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
 `assignee_id` int DEFAULT NULL,
 `auto_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `pos_x` int DEFAULT '0',
 `pos_y` int DEFAULT '0',
 `config` text COLLATE utf8mb4_unicode_ci,
 `node_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `entered_at` datetime DEFAULT NULL,
 `exited_at` datetime DEFAULT NULL,
 `comment` text COLLATE utf8mb4_unicode_ci,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: integration_configs
CREATE TABLE `integration_configs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `channel` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `webhook_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `secret` text COLLATE utf8mb4_unicode_ci,
 `enabled` int NOT NULL DEFAULT '1',
 `verification_token` text COLLATE utf8mb4_unicode_ci,
 `encrypt_key` text COLLATE utf8mb4_unicode_ci,
 `app_id` text COLLATE utf8mb4_unicode_ci,
 `app_secret` text COLLATE utf8mb4_unicode_ci,
 `project_id` int DEFAULT NULL,
 `notify_on_create` int NOT NULL DEFAULT '1',
 `notify_on_status_change` int NOT NULL DEFAULT '1',
 `notify_on_high_priority` int NOT NULL DEFAULT '1',
 `created_by` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600013 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: integration_messages
CREATE TABLE `integration_messages` (
 `id` int NOT NULL AUTO_INCREMENT,
 `channel` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `config_id` int NOT NULL,
 `external_msg_id` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `chat_id` text COLLATE utf8mb4_unicode_ci,
 `sender_id` text COLLATE utf8mb4_unicode_ci,
 `raw_payload` text COLLATE utf8mb4_unicode_ci,
 `parsed_command` text COLLATE utf8mb4_unicode_ci,
 `requirement_id` int DEFAULT NULL,
 `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'received',
 `error_message` text COLLATE utf8mb4_unicode_ci,
 `received_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `processed_at` datetime DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `channel_external_msg_id` (`channel`(191),`external_msg_id`(191))
) ENGINE=InnoDB AUTO_INCREMENT=100006 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_ai_jobs
CREATE TABLE `knowledge_ai_jobs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `trigger_status` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `llm_model` text COLLATE utf8mb4_unicode_ci,
 `prompt_tokens` int DEFAULT NULL,
 `completion_tokens` int DEFAULT NULL,
 `error_message` text COLLATE utf8mb4_unicode_ci,
 `knowledge_entry_id` int DEFAULT NULL,
 `duration_ms` int DEFAULT NULL,
 `triggered_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `finished_at` datetime DEFAULT NULL,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600007 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_entries
CREATE TABLE `knowledge_entries` (
 `id` int NOT NULL AUTO_INCREMENT,
 `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
 `type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
 `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `question` text COLLATE utf8mb4_unicode_ci,
 `answer` text COLLATE utf8mb4_unicode_ci,
 `content` text COLLATE utf8mb4_unicode_ci,
 `tags` text COLLATE utf8mb4_unicode_ci,
 `source_requirement_id` int DEFAULT NULL,
 `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'published',
 `view_count` int DEFAULT '0',
 `useful_count` int DEFAULT '0',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `source_requirement_id` (`source_requirement_id`),
 KEY `created_by` (`created_by`),
 CONSTRAINT `knowledge_entries_ibfk_1` FOREIGN KEY (`source_requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `knowledge_entries_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=100002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_feedback
CREATE TABLE `knowledge_feedback` (
 `id` int NOT NULL AUTO_INCREMENT,
 `knowledge_id` int NOT NULL,
 `user_id` int NOT NULL,
 `is_useful` tinyint(1) DEFAULT '1',
 `comment` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `knowledge_id` (`knowledge_id`),
 KEY `user_id` (`user_id`),
 CONSTRAINT `knowledge_feedback_ibfk_1` FOREIGN KEY (`knowledge_id`) REFERENCES `knowledge_entries` (`id`),
 CONSTRAINT `knowledge_feedback_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_recommendations
CREATE TABLE `knowledge_recommendations` (
 `id` int NOT NULL AUTO_INCREMENT,
 `source_type` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `source_id` int NOT NULL,
 `target_type` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `target_id` int NOT NULL,
 `score` double NOT NULL,
 `algo` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `rank_no` int NOT NULL,
 `computed_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `source_type_source_id_target_type_target_id_algo` (`source_type`(191),`source_id`,`target_type`(191),`target_id`,`algo`(50))
) ENGINE=InnoDB AUTO_INCREMENT=100004 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_relations
CREATE TABLE `knowledge_relations` (
 `id` int NOT NULL AUTO_INCREMENT,
 `source_id` int NOT NULL,
 `target_id` int NOT NULL,
 `relation_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `source_id` (`source_id`),
 KEY `target_id` (`target_id`),
 CONSTRAINT `knowledge_relations_ibfk_1` FOREIGN KEY (`source_id`) REFERENCES `knowledge_entries` (`id`),
 CONSTRAINT `knowledge_relations_ibfk_2` FOREIGN KEY (`target_id`) REFERENCES `knowledge_entries` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: knowledge_review_tasks
CREATE TABLE `knowledge_review_tasks` (
 `id` int NOT NULL AUTO_INCREMENT,
 `entry_id` int NOT NULL,
 `assigned_to` int NOT NULL,
 `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `triggered_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `due_at` datetime NOT NULL,
 `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
 `resolved_at` datetime DEFAULT NULL,
 `resolved_note` text COLLATE utf8mb4_unicode_ci,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600007 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: notifications
CREATE TABLE `notifications` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int NOT NULL,
 `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `content` text COLLATE utf8mb4_unicode_ci,
 `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `is_read` tinyint(1) DEFAULT '0',
 `link` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `user_id` (`user_id`),
 CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600207 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: project_budget_alerts
CREATE TABLE `project_budget_alerts` (
 `id` int NOT NULL AUTO_INCREMENT,
 `project_id` int NOT NULL,
 `threshold` int NOT NULL,
 `triggered_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `triggered_cost` double NOT NULL,
 `triggered_budget` double NOT NULL,
 `triggered_ratio` double NOT NULL,
 `notified_user_ids` text COLLATE utf8mb4_unicode_ci,
 `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sent',
 `acknowledged_by` int DEFAULT NULL,
 `acknowledged_at` datetime DEFAULT NULL,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600013 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: project_costs
CREATE TABLE `project_costs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `project_id` int NOT NULL,
 `category` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `amount` double NOT NULL,
 `occurred_on` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `vendor` text COLLATE utf8mb4_unicode_ci,
 `requirement_id` int DEFAULT NULL,
 `attachment_id` int DEFAULT NULL,
 `created_by` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600019 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: project_milestones
CREATE TABLE `project_milestones` (
 `id` int NOT NULL AUTO_INCREMENT,
 `project_id` int NOT NULL,
 `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `planned_date` date NOT NULL,
 `actual_date` date DEFAULT NULL,
 `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `weight` int DEFAULT '1',
 `sort_order` int DEFAULT '0',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_milestone_project` (`project_id`),
 KEY `idx_milestone_status` (`status`),
 KEY `idx_milestone_date` (`planned_date`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: project_risks
CREATE TABLE `project_risks` (
 `id` int NOT NULL AUTO_INCREMENT,
 `project_id` int NOT NULL,
 `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `type` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'technical',
 `level` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
 `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'open',
 `strategy` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'mitigate',
 `owner_id` int DEFAULT NULL,
 `impact` text COLLATE utf8mb4_unicode_ci,
 `mitigation_plan` text COLLATE utf8mb4_unicode_ci,
 `resolved_note` text COLLATE utf8mb4_unicode_ci,
 `resolved_at` datetime DEFAULT NULL,
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_risk_project` (`project_id`),
 KEY `idx_risk_status` (`status`),
 KEY `idx_risk_level` (`level`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: projects
CREATE TABLE `projects` (
 `id` int NOT NULL AUTO_INCREMENT,
 `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `health_score` int DEFAULT NULL,
 `health_level` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `health_updated_at` datetime DEFAULT NULL,
 `budget` double DEFAULT '0',
 `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'CNY',
 `cost_center` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `budget_period` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'total',
 `alert_threshold_80` tinyint NOT NULL DEFAULT '1',
 `alert_threshold_100` tinyint NOT NULL DEFAULT '1',
 PRIMARY KEY (`id`),
 KEY `created_by` (`created_by`),
 CONSTRAINT `projects_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_acceptance_criteria
CREATE TABLE `requirement_acceptance_criteria` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `sequence` int NOT NULL DEFAULT '0',
 `criterion_text` text NOT NULL,
 `acceptance_type` varchar(20) NOT NULL DEFAULT 'manual',
 `target_value` varchar(100) DEFAULT NULL,
 `is_required` tinyint NOT NULL DEFAULT '1',
 `status` varchar(20) NOT NULL DEFAULT 'pending',
 `evidence` text,
 `verified_by` int DEFAULT NULL,
 `verified_at` datetime DEFAULT NULL,
 `created_by` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_ac_requirement` (`requirement_id`),
 KEY `idx_ac_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci 
;
-- Table: requirement_attachments
CREATE TABLE `requirement_attachments` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `user_id` int NOT NULL,
 `file_name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `file_path` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `file_size` int DEFAULT '0',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `user_id` (`user_id`),
 CONSTRAINT `requirement_attachments_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_attachments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_checklist
CREATE TABLE `requirement_checklist` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `title` text NOT NULL,
 `description` text,
 `sequence` int NOT NULL DEFAULT '0',
 `assignee_id` int DEFAULT NULL,
 `due_date` date DEFAULT NULL,
 `status` varchar(20) NOT NULL DEFAULT 'todo',
 `priority` varchar(20) DEFAULT 'medium',
 `estimate_hours` double DEFAULT NULL,
 `actual_hours` double DEFAULT NULL,
 `blocked_reason` text,
 `completed_at` datetime DEFAULT NULL,
 `completed_by` int DEFAULT NULL,
 `created_by` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_checklist_requirement` (`requirement_id`),
 KEY `idx_checklist_assignee` (`assignee_id`),
 KEY `idx_checklist_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci 
;
-- Table: requirement_comments
CREATE TABLE `requirement_comments` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `user_id` int NOT NULL,
 `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `user_id` (`user_id`),
 CONSTRAINT `requirement_comments_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_comments_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_import_rows
CREATE TABLE `requirement_import_rows` (
 `id` int NOT NULL AUTO_INCREMENT,
 `import_id` int NOT NULL,
 `row_no` int NOT NULL,
 `raw_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `normalized_json` text COLLATE utf8mb4_unicode_ci,
 `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `requirement_id` int DEFAULT NULL,
 `error_message` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_rir_import` (`import_id`,`status`),
 CONSTRAINT `rir_import_fk` FOREIGN KEY (`import_id`) REFERENCES `requirement_imports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=600121 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_imports
CREATE TABLE `requirement_imports` (
 `id` int NOT NULL AUTO_INCREMENT,
 `filename` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
 `file_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
 `total_rows` int NOT NULL DEFAULT '0',
 `success_count` int NOT NULL DEFAULT '0',
 `failed_count` int NOT NULL DEFAULT '0',
 `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `error_report_path` text COLLATE utf8mb4_unicode_ci,
 `mapping_json` text COLLATE utf8mb4_unicode_ci,
 `created_by` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `finished_at` datetime DEFAULT NULL,
 PRIMARY KEY (`id`),
 KEY `idx_ri_status` (`status`),
 KEY `idx_ri_user` (`created_by`),
 KEY `idx_ri_hash` (`file_hash`,`created_by`)
) ENGINE=InnoDB AUTO_INCREMENT=600031 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_relations
CREATE TABLE `requirement_relations` (
 `id` int NOT NULL AUTO_INCREMENT,
 `source_id` int NOT NULL,
 `target_id` int NOT NULL,
 `relation_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `source_id` (`source_id`),
 KEY `target_id` (`target_id`),
 CONSTRAINT `requirement_relations_ibfk_1` FOREIGN KEY (`source_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_relations_ibfk_2` FOREIGN KEY (`target_id`) REFERENCES `requirements` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=500008 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_sprints
CREATE TABLE `requirement_sprints` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `sprint_id` int NOT NULL,
 `assigned_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uniq_req` (`requirement_id`),
 KEY `idx_req_sprint_sprint` (`sprint_id`),
 KEY `idx_req_sprint_req` (`requirement_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_tags
CREATE TABLE `requirement_tags` (
 `requirement_id` int NOT NULL,
 `tag_id` int NOT NULL,
 PRIMARY KEY (`requirement_id`,`tag_id`),
 KEY `tag_id` (`tag_id`),
 CONSTRAINT `requirement_tags_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_tags_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_templates
CREATE TABLE `requirement_templates` (
 `id` int NOT NULL AUTO_INCREMENT,
 `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `title_template` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `description_template` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
 `business_unit` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
 `priority` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
 `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'project',
 `benefit_template` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `created_by` (`created_by`),
 CONSTRAINT `requirement_templates_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_timeline
CREATE TABLE `requirement_timeline` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'description',
 `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `created_by` (`created_by`),
 CONSTRAINT `requirement_timeline_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_timeline_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirement_versions
CREATE TABLE `requirement_versions` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `version` int DEFAULT '1',
 `title` text COLLATE utf8mb4_unicode_ci,
 `description` text COLLATE utf8mb4_unicode_ci,
 `business_unit` text COLLATE utf8mb4_unicode_ci,
 `priority` text COLLATE utf8mb4_unicode_ci,
 `status` text COLLATE utf8mb4_unicode_ci,
 `handler_id` int DEFAULT NULL,
 `verifier_id` int DEFAULT NULL,
 `change_summary` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT '',
 `changed_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `changed_by` (`changed_by`),
 CONSTRAINT `requirement_versions_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirement_versions_ibfk_2` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: requirements
CREATE TABLE `requirements` (
 `id` int NOT NULL AUTO_INCREMENT,
 `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `business_unit` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `priority` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
 `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'received_not_evaluated',
 `category` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'project',
 `project_id` int DEFAULT NULL,
 `parent_id` int DEFAULT NULL,
 `requester_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `receiver_id` int DEFAULT NULL,
 `handler_id` int DEFAULT NULL,
 `verifier_id` int DEFAULT NULL,
 `benefit` text COLLATE utf8mb4_unicode_ci,
 `planned_start` date DEFAULT NULL,
 `planned_end` date DEFAULT NULL,
 `actual_end` date DEFAULT NULL,
 `solution` text COLLATE utf8mb4_unicode_ci,
 `lessons_learned` text COLLATE utf8mb4_unicode_ci,
 `root_cause` text COLLATE utf8mb4_unicode_ci,
 `resolution_time_hours` double DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `story_points` int DEFAULT NULL,
 `estimate_hours` double DEFAULT NULL,
 `actual_hours` double DEFAULT NULL,
 `merged_into` int DEFAULT NULL,
 `merged_at` datetime DEFAULT NULL,
 `sprint_id` int DEFAULT NULL,
 `estimated_hours` double DEFAULT '0',
 `priority_rank` tinyint NOT NULL DEFAULT '3',
 PRIMARY KEY (`id`),
 KEY `project_id` (`project_id`),
 KEY `parent_id` (`parent_id`),
 KEY `receiver_id` (`receiver_id`),
 KEY `handler_id` (`handler_id`),
 KEY `verifier_id` (`verifier_id`),
 KEY `idx_requirements_story_points` (`story_points`),
 KEY `idx_requirements_merged` (`merged_into`),
 KEY `idx_req_sprint` (`sprint_id`),
 KEY `idx_req_status_pri_updated` (`status`,`priority_rank`,`updated_at`),
 KEY `idx_req_business_unit` (`business_unit`),
 KEY `idx_req_category` (`category`),
 KEY `idx_req_created_at` (`created_at`),
 KEY `idx_req_sprint_status` (`sprint_id`,`status`),
 CONSTRAINT `requirements_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`),
 CONSTRAINT `requirements_ibfk_2` FOREIGN KEY (`parent_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `requirements_ibfk_3` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`),
 CONSTRAINT `requirements_ibfk_4` FOREIGN KEY (`handler_id`) REFERENCES `users` (`id`),
 CONSTRAINT `requirements_ibfk_5` FOREIGN KEY (`verifier_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600241 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: role_project_access
CREATE TABLE `role_project_access` (
 `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `project_id` int NOT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`role_name`,`project_id`),
 KEY `project_id` (`project_id`),
 CONSTRAINT `role_project_access_ibfk_1` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: roles
CREATE TABLE `roles` (
 `id` int NOT NULL AUTO_INCREMENT,
 `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: sla_warnings
CREATE TABLE `sla_warnings` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `warning_type` varchar(20) NOT NULL,
 `warning_level` int NOT NULL,
 `planned_end` datetime NOT NULL,
 `days_diff` double NOT NULL,
 `notified_user_ids` text NOT NULL,
 `acknowledged_by` int DEFAULT NULL,
 `acknowledged_at` datetime DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_sla_warnings_req` (`requirement_id`),
 KEY `idx_sla_warnings_type_level` (`warning_type`,`warning_level`),
 KEY `idx_sla_warnings_unack` (`acknowledged_at`)
) ENGINE=InnoDB AUTO_INCREMENT=600067 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci 
;
-- Table: sprints
CREATE TABLE `sprints` (
 `id` int NOT NULL AUTO_INCREMENT,
 `project_id` int NOT NULL,
 `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `goal` text COLLATE utf8mb4_unicode_ci,
 `start_date` date NOT NULL,
 `end_date` date NOT NULL,
 `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
 `capacity_hours` double DEFAULT '0',
 `notes` text COLLATE utf8mb4_unicode_ci,
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_sprints_project` (`project_id`),
 KEY `idx_sprints_status` (`status`),
 KEY `idx_sprints_date` (`start_date`,`end_date`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: status_log
CREATE TABLE `status_log` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `old_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `new_status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `changed_by` int DEFAULT NULL,
 `changed_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `requirement_id` (`requirement_id`),
 KEY `changed_by` (`changed_by`),
 CONSTRAINT `status_log_ibfk_1` FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`),
 CONSTRAINT `status_log_ibfk_2` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600254 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: system_config
CREATE TABLE `system_config` (
 `key` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `value` text COLLATE utf8mb4_unicode_ci,
 `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `label` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT '',
 `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
 `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'text',
 `sort_order` int DEFAULT '0',
 PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: tags
CREATE TABLE `tags` (
 `id` int NOT NULL AUTO_INCREMENT,
 `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#6B7280',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=100046 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: user_openclaw_sessions
CREATE TABLE `user_openclaw_sessions` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int NOT NULL,
 `session_key` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `agent_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `workspace_dir` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
 `enabled` int DEFAULT '1',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `user_id` (`user_id`),
 CONSTRAINT `user_openclaw_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=100002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: user_project_access
CREATE TABLE `user_project_access` (
 `user_id` int NOT NULL,
 `project_id` int NOT NULL,
 `role_in_project` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'viewer',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`user_id`,`project_id`),
 KEY `project_id` (`project_id`),
 CONSTRAINT `user_project_access_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
 CONSTRAINT `user_project_access_ibfk_2` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: user_roles
CREATE TABLE `user_roles` (
 `user_id` int NOT NULL,
 `role_id` int NOT NULL,
 PRIMARY KEY (`user_id`,`role_id`),
 KEY `role_id` (`role_id`),
 CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
 CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: users
CREATE TABLE `users` (
 `id` int NOT NULL AUTO_INCREMENT,
 `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
 `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
 `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `avatar` text COLLATE utf8mb4_unicode_ci,
 `auth_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'local',
 `external_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `theme` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'system' COMMENT 'light/dark/system',
 PRIMARY KEY (`id`),
 UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=100010 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: webhook_deliveries
CREATE TABLE `webhook_deliveries` (
 `id` int NOT NULL AUTO_INCREMENT,
 `subscription_id` int NOT NULL,
 `event_id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
 `event_type` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `payload` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `attempt` int NOT NULL DEFAULT '1',
 `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
 `response_status` int DEFAULT NULL,
 `response_body` text COLLATE utf8mb4_unicode_ci,
 `error_message` text COLLATE utf8mb4_unicode_ci,
 `duration_ms` int DEFAULT NULL,
 `scheduled_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `delivered_at` datetime DEFAULT NULL,
 `next_retry_at` datetime DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `event_id` (`event_id`)
) ENGINE=InnoDB AUTO_INCREMENT=100002 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: webhook_subscriptions
CREATE TABLE `webhook_subscriptions` (
 `id` int NOT NULL AUTO_INCREMENT,
 `owner_user_id` int NOT NULL,
 `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `target_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `secret` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `events` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `enabled` int NOT NULL DEFAULT '1',
 `filter_project_id` int DEFAULT NULL,
 `filter_priority` text COLLATE utf8mb4_unicode_ci,
 `last_triggered_at` datetime DEFAULT NULL,
 `last_status_code` int DEFAULT NULL,
 `last_error` text COLLATE utf8mb4_unicode_ci,
 `consecutive_failures` int NOT NULL DEFAULT '0',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600007 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: weekly_report_subscriptions
CREATE TABLE `weekly_report_subscriptions` (
 `id` int NOT NULL AUTO_INCREMENT,
 `user_id` int NOT NULL,
 `scope` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `project_id` int DEFAULT NULL,
 `delivery_channel` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'download',
 `day_of_week` int NOT NULL DEFAULT '1',
 `hour` int NOT NULL DEFAULT '9',
 `enabled` int NOT NULL DEFAULT '1',
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: weekly_reports
CREATE TABLE `weekly_reports` (
 `id` int NOT NULL AUTO_INCREMENT,
 `week_start` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `week_end` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `generated_by` int DEFAULT NULL,
 `user_id` int NOT NULL,
 `scope` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `project_id` int DEFAULT NULL,
 `file_path` text COLLATE utf8mb4_unicode_ci NOT NULL,
 `file_size` int DEFAULT NULL,
 `page_count` int DEFAULT NULL,
 `summary_json` text COLLATE utf8mb4_unicode_ci,
 `generated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=600045 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: work_logs
CREATE TABLE `work_logs` (
 `id` int NOT NULL AUTO_INCREMENT,
 `requirement_id` int NOT NULL,
 `user_id` int NOT NULL,
 `work_date` date NOT NULL,
 `hours` double NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `sprint_id` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 KEY `idx_wlog_req` (`requirement_id`),
 KEY `idx_wlog_user` (`user_id`),
 KEY `idx_wlog_date` (`work_date`),
 KEY `idx_wlog_sprint` (`sprint_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: workflow_edges
CREATE TABLE `workflow_edges` (
 `id` int NOT NULL AUTO_INCREMENT,
 `workflow_id` int NOT NULL,
 `from_node` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `to_node` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `condition_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'always',
 `condition_value` text COLLATE utf8mb4_unicode_ci,
 `label` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 PRIMARY KEY (`id`),
 KEY `idx_wf` (`workflow_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: workflow_instances
CREATE TABLE `workflow_instances` (
 `id` int NOT NULL AUTO_INCREMENT,
 `workflow_id` int NOT NULL,
 `workflow_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `requirement_id` int NOT NULL,
 `current_node_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running',
 `started_by` int NOT NULL,
 `started_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `ended_at` datetime DEFAULT NULL,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: workflow_nodes
CREATE TABLE `workflow_nodes` (
 `id` int NOT NULL AUTO_INCREMENT,
 `workflow_id` int NOT NULL,
 `node_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
 `label` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
 `assignee_id` int DEFAULT NULL,
 `auto_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 `pos_x` int DEFAULT '0',
 `pos_y` int DEFAULT '0',
 `config` text COLLATE utf8mb4_unicode_ci,
 PRIMARY KEY (`id`),
 KEY `idx_wf` (`workflow_id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
-- Table: workflows
CREATE TABLE `workflows` (
 `id` int NOT NULL AUTO_INCREMENT,
 `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
 `description` text COLLATE utf8mb4_unicode_ci,
 `is_default` tinyint DEFAULT '0',
 `created_by` int DEFAULT NULL,
 `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
 `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
;
