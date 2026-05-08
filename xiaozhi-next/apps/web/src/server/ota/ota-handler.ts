/**
 * ============================================================
 * OTA 固件升级处理器 — HTTP 端点
 * 对标旧Python: core/api/ota_handler.py
 *
 * 职责：
 * 1. 提供固件版本查询接口
 * 2. 提供固件下载接口
 * 3. 管理固件版本信息
 *
 * 协议：
 *   GET  /xiaozhi/ota/check  — 检查更新
 *   GET  /xiaozhi/ota/download — 下载固件
 * ============================================================
 */

import type { IncomingMessage, ServerResponse } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** 固件版本信息 */
interface FirmwareInfo {
  version: string;
  filename: string;
  size: number;
  md5: string;
  releaseNotes: string;
  publishedAt: string;
  platform: string;
}

/** 模拟固件数据（实际应从数据库或配置文件读取） */
const FIRMWARE_STORE: Record<string, FirmwareInfo[]> = {
  'esp32-s3': [
    {
      version: '1.0.0',
      filename: 'xiaozhi-esp32-s3-v1.0.0.bin',
      size: 1048576,
      md5: 'abc123def456...',
      releaseNotes: '初始版本',
      publishedAt: '2026-01-01',
      platform: 'esp32-s3',
    },
  ],
  'esp32-c3': [
    {
      version: '1.0.0',
      filename: 'xiaozhi-esp32-c3-v1.0.0.bin',
      size: 524288,
      md5: 'def789abc012...',
      releaseNotes: '初始版本',
      publishedAt: '2026-01-01',
      platform: 'esp32-c3',
    },
  ],
};

/** 固件文件存储目录 */
const FIRMWARE_DIR = process.env.FIRMWARE_DIR || path.join(process.cwd(), 'firmware');

/**
 * 处理 OTA 检查请求
 *
 * 对标旧Python: ota_handler.check_update()
 *
 * 请求格式：
 *   GET /xiaozhi/ota/check?platform=esp32-s3&version=0.9.0
 *
 * 响应格式：
 *   { "hasUpdate": true, "latest": { "version": "1.0.0", ... } }
 */
export function handleOTACheck(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const platform = url.searchParams.get('platform') || 'esp32-s3';
  const currentVersion = url.searchParams.get('version') || '0.0.0';

  const firmwares = FIRMWARE_STORE[platform];
  if (!firmwares || firmwares.length === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `未找到平台 ${platform} 的固件` }));
    return;
  }

  // 获取最新版本
  const latest = firmwares[firmwares.length - 1]!;
  const hasUpdate = _compareVersions(latest.version, currentVersion) > 0;

  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({
    hasUpdate,
    currentVersion,
    latest: hasUpdate ? {
      version: latest.version,
      size: latest.size,
      md5: latest.md5,
      releaseNotes: latest.releaseNotes,
      publishedAt: latest.publishedAt,
    } : null,
  }));
}

/**
 * 处理 OTA 下载请求
 *
 * 对标旧Python: ota_handler.download()
 *
 * 请求格式：
 *   GET /xiaozhi/ota/download?platform=esp32-s3&version=1.0.0
 *
 * 响应：固件二进制文件（application/octet-stream）
 */
export async function handleOTADownload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const platform = url.searchParams.get('platform') || 'esp32-s3';
  const version = url.searchParams.get('version') || '';

  const firmwares = FIRMWARE_STORE[platform];
  if (!firmwares) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `未找到平台 ${platform} 的固件` }));
    return;
  }

  // 查找指定版本
  let firmware: FirmwareInfo | undefined;
  if (version) {
    firmware = firmwares.find(f => f.version === version);
  } else {
    firmware = firmwares[firmwares.length - 1];
  }

  if (!firmware) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `未找到版本 ${version} 的固件` }));
    return;
  }

  // 查找本地固件文件
  const filePath = path.join(FIRMWARE_DIR, firmware.filename);

  try {
    const stat = await fs.promises.stat(filePath);
    const fileStream = fs.createReadStream(filePath);

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${firmware.filename}"`,
      'X-Firmware-Version': firmware.version,
      'X-Firmware-MD5': firmware.md5,
      'Access-Control-Allow-Origin': '*',
    });

    fileStream.pipe(res);
  } catch {
    // 文件不存在，返回 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `固件文件不存在: ${firmware.filename}`,
      hint: `请将固件文件放入 ${FIRMWARE_DIR} 目录`,
      expectedPath: filePath,
    }));
  }
}

/**
 * 注册 OTA 路由到 HTTP 服务器
 */
export function registerOTARoutes(router: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>) => void): void {
  router('/xiaozhi/ota/check', (req, res) => { handleOTACheck(req, res); });
  router('/xiaozhi/ota/download', (req, res) => { handleOTADownload(req, res); });
}

/**
 * 版本号比较
 * @returns 1 (a > b), -1 (a < b), 0 (a == b)
 */
function _compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}
