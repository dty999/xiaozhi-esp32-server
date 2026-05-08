import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { safeParseBody } from '@/lib/request-body';

// POST /api/config/agent-models — 智能体配置下发（xiaozhi-server 调用，ServerSecret 鉴权）
export async function POST(request: NextRequest) {
  const auth = await authenticate('server', request);
  if (!auth.authenticated) {
    return NextResponse.json({ code: 403, msg: auth.error }, { status: 403 });
  }

  const body = await safeParseBody(request);
  if (!body) {
    return NextResponse.json({ code: 400, msg: '请求参数格式错误' });
  }
  const { macAddress, clientId, selectedModule } = body;

  // 1. 根据 MAC 查找设备
  const device = await prisma.aiDevice.findFirst({
    where: { macAddress },
    include: { agent: true },
  });
  if (!device || !device.agent) {
    return NextResponse.json({ code: 404, msg: '设备未绑定智能体' });
  }
  const agent = device.agent;

  // 2. 如果指定了 selectedModule（模块白名单），只返回选中的模块
  const selectedModulesSet = selectedModule
    ? new Set(selectedModule.split(',').map((s: string) => s.trim().toUpperCase()))
    : null;

  // 3. 构建模型配置 Map
  const modelConfig: Record<string, any> = {};

  const modelIds = [
    { key: 'VAD', id: agent.vadModelId },
    { key: 'ASR', id: agent.asrModelId },
    { key: 'LLM', id: agent.llmModelId },
    { key: 'TTS', id: agent.ttsModelId },
    { key: 'Memory', id: agent.memModelId },
    { key: 'Intent', id: agent.intentModelId },
    { key: 'VLLM', id: agent.vllmModelId },
    { key: 'SLM', id: agent.slmModelId },
  ];

  for (const { key, id } of modelIds) {
    if (selectedModulesSet && !selectedModulesSet.has(key)) continue;
    if (!id) continue;

    const config = await prisma.modelConfig.findUnique({ where: { id } });
    if (config) {
      modelConfig[key] = {
        type: config.modelCode,
        provider: config.modelName,
        config: config.configJson,
      };
    }
  }

  // 4. TTS 音色配置
  if (!selectedModulesSet || selectedModulesSet.has('TTS')) {
    if (agent.ttsVoiceId) {
      const voice = await prisma.aiTtsVoice.findUnique({
        where: { id: agent.ttsVoiceId },
      });
      if (voice) {
        modelConfig['TTS'] = {
          ...modelConfig['TTS'],
          voiceName: voice.name,
          voiceConfig: voice.ttsVoice,
          language: voice.languages,
          volume: agent.ttsVolume,
          rate: agent.ttsRate,
          pitch: agent.ttsPitch,
        };
      }
    }
  }

  // 5. 上下文源
  const contextProviders = await prisma.agentContextProvider.findFirst({
    where: { agentId: agent.id },
  });
  if (contextProviders?.contextProviders) {
    modelConfig['ContextProviders'] = contextProviders.contextProviders;
  }

  // 6. 替换词
  const correctWords = await prisma.agentCorrectWordMapping.findMany({
    where: { agentId: agent.id },
    include: {
      file: true,
    },
  });
  if (correctWords.length > 0) {
    modelConfig['CorrectWords'] = correctWords
      .map(cw => cw.file?.content || '')
      .filter(Boolean)
      .join('\n');
  }

  // 7. 插件配置
  const plugins = await prisma.agentPluginMapping.findMany({
    where: { agentId: agent.id },
  });
  if (plugins.length > 0) {
    modelConfig['Plugin'] = plugins.map(p => ({
      id: p.pluginId,
      targetId: p.targetId,
    }));
  }

  // 8. 智能体参数
  modelConfig['agentParams'] = {
    systemPrompt: agent.systemPrompt,
    summaryMemory: agent.summaryMemory,
    chatHistoryConf: agent.chatHistoryConf,
    language: agent.ttsLanguage,
    functions: agent.functions,
  };

  return NextResponse.json({
    code: 0,
    data: modelConfig,
  });
}
