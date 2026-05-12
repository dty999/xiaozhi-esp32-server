/**
 * ============================================================
 * UDP 音频服务器
 * 对标固件规范: UDP + AES-CTR 加密音频传输
 *
 * 职责：
 * 1. 在指定端口监听 UDP 数据包
 * 2. 解析 UDP 音频包头（type, flags, payload_len, ssrc, timestamp, sequence）
 * 3. 使用 AES-CTR 解密音频数据
 * 4. 转发解密后的 OPUS 音频到连接处理器
 * 5. 将 TTS 音频加密后通过 UDP 发送回设备
 *
 * UDP 包格式：
 * | type 1B | flags 1B | payload_len 2B | ssrc 4B | timestamp 4B | sequence 4B | payload ... |
 * ============================================================
 */

import { createSocket, type RemoteInfo } from 'dgram';
import { logger } from '../utils/logger';
import { aesCtrDecrypt, aesCtrEncrypt, decodeHexKey } from './aes-ctr';

const TAG = 'UDPServer';

/** UDP 监听端口 */
const UDP_PORT = parseInt(process.env.UDP_PORT || '8080');

/** UDP 音频包头长度 */
const UDP_HEADER_SIZE = 16;

/** 设备 UDP 会话: deviceId → { key, nonce, ssrc, serverPort, address, lastActivity } */
const udpSessions = new Map<string, {
  key: Buffer;
  nonce: Buffer;
  ssrc: number;
  serverPort: number;
  clientAddress: string;
  clientPort: number;
  lastActivity: number;
}>();

/** 全局 UDP socket */
let udpSocket: ReturnType<typeof createSocket> | null = null;

/**
 * 启动 UDP 音频服务器
 */
export function startUDPServer(): ReturnType<typeof createSocket> | null {
  udpSocket = createSocket('udp4');

  udpSocket.on('message', (msg: Buffer, rinfo: RemoteInfo) => {
    try {
      handleUDPPacket(msg, rinfo);
    } catch (e: any) {
      logger.error(TAG, `处理 UDP 包错误: ${e.message}`);
    }
  });

  udpSocket.on('error', (err: Error) => {
    logger.error(TAG, `UDP 服务器错误: ${err.message}`);
  });

  udpSocket.bind(UDP_PORT, () => {
    console.log('='.repeat(56));
    console.log(' UDP 音频服务器已启动');
    console.log(` 监听端口: ${UDP_PORT}`);
    console.log('='.repeat(56));
    logger.info(TAG, `UDP 服务器已启动`, { port: UDP_PORT });
  });

  // 启动清理定时器（移除 60 秒无活动的会话）
  setInterval(() => {
    const now = Date.now();
    for (const [deviceId, session] of udpSessions) {
      if (now - session.lastActivity > 60000) {
        udpSessions.delete(deviceId);
        logger.info(TAG, `会话超时清理`, { deviceId });
      }
    }
  }, 30000);

  return udpSocket;
}

/**
 * 处理 UDP 数据包
 */
function handleUDPPacket(msg: Buffer, rinfo: RemoteInfo): void {
  if (msg.length < UDP_HEADER_SIZE) return;

  // 解析包头
  const type = msg.readUInt8(0);
  // const flags = msg.readUInt8(1);
  const payloadLen = msg.readUInt16BE(2);
  const ssrc = msg.readUInt32BE(4);
  const timestamp = msg.readUInt32BE(8);
  const sequence = msg.readUInt32BE(12);

  if (type !== 0x01) {
    logger.warn(TAG, `未知 UDP 包类型: ${type}`);
    return;
  }

  const payload = msg.slice(UDP_HEADER_SIZE, UDP_HEADER_SIZE + payloadLen);

  // 查找设备会话
  let deviceId: string | null = null;
  for (const [did, session] of udpSessions) {
    if (session.clientAddress === rinfo.address && session.clientPort === rinfo.port) {
      deviceId = did;
      break;
    }
  }

  if (!deviceId) {
    // 可能是新会话，尝试通过 SSRC 查找（或广播）
    logger.warn(TAG, `未找到 UDP 会话`, { address: rinfo.address, port: rinfo.port, ssrc });
    return;
  }

  const session = udpSessions.get(deviceId)!;
  session.lastActivity = Date.now();

  // 解密音频数据
  try {
    const decrypted = aesCtrDecrypt(payload, session.key, session.nonce);
    // 将解密后的 OPUS 音频转发到 WebSocket 连接处理器
    // 通过 ConnectionHandler 处理音频
    forwardAudioToHandler(deviceId, decrypted, timestamp, sequence);
  } catch (e: any) {
    logger.error(TAG, `解密失败: ${e.message}`, { deviceId });
  }
}

/**
 * 注册设备 UDP 会话
 */
export function registerUDPSession(
  deviceId: string,
  keyHex: string,
  nonceHex: string,
  clientAddress: string,
  clientPort: number,
): { server: string; port: number; ssrc: number } {
  const ssrc = Math.floor(Math.random() * 0xFFFFFFFF);

  udpSessions.set(deviceId, {
    key: decodeHexKey(keyHex),
    nonce: decodeHexKey(nonceHex),
    ssrc,
    serverPort: UDP_PORT,
    clientAddress,
    clientPort,
    lastActivity: Date.now(),
  });

  logger.info(TAG, `注册 UDP 会话`, { deviceId, ssrc, clientAddress, clientPort });

  return {
    server: process.env.UDP_HOST || '0.0.0.0',
    port: UDP_PORT,
    ssrc,
  };
}

/**
 * 发送加密音频到设备
 */
export function sendAudioToDevice(deviceId: string, opusData: Buffer, timestamp: number, sequence: number): boolean {
  if (!udpSocket) return false;

  const session = udpSessions.get(deviceId);
  if (!session) return false;

  try {
    // 加密音频数据
    const encrypted = aesCtrEncrypt(opusData, session.key, session.nonce);

    // 构建 UDP 包头
    const header = Buffer.alloc(UDP_HEADER_SIZE);
    header.writeUInt8(0x01, 0);                  // type
    header.writeUInt8(0x00, 1);                  // flags
    header.writeUInt16BE(encrypted.length, 2);   // payload_len
    header.writeUInt32BE(session.ssrc, 4);       // ssrc
    header.writeUInt32BE(timestamp, 8);          // timestamp
    header.writeUInt32BE(sequence, 12);          // sequence

    const packet = Buffer.concat([header, encrypted]);
    udpSocket.send(packet, session.clientPort, session.clientAddress);
    return true;
  } catch (e: any) {
    logger.error(TAG, `发送音频失败: ${e.message}`, { deviceId });
    return false;
  }
}

/**
 * 获取设备 UDP 会话
 */
export function getUDPSession(deviceId: string) {
  return udpSessions.get(deviceId);
}

/**
 * 移除设备 UDP 会话
 */
export function removeUDPSession(deviceId: string): void {
  udpSessions.delete(deviceId);
}

// 音频转发回调（由外部设置）
let audioForwardCallback: ((deviceId: string, opusData: Buffer, timestamp: number, sequence: number) => void) | null = null;

export function setAudioForwardCallback(callback: (deviceId: string, opusData: Buffer, timestamp: number, sequence: number) => void): void {
  audioForwardCallback = callback;
}

function forwardAudioToHandler(deviceId: string, opusData: Buffer, timestamp: number, sequence: number): void {
  if (audioForwardCallback) {
    audioForwardCallback(deviceId, opusData, timestamp, sequence);
  }
}
