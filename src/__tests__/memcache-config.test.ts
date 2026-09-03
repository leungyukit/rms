import { describe, it, expect } from 'vitest';
import { resolveMemcacheConfig, MEMCACHE_DEFAULTS, buildMemcacheNodeUri } from '@/lib/chat-store';

/**
 * 这组测试的存在意义：2026-09-03 之前 chat-store 只读 system_config，
 * 容器化部署里 DB 存的是单机时代的 127.0.0.1 → 健康检查必失败 → 静默降级到文件后端，
 * 而 compose 早就注入了正确的 MEMCACHE_HOST=memcached 却没人读。
 * 线上跑了几个月 memcached cmd_set=0，无人发现。
 *
 * 所以「环境变量优先」这条规则必须被断言锁住，不能只靠读代码确认。
 */

describe('resolveMemcacheConfig —— 优先级：env > db > default', () => {
  it('环境变量存在时压过 DB 配置（本次 bug 的核心场景）', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: 'true', MEMCACHE_HOST: 'memcached', MEMCACHE_PORT: '11211' },
      // DB 里是错的单机值，就是 63 生产的真实状态
      { memcache_enabled: 'true', memcache_host: '127.0.0.1', memcache_port: '11211' },
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.host).toBe('memcached');
    expect(cfg.source?.host).toBe('env');
  });

  it('环境变量缺失时回落到 DB 配置', () => {
    const cfg = resolveMemcacheConfig(
      {},
      { memcache_enabled: 'true', memcache_host: '10.0.0.9', memcache_port: '11311', memcache_ttl_days: '7' },
    );
    expect(cfg).toMatchObject({ enabled: true, host: '10.0.0.9', port: 11311, ttlDays: 7 });
    expect(cfg.source).toMatchObject({ enabled: 'db', host: 'db', port: 'db', ttlDays: 'db' });
  });

  it('两层都没有时用内置默认值', () => {
    const cfg = resolveMemcacheConfig({ MEMCACHE_ENABLED: 'true' }, {});
    expect(cfg.host).toBe(MEMCACHE_DEFAULTS.host);
    expect(cfg.port).toBe(MEMCACHE_DEFAULTS.port);
    expect(cfg.ttlDays).toBe(MEMCACHE_DEFAULTS.ttlDays);
    expect(cfg.source).toMatchObject({ enabled: 'env', host: 'default', port: 'default' });
  });

  it('可以逐字段混合取值（host 来自 env、port 来自 db、ttl 用默认）', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_HOST: 'memcached' },
      { memcache_enabled: 'true', memcache_port: '11311' },
    );
    expect(cfg).toMatchObject({ enabled: true, host: 'memcached', port: 11311, ttlDays: MEMCACHE_DEFAULTS.ttlDays });
    expect(cfg.source).toMatchObject({ enabled: 'db', host: 'env', port: 'db', ttlDays: 'default' });
  });
});

describe('resolveMemcacheConfig —— 启用开关', () => {
  it('默认不启用：谁都没明确打开时不要去连外部服务', () => {
    expect(resolveMemcacheConfig({}, {}).enabled).toBe(false);
  });

  it('未启用时不返回连接参数，避免调用方误用', () => {
    const cfg = resolveMemcacheConfig({ MEMCACHE_ENABLED: 'false' }, { memcache_host: 'memcached' });
    expect(cfg.enabled).toBe(false);
    expect(cfg.host).toBeUndefined();
    expect(cfg.port).toBeUndefined();
  });

  it('环境变量可以关掉 DB 里开着的开关（紧急止血用）', () => {
    const cfg = resolveMemcacheConfig({ MEMCACHE_ENABLED: 'false' }, { memcache_enabled: 'true' });
    expect(cfg.enabled).toBe(false);
    expect(cfg.source?.enabled).toBe('env');
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
  ])('布尔值 %s 解析为 %s', (raw, expected) => {
    expect(resolveMemcacheConfig({ MEMCACHE_ENABLED: raw as string }, {}).enabled).toBe(expected);
  });

  it('认不出的布尔值当作未配置，交给下一层而不是瞎猜', () => {
    // env 是垃圾值 → 应该用 DB 的 true，而不是直接判 false
    const cfg = resolveMemcacheConfig({ MEMCACHE_ENABLED: 'maybe' }, { memcache_enabled: 'true' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.source?.enabled).toBe('db');
  });
});

describe('resolveMemcacheConfig —— 脏值处理', () => {
  it('空字符串环境变量不算配置，不能盖掉 DB 值', () => {
    // Docker 里 `MEMCACHE_HOST=` 这种写法很常见，必须当作没设
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_HOST: '', MEMCACHE_PORT: '   ' },
      { memcache_enabled: 'true', memcache_host: 'memcached', memcache_port: '11311' },
    );
    expect(cfg.host).toBe('memcached');
    expect(cfg.port).toBe(11311);
    expect(cfg.source).toMatchObject({ host: 'db', port: 'db' });
  });

  it('端口/TTL 非法时回落而不是产出 NaN', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: 'true', MEMCACHE_PORT: 'abc', MEMCACHE_TTL_DAYS: '-3' },
      {},
    );
    expect(cfg.port).toBe(MEMCACHE_DEFAULTS.port);
    expect(cfg.ttlDays).toBe(MEMCACHE_DEFAULTS.ttlDays);
    expect(Number.isNaN(cfg.port)).toBe(false);
    expect(Number.isNaN(cfg.ttlDays)).toBe(false);
  });

  it('端口 0 视为非法（0 会让连接指向随机端口）', () => {
    const cfg = resolveMemcacheConfig({ MEMCACHE_ENABLED: 'true', MEMCACHE_PORT: '0' }, {});
    expect(cfg.port).toBe(MEMCACHE_DEFAULTS.port);
  });

  it('值两侧空白被裁掉', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: ' true ', MEMCACHE_HOST: ' memcached ', MEMCACHE_PORT: ' 11311 ' },
      {},
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.port).toBe(11311);
    // host 保留原样交给调用方，但不应带空白导致 DNS 解析失败
    expect(cfg.host?.trim()).toBe('memcached');
  });

  it('DB 值为 null（列存在但没值）时不崩，回落到默认', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: 'true' },
      { memcache_host: undefined, memcache_port: undefined },
    );
    expect(cfg.host).toBe(MEMCACHE_DEFAULTS.host);
    expect(cfg.port).toBe(MEMCACHE_DEFAULTS.port);
  });
});

describe('buildMemcacheNodeUri —— 节点 URI 拼接', () => {
  it('普通主机名', () => {
    expect(buildMemcacheNodeUri('memcached', 11211)).toBe('memcached:11211');
  });

  it('IPv4', () => {
    expect(buildMemcacheNodeUri('127.0.0.1', 11211)).toBe('127.0.0.1:11211');
  });

  it('裸 IPv6 要补方括号，否则地址与端口分不开', () => {
    expect(buildMemcacheNodeUri('::1', 11211)).toBe('[::1]:11211');
    expect(buildMemcacheNodeUri('2001:db8::1', 11212)).toBe('[2001:db8::1]:11212');
  });

  it('已带方括号的 IPv6 不重复加', () => {
    expect(buildMemcacheNodeUri('[::1]', 11211)).toBe('[::1]:11211');
  });

  it('两侧空白被裁掉（否则 DNS 解析失败）', () => {
    expect(buildMemcacheNodeUri('  memcached  ', 11211)).toBe('memcached:11211');
  });
});

describe('resolveMemcacheConfig —— 回归：63 生产的两种真实状态', () => {
  it('修复前的状态（只有 DB 配置、host 是 127.0.0.1）仍可解析，但指向本机', () => {
    // 这是本次事故现场：解析结果本身没错，错在容器内 127.0.0.1 连不上
    const cfg = resolveMemcacheConfig({}, { memcache_enabled: 'true', memcache_host: '127.0.0.1' });
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.source?.host).toBe('db');
  });

  it('修复后的状态（compose 注入 MEMCACHE_HOST=memcached）指向独立容器', () => {
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: 'true', MEMCACHE_HOST: 'memcached', MEMCACHE_PORT: '11211' },
      { memcache_enabled: 'true', memcache_host: '127.0.0.1', memcache_port: '11211' },
    );
    expect(cfg.host).toBe('memcached');
    // 关键：DB 里那个错值再也影响不到运行态
    expect(cfg.host).not.toBe('127.0.0.1');
  });

  it('解析结果能直接拼成干净的单节点 URI（第二个 bug 的回归）', () => {
    // 2026-09-03 部署后发现：配置解析对了，但 new Memcache() 无参构造
    // 会自建默认节点 localhost:11211，addNode 只是追加第二个节点，
    // ketama 环把健康检查 key 分到不存在的 localhost 上 → ECONNREFUSED。
    // 现在改成构造时传 nodes:[target]，所以这个 URI 必须是唯一且正确的。
    const cfg = resolveMemcacheConfig(
      { MEMCACHE_ENABLED: 'true', MEMCACHE_HOST: 'memcached', MEMCACHE_PORT: '11211' },
      { memcache_host: '127.0.0.1' },
    );
    const uri = buildMemcacheNodeUri(cfg.host!, cfg.port!);
    expect(uri).toBe('memcached:11211');
    expect(uri).not.toContain('localhost');
    expect(uri).not.toContain('127.0.0.1');
  });
});
