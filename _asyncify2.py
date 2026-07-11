#!/usr/bin/env python3
"""智能转换 route.ts: getDb → getAsyncDb + db.prepare(...).X() 前加 await"""
import re
import sys
from pathlib import Path

def find_matching_paren(s: str, start: int) -> int:
    """从 start 位置（'('）开始找到匹配的 ')'"""
    assert s[start] == '('
    depth = 0
    in_str = None
    in_template = 0  # ${ ... } 嵌套层
    i = start
    while i < len(s):
        c = s[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in ("'", '"'):
            in_str = c
        elif c == '`':
            in_str = '`'  # template literal
        elif in_str == '`':
            if c == '\\':
                i += 2; continue
            if c == '$' and i+1 < len(s) and s[i+1] == '{':
                in_template += 1
                i += 2
                continue
            if c == '}' and in_template > 0:
                in_template -= 1
            if c == '`':
                in_str = None
        elif in_template > 0:
            if c == '{':
                # 进入子 scope
                pass  # 不需要特别处理，因为我们在找 )
        else:
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def find_matching_brace(s: str, start: int) -> int:
    """从 start 位置（'{'）开始找到匹配的 '}'，跳过 string/template"""
    assert s[start] == '{'
    depth = 0
    in_str = None
    in_template_expr = 0
    i = start
    while i < len(s):
        c = s[i]
        if in_str:
            if c == '\\':
                i += 2; continue
            if c == in_str:
                in_str = None
        elif c in ("'", '"'):
            in_str = c
        elif c == '`':
            in_str = '`'
        elif in_str == '`':
            if c == '\\':
                i += 2; continue
            if c == '$' and i+1 < len(s) and s[i+1] == '{':
                in_template_expr += 1; i += 2; continue
            if c == '}' and in_template_expr > 0:
                in_template_expr -= 1
            if c == '`':
                in_str = None
        elif in_template_expr > 0:
            if c == '{':
                # 嵌套 ${...}
                pass
        else:
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return -1

def transform_file(content: str) -> str:
    """先改 import 和 getDb()"""
    # import { getDb } → import { getAsyncDb }
    content = re.sub(
        r"import\s*\{\s*getDb\s*\}\s*from\s*['\"]\@/lib/db['\"]",
        "import { getAsyncDb } from '@/lib/db'",
        content
    )
    # getDb() → getAsyncDb()  (避免匹配 getAsyncDb)
    content = re.sub(r'(?<![A-Za-z])getDb\(\)', 'getAsyncDb()', content)
    return content

def add_awaits(content: str) -> tuple[str, int]:
    """给所有 db.prepare(...).X() 表达式前加 await"""
    # 找 db.prepare( 起点
    count = 0
    out = []
    i = 0
    pat = re.compile(r'\bdb\.prepare\(')
    while True:
        m = pat.search(content, i)
        if not m:
            out.append(content[i:])
            break
        # 找到 db.prepare( 起点
        prep_start = m.start()
        prep_paren_start = m.end() - 1  # '('
        prep_end_paren = find_matching_paren(content, prep_paren_start)
        if prep_end_paren < 0:
            out.append(content[i:prep_start+10])
            i = prep_start + 10
            continue
        # 准备语句结束于 prep_end_paren
        # 后面应该接 .METHOD(
        after = prep_end_paren + 1
        # 跳过空白
        while after < len(content) and content[after] in ' \t\n\r':
            after += 1
        if after >= len(content) or content[after] != '.':
            out.append(content[i:prep_end_paren+1])
            i = prep_end_paren + 1
            continue
        # 找 .METHOD
        m2 = re.match(r'\.(get|all|run)\(', content[after:])
        if not m2:
            out.append(content[i:prep_end_paren+1])
            i = prep_end_paren + 1
            continue
        method = m2.group(1)
        method_paren_start = after + m2.end() - 1  # '('
        method_end_paren = find_matching_paren(content, method_paren_start)
        if method_end_paren < 0:
            out.append(content[i:method_paren_start+1])
            i = method_paren_start + 1
            continue
        # 整段: db.prepare(...)  .METHOD(...)
        full_end = method_end_paren + 1
        full_expr = content[prep_start:full_end]
        # 检查前面是否已经有 await
        # 回看从 prep_start 往前找最近的非空白字符
        prev_pos = prep_start - 1
        while prev_pos >= 0 and content[prev_pos] in ' \t\n\r':
            prev_pos -= 1
        already_await = False
        if prev_pos >= 4 and content[prev_pos-4:prev_pos+1] == 'await':
            # 看是否紧接 await（中间无其他标识符）
            already_await = True
        # 输出: 上文 + (await full_expr) + 后文
        out.append(content[i:prep_start])
        if not already_await:
            out.append('(await ')
            out.append(full_expr)
            out.append(')')
            count += 1
        else:
            out.append(full_expr)
        i = full_end
    return ''.join(out), count

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("usage: _asyncify2.py <dir>")
        sys.exit(1)
    root = Path(sys.argv[1])
    files = list(root.rglob('route.ts'))
    print(f"Found {len(files)} route.ts files")
    total_added = 0
    for f in files:
        src = f.read_text()
        new = transform_file(src)
        new, n = add_awaits(new)
        if new != src:
            f.write_text(new)
            total_added += n
            print(f"  {f.relative_to(root)}: +{n} awaits")
    print(f"Total awaits added: {total_added}")
