#!/usr/bin/env python3
"""把所有 route.ts 的同步 db 调用改成 async + getAsyncDb"""
import re
import sys
import os
from pathlib import Path

# 匹配模式: db.prepare(...).X(...) 
# 关键: prepare() 后接 .get/.all/.run
# X(...) 可能带参数或空参
# 整个链要 await 一下
PATTERNS = [
    # db.prepare(`...`).all(args) → await db.prepare(`...`).all(args)
    (r'(?<!await\s)(const\s+\w+\s*=\s*)?db\.prepare\(', r'\1await db.prepare('),
    # 但要避免 .get/.all/.run 后面再被 await 重复加（看下一条）
]

# 方案：分两步
# Step 1: 把 `const xxx = db.prepare(sql).METHOD(...)` 替换成 `const xxx = await db.prepare(sql).METHOD(...)`
# Step 2: 把 `db.prepare(sql).METHOD(...)` (在表达式里) 替换成 `(await db.prepare(sql).METHOD(...))`
# 风险：嵌套 prepare 调用，但代码里没有

# 匹配 `const X = db.prepare(...).METHOD(`
STEP1 = re.compile(r'(const\s+(\w+)\s*=\s*)(db\.prepare\(.*?\)\.(get|all|run)\()', re.DOTALL)
# 匹配直接 db.prepare(...).METHOD()（在 if 条件、for、return 等里）
# 简化：找 db.prepare(  到 .METHOD(  的范围
STEP2 = re.compile(r'(?<!await )(db\.prepare\(.*?\)\.(get|all|run)\()', re.DOTALL)

def transform(content: str) -> str:
    # 先处理 import: getDb → getAsyncDb
    content = re.sub(r"import\s*\{\s*getDb\s*\}\s*from\s*['\"]\@/lib/db['\"]",
                     "import { getAsyncDb } from '@/lib/db'", content)
    # getDb() → getAsyncDb()
    content = re.sub(r'(?<!Async)(?<!getAsync)getDb\(\)', 'getAsyncDb()', content)
    return content

# 上面没加 await。需要更细的：db.prepare(...).get() 前加 await
# 我直接读每个文件手工加 await

def file_needs_await(filepath: Path) -> bool:
    """检查文件里 db.prepare().X() 是否在 await 之后"""
    src = filepath.read_text()
    # 找 db.prepare( 块（可能跨行）
    return bool(re.search(r'\bdb\.prepare\(', src)) and 'getAsyncDb' in src

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("usage: _asyncify.py <dir>")
        sys.exit(1)
    root = Path(sys.argv[1])
    files = list(root.rglob('route.ts'))
    print(f"Found {len(files)} route.ts files")
    for f in files:
        src = f.read_text()
        new = transform(src)
        if new != src:
            f.write_text(new)
            print(f"  updated: {f}")
