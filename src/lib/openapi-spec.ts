// 自动生成于 2026-09-02T07:06:05.642Z
// 运行 `node scripts/generate-openapi.mjs` 重新生成
export const OPENAPI_SPEC: any = {
  "openapi": "3.1.0",
  "info": {
    "title": "RMS API v1",
    "version": "1.0.0",
    "description": "用户需求管理系统 REST API · 自动生成",
    "contact": {
      "name": "RMS Team"
    }
  },
  "servers": [
    {
      "url": "/api",
      "description": "当前服务器"
    }
  ],
  "components": {
    "securitySchemes": {
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "description": "JWT Token（登录后自动设置）"
      },
      "apiKey": {
        "type": "apiKey",
        "in": "header",
        "name": "Authorization",
        "description": "Bearer <token> 或 Access Token 直接作为 Bearer"
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string",
            "description": "错误信息"
          }
        }
      },
      "Pagination": {
        "type": "object",
        "properties": {
          "page": {
            "type": "integer"
          },
          "pageSize": {
            "type": "integer"
          },
          "total": {
            "type": "integer"
          }
        }
      }
    }
  },
  "security": [
    {
      "bearerAuth": []
    }
  ],
  "paths": {
    "/acceptance-criteria": {
      "get": {
        "summary": "获取验收标准",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建验收标准",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/acceptance-criteria/{id}": {
      "put": {
        "summary": "更新验收标准",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除验收标准",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "patch": {
        "summary": "PATCH /acceptance-criteria/[id]",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/acceptance-criteria/reorder": {
      "post": {
        "summary": "重新排序验收标准",
        "tags": [
          "acceptance-criteria"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/config": {
      "get": {
        "summary": "管理员：获取配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "管理员：更新配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/dedup/merge": {
      "post": {
        "summary": "合并重复需求",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/dedup/scan": {
      "post": {
        "summary": "扫描重复需求",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /admin/dedup/scan",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/dedup/split": {
      "post": {
        "summary": "拆分需求",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/field-policies": {
      "get": {
        "summary": "列出字段权限策略",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建策略",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/field-policies/{id}": {
      "put": {
        "summary": "更新策略",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除策略",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/integrations": {
      "get": {
        "summary": "管理员：列出集成配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "管理员：创建集成配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/integrations/{id}": {
      "patch": {
        "summary": "管理员：更新集成配置",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "管理员：删除集成配置",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/integrations/{id}/test": {
      "post": {
        "summary": "测试集成配置",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/integrations/messages": {
      "get": {
        "summary": "获取集成消息列表",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "config_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "集成配置 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "消息状态"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/integrations/skill-download": {
      "post": {
        "summary": "下载 MCP Skill",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /admin/integrations/skill-download",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/menu-permissions": {
      "get": {
        "summary": "获取菜单权限配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "更新菜单权限配置",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/migrations/verify": {
      "get": {
        "summary": "验证数据库迁移状态",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/admin/users": {
      "get": {
        "summary": "管理员：列出用户",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "管理员：创建用户",
        "tags": [
          "admin"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/admin/webhook-worker": {
      "get": {
        "summary": "获取 Webhook Worker 状态",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "是否运行中"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "触发手动投递",
        "tags": [
          "admin"
        ],
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "是否运行中"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/asr": {
      "post": {
        "summary": "语音识别",
        "tags": [
          "asr"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /asr",
        "tags": [
          "asr"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/attachments": {
      "post": {
        "summary": "上传附件",
        "tags": [
          "attachments"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /attachments",
        "tags": [
          "attachments"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "delete": {
        "summary": "DELETE /attachments",
        "tags": [
          "attachments"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/audit-logs": {
      "get": {
        "summary": "获取审计日志",
        "tags": [
          "audit-logs"
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "用户 ID"
          },
          {
            "name": "action",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "操作类型"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 50
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/dingtalk": {
      "get": {
        "summary": "GET /auth/dingtalk",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/dingtalk/callback": {
      "get": {
        "summary": "GET /auth/dingtalk/callback",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/feishu": {
      "get": {
        "summary": "GET /auth/feishu",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/feishu/callback": {
      "get": {
        "summary": "GET /auth/feishu/callback",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/login": {
      "post": {
        "summary": "用户登录",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/auth/logout": {
      "post": {
        "summary": "用户登出",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/auth/me": {
      "get": {
        "summary": "获取当前登录用户",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "delete": {
        "summary": "DELETE /auth/me",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/register": {
      "post": {
        "summary": "用户注册",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/auth/tokens": {
      "get": {
        "summary": "列出 API Token",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建 Token",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除 Token",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/wecom": {
      "get": {
        "summary": "GET /auth/wecom",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/auth/wecom/callback": {
      "get": {
        "summary": "GET /auth/wecom/callback",
        "tags": [
          "auth"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/calendar": {
      "get": {
        "summary": "获取日历数据",
        "tags": [
          "calendar"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/chat": {
      "post": {
        "summary": "发送聊天消息",
        "tags": [
          "chat"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/conversations": {
      "get": {
        "summary": "列出对话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建对话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/conversations/{id}": {
      "get": {
        "summary": "获取对话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "delete": {
        "summary": "删除对话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/chat/conversations/{id}/messages": {
      "get": {
        "summary": "获取对话消息",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 50
            },
            "description": "返回条数"
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "description": "早于该时间"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "发送消息",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 50
            },
            "description": "返回条数"
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "description": "早于该时间"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/llm": {
      "post": {
        "summary": "LLM 对话（RMS Agent）",
        "tags": [
          "chat"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/sessions": {
      "get": {
        "summary": "列出会话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建会话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/sessions/{id}": {
      "get": {
        "summary": "获取会话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "delete": {
        "summary": "删除会话",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "PUT /chat/sessions/[id]",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/chat/sessions/{id}/messages": {
      "get": {
        "summary": "获取会话消息",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 50
            },
            "description": "返回条数"
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "description": "早于该时间"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /chat/sessions/[id]/messages",
        "tags": [
          "chat"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 50
            },
            "description": "返回条数"
          },
          {
            "name": "before",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date-time"
            },
            "description": "早于该时间"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/checklist": {
      "get": {
        "summary": "获取检查清单",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "pending",
                "completed"
              ]
            },
            "description": "状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建检查项",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "pending",
                "completed"
              ]
            },
            "description": "状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/checklist/{id}": {
      "get": {
        "summary": "获取检查项详情",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新检查项",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除检查项",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "patch": {
        "summary": "PATCH /checklist/[id]",
        "tags": [
          "checklist"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/checklist/my": {
      "get": {
        "summary": "获取我的检查项",
        "tags": [
          "checklist"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/checklist/reorder": {
      "post": {
        "summary": "POST /checklist/reorder",
        "tags": [
          "checklist"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/config": {
      "get": {
        "summary": "获取系统配置",
        "tags": [
          "config"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新系统配置",
        "tags": [
          "config"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/custom-reports": {
      "get": {
        "summary": "列出自定义报表",
        "tags": [
          "custom-reports"
        ],
        "parameters": [
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "report",
                "dashboard"
              ]
            },
            "description": "类型"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建报表",
        "tags": [
          "custom-reports"
        ],
        "parameters": [
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "report",
                "dashboard"
              ]
            },
            "description": "类型"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/custom-reports/{id}": {
      "get": {
        "summary": "获取报表详情",
        "tags": [
          "custom-reports"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新报表",
        "tags": [
          "custom-reports"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除报表",
        "tags": [
          "custom-reports"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/dashboard": {
      "get": {
        "summary": "获取仪表盘数据",
        "tags": [
          "dashboard"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/dashboard-widgets": {
      "get": {
        "summary": "获取仪表盘组件",
        "tags": [
          "dashboard-widgets"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加组件",
        "tags": [
          "dashboard-widgets"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/dashboard/workload": {
      "get": {
        "summary": "GET /dashboard/workload",
        "tags": [
          "dashboard"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/data-sources": {
      "get": {
        "summary": "列出数据源",
        "tags": [
          "data-sources"
        ],
        "parameters": [
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "mysql",
                "sqlite",
                "api"
              ]
            },
            "description": "数据源类型"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建数据源",
        "tags": [
          "data-sources"
        ],
        "parameters": [
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "mysql",
                "sqlite",
                "api"
              ]
            },
            "description": "数据源类型"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/data-sources/{id}": {
      "get": {
        "summary": "获取数据源详情",
        "tags": [
          "data-sources"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新数据源",
        "tags": [
          "data-sources"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除数据源",
        "tags": [
          "data-sources"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/data-sources/query": {
      "post": {
        "summary": "执行数据源查询",
        "tags": [
          "data-sources"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/data-sources/schema": {
      "get": {
        "summary": "获取数据源 schema",
        "tags": [
          "data-sources"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/data-sources/tables": {
      "get": {
        "summary": "获取数据源表列表",
        "tags": [
          "data-sources"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/database": {
      "get": {
        "summary": "获取数据库状态",
        "tags": [
          "database"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "执行数据库操作",
        "tags": [
          "database"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/db-explorer": {
      "get": {
        "summary": "获取数据库探索数据",
        "tags": [
          "db-explorer"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "执行 SQL 查询",
        "tags": [
          "db-explorer"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/dedup/check": {
      "post": {
        "summary": "检查重复需求",
        "tags": [
          "dedup"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /dedup/check",
        "tags": [
          "dedup"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/health": {
      "get": {
        "summary": "健康检查",
        "tags": [
          "health"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/i18n/locale": {
      "get": {
        "summary": "获取当前语言",
        "tags": [
          "i18n"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "切换语言",
        "tags": [
          "i18n"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/integrations/feishu/callback": {
      "post": {
        "summary": "飞书事件回调",
        "tags": [
          "integrations"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge": {
      "get": {
        "summary": "列出知识条目",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "category_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "分类 ID"
          },
          {
            "name": "tag",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "标签筛选"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建知识",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "category_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "分类 ID"
          },
          {
            "name": "tag",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "标签筛选"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/{id}": {
      "get": {
        "summary": "获取知识详情",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新知识",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除知识",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/{id}/feedback": {
      "post": {
        "summary": "提交知识反馈",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/{id}/related-requirements": {
      "get": {
        "summary": "获取关联需求",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/{id}/review": {
      "post": {
        "summary": "提交知识审核",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/{id}/versions": {
      "get": {
        "summary": "获取知识版本历史",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/{id}/versions/{version}": {
      "get": {
        "summary": "GET /knowledge/[id]/versions/[version]",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "version",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "version ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /knowledge/[id]/versions/[version]",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "version",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "version ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/capture-tasks": {
      "get": {
        "summary": "获取沉淀待办",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建沉淀任务",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/categories": {
      "get": {
        "summary": "获取知识分类",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建分类",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/categories/{id}": {
      "put": {
        "summary": "更新分类",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除分类",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/categories/{id}/acl": {
      "get": {
        "summary": "获取分类权限",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "设置分类权限",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /knowledge/categories/[id]/acl",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/generate": {
      "post": {
        "summary": "AI 生成知识条目",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/graph": {
      "get": {
        "summary": "获取知识图谱数据",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/knowledge/review-tasks": {
      "get": {
        "summary": "获取审核任务",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建审核任务",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/review-tasks/{id}": {
      "patch": {
        "summary": "PATCH /knowledge/review-tasks/[id]",
        "tags": [
          "knowledge"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/scan-stale": {
      "post": {
        "summary": "扫描失效知识",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/knowledge/stats": {
      "get": {
        "summary": "获取知识统计",
        "tags": [
          "knowledge"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/notifications": {
      "get": {
        "summary": "获取通知列表",
        "tags": [
          "notifications"
        ],
        "parameters": [
          {
            "name": "unread",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "仅未读"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建通知",
        "tags": [
          "notifications"
        ],
        "parameters": [
          {
            "name": "unread",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "仅未读"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "标记已读",
        "tags": [
          "notifications"
        ],
        "parameters": [
          {
            "name": "unread",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "仅未读"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除通知",
        "tags": [
          "notifications"
        ],
        "parameters": [
          {
            "name": "unread",
            "in": "query",
            "schema": {
              "type": "boolean"
            },
            "description": "仅未读"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/openclaw": {
      "post": {
        "summary": "OpenClaw Agent 对话",
        "tags": [
          "openclaw"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /openclaw",
        "tags": [
          "openclaw"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/openclaw/models": {
      "get": {
        "summary": "获取可用模型列表",
        "tags": [
          "openclaw"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /openclaw/models",
        "tags": [
          "openclaw"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects": {
      "get": {
        "summary": "列出项目",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建项目",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /projects",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /projects",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/projects/{id}": {
      "get": {
        "summary": "获取项目详情",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新项目",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除项目",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/projects/{id}/budget": {
      "get": {
        "summary": "获取项目预算",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "设置预算",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "patch": {
        "summary": "PATCH /projects/[id]/budget",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/budget-summary": {
      "get": {
        "summary": "GET /projects/[id]/budget-summary",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/projects/{id}/costs": {
      "get": {
        "summary": "获取项目成本",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "记录成本",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/health": {
      "get": {
        "summary": "获取项目健康检查",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /projects/[id]/health",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/milestones": {
      "get": {
        "summary": "获取项目里程碑",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建里程碑",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/milestones/{mid}": {
      "put": {
        "summary": "PUT /projects/[id]/milestones/[mid]",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "mid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "mid ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /projects/[id]/milestones/[mid]",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "mid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "mid ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/projects/{id}/milestones/{mid}/achieve": {
      "post": {
        "summary": "POST /projects/[id]/milestones/[mid]/achieve",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "mid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "mid ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/risks": {
      "get": {
        "summary": "获取项目风险",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建风险",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/projects/{id}/risks/{rid}": {
      "put": {
        "summary": "PUT /projects/[id]/risks/[rid]",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "rid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "rid ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /projects/[id]/risks/[rid]",
        "tags": [
          "projects"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "rid",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "rid ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/reports/weekly": {
      "get": {
        "summary": "获取周报",
        "tags": [
          "reports"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "生成周报",
        "tags": [
          "reports"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/reports/weekly/history": {
      "get": {
        "summary": "获取周报历史",
        "tags": [
          "reports"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirement-relations": {
      "get": {
        "summary": "获取需求关系",
        "tags": [
          "requirement-relations"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建需求关系",
        "tags": [
          "requirement-relations"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirement-relations/{id}": {
      "delete": {
        "summary": "删除需求关系",
        "tags": [
          "requirement-relations"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements": {
      "get": {
        "summary": "列出需求（支持分页、筛选、排序）",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "状态筛选"
          },
          {
            "name": "priority",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "high",
                "medium",
                "low"
              ]
            },
            "description": "优先级筛选"
          },
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          },
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建新需求",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "状态筛选"
          },
          {
            "name": "priority",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "high",
                "medium",
                "low"
              ]
            },
            "description": "优先级筛选"
          },
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          },
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/{id}": {
      "get": {
        "summary": "获取需求详情",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新需求",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除需求",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements/{id}/acceptance-criteria": {
      "get": {
        "summary": "获取验收标准",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加验收标准",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/{id}/checklist": {
      "get": {
        "summary": "获取需求检查清单",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加检查项",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/{id}/comments": {
      "get": {
        "summary": "获取需求评论",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加评论",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /requirements/[id]/comments",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements/{id}/recommendations": {
      "get": {
        "summary": "获取知识推荐",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements/{id}/status": {
      "patch": {
        "summary": "更新需求状态",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "post": {
        "summary": "POST /requirements/[id]/status",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/{id}/versions": {
      "get": {
        "summary": "获取需求版本历史",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /requirements/[id]/versions",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/{id}/work-logs": {
      "get": {
        "summary": "获取需求工时记录",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加工时记录",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/batch": {
      "post": {
        "summary": "批量操作需求",
        "tags": [
          "requirements"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/export": {
      "get": {
        "summary": "导出需求（CSV）",
        "tags": [
          "requirements"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /requirements/export",
        "tags": [
          "requirements"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/requirements/import": {
      "post": {
        "summary": "导入需求（Excel）",
        "tags": [
          "requirements"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /requirements/import",
        "tags": [
          "requirements"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements/import/{id}": {
      "get": {
        "summary": "GET /requirements/import/[id]",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/requirements/import/{id}/report": {
      "get": {
        "summary": "GET /requirements/import/[id]/report",
        "tags": [
          "requirements"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/roles": {
      "get": {
        "summary": "列出角色",
        "tags": [
          "roles"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建角色",
        "tags": [
          "roles"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /roles",
        "tags": [
          "roles"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/search": {
      "get": {
        "summary": "全局搜索",
        "tags": [
          "search"
        ],
        "parameters": [
          {
            "name": "keyword",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "required": true,
            "description": "搜索关键词"
          },
          {
            "name": "type",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "requirement",
                "project",
                "knowledge"
              ]
            },
            "description": "搜索类型"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/search/suggest": {
      "get": {
        "summary": "搜索建议",
        "tags": [
          "search"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sla/dashboard": {
      "get": {
        "summary": "获取 SLA 看板",
        "tags": [
          "sla"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sla/scan": {
      "post": {
        "summary": "手动触发 SLA 扫描",
        "tags": [
          "sla"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /sla/scan",
        "tags": [
          "sla"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sla/warnings": {
      "get": {
        "summary": "获取 SLA 预警列表",
        "tags": [
          "sla"
        ],
        "parameters": [
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "active",
                "acknowledged",
                "resolved"
              ]
            },
            "description": "预警状态"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sla/warnings/{id}/ack": {
      "post": {
        "summary": "确认 SLA 预警",
        "tags": [
          "sla"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/sprints": {
      "get": {
        "summary": "列出迭代",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "planning",
                "active",
                "completed"
              ]
            },
            "description": "迭代状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建迭代",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "planning",
                "active",
                "completed"
              ]
            },
            "description": "迭代状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/sprints/{id}": {
      "get": {
        "summary": "获取迭代详情",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新迭代",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /sprints/[id]",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sprints/{id}/burndown": {
      "get": {
        "summary": "获取燃尽图数据",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sprints/{id}/complete": {
      "post": {
        "summary": "POST /sprints/[id]/complete",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/sprints/{id}/requirements": {
      "get": {
        "summary": "获取迭代需求",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "需求状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "添加需求到迭代",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "需求状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /sprints/[id]/requirements",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "需求状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/sprints/{id}/start": {
      "post": {
        "summary": "POST /sprints/[id]/start",
        "tags": [
          "sprints"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/tags": {
      "get": {
        "summary": "列出所有标签",
        "tags": [
          "tags"
        ],
        "parameters": [
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建标签",
        "tags": [
          "tags"
        ],
        "parameters": [
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/tasks/recent": {
      "get": {
        "summary": "GET /tasks/recent",
        "tags": [
          "tasks"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/templates": {
      "get": {
        "summary": "获取模板列表",
        "tags": [
          "templates"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建模板",
        "tags": [
          "templates"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /templates",
        "tags": [
          "templates"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /templates",
        "tags": [
          "templates"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/timeline": {
      "get": {
        "summary": "获取时间线数据",
        "tags": [
          "timeline"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /timeline",
        "tags": [
          "timeline"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/tts": {
      "post": {
        "summary": "语音合成",
        "tags": [
          "tts"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /tts",
        "tags": [
          "tts"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/user": {
      "get": {
        "summary": "获取当前用户",
        "tags": [
          "user"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "put": {
        "summary": "更新当前用户",
        "tags": [
          "user"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/user/menu-permissions": {
      "get": {
        "summary": "获取菜单权限",
        "tags": [
          "user"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/user/theme": {
      "put": {
        "summary": "更新主题偏好",
        "tags": [
          "user"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "get": {
        "summary": "GET /user/theme",
        "tags": [
          "user"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/users": {
      "get": {
        "summary": "列出用户",
        "tags": [
          "users"
        ],
        "parameters": [
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建用户",
        "tags": [
          "users"
        ],
        "parameters": [
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /users",
        "tags": [
          "users"
        ],
        "parameters": [
          {
            "name": "search",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "搜索关键词"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/v1/docs": {
      "get": {
        "summary": "Swagger UI 文档页面",
        "tags": [
          "v1"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/v1/openapi.json": {
      "get": {
        "summary": "OpenAPI 规范 JSON",
        "tags": [
          "v1"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/v1/webhooks": {
      "get": {
        "summary": "列出 Webhook 订阅",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建 Webhook 订阅",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/v1/webhooks/{id}": {
      "patch": {
        "summary": "更新 Webhook 订阅",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除 Webhook 订阅",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/v1/webhooks/{id}/deliveries": {
      "get": {
        "summary": "获取投递记录",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string",
              "enum": [
                "pending",
                "in_progress",
                "delivered",
                "failed"
              ]
            },
            "description": "投递状态"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/v1/webhooks/{id}/test": {
      "post": {
        "summary": "测试 Webhook",
        "tags": [
          "v1"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/work-logs": {
      "get": {
        "summary": "获取工时记录",
        "tags": [
          "work-logs"
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "用户 ID"
          },
          {
            "name": "date_from",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "开始日期"
          },
          {
            "name": "date_to",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "结束日期"
          },
          {
            "name": "requirement_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "需求 ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建工时记录",
        "tags": [
          "work-logs"
        ],
        "parameters": [
          {
            "name": "user_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "用户 ID"
          },
          {
            "name": "date_from",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "开始日期"
          },
          {
            "name": "date_to",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "结束日期"
          },
          {
            "name": "requirement_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "需求 ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/work-logs/{id}": {
      "put": {
        "summary": "更新工时记录",
        "tags": [
          "work-logs"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "删除工时记录",
        "tags": [
          "work-logs"
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "integer"
            },
            "description": "id ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workflow-instances": {
      "get": {
        "summary": "列出工作流实例",
        "tags": [
          "workflow-instances"
        ],
        "parameters": [
          {
            "name": "workflow_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "工作流 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "实例状态"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "启动工作流实例",
        "tags": [
          "workflow-instances"
        ],
        "parameters": [
          {
            "name": "workflow_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "工作流 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "实例状态"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /workflow-instances",
        "tags": [
          "workflow-instances"
        ],
        "parameters": [
          {
            "name": "workflow_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "工作流 ID"
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "实例状态"
          },
          {
            "name": "page",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 1
            },
            "description": "页码"
          },
          {
            "name": "pageSize",
            "in": "query",
            "schema": {
              "type": "integer",
              "default": 30
            },
            "description": "每页条数"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/workflow-monitor": {
      "get": {
        "summary": "获取工作流监控数据",
        "tags": [
          "workflow-monitor"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "POST /workflow-monitor",
        "tags": [
          "workflow-monitor"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /workflow-monitor",
        "tags": [
          "workflow-monitor"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/workflows": {
      "get": {
        "summary": "列出工作流",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      },
      "post": {
        "summary": "创建工作流",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "put": {
        "summary": "PUT /workflows",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "summary": "DELETE /workflows",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workflows/designer": {
      "get": {
        "summary": "获取工作流设计器数据",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workflows/monitor": {
      "get": {
        "summary": "获取工作流监控视图",
        "tags": [
          "workflows"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workload/capacity": {
      "get": {
        "summary": "获取产能数据",
        "tags": [
          "workload"
        ],
        "parameters": [],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workload/members": {
      "get": {
        "summary": "获取成员工作量",
        "tags": [
          "workload"
        ],
        "parameters": [
          {
            "name": "date_from",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "开始日期"
          },
          {
            "name": "date_to",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "结束日期"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workload/projects": {
      "get": {
        "summary": "获取项目工作量",
        "tags": [
          "workload"
        ],
        "parameters": [
          {
            "name": "date_from",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "开始日期"
          },
          {
            "name": "date_to",
            "in": "query",
            "schema": {
              "type": "string",
              "format": "date"
            },
            "description": "结束日期"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    },
    "/workload/requirements": {
      "get": {
        "summary": "获取需求工作量",
        "tags": [
          "workload"
        ],
        "parameters": [
          {
            "name": "project_id",
            "in": "query",
            "schema": {
              "type": "integer"
            },
            "description": "项目 ID"
          }
        ],
        "responses": {
          "200": {
            "description": "成功"
          },
          "401": {
            "description": "未登录"
          },
          "403": {
            "description": "无权限"
          }
        }
      }
    }
  },
  "x-tagGroups": [
    {
      "name": "需求",
      "tags": [
        "requirements"
      ]
    },
    {
      "name": "项目",
      "tags": [
        "projects"
      ]
    },
    {
      "name": "知识库",
      "tags": [
        "knowledge"
      ]
    },
    {
      "name": "搜索",
      "tags": [
        "search"
      ]
    },
    {
      "name": "用户与认证",
      "tags": [
        "user",
        "users",
        "auth",
        "roles"
      ]
    },
    {
      "name": "通知",
      "tags": [
        "notifications"
      ]
    },
    {
      "name": "工作流",
      "tags": [
        "workflows",
        "workflow-instances",
        "workflow-monitor"
      ]
    },
    {
      "name": "迭代",
      "tags": [
        "sprints"
      ]
    },
    {
      "name": "工时",
      "tags": [
        "work-logs",
        "workload"
      ]
    },
    {
      "name": "SLA",
      "tags": [
        "sla"
      ]
    },
    {
      "name": "检查清单",
      "tags": [
        "checklist"
      ]
    },
    {
      "name": "标签",
      "tags": [
        "tags"
      ]
    },
    {
      "name": "自定义报表",
      "tags": [
        "custom-reports",
        "data-sources"
      ]
    },
    {
      "name": "日历",
      "tags": [
        "calendar",
        "timeline"
      ]
    },
    {
      "name": "仪表盘",
      "tags": [
        "dashboard",
        "dashboard-widgets"
      ]
    },
    {
      "name": "对话 & AI",
      "tags": [
        "chat",
        "openclaw"
      ]
    },
    {
      "name": "系统管理",
      "tags": [
        "admin",
        "config",
        "health",
        "audit-logs",
        "database",
        "dedup"
      ]
    },
    {
      "name": "Webhook",
      "tags": [
        "v1"
      ]
    },
    {
      "name": "集成",
      "tags": [
        "integrations"
      ]
    },
    {
      "name": "系统工具",
      "tags": [
        "i18n",
        "asr",
        "tts",
        "attachments",
        "templates",
        "files"
      ]
    },
    {
      "name": "其他",
      "tags": [
        "general"
      ]
    }
  ]
};
