import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['onnxruntime-node', 'sharp'],
  images: {
    remotePatterns: [],
  },

  /**
   * uni-app 旧路径 → 新 API 路径映射
   *
   * uni-app (manager-mobile) 使用旧 Java Spring Boot 风格的 API 路径，
   * 如 /user/login、/agent/list。通过 rewrites 将其映射到 Next.js 新路径
   * /api/auth/login、/api/agents，实现 uni-app 零代码兼容。
   */
  async rewrites() {
    return [
      // ──────────── 认证模块 /user/* → /api/auth/* ────────────
      { source: '/user/login', destination: '/api/auth/login' },
      { source: '/user/info', destination: '/api/auth/me' },
      { source: '/user/captcha', destination: '/api/auth/captcha' },
      { source: '/user/pub-config', destination: '/api/auth/pub-config' },
      { source: '/user/register', destination: '/api/auth/register' },
      { source: '/user/smsVerification', destination: '/api/auth/sms' },
      { source: '/user/retrieve-password', destination: '/api/auth/reset-password' },

      // ──────────── 智能体模块 /agent/* → /api/agents/* ────────────
      { source: '/agent/list', destination: '/api/agents' },
      { source: '/agent/template', destination: '/api/templates' },
      { source: '/agent/mcp/address/:id', destination: '/api/agents/:id/mcp/address' },
      { source: '/agent/mcp/tools/:id', destination: '/api/agents/:id/mcp/tools' },
      { source: '/agent/voice-print/list/:id', destination: '/api/agents/:id/voice-prints' },
      { source: '/agent/voice-print', destination: '/api/agents/voice-prints' },
      { source: '/agent/play/:downloadId', destination: '/api/agents/play/:downloadId' },
      { source: '/agent/:id/chat-history/user', destination: '/api/agents/:id/chat-history/user' },
      { source: '/agent/:id/chat-history/:sid', destination: '/api/agents/:id/chat-history/:sid' },
      { source: '/agent/:id/sessions', destination: '/api/agents/:id/sessions' },
      { source: '/agent/:id/tags', destination: '/api/agents/:id/tags' },
      { source: '/agent/:id', destination: '/api/agents/:id' },
      { source: '/agent', destination: '/api/agents' },
      // 声纹子资源
      { source: '/agent/voice-print', destination: '/api/agents/voice-prints' },
      { source: '/agent/audio/:id', destination: '/api/agents/audio/:id' },

      // ──────────── 设备模块 /device/* → /api/devices/* ────────────
      { source: '/device/bind/:agentId/:code', destination: '/api/devices/bind/:agentId/:code' },
      { source: '/device/bind/:agentId', destination: '/api/devices/bind/:agentId' },
      { source: '/device/unbind', destination: '/api/devices/unbind' },
      { source: '/device/manual-add', destination: '/api/devices/manual-add' },
      // uni-app 按 MAC 更新设备，走兼容层
      { source: '/device/update/:macAddress', destination: '/api/devices/by-mac/update' },

      // ──────────── 模型模块 /models/* → /api/models/* ────────────
      { source: '/models/names', destination: '/api/models/names' },
      { source: '/models/:id/voices', destination: '/api/models/:id/voices' },
      { source: '/models/provider/plugin/names', destination: '/api/models/names' },

      // ──────────── 管理模块 /admin/* → /api/admin/* ────────────
      { source: '/admin/dict/data/type/:type', destination: '/api/admin/dict/data/type/:type' },
    ];
  },
};

export default withNextIntl(nextConfig);
