'use client';

/**
 * 对话消息的 Markdown 渲染 —— 浮窗与独立对话页**共用这一份**。
 *
 * 为什么要抽出来（2026-09-02）：
 * 原先独立页 `chat/page.tsx` 用 `<ReactMarkdown remarkPlugins={[remarkGfm]}>` 渲染，
 * 而浮窗 `layout.tsx` 里 **import 了 ReactMarkdown 却从没调用**，直接把 `{m.content}`
 * 当纯文本塞进 `<div className="md-content">` —— 而 `md-content` 这个类**只存在于
 * globals.css.bak.pre-shadcn 备份里，活的样式表根本没有**。
 * 结果：浮窗里 Agent 回的 `**粗体**`、表格、列表全是裸的星号和竖线。
 *
 * TOOLS.md 记过「同一功能两处实现 = 只改一处的定时炸弹」，
 * 这次不再复制第三份，两边都 import 这个组件。
 *
 * 安全：**不引入 rehype-raw**。react-markdown 默认不渲染裸 HTML，
 * 消息内容来自 LLM/Agent，属不可信输入，保持默认即可防 XSS。
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * LLM 常把整段回答包在一个 ```代码块``` 里。
 * 那样渲染出来是一坨等宽黑底，Markdown 结构全丢。
 * 若整条消息**正好**是单个代码块就剥掉外层围栏；
 * 内含多个代码块时不动（那是真的在贴代码）。
 */
export function unwrapSingleCodeBlock(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

interface Props {
  content: string;
  /**
   * 紧凑模式：浮窗只有 420px 宽，表格/代码块要能横向滚动而不是撑破窗体。
   * 独立页宽松，不需要。
   */
  compact?: boolean;
  className?: string;
}

export default function ChatMarkdown({ content, compact = false, className = '' }: Props) {
  return (
    <div className={`text-sm chat-markdown${compact ? ' chat-markdown-compact' : ''} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 外链一律新窗口打开 + noreferrer：
          // 对话内容里的链接可能来自 LLM，别让它能操作 window.opener
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // 表格套一层可横向滚动的容器 —— 窄浮窗里宽表格不撑破布局
          table: ({ node, ...props }) => (
            <div className="chat-markdown-table-wrap">
              <table {...props} />
            </div>
          ),
        }}
      >
        {unwrapSingleCodeBlock(content)}
      </ReactMarkdown>
    </div>
  );
}
