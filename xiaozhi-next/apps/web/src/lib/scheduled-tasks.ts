import { prisma } from './db';
import { cache } from './redis';
import { createRAGFlowClient } from './ragflow-factory';

/**
 * 系统启动时预热缓存
 * 在 Next.js instrumentation.ts 中调用
 */
export async function warmupCaches(): Promise<void> {
  // 1. 参数缓存
  const params = await prisma.sysParams.findMany();
  if (params.length > 0) {
    const paramMap: Record<string, string> = {};
    params.forEach(p => { paramMap[p.paramCode] = p.paramValue; });
    await cache.hmset('sys:params', paramMap);
  }

  // 2. 版本检测（若版本号不同则 flushAll）
  const dbVersion = params.find(p => p.paramCode === 'system-web.version')?.paramValue || '1.0';
  const cachedVersion = await cache.get('sys:version');
  if (cachedVersion !== dbVersion) {
    await cache.flushAll();
    await cache.set('sys:version', dbVersion, 86400 * 365);
    // 重新预热
    await warmupCaches();
  }
}

/**
 * 文档状态同步定时任务（每 30 秒执行）
 *
 * 对标 Java DocumentStatusSyncTask:
 *   定时轮询状态为 RUNNING 的知识库文档，
 *   调用 RAGFlow API 查询最新状态并更新本地数据库。
 *
 * 更新字段：status / chunkCount / tokenCount / progress
 */
export async function syncDocumentStatus(): Promise<void> {
  try {
    // 查找所有状态为 RUNNING 的文档
    const runningDocs = await prisma.document.findMany({
      where: { status: 'RUNNING' },
      include: { knowledgeBase: true },
    });

    for (const doc of runningDocs) {
      try {
        const client = await createRAGFlowClient(
          doc.knowledgeBase.ragModelId
        );
        const status = await client.getDocumentStatus(
          doc.knowledgeBase.datasetId,
          doc.documentId
        );

        // 当状态变更时更新本地记录
        if (status?.data?.status && status.data.status !== doc.status) {
          await prisma.document.update({
            where: { id: doc.id },
            data: {
              status: status.data.status,
              chunkCount: status.data.chunk_count ?? undefined,
              tokenCount: status.data.token_count ?? undefined,
              progress: status.data.progress ?? undefined,
              error: status.data.status === 'FAILED' ? (status.data.error || '解析失败') : null,
              lastSyncAt: new Date(),
            },
          });
        } else {
          // 即使状态未变，也更新同步时间
          await prisma.document.update({
            where: { id: doc.id },
            data: { lastSyncAt: new Date() },
          });
        }
      } catch {
        // 单条同步失败不影响其他文档
        continue;
      }
    }
  } catch {
    // 整体同步异常时不抛出，避免定时器崩溃
    console.error('[ScheduledTask] 文档状态同步异常');
  }
}

/** 定时任务句柄，用于后续管理 */
let syncIntervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * 启动定时任务
 * 应在 instrumentation.ts 或应用启动入口调用
 */
export function startScheduledTasks(): void {
  if (syncIntervalHandle) return; // 防止重复启动

  // 文档状态同步：每 30 秒
  syncIntervalHandle = setInterval(syncDocumentStatus, 30_000);

  console.log('[ScheduledTask] 定时任务已启动（文档状态同步 / 30秒）');
}

/**
 * 停止定时任务
 */
export function stopScheduledTasks(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
    console.log('[ScheduledTask] 定时任务已停止');
  }
}
