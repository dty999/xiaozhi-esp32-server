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
import { initPlugins, getToolDefinitions, executeToolCalls } from './plugins/func-handler';
import type { ToolResult } from './plugins/func-handler';
import { buildContext } from './context/context-provider';
import { logger } from './utils/logger';

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

  constructor(ws: WebSocket, deviceId: string, clientIp: string) {
    this.ws = ws; this.deviceId = deviceId; this.clientIp = clientIp;
    this.sessionId = uuidv4();
    this.vad = SileroVAD.getInstance();
    this.silenceDetector = new SilenceDetector(200);
    this.opusCodec = new OpusCodec();
    this.dialogue = new DialogueManager(20);
    this.welcomeMsg = { type: 'hello', transport: 'ws', session_id: this.sessionId,
      audio_params: { format: 'opus', sample_rate: 16000, channels: 1, frame_duration: 60 } };
    logger.info('Connection', `新连接建立`, { deviceId, clientIp, sessionId: this.sessionId });
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
      if (data[0] === 0x7B) { const msg = JSON.parse(data.toString()); this._routeMessage(msg); }
      else { this._handleAudioFrame(data); }
    } catch {}
  }

  private _routeMessage(msg: Record<string, any>): void {
    switch (msg.type as string) {
      case 'hello': this._handleHello(msg); break;
      case 'listen': this._handleListen(msg); break;
      case 'abort': this._handleAbort(); break;
      case 'iot': this._sendJson({ type: 'iot', state: 'ack' }); break;
      case 'mcp': /* TODO */ break;
      case 'ping': this._sendJson({ type: 'pong' }); break;
    }
  }

  // ===== Hello 握手（对标 helloHandle） =====
  private _handleHello(msg: Record<string, any>): void {
    if (msg.audio_params) { this.welcomeMsg.audio_params = msg.audio_params; }
    this.welcomeMsg.transport = msg.transport || 'ws';
    if (msg.features?.mcp) { console.log(`[Connection] ${this.deviceId} 支持MCP`); }
    this._sendJson(this.welcomeMsg);
  }

  // ===== Listen 监听状态（对标 listenMessageHandler） =====
  private async _handleListen(msg: Record<string, any>): Promise<void> {
    if (msg.mode) { this.listenMode = msg.mode; }
    if (msg.state === 'start') { this.isListening = true; this.clientIsSpeaking = true; }
    else if (msg.state === 'stop') {
      this.isListening = false; this.clientIsSpeaking = false;
      if (this.listenMode === 'manual' && this.speechBuffer.length > 0) { await this._handleSpeechEnd(); }
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

  private async _handleSpeechEnd(): Promise<void> {
    if (this.speechBuffer.length === 0) return;
    this.clientIsSpeaking = false; this.silenceDetector.reset();
    const fullAudio = this.opusCodec.mergeFrames(this.speechBuffer);
    this.speechBuffer = [];
    if (!this.asr) return;
    const text = await this.asr.speechToText(fullAudio, 16000).catch(() => '');
    if (!text.trim()) return;
    console.log(`[Connection] ASR: "${text}"`);

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
            const { emotion } = extractEmotion(token);
            if (emotion) { this._sendJson({ type: 'emotion', emoji: emotion }); }
            this.emotionFlag = false;
          }
          // 发送字幕
          this._sendJson({ type: 'llm', text: token, state: 'sentence_start' });
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
    this.dialogue.put({ role: 'assistant', content: '', tool_calls: toolCalls });

    const ctx = { deviceId: this.deviceId, sessionId: this.sessionId };
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
            if (this.ws.readyState === WebSocket.OPEN) { this.ws.send(opusFrame); }
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
                if (this.ws.readyState === WebSocket.OPEN) { this.ws.send(opusFrame); }
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
      setTimeout(() => { if (this.ws.readyState === WebSocket.OPEN) this.ws.close(); }, 3000);
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

  // ===== 工具方法 =====
  private _sendJson(data: Record<string, any>): void {
    if (this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify(data)); } catch {} }
  }

  onClose(): void {
    logger.info('Connection', `连接断开`, { deviceId: this.deviceId, sessionId: this.sessionId });
    if (this.timeoutTask) { clearInterval(this.timeoutTask); }
    this._handleAbort();
    this.speechBuffer = []; this.dialogue.clear();
    if (this.memory && this.dialogue) {
      this.memory.saveMemory(this.dialogue.getAllMessages(), this.sessionId).catch(() => {});
    }
  }

  onPong(): void { this.lastActivityTime = Date.now(); }
}
