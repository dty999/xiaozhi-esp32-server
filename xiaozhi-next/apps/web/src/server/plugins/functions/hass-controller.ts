import type { ToolResult } from '../func-handler';

export async function handleHassGetState(
  args: Record<string, any>,
  _context: Record<string, any>,
): Promise<ToolResult> {
  const entityId = args.entity_id || args.entityId || '';
  const hassUrl = process.env.HASS_URL;
  const hassToken = process.env.HASS_TOKEN;

  if (!hassUrl || !hassToken) {
    return {
      success: false,
      result: 'Home Assistant 服务未配置。',
    };
  }

  if (!entityId) {
    return {
      success: false,
      result: '请提供实体ID。',
    };
  }

  try {
    const response = await fetch(`${hassUrl}/api/states/${entityId}`, {
      headers: {
        'Authorization': `Bearer ${hassToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        result: `获取Home Assistant状态失败：HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const state = data.state;
    const friendlyName = data.attributes?.friendly_name || entityId;

    return {
      success: true,
      result: `${friendlyName} 当前状态为：${state}`,
      needsLLMResponse: false,
    };
  } catch (e: any) {
    return {
      success: false,
      result: `Home Assistant 请求失败：${e.message}`,
    };
  }
}

export async function handleHassSetState(
  args: Record<string, any>,
  _context: Record<string, any>,
): Promise<ToolResult> {
  const entityId = args.entity_id || args.entityId || '';
  const service = args.service || '';
  const serviceData = args.service_data || {};
  const hassUrl = process.env.HASS_URL;
  const hassToken = process.env.HASS_TOKEN;

  if (!hassUrl || !hassToken) {
    return {
      success: false,
      result: 'Home Assistant 服务未配置。',
    };
  }

  if (!entityId || !service) {
    return {
      success: false,
      result: '请提供实体ID和服务名称。',
    };
  }

  try {
    const [domain] = entityId.split('.');
    const response = await fetch(`${hassUrl}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hassToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entity_id: entityId,
        ...serviceData,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return {
        success: false,
        result: `Home Assistant 控制失败：HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      result: `已成功控制 ${entityId} 执行 ${service} 操作。`,
      needsLLMResponse: true,
    };
  } catch (e: any) {
    return {
      success: false,
      result: `Home Assistant 控制失败：${e.message}`,
    };
  }
}
