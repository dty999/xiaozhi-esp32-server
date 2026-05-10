/**
 * ============================================================
 * 统一插件处理器 — Function Calling 路由与执行
 * 对标旧Python: plugins_func/ 体系 + UnifiedToolHandler
 *
 * 核心职责：
 * 1. 注册所有可用工具函数
 * 2. 生成 OpenAI tools 定义（供 LLM Function Calling 使用）
 * 3. 路由工具调用 → 执行具体插件 → 返回结果
 * 4. 处理 direct_answer 虚拟工具
 *
 * ============================================================
 */

import type { ToolCall, ToolDefinition, ChatMessage } from '../types';
import { handleGetWeather } from './functions/get-weather';
import { handleGetTime } from './functions/get-time';
import { handleExitIntent } from './functions/handle-exit-intent';
import { handleGetNews } from './functions/get-news';
import { handlePlayMusic } from './functions/play-music';
import { handleChangeRole } from './functions/change-role';
import { handleRAGSearch } from './functions/search-ragflow';
import { handleHassGetState, handleHassSetState } from './functions/hass-controller';

// ==============================
// 工具执行结果
// ==============================

/** 工具执行行动类型（对标旧Python: Action） */
export type ToolAction = 'response' | 'reqllm' | 'record' | 'error' | 'notfound';

/** 工具执行响应（对标旧Python: ActionResponse） */
export interface ToolResult {
  /** 执行是否成功 */
  success: boolean;
  /** 执行行动类型 */
  action?: ToolAction;
  /** 返回给LLM的文本（tool角色消息内容） */
  result: string;
  /** 直接回复文本（Action.RESPONSE时填充） */
  response?: string;
  /** 是否需要在下一轮对话中继续请求LLM（Action.REQLLM） */
  needsLLMResponse?: boolean;
  /** 是否仅记录不调LLM（Action.RECORD） */
  recordOnly?: boolean;
  /** 是否触发退出 */
  exit?: boolean;
  /** 退出时的告别语 */
  goodbyeMessage?: string;
}

/** 工具函数签名 */
export type ToolFunction = (
  args: Record<string, any>,
  context: ToolContext,
) => Promise<ToolResult>;

/** 工具执行上下文 */
export interface ToolContext {
  /** 当前设备ID */
  deviceId: string;
  /** 当前会话ID */
  sessionId: string;
  /** 工具调用超时时间（秒），默认30 */
  toolCallTimeout?: number;
}

// ==============================
// 工具注册表
// ==============================

/** 已注册的工具函数映射 */
const toolRegistry = new Map<string, { handler: ToolFunction; definition: ToolDefinition }>();

/**
 * 初始化插件系统
 * 对标旧Python: auto_import_modules("plugins_func.functions") + UnifiedToolHandler
 */
export function initPlugins(): void {
  // ---- 基础工具 ----

  // 天气查询
  registerTool('get_weather', handleGetWeather, {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的当前天气信息，包括温度、湿度、天气状况、风力等',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，如"北京"、"上海"、"深圳"' },
        },
        required: ['city'],
      },
    },
  });

  // 时间查询
  registerTool('get_time', handleGetTime, {
    type: 'function',
    function: {
      name: 'get_time',
      description: '获取当前日期和时间信息',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: '时区，如"Asia/Shanghai"，默认为空使用系统时区' },
        },
      },
    },
  });

  // 退出对话
  registerTool('handle_exit_intent', handleExitIntent, {
    type: 'function',
    function: {
      name: 'handle_exit_intent',
      description: '当用户明确表示要退出、结束对话、再见时调用此工具。注意：仅仅是"谢谢"、"好的"等不是退出意图。',
      parameters: {
        type: 'object',
        properties: {
          say_goodbye: { type: 'string', description: '告别语，用于和用户道别' },
        },
        required: ['say_goodbye'],
      },
    },
  });

  // 新闻查询
  registerTool('get_news', handleGetNews, {
    type: 'function',
    function: {
      name: 'get_news',
      description: '获取当前最新新闻资讯',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: '新闻类别',
            enum: ['general', 'technology', 'business', 'sports', 'entertainment'],
          },
          count: { type: 'number', description: '返回新闻条数，默认5条' },
        },
      },
    },
  });

  // 播放音乐
  registerTool('play_music', handlePlayMusic, {
    type: 'function',
    function: {
      name: 'play_music',
      description: '播放音乐，用户要求听歌时调用此工具',
      parameters: {
        type: 'object',
        properties: {
          song: { type: 'string', description: '歌曲名称' },
          artist: { type: 'string', description: '歌手名称（可选）' },
        },
        required: ['song'],
      },
    },
  });

  // 切换角色
  registerTool('change_role', handleChangeRole, {
    type: 'function',
    function: {
      name: 'change_role',
      description: '切换AI助手的角色或人设，用户要求改变说话风格或角色时调用',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', description: '角色名称，如"猫娘"、"管家"、"老师"等' },
          prompt: { type: 'string', description: '角色的详细描述或人设提示词' },
        },
      },
    },
  });

  // RAG知识库搜索
  registerTool('search_knowledge_base', handleRAGSearch, {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: '从知识库中搜索相关信息，当用户的问题可能需要特定领域知识时调用',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询内容' },
          dataset: { type: 'string', description: '数据集ID（可选）' },
        },
        required: ['query'],
      },
    },
  });

  // Home Assistant 获取状态
  registerTool('hass_get_state', handleHassGetState, {
    type: 'function',
    function: {
      name: 'hass_get_state',
      description: '获取Home Assistant中智能设备的状态，如灯光、开关、传感器等',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: '实体ID，如light.living_room、sensor.temperature' },
        },
        required: ['entity_id'],
      },
    },
  });

  // Home Assistant 控制设备
  registerTool('hass_set_state', handleHassSetState, {
    type: 'function',
    function: {
      name: 'hass_set_state',
      description: '控制Home Assistant中的智能设备，如开灯、关灯、调节温度等',
      parameters: {
        type: 'object',
        properties: {
          entity_id: { type: 'string', description: '实体ID，如light.living_room' },
          service: { type: 'string', description: '服务名称，如turn_on、turn_off、toggle' },
          service_data: { type: 'object', description: '服务参数，如亮度、颜色等' },
        },
        required: ['entity_id', 'service'],
      },
    },
  });

  // ---- direct_answer 虚拟工具 ----
  // 对标旧Python: DIRECT_ANSWER_TOOL
  // 不是真实工具，是路由机制：将"调不调工具"的二选一变为"调哪个"的多选
  registerTool('direct_answer', handleDirectAnswer, {
    type: 'function',
    function: {
      name: 'direct_answer',
      description: '当用户的请求不匹配其他任何工具时，可用此选项直接回复。将回复内容写在response参数里。',
      parameters: {
        type: 'object',
        properties: {
          response: { type: 'string', description: '你回复用户的完整内容' },
        },
        required: ['response'],
      },
    },
  });

  console.log(`[Plugins] 插件系统初始化完成，已注册 ${toolRegistry.size} 个工具`);
}

// ==============================
// 工具注册/查询
// ==============================

/**
 * 注册一个工具函数
 */
export function registerTool(
  name: string,
  handler: ToolFunction,
  definition: ToolDefinition,
): void {
  toolRegistry.set(name, { handler, definition });
}

/**
 * 获取所有已注册工具的定义列表（供LLM使用）
 * 对标旧Python: func_handler.get_functions()
 */
export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(toolRegistry.values()).map((t) => t.definition);
}

/**
 * 获取除 direct_answer 外的所有工具定义
 */
export function getRealToolDefinitions(): ToolDefinition[] {
  return Array.from(toolRegistry.values())
    .filter((t) => t.definition.function.name !== 'direct_answer')
    .map((t) => t.definition);
}

// ==============================
// 工具路由与执行
// ==============================

/**
 * 执行工具调用
 * 对标旧Python: func_handler.handle_llm_function_call()
 *
 * @param toolCall LLM返回的工具调用
 * @param context 工具执行上下文
 * @returns 执行结果
 */
export async function executeToolCall(
  toolCall: ToolCall,
  context: ToolContext,
): Promise<ToolResult> {
  const { name, arguments: argsStr } = toolCall.function;

  let args: Record<string, any>;
  try {
    args = JSON.parse(argsStr || '{}');
  } catch {
    args = {};
  }

  const entry = toolRegistry.get(name);
  if (!entry) {
    console.warn(`[Plugins] 未知工具: ${name}`);
    return {
      success: false,
      result: `未知工具: ${name}。当前可用工具有：${Array.from(toolRegistry.keys()).join(', ')}`,
    };
  }

  try {
    const timeout = context.toolCallTimeout || 30;
    const result = await Promise.race([
      entry.handler(args, context),
      new Promise<ToolResult>((_, reject) =>
        setTimeout(() => reject(new Error('工具调用超时')), timeout * 1000),
      ),
    ]);
    return result;
  } catch (e: any) {
    if (e.message === '工具调用超时') {
      console.warn(`[Plugins] 工具调用超时 [${name}]，超时时间: ${context.toolCallTimeout || 30}秒`);
      return {
        success: false,
        result: '哎呀，网络遇到点问题，请稍后再试下！',
      };
    }
    console.error(`[Plugins] 工具执行失败 [${name}]: ${e.message}`);
    return {
      success: false,
      result: `工具 ${name} 执行失败: ${e.message}`,
    };
  }
}

/**
 * 批量执行多个工具调用（并行执行）
 * 对标旧Python: _handle_function_result
 *
 * @param toolCalls 工具调用列表
 * @param context 执行上下文
 * @returns 执行结果映射
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  context: ToolContext,
): Promise<Map<string, ToolResult>> {
  const results = new Map<string, ToolResult>();

  // 分离 direct_answer 与真实工具
  const directAnswerCalls = toolCalls.filter(
    (tc) => tc.function.name === 'direct_answer',
  );
  const realToolCalls = toolCalls.filter(
    (tc) => tc.function.name !== 'direct_answer',
  );

  // direct_answer 统一处理
  for (const tc of directAnswerCalls) {
    const result = await executeToolCall(tc, context);
    // 流式阶段已播报，此处标记为已处理
    results.set(tc.id, result);
  }

  // 真实工具并行执行（每个工具调用30秒超时）
  if (realToolCalls.length > 0) {
    const promises = realToolCalls.map(async (tc) => {
      try {
        const result = await executeToolCall(tc, context);
        return { id: tc.id, result };
      } catch (e: any) {
        return {
          id: tc.id,
          result: {
            success: false,
            result: `工具执行超时或异常: ${e.message}`,
          } as ToolResult,
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.set(item.value.id, item.value.result);
      }
    }
  }

  return results;
}

// ==============================
// direct_answer 虚拟工具处理
// ==============================
// 对标旧Python: DIRECT_ANSWER_TOOL + _extract_direct_answer_response

async function handleDirectAnswer(
  args: Record<string, any>,
  _context: ToolContext,
): Promise<ToolResult> {
  // direct_answer 在LLM流式阶段已实时播报
  // 此处仅返回确认，不重复播报
  return {
    success: true,
    result: '已直接回复',
    needsLLMResponse: false,
  };
}
