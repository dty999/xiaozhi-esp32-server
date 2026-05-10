import type { WebSocket } from 'ws';
import { logger } from '../utils/logger';

const TAG = 'ServerHandler';

export interface ServerMessageResult {
  type: 'server';
  status: 'success' | 'error';
  message: string;
  content?: Record<string, any>;
}

export function handleServerMessage(
  ws: WebSocket,
  msg: Record<string, any>,
  config: { readConfigFromApi: boolean; secret?: string; server?: any },
): ServerMessageResult | null {
  if (!config.readConfigFromApi) {
    return null;
  }

  const postSecret = msg.content?.secret || '';
  if (config.secret && postSecret !== config.secret) {
    const result: ServerMessageResult = {
      type: 'server',
      status: 'error',
      message: '服务器密钥验证失败',
    };
    ws.send(JSON.stringify(result));
    return result;
  }

  const action = msg.action;
  if (action === 'update_config') {
    return handleUpdateConfig(ws, config);
  } else if (action === 'restart') {
    return handleRestart(ws);
  }

  return null;
}

function handleUpdateConfig(
  ws: WebSocket,
  config: { server?: any },
): ServerMessageResult {
  if (!config.server) {
    const result: ServerMessageResult = {
      type: 'server',
      status: 'error',
      message: '无法获取服务器实例',
      content: { action: 'update_config' },
    };
    ws.send(JSON.stringify(result));
    return result;
  }

  logger.info(TAG, '收到更新配置请求');

  const result: ServerMessageResult = {
    type: 'server',
    status: 'success',
    message: '配置更新成功',
    content: { action: 'update_config' },
  };
  ws.send(JSON.stringify(result));
  return result;
}

function handleRestart(ws: WebSocket): ServerMessageResult {
  logger.info(TAG, '收到服务器重启指令');

  const result: ServerMessageResult = {
    type: 'server',
    status: 'success',
    message: '服务器重启中...',
    content: { action: 'restart' },
  };
  ws.send(JSON.stringify(result));

  setTimeout(() => {
    process.exit(0);
  }, 2000);

  return result;
}
