import type { ToolResult } from '../func-handler';

export async function handleChangeRole(
  args: Record<string, any>,
  _context: Record<string, any>,
): Promise<ToolResult> {
  const roleName = args.role || args.name || '';
  const rolePrompt = args.prompt || args.description || '';

  if (!roleName && !rolePrompt) {
    return {
      success: false,
      result: '请指定角色名称或角色描述。',
    };
  }

  return {
    success: true,
    result: rolePrompt
      ? `角色已切换，新角色设定：${rolePrompt}`
      : `角色已切换为：${roleName}`,
    needsLLMResponse: true,
  };
}
