/**
 * ============================================================
 * WebSocket 服务器入口
 * 对标旧Python: core/websocket_server.py → WebSocketServer
 *
 * 职责：
 * 1. 在 8000 端口监听 WebSocket 连接
 * 2. 路径格式 `/xiaozhi/v1/` 匹配
 * 3. 提取 device-id（URL参数或Header）
 * 4. 设备认证（JWT Token 或 MAC 白名单）
 * 5. 为每个连接创建 ConnectionHandler
 * 6. 心跳保活（每30s ping/pong）
 *
 * 【开发模式】
 * 在无ESP32硬件的开发环境中，可使用以下方式测试：
 * 1. wscat -c ws://localhost:8000/xiaozhi/v1/?device-id=test-device
 * 2. 浏览器打开 test/test_page.html（模拟ESP32客户端）
 *
 * 测试流程：
 *   → 发送JSON {"type":"hello"} 获得握手响应
 *   → 发送Opus音频帧（或模拟二进制数据）触发VAD→ASR→LLM→TTS
 * ============================================================
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer, IncomingMessage } from 'http';
import { ConnectionHandler } from './connection';
import { verifyServerSecret } from '@/lib/jwt';
import { cache } from '@/lib/redis';
import { logger } from './utils/logger';

/** WebSocket 监听端口 */
const WS_PORT = parseInt(process.env.WS_PORT || '8000');
/** WebSocket 路径 */
const WS_PATH = '/xiaozhi/v1/';

// ==============================
// 连接管理器
// ==============================

/** 活跃连接 Map: deviceId → ConnectionHandler */
const activeConnections = new Map<string, ConnectionHandler>();

/**
 * 启动 WebSocket 服务器
 *
 * 对标旧Python: WebSocketServer.start()
 *
 * 可在 Node.js 独立脚本中直接调用：
 *   import { startWebSocketServer } from './server/ws-server';
 *   startWebSocketServer();
 *
 * 也可作为 Next.js 自定义 server 的一部分（下一阶段集成）
 */
export function startWebSocketServer(): WebSocketServer {
  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({
    port: WS_PORT,
    maxPayload: 2 * 1024 * 1024, // 2MB 最大载荷
    perMessageDeflate: false,     // ESP32 不支持压缩
  });

  console.log('='.repeat(56));
  console.log(' WebSocket AI 引擎已启动');
  console.log(` 监听端口: ${WS_PORT}`);
  console.log(` 连接路径: ${WS_PATH}`);
  console.log(` 连接示例: ws://localhost:${WS_PORT}${WS_PATH}?device-id=YOUR_DEVICE_ID`);
  console.log('='.repeat(56));
  logger.info('WS', `WebSocket 服务器已启动`, { port: WS_PORT });

  /**
   * 新连接处理
   * 
   * 对标旧Python: _handle_connection()
   *
   * 处理流程：
   *   1. 解析 URL → 提取 device-id（查询参数或请求头）
   *   2. 认证（JWT Token 验证 或 MAC 白名单）
   *   3. 创建 ConnectionHandler → 初始化组件
   *   4. 注册消息/关闭/错误/心跳事件
   */
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    // ---- 1. 解析 URL 并提取设备ID ----
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    
    // 路径匹配：仅处理 /xiaozhi/v1/ 路径
    if (url.pathname !== '/xiaozhi/v1/' && url.pathname !== '/xiaozhi/v1') {
      // 非WebSocket AI连接路径，返回提示
      console.warn(`[WS] 非法路径: ${url.pathname}`);
      ws.send(JSON.stringify({ error: 'Invalid path, use /xiaozhi/v1/' }));
      ws.close(4000, 'Invalid path');
      return;
    }

    // 提取 device-id
    // 优先级：URL参数 > 请求头device-id > 请求头Device-Id
    const deviceId = 
      url.searchParams.get('device-id') || 
      (req.headers['device-id'] as string) ||
      (req.headers['Device-Id'] as string) ||
      '';

    if (!deviceId) {
      console.warn('[WS] 缺少 device-id 参数');
      ws.send(JSON.stringify({ error: 'Missing device-id parameter' }));
      ws.close(4000, 'Missing device-id');
      return;
    }

    // 提取客户端 IP
    const clientIp = 
      (req.headers['x-real-ip'] as string) || 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
      req.socket.remoteAddress || 
      'unknown';

    // ---- 2. 认证 ----
    // 对标旧Python: _handle_auth()
    // 支持两种认证方式：
    //   a) Token 验证（Bearer Token）
    //   b) MAC 白名单（配置文件中预定义的设备MAC地址）
    const authValid = await authenticateDevice(req, deviceId);
    if (!authValid) {
      ws.send(JSON.stringify({ error: 'Authentication failed' }));
      ws.close(4001, 'Authentication failed');
      return;
    }

    // ---- 3. 检查重复连接（会话恢复） ----
    const existingHandler = activeConnections.get(deviceId);
    if (existingHandler) {
      logger.info('WS', `设备 ${deviceId} 已有活跃连接，关闭旧连接并恢复会话`);
      existingHandler.onClose();
      activeConnections.delete(deviceId);
    }

    // ---- 4. 创建连接处理器 ----
    const handler = new ConnectionHandler(ws, deviceId, clientIp);
    activeConnections.set(deviceId, handler);

    // 异步初始化（不阻塞WebSocket握手）
    handler.initialize().catch((err) => {
      console.error(`[WS] 设备 ${deviceId} 初始化失败: ${err.message}`);
    });

    // ---- 5. 注册事件处理 ----
    ws.on('message', (data: Buffer) => {
      handler.onMessage(data);
    });

    ws.on('close', () => {
      handler.onClose();
      activeConnections.delete(deviceId);
      logger.info('WS', `设备断开`, { deviceId, active: activeConnections.size });
    });

    ws.on('error', (err) => {
      console.error(`[WS] 设备 ${deviceId} 错误: ${err.message}`);
    });

    ws.on('pong', () => {
      handler.onPong();
    });

    console.log(
      `[WS] 新连接: device=${deviceId}, ip=${clientIp}, ` +
      `当前连接数: ${activeConnections.size}`,
    );
    logger.onConnection(deviceId, handler['sessionId'], clientIp);
  });

  /**
   * 心跳机制
   * 对标旧Python: 无显式心跳（Python websockets 库自带）
   * 
   * 每30秒向所有活跃连接发送 ping
   * 如果客户端30秒内未响应 pong，ws 库会自动断开连接
   */
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    });
  }, 30000);

  // 服务器关闭时清理定时器
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  // ---- 清理 ----
  // 如果WebSocket服务器意外关闭，清理所有连接
  wss.on('error', (err) => {
    console.error(`[WS] WebSocket 服务器错误: ${err.message}`);
  });

  return wss;
}

/**
 * 设备认证
 *
 * 对标旧Python: _handle_auth()
 *
 * 认证策略：
 *   1. 如果设备MAC在白名单中 → 直接放行（无需Token）
 *   2. 否则 → 验证 Authorization: Bearer <token>
 *   3. 无认证配置 → 直接放行（开发模式）
 *
 * @param req HTTP请求对象
 * @param deviceId 设备ID（MAC地址）
 * @returns 是否认证通过
 */
async function authenticateDevice(
  req: IncomingMessage,
  deviceId: string,
): Promise<boolean> {
  // 开发模式：如果未配置JWT_SECRET，直接放行
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
    console.log(`[WS] 开发模式，设备 ${deviceId} 无需认证`);
    return true;
  }

  // 1. 检查白名单
  const whitelist = process.env.DEVICE_WHITELIST?.split(',').map((s) => s.trim()) || [];
  if (whitelist.length > 0 && whitelist.includes(deviceId)) {
    console.log(`[WS] 设备 ${deviceId} 在白名单中，放行`);
    return true;
  }

  // 2. 检查ServerSecret（从管理端下发）
  const serverSecret = await cache.hget('sys:params', 'server.secret');
  if (serverSecret) {
    // 从URL参数或Header提取token
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const authHeader = 
      url.searchParams.get('authorization') || 
      url.searchParams.get('token') || 
      req.headers['authorization'] as string || 
      '';

    if (authHeader) {
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : authHeader;

      const isValid = await verifyServerSecret(token);
      if (isValid) {
        return true;
      }
    }
  }

  // 3. 宽松模式（无白名单且无Token时也放行）
  // 生产环境需移除此逻辑
  return true;
}

// ==============================
// 连接管理 API（外部调用）
// ==============================

/**
 * 获取所有活跃连接
 */
export function getActiveConnections(): Map<string, ConnectionHandler> {
  return activeConnections;
}

/**
 * 获取指定设备的连接处理器
 */
export function getConnection(deviceId: string): ConnectionHandler | undefined {
  return activeConnections.get(deviceId);
}

/**
 * 断开指定设备
 */
export function disconnectDevice(deviceId: string): void {
  const handler = activeConnections.get(deviceId);
  if (handler) {
    handler.onClose();
    activeConnections.delete(deviceId);
  }
}

// ==============================
// 直接启动（作为独立脚本时）
// ==============================

// 如果此文件被直接执行（node ws-server.js），则启动服务器
if (require.main === module) {
  console.log('正在启动 WebSocket AI 引擎（独立模式）...');
  startWebSocketServer();
  console.log('WebSocket 服务器运行中，按 Ctrl+C 停止');
}
