-- 自定义报表和Dashboard功能 - 数据库结构

-- 报表定义表
CREATE TABLE `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'custom',
  `config` text COLLATE utf8mb4_unicode_ci,
  `layout` text COLLATE utf8mb4_unicode_ci,
  `created_by` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_report_creator` (`created_by`),
  KEY `idx_report_type` (`type`),
  CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报表图表组件表
CREATE TABLE `report_widgets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `widget_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chart_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_source` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` text COLLATE utf8mb4_unicode_ci,
  `position_x` int DEFAULT 0,
  `position_y` int DEFAULT 0,
  `width` int DEFAULT 4,
  `height` int DEFAULT 3,
  `sort_order` int DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_widget_report` (`report_id`),
  KEY `idx_widget_type` (`widget_type`),
  CONSTRAINT `report_widgets_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dashboard定义表
CREATE TABLE `dashboards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_default` tinyint(1) DEFAULT 0,
  `config` text COLLATE utf8mb4_unicode_ci,
  `layout` text COLLATE utf8mb4_unicode_ci,
  `created_by` int NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dashboard_creator` (`created_by`),
  KEY `idx_dashboard_default` (`is_default`),
  CONSTRAINT `dashboards_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dashboard组件表
CREATE TABLE `dashboard_widgets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dashboard_id` int NOT NULL,
  `widget_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `chart_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_source` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` text COLLATE utf8mb4_unicode_ci,
  `position_x` int DEFAULT 0,
  `position_y` int DEFAULT 0,
  `width` int DEFAULT 4,
  `height` int DEFAULT 3,
  `sort_order` int DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_dash_widget_dashboard` (`dashboard_id`),
  KEY `idx_dash_widget_type` (`widget_type`),
  CONSTRAINT `dashboard_widgets_ibfk_1` FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 用户Dashboard关联表
CREATE TABLE `user_dashboards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `dashboard_id` int NOT NULL,
  `is_favorite` tinyint(1) DEFAULT 0,
  `sort_order` int DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_dash` (`user_id`, `dashboard_id`),
  KEY `idx_user_dash_user` (`user_id`),
  KEY `idx_user_dash_dash` (`dashboard_id`),
  CONSTRAINT `user_dashboards_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `user_dashboards_ibfk_2` FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 预定义数据源
CREATE TABLE `data_sources` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `query` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `config` text COLLATE utf8mb4_unicode_ci,
  `is_system` tinyint(1) DEFAULT 0,
  `created_by` int,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ds_type` (`type`),
  KEY `idx_ds_system` (`is_system`),
  KEY `idx_ds_creator` (`created_by`),
  CONSTRAINT `data_sources_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
