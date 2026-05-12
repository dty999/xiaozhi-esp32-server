/**
 * 设备连接处理器 — WebSocket AI 对话核心管线
 * 对标旧Python: core/connection.py → ConnectionHandler
 *
 * 全管线：VAD → ASR → Intent → Memory → LLM → FunctionCall → TTS → Opus → 客户端
 *
 * 在无 ESP32 硬件的开发环境中，OpusCodec 与 SileroVAD 自动降级为模拟模式
 */
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import type {
  ChatMessage, AgentConfig, LLMProvider, ASRProvider,
  TTSProvider, MemoryProvider, IntentProvider, ToolCall, ToolDefinition,
} from './types';
import { DialogueManager } from './types';

import { SileroVAD, SilenceDetector } from './vad/silero-vad';
import { OpusCodec } from './audio/opus-codec';
import { AudioRateController, ensureRateController, PRE_BUFFER_COUNT } from './audio/audio-rate-controller';
import { MarkdownCleaner, applyCorrectWords, extractEmotion, TTS_TRIGGER_PUNCTUATIONS } from './audio/text-cleaner';
import { createASRProvider } from './asr/provider-factory';
import { createLLMProvider } from './llm/provider-factory';
import { createTTSProvider } from './tts/provider-factory';
import { createMemoryProvider } from './memory/provider-factory';
import { createIntentProvider } from './intent/provider-factory';
import { initPlugins, getToolDefinitions, executeToolCalls, registerTool, ToolFunction, ToolContext } from './plugins/func-handler';
import type { ToolResult } from './plugins/func-handler';
import { buildContext } from './context/context-provider';
import { logger } from './utils/logger';
import { MCPClient } from './mcp/mcp-client';
import { handleMCPMessage, sendMCPInitialize, callMCPTool } from './mcp/mcp-handler';
import { IotDescriptor } from './iot/iot-descriptor';
import { handleIotDescriptors, handleIotStatus, registerIotTools, getIotStatus, sendIotCommand } from './iot/iot-handler';
import { handleServerMessage } from './server/server-handler';

// ---- 句子生命周期枚举（对标 SentenceType） ----
const SentenceState = { FIRST: 'first', MIDDLE: 'middle', LAST: 'last' } as const;
type SentenceState = (typeof SentenceState)[keyof typeof SentenceState];

// ---- 工具执行行动枚举（对标 Action） ----
const ActionType = {
  RESPONSE: 'response',
  REQLLM: 'reqllm',
  RECORD: 'record',
  ERROR: 'error',
} as const;
type ActionType = (typeof ActionType)[keyof typeof ActionType];

interface TTSQueueItem { text: string; priority: number; }

// ---- 直接退出命令（1-3字精确匹配） ----
const EXIT_PHRASES = new Set(['再见', '拜拜', 'bye', '退出', '告辞', '晚安', '休息吧']);

// ---- 唤醒词随机回复（对标 WAKEUP_CONFIG） ----
const WAKEUP_RESPONSES = [
  '我一直都在呢，您请说。', '在的呢，请随时吩咐我。',
  '来啦来啦，请告诉我吧。', '您请说，我正听着。',
  '请您讲话，我准备好了。', '我在这里，等候您的指令。',
  '请问您需要什么帮助？',
];

export class ConnectionHandler {
  // ---- 基础属性 ----
  private ws: WebSocket; readonly deviceId: string; readonly clientIp: string;
  readonly sessionId: string;
  /** 二进制音频协议版本 (1/2/3) */
  readonly protocolVersion: number;
  private config!: AgentConfig;
  private vad: SileroVAD; private silenceDetector: SilenceDetector;
  private asr: ASRProvider | null = null; private llm: LLMProvider | null = null;
  private tts: TTSProvider | null = null; private memory: MemoryProvider | null = null;
  private intent: IntentProvider | null = null; private opusCodec: OpusCodec;

  // ---- 对话状态 ----
  private dialogue: DialogueManager;
  private listenMode = 'auto'; private isListening = true; private clientIsSpeaking = false;
  private speechBuffer: Float32Array[] = [];

  // ---- TTS与流控 ----
  private ttsQueue: TTSQueueItem[] = []; private ttsRunning = false;
  private ttsTextBuffer = '';
  private sentenceId: string | null = null;
  private rateController: AudioRateController | null = null;
  private flowControl: { packetCount: number; sequence: number; sentenceId: string } | null = null;
  private emotionFlag = false; // 每轮对话仅提取一次情绪

  // ---- 打断与超时 ----
  private clientAbort = false; private llmAbortController: AbortController | null = null;
  private closeAfterChat = false; private maxOutputSize = 0;
  private firstActivityTime = Date.now(); private lastActivityTime = Date.now();
  private timeoutTask: ReturnType<typeof setInterval> | null = null;

  // ---- 意图与插件 ----
  private intentType = 'nointent'; private pluginsLoaded = false;
  private welcomeMsg: Record<string, any>;

  // ---- MCP 客户端（对标旧Python: conn.mcp_client） ----
  mcpClient: MCPClient | null = null;
  private features: Record<string, any> = {};

  // ---- IoT 设备描述符（对标旧Python: conn.iot_descriptors） ----
  iotDescriptors: Map<string, IotDescriptor> = new Map();
  private iotToolsRegistered = false;

  // ---- 设备绑定状态（对标旧Python: conn.need_bind） ----
  private needBind = false;
  private bindCompleted = false;
  private readConfigFromApi = false;

  constructor(ws: WebSocket, deviceId: string, clientIp: string, protocolVersion = 1) {
    this.ws = ws; this.deviceId = deviceId; this.clientIp = clientIp;
    this.sessionId = uuidv4();
    this.protocolVersion = protocolVersion;
    this.vad = SileroVAD.getInstance();
    this.silenceDetector = new SilenceDetector(200);
    this.opusCodec = new OpusCodec();
    this.dialogue = new DialogueManager(20);
    this.welcomeMsg = {
      type: 'hello',
      transport: 'websocket',
      session_id: this.sessionId,
      audio_params: { format: 'opus', sample_rate: 24000, channels: 1, frame_duration: 60 },
    };
    logger.info('Connection', `新连接建立`, { deviceId, clientIp, sessionId: this.sessionId, protocolVersion });
  }

  // ===== 初始化 =====
  async initialize(): Promise<void> {
    this.config = await this._loadDeviceConfig();
    if (this.config.welcome_msg) {
      this.welcomeMsg = { ...this.welcomeMsg, ...this.config.welcome_msg, session_id: this.sessionId };
    }
    this.intentType = this.config.Intent?.type || 'nointent';
    try {
      if (this.config.ASR) { this.asr = await createASRProvider(this.config.ASR); }
      if (this.config.LLM) { this.llm = await createLLMProvider(this.config.LLM); }
      if (this.config.TTS) { this.tts = await createTTSProvider(this.config.TTS); }
      if (this.config.Memory) { this.memory = await createMemoryProvider(this.config.Memory); }
      if (this.config.Intent && this.intentType !== 'nointent') {
        this.intent = await createIntentProvider(this.config.Intent);
      }
      if (!this.pluginsLoaded) { initPlugins(); this.pluginsLoaded = true; }
      // ---- Few-shot 工具调用示例注入（对标 _inject_tool_call_fewshot） ----
      if (this.intentType === 'function_call') { this._injectFewShot(); }
      const prompt = this.config.prompt || '你是小智，一个智能语音助手。请用简洁自然的语言回复用户。';
      this.dialogue.updateSystemMessage(prompt);
      if (this.config.device_max_output_size) { this.maxOutputSize = this.config.device_max_output_size; }
      // ---- 启动超时检查（对标 _check_timeout） ----
      this._startTimeoutCheck();
      logger.info('Connection', `初始化完成`, {
        deviceId: this.deviceId,
        asr: this.asr?.name || '-',
        llm: this.llm?.name || '-',
        tts: this.tts?.name || '-',
        intent: this.intentType,
      });
    } catch (e: any) {
      logger.error('Connection', `初始化失败: ${e.message}`, { deviceId: this.deviceId });
    }
  }

  private async _loadDeviceConfig(): Promise<AgentConfig> {
    const defaults: AgentConfig = {
      prompt: '你是小智，一个智能语音助手。请用简洁自然的语言回复用户，回复长度控制在100字以内。',
      ASR: { type: process.env.ASR_PROVIDER || 'openai', api_url: process.env.ASR_API_URL, api_key: process.env.ASR_API_KEY, model_name: process.env.ASR_MODEL || 'whisper-1' },
      LLM: { type: process.env.LLM_PROVIDER || 'openai', api_url: process.env.LLM_API_URL, api_key: process.env.LLM_API_KEY, model_name: process.env.LLM_MODEL || 'gpt-4o-mini', max_tokens: 2048, temperature: 0.7 },
      TTS: { type: process.env.TTS_PROVIDER || 'edge', voice: process.env.TTS_VOICE || 'zh-CN-XiaoxiaoNeural', volume: 80, rate: 1.0, pitch: 0 },
      Memory: { type: 'nomem' }, Intent: { type: 'function_call' },
      exit_commands: ['退出', '再见', '拜拜'],
    };
    const apiUrl = process.env.MANAGER_API_URL; const secret = process.env.SERVER_SECRET;
    if (apiUrl && secret) {
      try {
        const r = await fetch(`${apiUrl}/api/config/agent-models`, { method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ macAddress: this.deviceId }), signal: AbortSignal.timeout(10000) });
        if (r.ok) { const d = await r.json(); if (d.data) return { ...defaults, ...d.data }; }
      } catch {}
    }
    return defaults;
  }

  /** 注入工具调用 few-shot 示例（对标 _inject_tool_call_fewshot） */
  private _injectFewShot(): void {
    const daId = uuidv4();
    this.dialogue.put({ role: 'user', content: '给我讲个故事吧', is_temporary: true } as ChatMessage);
    this.dialogue.put({ role: 'assistant', content: '', is_temporary: true,
      tool_calls: [{ id: daId, type: 'function', index: 0,
        function: { name: 'direct_answer', arguments: '{"response": "好呀，你想听什么类型的呀？童话、冒险还是搞笑的？选一个我给你开讲~"}' } }] } as ChatMessage);
    this.dialogue.put({ role: 'tool', tool_call_id: daId, content: '已直接回复', is_temporary: true } as ChatMessage);
    const exId = uuidv4();
    this.dialogue.put({ role: 'user', content: '拜拜', is_temporary: true } as ChatMessage);
    this.dialogue.put({ role: 'assistant', content: '', is_temporary: true,
      tool_calls: [{ id: exId, type: 'function', index: 0,
        function: { name: 'handle_exit_intent', arguments: '{"say_goodbye": "再见，下次再聊~"}' } }] } as ChatMessage);
    this.dialogue.put({ role: 'tool', tool_call_id: exId, content: '退出意图已处理', is_temporary: true } as ChatMessage);
    this.dialogue.put({ role: 'assistant', content: '再见，下次再聊~', is_temporary: true } as ChatMessage);
  }

  /** 超时检查（对标 _check_timeout），每10秒检查一次 */
  private _startTimeoutCheck(): void {
    const timeoutSeconds = 180; // 3分钟无活动
    this.timeoutTask = setInterval(() => {
      if (Date.now() - this.lastActivityTime > timeoutSeconds * 1000) {
        console.log(`[Connection] ${this.deviceId} 连接超时`);
        if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
      }
    }, 10000);
  }

  // ===== 消息路由 =====
  onMessage(data: Buffer): void {
    this.lastActivityTime = Date.now();
    if (data.length === 0) return;
    try {
      // 根据协议版本解析二进制帧
      if (data[0] === 0x7B) {
        // JSON 消息（以 '{' 开头）
        const msg = JSON.parse(data.toString());
        this._routeMessage(msg);
      } else if (this.protocolVersion === 1) {
        // 版本 1：直接传输原始 OPUS 数据
        this._handleAudioFrame(data);
      } else if (this.protocolVersion === 2) {
        // 版本 2：带时间戳的二进制协议
        this._handleBinaryProtocol2(data);
      } else if (this.protocolVersion === 3) {
        // 版本 3：简化头
        this._handleBinaryProtocol3(data);
      } else {
        // 默认按版本 1 处理
        this._handleAudioFrame(data);
      }
    } catch {}
  }

  private _routeMessage(msg: Record<string, any>): void {
    switch (msg.type as string) {
      case 'hello': this._handleHello(msg); break;
      case 'listen': this._handleListen(msg); break;
      case 'abort': this._handleAbort(); break;
      case 'iot': this._handleIotMessage(msg); break;
      case 'mcp': this._handleMcpMessage(msg); break;
      case 'server': this._handleServerMessage(msg); break;
      case 'ping': this._sendJson({ type: 'pong' }); break;
    }
  }

  // ===== Hello 握手（对标 helloHandle） =====
  private _handleHello(msg: Record<string, any>): void {
    if (msg.audio_params) {
      // 合并设备的 audio_params，但服务器下行采样率固定为 24000
      this.welcomeMsg.audio_params = {
        ...msg.audio_params,
        sample_rate: 24000,
      };
    }
    this.welcomeMsg.transport = msg.transport || 'websocket';

    // 如果设备请求 UDP 传输（MQTT 模式下），添加 UDP 配置
    if (msg.transport === 'udp') {
      try {
        const { registerUDPSession } = require('./udp/udp-server');
        const clientIp = this.clientIp;
        const clientPort = 8080; // 设备默认端口
        const { generateCryptoParams } = require('./udp/aes-ctr');
        const { key, nonce } = generateCryptoParams();
        const udpInfo = registerUDPSession(this.deviceId, key, nonce, clientIp, clientPort);

        (this.welcomeMsg as any).udp = {
          server: udpInfo.server,
          port: udpInfo.port,
          key,
          nonce,
        };
      } catch (e: any) {
        logger.warn('Connection', `注册 UDP 会话失败: ${e.message}`, { deviceId: this.deviceId });
      }
    }

    if (msg.features) {
      this.features = msg.features;
      if (msg.features.mcp) {
        logger.info('Connection', `设备支持MCP，初始化MCP客户端`, { deviceId: this.deviceId });
        this.mcpClient = new MCPClient();
        sendMCPInitialize(this.ws);
      }
    }
    this._sendJson(this.welcomeMsg);
  }

  // ===== Listen 监听状态（对标 listenMessageHandler） =====
  private async _handleListen(msg: Record<string, any>): Promise<void> {
    if (msg.mode) { this.listenMode = msg.mode; }
    if (msg.state === 'start') {
      this.isListening = true; this.clientIsSpeaking = true;
    } else if (msg.state === 'stop') {
      this.isListening = false; this.clientIsSpeaking = false;
      if (this.listenMode === 'manual' && this.speechBuffer.length > 0) { await this._handleSpeechEnd(); }
    } else if (msg.state === 'detect') {
      // 唤醒词检测
      this._sendJson({ type: 'stt', text: msg.text || '', session_id: this.sessionId });
      // 发送唤醒回复
      const reply = WAKEUP_RESPONSES[Math.floor(Math.random() * WAKEUP_RESPONSES.length)]!;
      this._sendSttAndStart(reply);
      this._ttsOneSentence(reply);
      this.dialogue.put({ role: 'assistant', content: reply });
    }
  }

  // ===== Abort 打断（对标 abortHandle） =====
  private _handleAbort(): void {
    this.closeAfterChat = false; this.clientAbort = true;
    this.llmAbortController?.abort(); this.llmAbortController = null;
    this.ttsQueue = []; this.ttsRunning = false;
    this.speechBuffer = []; this.silenceDetector.reset();
    // 重置流控器
    if (this.rateController) { this.rateController.stopSending(); this.rateController = null; }
    this._sendJson({ type: 'tts', state: 'stop' });
  }

  // ===== IoT 消息处理（对标 iotMessageHandler） =====
  private _handleIotMessage(msg: Record<string, any>): void {
    if (msg.descriptors) {
      const changed = handleIotDescriptors(
        this.iotDescriptors,
        msg.descriptors,
        () => { this._refreshIotTools(); },
      );
      if (changed) {
        logger.info('Connection', `IoT描述符已更新`, {
          deviceId: this.deviceId,
          count: this.iotDescriptors.size,
        });
      }
    }
    if (msg.states) {
      handleIotStatus(this.iotDescriptors, msg.states);
    }
  }

  // ===== MCP 消息处理（对标 mcpMessageHandler） =====
  private _handleMcpMessage(msg: Record<string, any>): void {
    if (!this.mcpClient) {
      logger.warn('Connection', `收到MCP消息但客户端未初始化`, { deviceId: this.deviceId });
      return;
    }
    if (msg.payload) {
      handleMCPMessage(this.ws, this.mcpClient, msg.payload, () => {
        this._refreshMCPTools();
      }).catch((e: any) => {
        logger.error('Connection', `MCP消息处理失败: ${e.message}`, { deviceId: this.deviceId });
      });
    }
  }

  // ===== Server 消息处理（对标 serverMessageHandler） =====
  private _handleServerMessage(msg: Record<string, any>): void {
    handleServerMessage(this.ws, msg, {
      readConfigFromApi: this.readConfigFromApi,
      secret: process.env.SERVER_SECRET,
      server: null,
    });
  }

  /** 刷新IoT工具注册 */
  private _refreshIotTools(): void {
    const iotTools = registerIotTools(this.iotDescriptors);
    for (const toolDef of iotTools) {
      const name = toolDef.function.name;
      if (!this.iotToolsRegistered) {
        const handler: ToolFunction = async (args, ctx) => {
          return this._executeIotTool(name, args, ctx);
        };
        registerTool(name, handler, toolDef);
      }
    }
    this.iotToolsRegistered = true;
    logger.info('Connection', `IoT工具已注册`, {
      deviceId: this.deviceId,
      count: iotTools.length,
    });
  }

  /** 刷新MCP工具注册 */
  private _refreshMCPTools(): void {
    if (!this.mcpClient) return;
    const mcpTools = this.mcpClient.getAvailableTools();
    for (const toolDef of mcpTools) {
      const name = toolDef.function.name;
      const handler: ToolFunction = async (args, ctx) => {
        return this._executeMCPTool(name, args, ctx);
      };
      registerTool(name, handler, {
        type: 'function',
        function: toolDef.function,
      });
    }
    logger.info('Connection', `MCP工具已注册`, {
      deviceId: this.deviceId,
      count: mcpTools.length,
    });
  }

  /** 执行IoT工具 */
  private async _executeIotTool(toolName: string, args: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> {
    try {
      if (toolName.startsWith('get_')) {
        const parts = toolName.split('_', 2);
        if (parts.length >= 2) {
          const rest = toolName.substring(parts[0]!.length + 1 + parts[1]!.length + 1);
          const deviceName = parts[1]!;
          const propertyName = rest;
          const value = getIotStatus(this.iotDescriptors, deviceName, propertyName);
          if (value !== null) {
            const responseSuccess = args.response_success || '查询成功：{value}';
            return {
              success: true,
              result: responseSuccess.replace('{value}', String(value)),
              needsLLMResponse: false,
            };
          }
          return {
            success: false,
            result: args.response_failure || `无法获取${deviceName}的状态`,
          };
        }
      } else {
        const parts = toolName.split('_', 1);
        if (parts.length >= 1) {
          const deviceName = parts[0]!;
          const methodName = toolName.substring(deviceName.length + 1);
          const controlParams: Record<string, any> = {};
          for (const [k, v] of Object.entries(args)) {
            if (k !== 'response_success' && k !== 'response_failure') {
              controlParams[k] = v;
            }
          }
          const sent = sendIotCommand(this.ws, this.iotDescriptors, deviceName, methodName, controlParams);
          if (sent) {
            let responseSuccess = args.response_success || '操作成功';
            for (const [k, v] of Object.entries(controlParams)) {
              responseSuccess = responseSuccess.replace(`{${k}}`, String(v));
            }
            return {
              success: true,
              result: responseSuccess,
              needsLLMResponse: true,
            };
          }
          return { success: false, result: args.response_failure || '操作失败' };
        }
      }
      return { success: false, result: '无法解析IoT工具名称' };
    } catch (e: any) {
      return { success: false, result: args.response_failure || `操作失败: ${e.message}` };
    }
  }

  /** 执行MCP工具 */
  private async _executeMCPTool(toolName: string, args: Record<string, any>, _ctx: ToolContext): Promise<ToolResult> {
    if (!this.mcpClient || !this.mcpClient.ready) {
      return { success: false, result: 'MCP客户端未准备就绪' };
    }
    try {
      const argsStr = JSON.stringify(args);
      const result = await callMCPTool(this.ws, this.mcpClient, toolName, argsStr, 30);
      return {
        success: true,
        result: String(result),
        needsLLMResponse: true,
      };
    } catch (e: any) {
      if (e.message?.includes('不存在')) {
        return { success: false, result: e.message };
      }
      return { success: false, result: `MCP工具执行失败: ${e.message}` };
    }
  }

  // ===== 音频处理管线 =====
  private async _handleAudioFrame(opusData: Buffer): Promise<void> {
    if (!this.isListening || this.clientAbort) return;
    try {
      const pcmFrame = await this.opusCodec.decode(opusData);
      const vadState = { opusDecoder: null, audioBuffer: [], context: null, state: null, sampleRate: 16000 };
      const vadResult = await this.vad.detectSpeech(vadState, pcmFrame, this.listenMode);
      if (vadResult.isSpeech || this.listenMode === 'manual') {
        this.speechBuffer.push(pcmFrame);
        this.clientIsSpeaking = true;
      }
      if (this.listenMode !== 'manual') {
        const sr = this.silenceDetector.feed(vadResult.isSpeech);
        if (sr.shouldTriggerASR && this.speechBuffer.length > 0) { await this._handleSpeechEnd(); }
      }
    } catch { this.speechBuffer = []; }
  }

  // ===== 二进制协议版本 2（带时间戳）=====
  private async _handleBinaryProtocol2(data: Buffer): Promise<void> {
    // struct BinaryProtocol2 {
    //     uint16_t version;        // 协议版本 (大端序)
    //     uint16_t type;           // 0=OPUS, 1=JSON
    //     uint32_t reserved;       // 保留
    //     uint32_t timestamp;      // 时间戳毫秒 (大端序)
    //     uint32_t payload_size;   // 负载大小 (大端序)
    //     uint8_t  payload[];      // 变长负载
    // }
    if (data.length < 16) return;
    const version = data.readUInt16BE(0);
    const type = data.readUInt16BE(2);
    // const reserved = data.readUInt32BE(4);
    // const timestamp = data.readUInt32BE(8);
    const payloadSize = data.readUInt32BE(12);
    const payload = data.slice(16, 16 + payloadSize);

    if (type === 0) {
      // OPUS 音频
      await this._handleAudioFrame(payload);
    } else if (type === 1) {
      // JSON 消息
      try {
        const msg = JSON.parse(payload.toString());
        this._routeMessage(msg);
      } catch {}
    }
  }

  // ===== 二进制协议版本 3（简化头）=====
  private async _handleBinaryProtocol3(data: Buffer): Promise<void> {
    // struct BinaryProtocol3 {
    //     uint8_t  type;           // 消息类型
    //     uint8_t  reserved;       // 保留
    //     uint16_t payload_size;   // 负载大小 (大端序)
    //     uint8_t  payload[];      // 变长负载
    // }
    if (data.length < 4) return;
    const type = data.readUInt8(0);
    // const reserved = data.readUInt8(1);
    const payloadSize = data.readUInt16BE(2);
    const payload = data.slice(4, 4 + payloadSize);

    if (type === 0) {
      // OPUS 音频
      await this._handleAudioFrame(payload);
    } else if (type === 1) {
      // JSON 消息
      try {
        const msg = JSON.parse(payload.toString());
        this._routeMessage(msg);
      } catch {}
    }
  }

  /** 发送二进制音频帧（带协议头） */
  private async _sendAudioFrame(opusData: Buffer): Promise<void> {
    if (this.ws.readyState !== WebSocket.OPEN) return;

    if (this.protocolVersion === 1) {
      // 版本 1：直接发送 OPUS 数据
      this.ws.send(opusData);
    } else if (this.protocolVersion === 2) {
      // 版本 2：带时间戳的二进制协议
      const header = Buffer.alloc(16);
      header.writeUInt16BE(2, 0);        // version
      header.writeUInt16BE(0, 2);        // type = OPUS
      header.writeUInt32BE(0, 4);        // reserved
      header.writeUInt32BE(Date.now(), 8); // timestamp
      header.writeUInt32BE(opusData.length, 12); // payload_size
      this.ws.send(Buffer.concat([header, opusData]));
    } else if (this.protocolVersion === 3) {
      // 版本 3：简化头
      const header = Buffer.alloc(4);
      header.writeUInt8(0, 0);           // type = OPUS
      header.writeUInt8(0, 1);           // reserved
      header.writeUInt16BE(opusData.length, 2); // payload_size
      this.ws.send(Buffer.concat([header, opusData]));
    } else {
      this.ws.send(opusData);
    }
  }

  private async _handleSpeechEnd(): Promise<void> {
    if (this.speechBuffer.length === 0) return;
    this.clientIsSpeaking = false; this.silenceDetector.reset();
    const fullAudio = this.opusCodec.mergeFrames(this.speechBuffer);
    this.speechBuffer = [];
    if (!this.asr) return;
    const text = await this.asr.speechToText(fullAudio, 16000).catch(() => '');
    if (!text.trim()) return;
    console.log(`[Connection] ASR: "${text}"`);

    // ---- 设备绑定检查（对标 check_bind_device） ----
    if (this.needBind) {
      this._checkBindDevice();
      return;
    }

    // ---- 输出字数限制检查（对标 check_device_output_limit） ----
    if (this.maxOutputSize > 0 && this._checkOutputLimit()) {
      this._sendSttAndStart('不好意思，我现在有点事情要忙，明天这个时候我们再聊，约好了哦！明天不见不散，拜拜！');
      this._ttsOneSentence('不好意思，我现在有点事情要忙，明天这个时候我们再聊，约好了哦！明天不见不散，拜拜！');
      this.closeAfterChat = true;
      this._endChat();
      return;
    }

    // ---- 唤醒词检测（对标 checkWakeupWords） ----
    if (this.config.wakeup_words) {
      const filtered = text.replace(/[，,。\.！!？?；;：:]/g, '').trim();
      if (this.config.wakeup_words.includes(filtered)) {
        const reply = WAKEUP_RESPONSES[Math.floor(Math.random() * WAKEUP_RESPONSES.length)]!;
        this._sendSttAndStart(reply);
        this._ttsOneSentence(reply);
        this.dialogue.put({ role: 'assistant', content: reply });
        return;
      }
    }

    // ---- 直接退出命令（对标 check_direct_exit） ----
    const filtered = text.replace(/[，,。\.！!？?；;：:]/g, '').trim();
    if (EXIT_PHRASES.has(filtered)) {
      this._sendSttAndStart('好的，再见！');
      this._ttsOneSentence('好的，再见！');
      this.closeAfterChat = true;
      this._endChat();
      return;
    }

    // ---- 正常对话 ----
    this._sendSttAndStart(text);
    this.clientAbort = false;
    await this._chat(text);
  }

  /** 发送 STT + sentence_start 协议消息（对标 send_stt_message + send_tts_message start） */
  private _sendSttAndStart(text: string): void {
    this._sendJson({ type: 'stt', text, session_id: this.sessionId });
    this._sendJson({ type: 'tts', state: 'start', session_id: this.sessionId });
    this.clientIsSpeaking = true;
  }

  // ===== 核心对话 chat()（对标 connection.py chat） =====
  private async _chat(query: string, depth = 0): Promise<void> {
    if (depth === 0) {
      this.sentenceId = uuidv4().replace(/-/g, '').slice(0, 16);
      this.dialogue.put({ role: 'user', content: query });
      this.emotionFlag = true;
      // 发送 FIRST 标记
      this._sendJson({ type: 'tts', state: 'sentence_start' });
    }
    const MAX_DEPTH = 5;
    if (depth >= MAX_DEPTH) { this._endChat(); return; }
    if (!this.llm) { this._sendJson({ type: 'tts', text: '大模型未配置', state: 'sentence_start' }); this._endChat(); return; }

    // 1. 查询记忆
    let memCtx = '';
    if (this.memory && query) { try { memCtx = await this.memory.queryMemory(query); } catch {} }

    // 2. 构建消息
    const contextStr = await buildContext(this.deviceId, this.sessionId, this.config.context_providers).catch(() => '');
    const messages = this.dialogue.getLLMDialogueWithMemory(memCtx, this.config.voiceprint);
    if (contextStr) {
      // 将动态上下文注入到消息中
      const existingSystemMsg = messages.find(m => m.role === 'system');
      if (existingSystemMsg) {
        existingSystemMsg.content += `\n${contextStr}`;
      } else {
        messages.unshift({ role: 'system', content: contextStr });
      }
    }
    if (messages[messages.length - 1]?.role !== 'user') { messages.push({ role: 'user', content: query }); }

    // 3. 意图识别
    if (this.intent && depth === 0) {
      const ir = await this.intent.detect(query).catch(() => ({ exit: false }));
      if (ir.exit) { this._ttsOneSentence('好的，再见！'); this._endChat(); return; }
    }

    // 4. LLM 流式生成
    this._sendJson({ type: 'llm', state: 'start' });
    const tools = this.intentType === 'function_call' ? getToolDefinitions() : [];
    let fullResponse = '';
    this.llmAbortController = new AbortController();
    try {
      const response = await this.llm.responseWithFunctions(messages, tools,
        async (token: string) => {
          fullResponse += token;
          // ---- 情绪表情提取（每轮首个非空token） ----
          if (this.emotionFlag) {
            const { emotion, text: cleanToken } = extractEmotion(token);
            if (emotion) {
              // 固件规范要求 emotion 在 llm 消息中传递
              this._sendJson({ type: 'llm', emotion, text: cleanToken, state: 'sentence_start' });
            } else {
              this._sendJson({ type: 'llm', text: token, state: 'sentence_start' });
            }
            this.emotionFlag = false;
          } else {
            // 发送字幕
            this._sendJson({ type: 'llm', text: token, state: 'sentence_start' });
          }
          // 按标点分句触发TTS
          this.ttsTextBuffer += token;
          if (TTS_TRIGGER_PUNCTUATIONS.has(token[token.length - 1]!)) {
            this._enqueueTTSBlock();
          }
        }, this.llmAbortController.signal);
      this._enqueueTTSBlock(true); // 剩余文本

      // 5. 处理工具调用
      if (response.toolCalls?.length) { await this._processToolCalls(response.toolCalls, depth, fullResponse); }

      this._sendJson({ type: 'llm', state: 'stop' });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error(`[Connection] LLM错误: ${e.message}`);
        this._sendJson({ type: 'llm', state: 'error', error: e.message });
        this._ttsOneSentence('抱歉，我暂时无法回复，请稍后再试。');
      }
    } finally { this.llmAbortController = null; }

    if (fullResponse) { this.dialogue.put({ role: 'assistant', content: fullResponse }); }
    if (depth === 0) { this._endChat(); }
  }

  // ===== 工具调用处理（对标 _handle_function_result） =====
  private async _processToolCalls(toolCalls: ToolCall[], depth: number, streamedText: string): Promise<void> {
    console.log(`[Connection] 工具调用: ${toolCalls.map(tc => tc.function.name).join(', ')}`);

    for (const tc of toolCalls) {
      if (tc.function.name !== 'direct_answer') {
        this._sendJson({ type: 'llm', text: `正在执行${tc.function.name}...`, state: 'tool_call' });
      }
    }

    this.dialogue.put({ role: 'assistant', content: '', tool_calls: toolCalls });

    const ctx: ToolContext = {
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      toolCallTimeout: this.config.tool_call_timeout || 30,
    };
    const results = await executeToolCalls(toolCalls, ctx);

    // ---- 按 Action 类型分类处理（对标 Action.RESPONSE/REQLLM/RECORD/ERROR） ----
    let needLLM = false;
    for (const tc of toolCalls) {
      const r = results.get(tc.id);
      if (!r) continue;

      // direct_answer 已在流式阶段播报，历史中已写入
      if (tc.function.name === 'direct_answer') {
        try {
          const args = JSON.parse(tc.function.arguments || '{}');
          if (args.response) this.dialogue.put({ role: 'assistant', content: args.response });
        } catch {}
        continue;
      }

      // Action.RESPONSE / ERROR / NOTFOUND → 直接回复
      if (r.result && !r.needsLLMResponse) {
        // 跳过已流式播报过的重复文本
        const responseText = r.result;
        if (!streamedText.includes(responseText)) {
          this._ttsOneSentence(responseText);
        }
        this.dialogue.put({ role: 'assistant', content: responseText });
      }
      // Action.RECORD → 写入对话历史，不调LLM
      else if ((r as any).recordOnly) {
        this.dialogue.put({ role: 'tool', tool_call_id: tc.id, content: r.result || '' });
      }
      // Action.REQLLM → 标记需要再调LLM
      else {
        this.dialogue.put({ role: 'tool', tool_call_id: tc.id, content: r.result || '' });
        needLLM = true;
      }

      // 退出意图
      if (r.exit) {
        const goodbye = (r as any).goodbyeMessage || '好的，再见！';
        this._ttsOneSentence(goodbye);
        this.dialogue.put({ role: 'assistant', content: goodbye });
        this._endChat();
        return;
      }
    }

    // 仅 direct_answer 无实际工具 → 直接结束
    const realCalls = toolCalls.filter(tc => tc.function.name !== 'direct_answer');
    if (realCalls.length === 0 && !needLLM) { this._endChat(); return; }

    // 需要继续对话 → 递归 LLM
    if (needLLM) { await this._chat('', depth + 1); }
  }

  // ===== TTS 队列管理 =====
  private _enqueueTTSBlock(force = false): void {
    if (!this.ttsTextBuffer && !force) return;
    const text = this.ttsTextBuffer.trim();
    this.ttsTextBuffer = '';
    if (text) { this._enqueueTTS(text, 0); }
  }

  private _enqueueTTS(text: string, priority: number): void {
    if (!text.trim() || !this.tts) return;
    this.ttsQueue.push({ text, priority });
    this.ttsQueue.sort((a, b) => b.priority - a.priority);
    this._processTTSQueue();
  }

  /** 单句便捷方法（对标 tts_one_sentence） */
  private _ttsOneSentence(text: string): void {
    if (!this.tts || !text.trim()) return;
    this._enqueueTTS(text, 0);
  }

  private async _processTTSQueue(): Promise<void> {
    if (this.ttsRunning || !this.tts) return;
    this.ttsRunning = true;
    const voice = this.config.TTS?.voiceName || this.config.TTS?.voice || 'zh-CN-XiaoxiaoNeural';
    try {
      while (this.ttsQueue.length > 0) {
        if (this.clientAbort) { this.ttsQueue = []; break; }
        const item = this.ttsQueue.shift()!;

        // ---- Markdown清洗 + 纠错词替换（对标 MarkdownCleaner + correct_words） ----
        let cleanText = MarkdownCleaner.clean(item.text);
        cleanText = applyCorrectWords(cleanText, this.config.TTS?.correct_words);
        if (!cleanText.trim()) continue;

        try {
          // ---- AudioRateController 精确流控（对标 sendAudio / _send_audio_with_rate_control） ----
          const sentenceId = this.sentenceId || uuidv4();
          const rateCtrl = ensureRateController(
            this as any, 60, sentenceId,
          );
          this.rateController = rateCtrl;
          (this as any).flowControl = { packetCount: 0, sequence: 0, sentenceId };

          // 启动后台发送循环
          rateCtrl.startSending(async (opusFrame: Buffer) => {
            await this._sendAudioFrame(opusFrame);
          });

          for await (const audioChunk of this.tts!.textToSpeechStream(cleanText, voice, {
            rate: this.config.TTS?.rate, volume: this.config.TTS?.volume, pitch: this.config.TTS?.pitch,
          })) {
            if (this.clientAbort) break;
            const opusFrame = await this.opusCodec.encode(audioChunk);
            const fc = (this as any).flowControl;
            if (fc) {
              // 预缓冲前5帧直接发送
              if (fc.packetCount < PRE_BUFFER_COUNT) {
                await this._sendAudioFrame(opusFrame);
                fc.packetCount++;
              } else {
                rateCtrl.addAudio(opusFrame);
              }
            }
          }
          // 等待音频队列清空
          await rateCtrl.queueEmptyPromise;
          rateCtrl.stopSending();
        } catch (e: any) { console.error(`[Connection] TTS失败: ${e.message}`); }
      }
    } finally { this.ttsRunning = false; }
  }

  // ===== 对话结束 =====
  private _endChat(): void {
    if (this.ttsTextBuffer.trim()) { this._enqueueTTS(this.ttsTextBuffer.trim(), 0); this.ttsTextBuffer = ''; }
    this._sendJson({ type: 'tts', state: 'stop' });
    this._reportChatHistory();
    if (this.closeAfterChat) {
      setTimeout(() => { this._sendGoodbye(); }, 3000);
    }
  }

  // ===== 服务器主动发送 goodbye（MQTT 断开）=====
  sendGoodbye(): void {
    this._sendJson({ type: 'goodbye', session_id: this.sessionId });
    setTimeout(() => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
    }, 1000);
  }
  private _sendGoodbye(): void { this.sendGoodbye(); }

  // ===== 发送 alert 警告通知 =====
  sendAlert(status: string, message: string, emotion?: string): void {
    this._sendJson({
      type: 'alert',
      session_id: this.sessionId,
      status,
      message,
      ...(emotion ? { emotion } : {}),
    });
  }

  // ===== 发送 system 指令 =====
  sendSystemCommand(command: string): void {
    this._sendJson({
      type: 'system',
      session_id: this.sessionId,
      command,
    });
    // 处理 reboot 指令
    if (command === 'reboot') {
      setTimeout(() => { this._sendGoodbye(); }, 2000);
    }
  }

  // ===== 聊天上报 =====
  private async _reportChatHistory(): Promise<void> {
    const apiUrl = process.env.MANAGER_API_URL; const secret = process.env.SERVER_SECRET;
    if (!apiUrl || !secret) return;
    try {
      const msgs = this.dialogue.getAllMessages();
      const lastUser = [...msgs].reverse().find(m => m.role === 'user');
      const lastAsst = [...msgs].reverse().find(m => m.role === 'assistant');
      const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
      const base = { agentId: '0', sessionId: this.sessionId, macAddress: this.deviceId };
      if (lastUser) {
        await fetch(`${apiUrl}/api/chat/report`, { method: 'POST', headers, body: JSON.stringify({ ...base, chatType: 1, content: lastUser.content }) });
      }
      if (lastAsst) {
        await fetch(`${apiUrl}/api/chat/report`, { method: 'POST', headers, body: JSON.stringify({ ...base, chatType: 0, content: lastAsst.content }) });
      }
    } catch {}
  }

  private _generateChatTitle(): void {
    const apiUrl = process.env.MANAGER_API_URL;
    const secret = process.env.SERVER_SECRET;
    if (!apiUrl || !secret || !this.sessionId) return;
    const url = `${apiUrl}/api/agent/chat-title/${this.sessionId}/generate`;
    fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }

  // ===== 工具方法 =====
  private _sendJson(data: Record<string, any>): void {
    if (this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify(data)); } catch {} }
  }

  onClose(): void {
    logger.info('Connection', `连接断开`, { deviceId: this.deviceId, sessionId: this.sessionId });
    if (this.timeoutTask) { clearInterval(this.timeoutTask); this.timeoutTask = null; }
    this._handleAbort();
    this.speechBuffer = []; this.dialogue.clear();
    if (this.memory && this.dialogue) {
      this.memory.saveMemory(this.dialogue.getAllMessages(), this.sessionId).catch(() => {});
    }
    this._generateChatTitle();
    if (this.mcpClient) {
      this.mcpClient.destroy();
      this.mcpClient = null;
    }
    this.iotDescriptors.clear();
    this.iotToolsRegistered = false;
    if (this.rateController) {
      this.rateController.stopSending();
      this.rateController = null;
    }
    this.flowControl = null;
    this.llmAbortController = null;
  }

  onPong(): void { this.lastActivityTime = Date.now(); }

  /** 设备绑定检查（对标 check_bind_device） */
  private _checkBindDevice(): void {
    if ((this as any).bind_code) {
      const bindCode = String((this as any).bind_code);
      if (bindCode.length === 6) {
        const text = `请登录控制面板，输入${bindCode}，绑定设备。`;
        this._sendSttAndStart(text);
        this._ttsOneSentence(text);
      } else {
        this._sendSttAndStart('绑定码格式错误，请检查配置。');
        this._ttsOneSentence('绑定码格式错误，请检查配置。');
      }
    } else {
      const text = '没有找到该设备的版本信息，请正确配置OTA地址，然后重新编译固件。';
      this._sendSttAndStart(text);
      this._ttsOneSentence(text);
    }
  }

  /** 输出字数限制检查（对标 check_device_output_limit） */
  private _checkOutputLimit(): boolean {
    const messages = this.dialogue.getAllMessages();
    let totalChars = 0;
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.content) {
        totalChars += msg.content.length;
      }
    }
    return totalChars >= this.maxOutputSize;
  }
}
