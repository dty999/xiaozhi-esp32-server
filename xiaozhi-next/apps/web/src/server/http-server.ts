/**
 * ============================================================
 * HTTP 辅助服务器
 * 对标旧Python: core/http_server.py → SimpleHttpServer
 *
 * 职责：
 *   1. OTA 固件检查与下载（port 8003）
 *   2. MCP 视觉分析接口
 *   3. 服务端健康检查
 *
 * 【实现说明】
 * 在 Next.js App Router 架构中，这些端点已通过 src/app/api/ 实现，
 * 本服务器主要用于不依赖管理端API的场景（独立部署模式）。
 * ============================================================
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { handleOTACheck, handleOTADownload } from './ota/ota-handler';
import { startMQTTServer } from './mqtt/mqtt-server';
import { startUDPServer } from './udp/udp-server';
import { logger } from './utils/logger';

/** HTTP 监听端口 */
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '8003');

/**
 * 启动 HTTP 辅助服务器
 *
 * 对标旧Python: SimpleHttpServer.start()
 *
 * 端点列表：
 *   GET  /xiaozhi/ota/       — OTA检查 + 设备激活
 *   POST /mcp/vision/explain — 视觉分析接口
 *   GET  /health             — 健康检查
 *   GET  /                   — 服务状态页
 */
export function startHttpServer(): ReturnType<typeof createServer> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ---- 健康检查 ----
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: 'xiaozhi-http-server',
        }));
        return;
      }

      // ---- 首页 ----
      if (pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <html>
            <head><title>小智 HTTP Server</title></head>
            <body style="font-family: sans-serif; padding: 40px;">
              <h1>小智 HTTP Server</h1>
              <p>服务正常运行中。</p>
              <ul>
                <li>WebSocket: ws://localhost:${process.env.WS_PORT || 8000}/xiaozhi/v1/</li>
                <li>OTA检查: <a href="/xiaozhi/ota/">/xiaozhi/ota/</a></li>
                <li>健康检查: <a href="/health">/health</a></li>
              </ul>
            </body>
          </html>
        `);
        return;
      }

      // ---- OTA 检查与下载 ----
      // 对标旧Python: ota_handler.py
      if (pathname.startsWith('/xiaozhi/ota/')) {
        if (pathname === '/xiaozhi/ota/check' || pathname === '/xiaozhi/ota/') {
          handleOTACheck(req, res);
        } else if (pathname === '/xiaozhi/ota/download') {
          await handleOTADownload(req, res);
        }
        return;
      }

      // ---- MCP 视觉分析 ----
      // 对标旧Python: mcp vision explain
      if (pathname === '/mcp/vision/explain') {
        await handleVisionExplain(req, res);
        return;
      }

      // ---- 404 ----
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', path: pathname }));
    } catch (e: any) {
      console.error(`[HTTP] 请求处理错误: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(HTTP_PORT, () => {
    logger.info('HTTP', `辅助服务已启动: http://localhost:${HTTP_PORT}`);
    logger.info('HTTP', `OTA接口: http://localhost:${HTTP_PORT}/xiaozhi/ota/check`);
    logger.info('HTTP', `健康检查: http://localhost:${HTTP_PORT}/health`);

    // 启动 MQTT 服务器
    try {
      startMQTTServer();
    } catch (e: any) {
      logger.warn('HTTP', `MQTT 服务器启动失败: ${e.message}`);
    }

    // 启动 UDP 服务器
    try {
      startUDPServer();
    } catch (e: any) {
      logger.warn('HTTP', `UDP 服务器启动失败: ${e.message}`);
    }
  });

  return server;
}

/** 删除旧的 inline OTA 处理函数，已由 ota-handler.ts 接管 */

/**
 * MCP 视觉分析
 *
 * 对标旧Python: vision explain
 * 接收图片并调用视觉大模型进行分析
 */
async function handleVisionExplain(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST required' }));
    return;
  }

  // 读取请求体
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);

  try {
    const data = JSON.parse(body.toString());
    // TODO: 实现视觉分析（调用 VLLM provider）
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: 0,
      msg: 'success',
      data: {
        explanation: '视觉分析功能开发中，请等待后续版本',
      },
    }));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
  }
}

// 直接启动
if (require.main === module) {
  console.log('正在启动 HTTP 辅助服务器...');
  startHttpServer();
}
