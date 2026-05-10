import type { WebSocket } from 'ws';
import type { MCPClient, MCPToolData } from './mcp-client';
import { sanitizeToolNameExport } from './mcp-client';
import { logger } from '../utils/logger';

const TAG = 'MCPHandler';

const MCP_INITIALIZE_ID = 1;
const MCP_TOOLS_LIST_ID = 2;

export function sendMCPMessage(ws: WebSocket, payload: Record<string, any>): void {
  if (ws.readyState !== ws.OPEN) {
    logger.warn(TAG, 'WebSocket未连接，无法发送MCP消息');
    return;
  }
  const message = JSON.stringify({ type: 'mcp', payload });
  ws.send(message);
}

export function sendMCPInitialize(ws: WebSocket): void {
  const payload = {
    jsonrpc: '2.0',
    id: MCP_INITIALIZE_ID,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'XiaozhiClient',
        version: '1.0.0',
      },
    },
  };
  logger.info(TAG, '发送MCP初始化消息');
  sendMCPMessage(ws, payload);
}

export function sendMCPToolsListRequest(ws: WebSocket): void {
  const payload = {
    jsonrpc: '2.0',
    id: MCP_TOOLS_LIST_ID,
    method: 'tools/list',
  };
  logger.info(TAG, '发送MCP工具列表请求');
  sendMCPMessage(ws, payload);
}

export function sendMCPToolsListContinueRequest(ws: WebSocket, cursor: string): void {
  const payload = {
    jsonrpc: '2.0',
    id: MCP_TOOLS_LIST_ID,
    method: 'tools/list',
    params: { cursor },
  };
  logger.info(TAG, `发送带cursor的MCP工具列表请求: ${cursor}`);
  sendMCPMessage(ws, payload);
}

export async function handleMCPMessage(
  ws: WebSocket,
  mcpClient: MCPClient,
  payload: Record<string, any>,
  onToolsChanged?: () => void,
): Promise<void> {
  if (!payload || typeof payload !== 'object') {
    logger.error(TAG, 'MCP消息格式错误');
    return;
  }

  if ('result' in payload) {
    const result = payload.result;
    const msgId = Number(payload.id || 0);

    if (mcpClient.hasTool('__mcp_call__') || msgId > MCP_TOOLS_LIST_ID) {
      mcpClient.resolveCall(msgId, result);
      return;
    }

    if (msgId === MCP_INITIALIZE_ID) {
      logger.info(TAG, '收到MCP初始化响应');
      const serverInfo = result?.serverInfo;
      if (serverInfo) {
        logger.info(TAG, `MCP服务器: name=${serverInfo.name}, version=${serverInfo.version}`);
      }
      setTimeout(() => {
        sendMCPToolsListRequest(ws);
      }, 1000);
      return;
    }

    if (msgId === MCP_TOOLS_LIST_ID) {
      logger.info(TAG, '收到MCP工具列表响应');
      if (result?.tools && Array.isArray(result.tools)) {
        logger.info(TAG, `客户端设备支持的工具数量: ${result.tools.length}`);

        for (const tool of result.tools) {
          if (!tool || typeof tool !== 'object') continue;

          const name = tool.name || '';
          const description = tool.description || '';
          const inputSchema = {
            type: 'object',
            properties: {} as Record<string, any>,
            required: [] as string[],
          };

          if (tool.inputSchema && typeof tool.inputSchema === 'object') {
            inputSchema.type = tool.inputSchema.type || 'object';
            inputSchema.properties = tool.inputSchema.properties || {};
            inputSchema.required = (tool.inputSchema.required || []).filter(
              (s: any) => typeof s === 'string',
            );
          }

          await mcpClient.addTool({ name, description, inputSchema });
        }

        const nextCursor = result.nextCursor;
        if (nextCursor) {
          sendMCPToolsListContinueRequest(ws, nextCursor);
        } else {
          mcpClient.setReady(true);
          logger.info(TAG, '所有MCP工具已获取，客户端准备就绪');
          onToolsChanged?.();
        }
      }
      return;
    }

    mcpClient.resolveCall(msgId, result);
    return;
  }

  if ('method' in payload) {
    logger.info(TAG, `收到MCP客户端请求: ${payload.method}`);
    return;
  }

  if ('error' in payload) {
    const errorMsg = payload.error?.message || '未知错误';
    logger.error(TAG, `收到MCP错误响应: ${errorMsg}`);
    const msgId = Number(payload.id || 0);
    mcpClient.rejectCall(msgId, new Error(`MCP错误: ${errorMsg}`));
  }
}

export function callMCPTool(
  ws: WebSocket,
  mcpClient: MCPClient,
  toolName: string,
  args: string = '{}',
  timeout: number = 30,
): Promise<string> {
  let callId = 0;
  return new Promise((resolve, reject) => {
    if (!mcpClient.ready) {
      reject(new Error('MCP客户端尚未准备就绪'));
      return;
    }

    if (!mcpClient.hasTool(toolName)) {
      reject(new Error(`工具 ${toolName} 不存在`));
      return;
    }

    callId = mcpClient.getNextId();
    mcpClient.registerCallFuture(callId, resolve as any, reject, timeout * 1000);

    let argumentsObj: Record<string, any> = {};
    try {
      argumentsObj = args.trim() ? JSON.parse(args) : {};
    } catch {
      argumentsObj = {};
    }

    const actualName = mcpClient.getOriginalName(toolName);
    const payload = {
      jsonrpc: '2.0',
      id: callId,
      method: 'tools/call',
      params: { name: actualName, arguments: argumentsObj },
    };

    logger.info(TAG, `发送MCP工具调用请求: ${actualName}`);
    sendMCPMessage(ws, payload);
  }).then((rawResult: any) => {
    logger.info(TAG, `MCP工具调用成功: ${toolName}`);

    if (typeof rawResult === 'object' && rawResult !== null) {
      if (rawResult.isError === true) {
        throw new Error(`工具调用错误: ${rawResult.error || '未知错误'}`);
      }
      const content = rawResult.content;
      if (Array.isArray(content) && content.length > 0) {
        if (content[0]?.text) {
          return content[0].text as string;
        }
      }
    }
    return String(rawResult);
  }).catch((err: Error) => {
    mcpClient.cleanupCall(callId);
    throw err;
  });
}
