/**
 * 核心类型定义 - 会话消息、对话管理、工具定义等
 * 对标旧Python: core/utils/dialogue.py + core/providers/base.py
 */

// ---- 消息角色 ----

/** 对话中的角色类型，遵循 OpenAI Chat Completions API 规范 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** 单条对话消息，对标旧Python之 Message 类 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** 工具调用ID（tool角色消息） */
  tool_call_id?: string;
  /** 工具调用列表（assistant角色消息） */
  tool_calls?: ToolCall[];
  /** 是否临时消息（few-shot示例等），不计入实际对话历史 */
  is_temporary?: boolean;
  /** 消息唯一ID（可选，用于去重） */
  uniq_id?: string;
}

// ==============================
// 工具调用相关类型
// ==============================

/** 单个工具调用，对标 OpenAI function calling 格式 */
export interface ToolCall {
  id: string;
  type: 'function';
  index?: number;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** 工具定义（函数描述），用于 OpenAI tools 参数 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; enum?: string[] }>;
      required?: string[];
    };
  };
}

// ==============================
// Provider接口定义
// ==============================

// --- ASR 提供者 ---

/** ASR配置（从管理端下发） */
export interface ASRConfig {
  type: string;
  model_name?: string;
  api_url?: string;
  api_key?: string;
  access_token?: string;
  appid?: string;
  cluster?: string;
  private_voice?: string;
  [key: string]: any;
}

/** ASR提供者接口 */
export interface ASRProvider {
  readonly name: string;
  /**
   * 语音转文字（非流式）
   * @param audioData PCM Float32Array 音频数据
   * @param sampleRate 采样率（默认16000）
   * @returns 识别文本
   */
  speechToText(audioData: Float32Array, sampleRate: number): Promise<string>;
}

// --- LLM 提供者 ---

/** LLM配置 */
export interface LLMConfig {
  type: string;
  model_name?: string;
  api_url?: string;
  api_key?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  [key: string]: any;
}

/** LLM响应结构 */
export interface LLMResponse {
  text: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

/** 流式token回调 */
export type TokenCallback = (token: string) => void | Promise<void>;

/** LLM提供者接口 */
export interface LLMProvider {
  readonly name: string;
  /**
   * 流式对话（支持function calling）
   * @param messages 完整的对话消息列表
   * @param tools 可用工具定义列表
   * @param onToken 流式token回调（每个token调用一次）
   * @param signal 中断信号（用于abort）
   * @returns 完整响应（含工具调用信息）
   */
  responseWithFunctions(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    onToken: TokenCallback,
    signal?: AbortSignal,
  ): Promise<LLMResponse>;
}

// --- TTS 提供者 ---

/** TTS配置 */
export interface TTSConfig {
  type: string;
  voice?: string;
  voiceName?: string;
  volume?: number; // 0-100
  rate?: number;   // 0.5-2.0
  pitch?: number;  // -20到20
  api_url?: string;
  api_key?: string;
  format?: string;
  language?: string;
  correct_words?: Record<string, string>;
  [key: string]: any;
}

/** TTS提供者接口 */
export interface TTSProvider {
  readonly name: string;
  /**
   * 流式文本转语音
   * @param text 要合成的文本
   * @param voice 语音名称/角色
   * @param config TTS参数配置
   * @returns 异步迭代器，逐个返回PCM Float32Array音频块
   */
  textToSpeechStream(
    text: string,
    voice: string,
    config: Partial<TTSConfig>,
  ): AsyncIterable<Float32Array>;
}

// --- Memory 提供者 ---

/** Memory配置 */
export interface MemoryConfig {
  type: string;
  api_key?: string;
  api_url?: string;
  llm?: string;
  [key: string]: any;
}

/** Memory提供者接口 */
export interface MemoryProvider {
  readonly name: string;
  /** 查询相关记忆，返回上下文文本 */
  queryMemory(query: string): Promise<string>;
  /** 保存当前对话记忆 */
  saveMemory(dialogue: ChatMessage[], sessionId: string): Promise<void>;
}

// --- Intent 提供者 ---

/** Intent配置 */
export interface IntentConfig {
  type: string;
  llm?: string;
  functions?: string[];
  [key: string]: any;
}

/** 意图识别结果 */
export interface IntentResult {
  /** 是否为退出意图 */
  exit: boolean;
  /** 检测到的意图名称 */
  intentName?: string;
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

/** Intent提供者接口 */
export interface IntentProvider {
  readonly name: string;
  /**
   * 检测用户消息的意图
   * 对标旧Python: core/handle/intentHandler.py
   */
  detect(text: string, context?: ChatMessage[]): Promise<IntentResult>;
}

// ==============================
// 对话管理器（对标 Python Dialogue类）
// ==============================

/**
 * 对话历史管理器
 * 对标旧Python之 core/utils/dialogue.py
 * 维护完整的对话上下文，支持临时消息、截断、格式化输出
 */
export class DialogueManager {
  /** 完整对话列表 */
  private dialogue: ChatMessage[] = [];
  /** 最大保留轮数（每轮包含user+assistant两条消息） */
  private maxTurns = 20;
  /** 系统提示词 */
  private systemPrompt = '';
  /** 当前时间字符串 */
  private currentTime: string;

  constructor(maxTurns = 20) {
    this.maxTurns = maxTurns;
    this.currentTime = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /** 添加一条消息 */
  put(message: ChatMessage): void {
    this.dialogue.push(message);
    this._trim();
  }

  /** 更换系统提示词 */
  updateSystemMessage(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * 获取发送给LLM的完整对话列表
   * 对标旧Python之 get_llm_dialogue_with_memory()
   * 构建四段式prompt：静态system → few-shot示例 → 动态上下文 → 对话历史
   */
  getLLMDialogueWithMemory(
    memoryStr?: string,
    voiceprintConfig?: Record<string, any>,
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. 静态system prompt（前缀缓存友好）
    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    // 2. 临时few-shot示例（is_temporary = true）
    for (const msg of this.dialogue) {
      if (msg.is_temporary) {
        messages.push({ ...msg, is_temporary: undefined });
      }
    }

    // 3. 动态上下文（时间、记忆、说话人信息）
    const dynamicParts: string[] = [];
    dynamicParts.push(`当前时间：${this.currentTime}`);
    if (memoryStr) {
      dynamicParts.push(`相关记忆：${memoryStr}`);
    }
    if (voiceprintConfig?.enabled) {
      dynamicParts.push(`注意：系统启用了声纹识别，请通过说话人信息区分不同用户。`);
    }
    if (dynamicParts.length > 0) {
      messages.push({ role: 'system', content: dynamicParts.join('\n') });
    }

    // 4. 实际对话历史（仅取非临时消息）
    const realMessages = this.dialogue.filter((m) => !m.is_temporary);
    const recentMessages = realMessages.slice(-this.maxTurns * 2);
    for (const msg of recentMessages) {
      messages.push({ ...msg, is_temporary: undefined });
    }

    // 自动补全悬空的tool_calls（防止API返回400错误）
    this._ensureToolCallsComplete(messages);

    return messages;
  }

  /** 清理对话历史，保留最近N轮 */
  private _trim(): void {
    const realMessages = this.dialogue.filter((m) => !m.is_temporary);
    if (realMessages.length > this.maxTurns * 2) {
      const cutoff = realMessages.length - this.maxTurns * 2;
      // 只删除实际消息，保留临时消息
      this.dialogue = this.dialogue.filter((m) => m.is_temporary || realMessages.indexOf(m) >= cutoff);
    }
  }

  /**
   * 确保每个 assistant(tool_calls) 消息都有对应的 tool 响应
   * 对标旧Python之 _ensure_tool_calls_complete()
   */
  private _ensureToolCallsComplete(messages: ChatMessage[]): void {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        // 检查后续所有 tool_call_id 是否都有响应
        const respondedIds = new Set<string>();
        for (let j = i + 1; j < messages.length; j++) {
          const next = messages[j]!;
          if (next.role === 'tool' && next.tool_call_id) {
            respondedIds.add(next.tool_call_id);
          }
          if (next.role === 'assistant' || next.role === 'user') break;
        }

        for (const tc of msg.tool_calls) {
          if (!respondedIds.has(tc.id)) {
            // 补充dummy tool响应
            messages.splice(i + 1, 0, {
              role: 'tool',
              tool_call_id: tc.id,
              content: '动作已取消或被打断',
            });
          }
        }
      }
    }
  }

  /** 获取所有非临时消息（用于保存记忆等） */
  getAllMessages(): ChatMessage[] {
    return this.dialogue.filter((m) => !m.is_temporary);
  }

  /** 清空对话 */
  clear(): void {
    this.dialogue = [];
  }
}

// ==============================
// 设备配置/智能体配置类型
// ==============================

/**
 * 从管理端API获取的完整智能体配置
 * 对标旧Python之 _initialize_private_config_async() 获取的配置
 */
export interface AgentConfig {
  ASR?: ASRConfig;
  LLM?: LLMConfig;
  TTS?: TTSConfig;
  VAD?: Record<string, any>;
  Memory?: MemoryConfig;
  Intent?: IntentConfig;
  VLLM?: Record<string, any>;
  /** 系统提示词 */
  prompt?: string;
  /** 已选模块映射 */
  selected_module?: Record<string, string>;
  /** 声纹配置 */
  voiceprint?: Record<string, any>;
  /** 记忆总结配置 */
  summaryMemory?: string;
  /** 设备最大输出字数 */
  device_max_output_size?: number;
  /** 聊天历史配置 */
  chat_history_conf?: number;
  /** MCP接入点 */
  mcp_endpoint?: string;
  /** 上下文提供者 */
  context_providers?: string;
  /** 插件配置 */
  plugins?: Record<string, any>;
  /** 替换词（纠错词） */
  correct_words?: Record<string, string>;
  /** 退出命令列表 */
  exit_commands?: string[];
  /** 唤醒词列表 */
  wakeup_words?: string[];
  /** 是否启用唤醒词响应缓存 */
  enable_wakeup_words_response_cache?: boolean;
  /** 唤醒词响应 */
  xiaozhi?: Record<string, any>;
  /** 结束提示 */
  end_prompt?: Record<string, any>;
  /** 是否删除临时音频文件 */
  delete_audio?: boolean;
  /** 小智欢迎消息模板 */
  welcome_msg?: Record<string, any>;
  /** 工具调用超时时间（秒），默认30 */
  tool_call_timeout?: number;
}

// ==============================
// WebSocket消息类型
// ==============================

/** 客户端发送的JSON消息类型 */
export type ClientMessageType = 'hello' | 'listen' | 'abort' | 'iot' | 'mcp' | 'ping';

/** 服务器发送给客户端的消息格式 */
export interface ServerMessage {
  type: string;
  state?: string;
  text?: string;
  session_id?: string;
  transport?: string;
  audio_params?: {
    format: string;
    sample_rate: number;
    channels: number;
    frame_duration: number;
  };
  [key: string]: any;
}

/** 客户端发送的JSON消息 */
export interface ClientMessage {
  type: ClientMessageType;
  state?: string;
  transport?: string;
  features?: Record<string, any>;
  [key: string]: any;
}
