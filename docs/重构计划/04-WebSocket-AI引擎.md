# 第四阶段：WebSocket AI 引擎重构

> **目标**：以 Node.js/TypeScript 完整替代 Python xiaozhi-server，实现 WebSocket 实时语音对话管线。
> **验证标准**：ESP32 设备可连接到新服务器，语音对话（ASR→LLM→TTS）全管线可用。

---

## 4.1 架构与启动

### 文件：`src/server/ws-server.ts`

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { ConnectionHandler } from './connection';
import { prisma } from '@/lib/db';
import { verifyJwt } from '@/lib/jwt';

const WS_PORT = parseInt(process.env.WS_PORT || '8000');

export function startWebSocketServer(): void {
  const wss = new WebSocketServer({
    port: WS_PORT,
    maxPayload: 2 * 1024 * 1024, // 2MB max
  });

  console.log(`WebSocket server listening on port ${WS_PORT}`);

  wss.on('connection', async (ws: WebSocket, req) => {
    // 路径格式: /xiaozhi/v1/
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    
    // 提取 device-id（URL 参数或 Header）
    const deviceId = 
      url.searchParams.get('device-id') || 
      (req.headers['device-id'] as string) || 
      '';

    if (!deviceId) {
      ws.close(4000, 'Missing device-id');
      return;
    }

    // 验证（JWT Token 或 MAC 白名单）
    const token = url.searchParams.get('token') || '';
    if (token) {
      const payload = await verifyJwt(token);
      if (!payload) {
        ws.close(4001, 'Invalid token');
        return;
      }
    }

    // 创建连接处理器
    const handler = new ConnectionHandler(ws, deviceId);
    await handler.initialize();

    ws.on('message', (data) => handler.onMessage(data as Buffer));
    ws.on('close', () => handler.onClose());
    ws.on('error', (err) => console.error(`WS error [${deviceId}]:`, err));

    // 心跳
    ws.on('pong', () => handler.onPong());
  });

  // 每30秒 ping 所有连接
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    });
  }, 30000);
}
```

### 4.1.1 在 Next.js 中启动 WebSocket 服务器

**文件：`apps/web/server.js`**（自定义 server 入口，替代 `next start`）

```typescript
// server.js — 自定义 server 入口
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { startWebSocketServer } from './src/server/ws-server';
import { startHttpServer } from './src/server/http-server';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket 服务器（复用同一 HTTP server）
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url!);
    if (pathname === '/xiaozhi/v1/') {
      // ws 库会自行处理 upgrade
      // 此处只需传递给 wss
    }
  });

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000');
    startWebSocketServer(); // 在独立端口 8000
    startHttpServer();      // 在独立端口 8003
  });
});
```

> **推荐方案**：WebSocket Server 在实际部署中建议运行在独立的 8000 端口（用 `ws` 库单独创建），HTTP 辅助服务同理。Next.js 的 `server.js` 仅作为一体化入口的可选方案。

---

## 4.2 连接处理器

### 文件：`src/server/connection.ts`

```typescript
import { WebSocket } from 'ws';
import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { SileroVAD } from './vad/silero-vad';
import { createASRProvider } from './asr/provider-factory';
import { createLLMProvider } from './llm/provider-factory';
import { createTTSProvider } from './tts/provider-factory';
import { createMemoryProvider } from './memory/provider-factory';
import { createIntentProvider } from './intent/provider-factory';
import { OpusCodec } from './audio/opus-codec';

interface AgentConfig {
  VAD?: any;
  ASR?: any;
  LLM?: any;
  TTS?: any;
  Memory?: any;
  Intent?: any;
  agentParams?: any;
  ContextProviders?: any;
  Plugin?: any[];
  CorrectWords?: string;
}

interface QueueItem {
  text: string;
  priority: number;
}

export class ConnectionHandler {
  private ws: WebSocket;
  private deviceId: string;
  private config!: AgentConfig;
  
  // 音频队列
  private audioQueue: Buffer[] = [];
  
  // TTS 队列
  private ttsQueue: QueueItem[] = [];
  private ttsRunning = false;
  
  // 组件
  private vad!: SileroVAD;
  private asr: any;
  private llm: any;
  private tts: any;
  private memory: any;
  private intent: any;
  private opusCodec: OpusCodec;
  
  // 对话状态
  private isListening = true;
  private conversationHistory: any[] = [];
  private llmAbortController: AbortController | null = null;

  constructor(ws: WebSocket, deviceId: string) {
    this.ws = ws;
    this.deviceId = deviceId;
    this.opusCodec = new OpusCodec();
  }

  async initialize(): Promise<void> {
    // 1. 从管理端 API 获取设备配置
    const serverSecret = (await cache.hget('sys:params', 'server.secret')) || '';
    const configRes = await fetch(`http://localhost:3000/api/config/agent-models`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serverSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ macAddress: this.deviceId }),
    });
    this.config = (await configRes.json()).data || {};

    // 2. 初始化 VAD（共享实例，所有连接共用）
    this.vad = SileroVAD.getInstance();

    // 3. 初始化各 Provider（按需创建实例）
    if (this.config.ASR) {
      this.asr = await createASRProvider(this.config.ASR);
    }
    if (this.config.LLM) {
      this.llm = await createLLMProvider(this.config.LLM);
    }
    if (this.config.TTS) {
      this.tts = await createTTSProvider(this.config.TTS);
    }
    if (this.config.Memory) {
      this.memory = await createMemoryProvider(this.config.Memory);
    }
    if (this.config.Intent) {
      this.intent = await createIntentProvider(this.config.Intent);
    }

    console.log(`Connection initialized for device ${this.deviceId}`);
  }

  // ==========================================
  // 消息路由
  // ==========================================
  onMessage(data: Buffer): void {
    // 判断是 JSON 文本还是 Opus 音频
    if (data[0] === 0x7B) { // '{' 字符
      const msg = JSON.parse(data.toString());
      this.routeMessage(msg);
    } else {
      // Opus 音频帧
      this.audioQueue.push(data);
      this.handleAudioFrame(data);
    }
  }

  private routeMessage(msg: any): void {
    switch (msg.type) {
      case 'hello':
        this.handleHello(msg);
        break;
      case 'listen':
        this.handleListen(msg);
        break;
      case 'abort':
        this.handleAbort();
        break;
      case 'iot':
        this.handleIot(msg);
        break;
      case 'mcp':
        this.handleMcp(msg);
        break;
    }
  }

  // ==========================================
  // Hello 消息
  // ==========================================
  private async handleHello(msg: any): Promise<void> {
    // 返回设备配置
    this.sendJson({
      type: 'hello',
      transport: msg.transport || 'ws',
      session_id: this.deviceId,
      audio_params: {
        format: 'opus',
        sample_rate: 16000,
        channels: 1,
        frame_duration: 60,
      },
    });
  }

  // ==========================================
  // 监听状态切换
  // ==========================================
  private handleListen(msg: any): void {
    this.isListening = msg.state === 'start';
    if (!this.isListening) {
      // 如果用户在说话时停止监听，触发 ASR 处理
      this.handleSpeechEnd();
    }
  }

  // ==========================================
  // 打断
  // ==========================================
  handleAbort(): void {
    // 取消当前 LLM 请求
    this.llmAbortController?.abort();
    this.llmAbortController = null;

    // 清空 TTS 队列
    this.ttsQueue = [];
    this.ttsRunning = false;

    // 发送停止标记
    this.sendJson({ type: 'tts', state: 'stop' });
  }

  // ==========================================
  // IoT 控制
  // ==========================================
  private handleIot(msg: any): void {
    // 将 IoT 命令转发到插件处理器
    console.log('IoT message:', msg);
  }

  // ==========================================
  // MCP 协议
  // ==========================================
  private handleMcp(msg: any): void {
    console.log('MCP message:', msg);
  }

  // ==========================================
  // 音频处理（VAD → ASR → LLM → TTS）
  // ==========================================
  private speechBuffer: Float32Array[] = [];
  private isSpeaking = false;
  private silenceFrames = 0;
  private readonly SILENCE_THRESHOLD_FRAMES = 5; // 200ms @ 60ms/frame ≈ 3.3 frames

  private async handleAudioFrame(opusData: Buffer): Promise<void> {
    if (!this.isListening) return;

    // 1. Opus 解码 → PCM Float32
    const pcmFrame = await this.opusCodec.decode(opusData);
    
    // 2. VAD 检测
    const result = await this.vad.isSpeech(pcmFrame);

    if (result.isSpeech) {
      this.speechBuffer.push(pcmFrame);
      this.isSpeaking = true;
      this.silenceFrames = 0;
      
      // 通知客户端正在说话
      this.sendJson({ type: 'asr', state: 'listening' });
    } else if (this.isSpeaking) {
      this.speechBuffer.push(pcmFrame);
      this.silenceFrames++;

      // 静默超过阈值，认为说话结束
      if (this.silenceFrames >= this.SILENCE_THRESHOLD_FRAMES) {
        await this.handleSpeechEnd();
      }
    }
  }

  private async handleSpeechEnd(): Promise<void> {
    if (this.speechBuffer.length === 0) return;

    this.isSpeaking = false;
    this.silenceFrames = 0;

    // 1. 合并所有 PCM 帧
    const totalLength = this.speechBuffer.reduce((sum, f) => sum + f.length, 0);
    const fullAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const frame of this.speechBuffer) {
      fullAudio.set(frame, offset);
      offset += frame.length;
    }
    this.speechBuffer = [];

    // 2. ASR 识别
    let text: string;
    try {
      text = await this.asr.speechToText(fullAudio, 16000);
      this.sendJson({ type: 'asr', state: 'result', text });
    } catch (e) {
      console.error('ASR error:', e);
      return;
    }

    if (!text.trim()) return;

    // 3. 进入对话状态
    await this.chat(text);
  }

  // ==========================================
  // 对话管线
  // ==========================================
  async chat(text: string): Promise<void> {
    // 1. 查询记忆
    let memoryContext = '';
    if (this.memory) {
      memoryContext = await this.memory.queryMemory(text);
    }

    // 2. 构建消息
    const systemPrompt = this.config.agentParams?.systemPrompt || 
      '你是一个智能语音助手，请用简洁自然的语言回复。';
    const messages = [
      { role: 'system', content: systemPrompt + (memoryContext ? `\n\n历史记忆：${memoryContext}` : '') },
      ...this.conversationHistory.slice(-20), // 最近20轮对话
      { role: 'user', content: text },
    ];

    // 3. 意图识别（可选）
    if (this.intent) {
      const intentResult = await this.intent.detect(text);
      if (intentResult === 'exit') {
        this.sendJson({ type: 'tts', text: '好的，再见', state: 'sentence_start' });
        this.endChat();
        return;
      }
    }

    // 4. LLM 流式生成
    this.sendJson({ type: 'llm', state: 'start' });

    let fullResponse = '';
    let ttsBuffer = '';
    this.llmAbortController = new AbortController();

    try {
      const tools = this.buildToolDefinitions();
      
      await this.llm.responseWithFunctions(
        messages,
        tools,
        async (token: string) => {
          fullResponse += token;
          ttsBuffer += token;

          // 发送字幕到客户端
          this.sendJson({ type: 'llm', text: token, state: 'sentence_start' });

          // 遇到标点 → 触发 TTS（分句）
          if (/[。！？\n,，.!?;；]/.test(ttsBuffer)) {
            const sentence = ttsBuffer.trim();
            if (sentence) {
              this.enqueueTTS(sentence, 0);
            }
            ttsBuffer = '';
          }
        },
        this.llmAbortController.signal,
      );

      // 处理剩余的 ttsBuffer
      if (ttsBuffer.trim()) {
        this.enqueueTTS(ttsBuffer.trim(), 0);
      }

      // 发送完成标记
      this.enqueueTTS('LAST', 999);
      this.sendJson({ type: 'llm', state: 'stop' });
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('LLM error:', e);
        this.sendJson({ type: 'llm', state: 'error', error: e.message });
      }
    } finally {
      this.llmAbortController = null;
    }

    // 5. 保存对话历史
    this.conversationHistory.push(
      { role: 'user', content: text },
      { role: 'assistant', content: fullResponse },
    );
    if (this.conversationHistory.length > 40) {
      this.conversationHistory = this.conversationHistory.slice(-40);
    }

    // 6. 异步上报对话记录
    this.reportChatHistory(text, fullResponse);
  }

  // ==========================================
  // TTS 队列处理
  // ==========================================
  private enqueueTTS(text: string, priority: number): void {
    this.ttsQueue.push({ text, priority });
    this.ttsQueue.sort((a, b) => b.priority - a.priority);
    this.processTTSQueue();
  }

  private async processTTSQueue(): Promise<void> {
    if (this.ttsRunning) return;
    this.ttsRunning = true;

    while (this.ttsQueue.length > 0) {
      const item = this.ttsQueue.shift()!;
      
      if (item.text === 'LAST') break;

      try {
        // TTS 流式合成
        for await (const audioChunk of this.tts.textToSpeechStream(
          item.text,
          this.config.TTS?.voiceName || 'default',
          {
            volume: this.config.TTS?.volume,
            rate: this.config.TTS?.rate,
            pitch: this.config.TTS?.pitch,
          }
        )) {
          // PCM → Opus 编码
          const opusFrame = await this.opusCodec.encode(audioChunk);
          // 发送到 ESP32
          if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(opusFrame);
          }
        }
      } catch (e) {
        console.error('TTS error:', e);
      }
    }

    this.ttsRunning = false;
  }

  // ==========================================
  // Function Calling 工具定义
  // ==========================================
  private buildToolDefinitions(): any[] {
    const tools = [];

    // 基础工具
    tools.push({
      type: 'function',
      function: {
        name: 'get_weather',
        description: '获取指定城市的天气信息',
        parameters: {
          type: 'object',
          properties: {
            city: { type: 'string', description: '城市名称' },
          },
          required: ['city'],
        },
      },
    });

    // 插件工具（从配置中加载）
    if (this.config.Plugin) {
      for (const plugin of this.config.Plugin) {
        // 根据插件类型添加对应的工具定义
        tools.push({
          type: 'function',
          function: {
            name: `plugin_${plugin.id}`,
            description: `插件功能 ${plugin.id}`,
            parameters: { type: 'object', properties: {} },
          },
        });
      }
    }

    return tools;
  }

  // ==========================================
  // 工具函数执行
  // ==========================================
  private async executeToolCall(toolCall: any): Promise<string> {
    const { name, arguments: args } = toolCall.function;
    const parsedArgs = JSON.parse(args || '{}');

    switch (name) {
      case 'get_weather': {
        // 调用天气 API
        return `城市 ${parsedArgs.city} 的天气：晴，25°C`;
      }
      case 'handle_exit_intent': {
        return 'exit';
      }
      default:
        return `未知工具: ${name}`;
    }
  }

  // ==========================================
  // 对话结束
  // ==========================================
  private endChat(): void {
    this.sendJson({ type: 'tts', state: 'stop' });
  }

  // ==========================================
  // 聊天记录上报
  // ==========================================
  private async reportChatHistory(userText: string, aiText: string): Promise<void> {
    try {
      const serverSecret = (await cache.hget('sys:params', 'server.secret')) || '';
      const device = await prisma.aiDevice.findFirst({
        where: { macAddress: this.deviceId },
      });
      if (!device) return;

      const sessionId = `${this.deviceId}_${Date.now()}`;
      await fetch(`http://localhost:3000/api/chat/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serverSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: device.agentId.toString(),
          sessionId,
          chatType: 1,
          content: userText,
          macAddress: this.deviceId,
        }),
      });
      await fetch(`http://localhost:3000/api/chat/report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serverSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agentId: device.agentId.toString(),
          sessionId,
          chatType: 0,
          content: aiText,
          macAddress: this.deviceId,
        }),
      });
    } catch (e) {
      console.error('Chat report error:', e);
    }
  }

  // ==========================================
  // 辅助方法
  // ==========================================
  private sendJson(data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onClose(): void {
    console.log(`Device ${this.deviceId} disconnected`);
    this.handleAbort();
  }

  onPong(): void {
    // 心跳响应
  }
}
```

---

## 4.3 VAD 引擎

### 文件：`src/server/vad/silero-vad.ts`

```typescript
import * as ort from 'onnxruntime-node';

interface VADResult {
  probability: number;
  isSpeech: boolean;
}

export class SileroVAD {
  private static instance: SileroVAD;
  private session: ort.InferenceSession | null = null;
  private sr = 16000;
  // 双阈值
  private threshold = 0.5;
  private thresholdLow = 0.3;
  private currentThreshold = 0.5;
  private speechProbAvg = 0;

  static getInstance(): SileroVAD {
    if (!SileroVAD.instance) {
      SileroVAD.instance = new SileroVAD();
    }
    return SileroVAD.instance;
  }

  private constructor() {}

  async init(): Promise<void> {
    if (this.session) return;

    // 加载 Silero VAD ONNX 模型
    // 模型文件需放置在 server/vad/ 目录或从 ModelScope 下载
    const modelPath = process.env.VAD_MODEL_PATH || './models/silero_vad.onnx';
    this.session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    console.log('SileroVAD initialized');
  }

  /**
   * 判断音频帧是否为语音
   * @param audioFrame Float32Array 16kHz PCM 音频帧（建议 512 samples = 32ms 或 960 samples = 60ms）
   */
  async isSpeech(audioFrame: Float32Array): Promise<VADResult> {
    if (!this.session) await this.init();

    // Silero VAD 输入: [batch, samples]
    const inputTensor = new ort.Tensor('float32', audioFrame, [1, audioFrame.length]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[this.session!.inputNames[0]!] = inputTensor;

    const results = await this.session!.run(feeds);
    const probability = results[this.session!.outputNames[0]!].data[0] as number;

    // 平滑处理
    this.speechProbAvg = this.speechProbAvg * 0.7 + probability * 0.3;

    // 双阈值自适应
    if (this.speechProbAvg > this.threshold) {
      this.currentThreshold = this.thresholdLow; // 切换到低阈值维持语音
    } else {
      this.currentThreshold = this.threshold;
    }

    const isSpeech = this.speechProbAvg > this.currentThreshold;

    return { probability: this.speechProbAvg, isSpeech };
  }
}
```

---

## 4.4 ASR 适配器接口与工厂

### 文件：`src/server/asr/types.ts`

```typescript
export interface ASRProvider {
  readonly name: string;
  /**
   * 非流式语音识别
   * @param audioBuffer PCM Float32 音频数据
   * @param sampleRate 采样率
   */
  speechToText(audioBuffer: Float32Array | Buffer, sampleRate: number): Promise<string>;

  /**
   * 流式语音识别（可选实现）
   */
  streamSpeechToText?(
    audioStream: AsyncIterable<Float32Array>,
    sampleRate: number
  ): AsyncIterable<{ text: string; isFinal: boolean }>;
}

export interface ASRProviderConfig {
  type: string;
  config: {
    api_url?: string;
    api_key?: string;
    model_name?: string;
    [key: string]: any;
  };
}
```

### 文件：`src/server/asr/provider-factory.ts`

```typescript
import { ASRProvider, ASRProviderConfig } from './types';
import { OpenAIASRProvider } from './providers/openai-asr';
import { DoubaoStreamASRProvider } from './providers/doubao-stream-asr';

export async function createASRProvider(config: ASRProviderConfig): Promise<ASRProvider> {
  const type = config.type?.toLowerCase() || '';

  switch (type) {
    case 'openai':
    case 'groq':
      return new OpenAIASRProvider(config);
    case 'doubao':
    case 'doubao_stream':
      return new DoubaoStreamASRProvider(config);
    // 其他 ASR Provider 在此添加
    default:
      console.warn(`Unknown ASR type: ${type}, falling back to OpenAI`);
      return new OpenAIASRProvider(config);
  }
}
```

### 文件：`src/server/asr/providers/openai-asr.ts`

```typescript
import { ASRProvider, ASRProviderConfig } from '../types';

export class OpenAIASRProvider implements ASRProvider {
  readonly name = 'OpenAIASR';
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: ASRProviderConfig) {
    this.baseUrl = config.config.api_url || 'https://api.openai.com';
    this.apiKey = config.config.api_key || '';
    this.model = config.config.model_name || 'whisper-1';
  }

  async speechToText(audioBuffer: Float32Array, sampleRate: number): Promise<string> {
    // Float32Array → WAV Buffer
    const wavBuffer = this.float32ToWav(audioBuffer, sampleRate);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.model);

    const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData,
    });

    const result = await response.json();
    return result.text || '';
  }

  private float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const dataSize = samples.length * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);

    // WAV Header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // PCM data
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, 44 + i * 2);
    }

    return buffer;
  }
}
```

> 注：其余 ASR Provider（Doubao Stream、Aliyun Stream、Xunfei Stream 等）均需写入 `src/server/asr/providers/` 目录下，篇幅所限此处不逐一展开，实现原则与 OpenAIASR 一致——遵循 `ASRProvider` 接口，实现 `speechToText` 方法。

---

## 4.5 LLM 适配器

### 文件：`src/server/llm/types.ts`

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export interface LLMProvider {
  readonly name: string;
  responseWithFunctions(
    messages: Message[],
    tools: ToolDefinition[],
    onToken: (token: string) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<LLMResponse>;
}
```

### 文件：`src/server/llm/providers/openai-compatible.ts`

```typescript
import { LLMProvider, LLMResponse, Message, ToolCall } from '../types';

export class OpenAICompatibleLLM implements LLMProvider {
  readonly name = 'OpenAICompatibleLLM';
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(config: any) {
    this.baseUrl = config.config.api_url || 'https://api.openai.com';
    this.apiKey = config.config.api_key || '';
    this.model = config.config.model_name || 'gpt-4o-mini';
  }

  async responseWithFunctions(
    messages: Message[],
    tools: any[],
    onToken: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<LLMResponse> {
    // 禁用思考模式的模型列表
    const noThinkModels = ['glm-4', 'qwen-', 'moonshot', 'doubao'];
    const shouldDisableThinking = noThinkModels.some(m => this.model.includes(m));

    const requestBody: any = {
      model: this.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    if (shouldDisableThinking) {
      requestBody.thinking = { type: 'disabled' };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    // 解析 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    const toolCalls: Map<number, ToolCall> = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;

          if (delta?.content) {
            fullText += delta.content;
            await onToken(delta.content);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!toolCalls.has(index)) {
                toolCalls.set(index, {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: tc.function?.name || '', arguments: '' },
                });
              }
              if (tc.function?.arguments) {
                toolCalls.get(index)!.function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {}
      }
    }

    return {
      text: fullText,
      toolCalls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
      finishReason: toolCalls.size > 0 ? 'tool_calls' : 'stop',
    };
  }
}
```

---

## 4.6 TTS 适配器（示例）

### 文件：`src/server/tts/types.ts`

```typescript
export interface TTSConfig {
  volume?: number;  // 0-100
  rate?: number;    // 0.5-2.0
  pitch?: number;   // -20 to 20
}

export interface TTSProvider {
  readonly name: string;
  textToSpeechStream(
    text: string,
    voice: string,
    config: TTSConfig,
  ): AsyncIterable<Float32Array>;
}
```

### 文件：`src/server/tts/providers/edge-tts.ts`

```typescript
import { TTSProvider, TTSConfig } from '../types';

/**
 * 微软 Edge TTS（免费，流式）
 * 通过 HTTP API 调用，解析 SSE 流获取音频
 */
export class EdgeTTSProvider implements TTSProvider {
  readonly name = 'EdgeTTS';

  async *textToSpeechStream(
    text: string,
    voice: string,
    config: TTSConfig,
  ): AsyncIterable<Float32Array> {
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
      <voice name="${voice || 'zh-CN-XiaoxiaoNeural'}">
        <prosody rate="${config.rate || 1.0}" pitch="${config.pitch || 0}%">
          ${this.escapeXml(text)}
        </prosody>
      </voice>
    </speak>`;

    const response = await fetch(
      `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: ssml,
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`Edge TTS error: ${response.status}`);
    }

    // 解析流（Edge TTS 返回的是分块的 MP3）
    // 需要 MP3 → PCM 解码（可用 lamejs 或其他解码器）
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // value 是 MP3 数据块，需解码为 Float32Array
      // 简化处理：直接返回原始数据，由 OpusCodec 处理
      yield new Float32Array(value.buffer);
    }
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
```

---

## 4.7 Opus 编解码

### 文件：`src/server/audio/opus-codec.ts`

```typescript
// 使用 @discordjs/opus 或 opusscript 库
// 如不使用原生模块，可改用 WASM 方案

export class OpusCodec {
  private encoder: any;
  private decoder: any;

  constructor() {
    // 初始化 Opus 编码器/解码器
    // 采样率: 16000, 单声道, 60ms 帧
    // 此处需引入具体的 Opus 库实现
  }

  /**
   * Opus → PCM Float32
   */
  async decode(opusData: Buffer): Promise<Float32Array> {
    // 实际实现依赖 opus 库
    // 示例返回空帧
    return new Float32Array(960); // 16000Hz * 60ms = 960 samples
  }

  /**
   * PCM Float32 → Opus
   */
  async encode(pcmData: Float32Array): Promise<Buffer> {
    // 实际实现依赖 opus 库
    return Buffer.alloc(0);
  }
}
```

> **Opus 库选型建议**：
> - `@discordjs/opus`（Node 原生，需要编译工具链）
> - `opusscript`（纯 JS，性能较低）
> - 自编译 WASM 版 `libopus`（推荐：性能好且跨平台）

---

## 4.8 P4 验证清单

- [ ] `node server.js` 启动 WebSocket 服务器（port 8000）
- [ ] ESP32 可 WebSocket 连接，发送 `hello` 消息获得响应
- [ ] 发送 Opus 音频帧，VAD 检测发言
- [ ] 静默后触发 ASR → 获得文字
- [ ] LLM 流式生成，字幕推送到客户端
- [ ] TTS 合成音频，Opus 编码后返回 ESP32
- [ ] 打断功能（LLM AbortController + TTS 队列清空）
- [ ] Function Calling 工具调用
- [ ] 对话历史管理（最大 40 轮）
- [ ] 聊天记录异步上报

---

## 4.9 补充 Provider 实现列表

以下 Provider 需在 `src/server/asr/providers/`、`src/server/llm/providers/`、`src/server/tts/providers/` 中逐一实现：

| 类别 | Provider | 文件 |
|:---|:---|:---|
| ASR | DoubaoStreamASR | `asr/providers/doubao-stream-asr.ts` |
| ASR | AliyunStreamASR | `asr/providers/aliyun-stream-asr.ts` |
| ASR | AliyunBLStreamASR | `asr/providers/aliyun-bl-stream-asr.ts` |
| ASR | XunfeiStreamASR | `asr/providers/xunfei-stream-asr.ts` |
| ASR | TencentASR | `asr/providers/tencent-asr.ts` |
| ASR | BaiduASR | `asr/providers/baidu-asr.ts` |
| ASR | Qwen3ASRFlash | `asr/providers/qwen3-asr-flash.ts` |
| LLM | GeminiLLM | `llm/providers/gemini-llm.ts` |
| LLM | DifyLLM | `llm/providers/dify-llm.ts` |
| LLM | CozeLLM | `llm/providers/coze-llm.ts` |
| TTS | DoubaoTTS | `tts/providers/doubao-tts.ts` |
| TTS | HuoshanDoubleStreamTTS | `tts/providers/huoshan-double-stream.ts` |
| TTS | OpenAITTS | `tts/providers/openai-tts.ts` |
| TTS | SiliconFlowTTS | `tts/providers/siliconflow-tts.ts` |
| TTS | AliyunStreamTTS | `tts/providers/aliyun-stream-tts.ts` |
| TTS | AliBLStreamTTS | `tts/providers/ali-bl-stream-tts.ts` |
| TTS | MinimaxStreamTTS | `tts/providers/minimax-stream-tts.ts` |
| TTS | XunfeiStreamTTS | `tts/providers/xunfei-stream-tts.ts` |
| TTS | CozeTTS | `tts/providers/coze-tts.ts` |
| TTS | CustomTTS | `tts/providers/custom-tts.ts` |
