import type { WebSocket } from 'ws';
import { IotDescriptor } from './iot-descriptor';
import type { ToolDefinition } from '../types';
import { logger } from '../utils/logger';

const TAG = 'IoTHandler';

export function handleIotDescriptors(
  iotDescriptors: Map<string, IotDescriptor>,
  descriptors: Record<string, any>[],
  onToolsChanged?: () => void,
): boolean {
  let functionsChanged = false;

  for (const descriptor of descriptors) {
    if (!descriptor.properties && !descriptor.methods) continue;

    if (!descriptor.properties) {
      descriptor.properties = {};
      if (descriptor.methods) {
        for (const [methodName, methodInfo] of Object.entries(descriptor.methods)) {
          if ((methodInfo as any).parameters) {
            for (const [paramName, paramInfo] of Object.entries((methodInfo as any).parameters)) {
              descriptor.properties[paramName] = {
                description: (paramInfo as any).description,
                type: (paramInfo as any).type,
              };
            }
          }
        }
      }
    }

    const iotDesc = new IotDescriptor(
      descriptor.name,
      descriptor.description,
      descriptor.properties,
      descriptor.methods,
    );
    iotDescriptors.set(descriptor.name, iotDesc);
    functionsChanged = true;
  }

  if (functionsChanged) {
    onToolsChanged?.();
  }

  return functionsChanged;
}

export function handleIotStatus(
  iotDescriptors: Map<string, IotDescriptor>,
  states: Record<string, any>[],
): void {
  for (const state of states) {
    const descriptor = iotDescriptors.get(state.name);
    if (!descriptor) continue;

    if (!state.state) continue;

    for (const prop of descriptor.properties) {
      const v = state.state[prop.name];
      if (v !== undefined) {
        if (typeof v !== typeof prop.value) {
          logger.error(TAG, `属性${prop.name}的值类型不匹配`);
          continue;
        }
        prop.value = v;
        logger.info(TAG, `IoT状态更新: ${state.name}, ${prop.name} = ${v}`);
      }
    }
  }
}

export function registerIotTools(
  iotDescriptors: Map<string, IotDescriptor>,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const [, descriptor] of iotDescriptors) {
    const deviceName = descriptor.name;
    const deviceDesc = descriptor.description;

    for (const prop of descriptor.properties) {
      const toolName = `get_${deviceName.toLowerCase()}_${prop.name.toLowerCase()}`;
      tools.push({
        type: 'function',
        function: {
          name: toolName,
          description: `查询${deviceDesc}的${prop.description}`,
          parameters: {
            type: 'object',
            properties: {
              response_success: {
                type: 'string',
                description: `查询成功时的友好回复，必须使用{value}作为占位符表示查询到的值`,
              },
              response_failure: {
                type: 'string',
                description: `查询失败时的友好回复`,
              },
            },
            required: ['response_success', 'response_failure'],
          },
        },
      });
    }

    for (const method of descriptor.methods) {
      const toolName = `${deviceName.toLowerCase()}_${method.name.toLowerCase()}`;
      const parameters: Record<string, { type: string; description: string }> = {};
      const required: string[] = [];

      if (method.parameters) {
        for (const [paramName, paramInfo] of Object.entries(method.parameters)) {
          parameters[paramName] = {
            type: paramInfo.type,
            description: paramInfo.description,
          };
          required.push(paramName);
        }
      }

      parameters['response_success'] = {
        type: 'string',
        description: '操作成功时的友好回复',
      };
      parameters['response_failure'] = {
        type: 'string',
        description: '操作失败时的友好回复',
      };
      required.push('response_success', 'response_failure');

      tools.push({
        type: 'function',
        function: {
          name: toolName,
          description: `${deviceDesc} - ${method.description}`,
          parameters: {
            type: 'object',
            properties: parameters,
            required,
          },
        },
      });
    }
  }

  return tools;
}

export function getIotStatus(
  iotDescriptors: Map<string, IotDescriptor>,
  deviceName: string,
  propertyName: string,
): any {
  for (const [, descriptor] of iotDescriptors) {
    if (descriptor.name.toLowerCase() === deviceName.toLowerCase()) {
      for (const prop of descriptor.properties) {
        if (prop.name.toLowerCase() === propertyName.toLowerCase()) {
          return prop.value;
        }
      }
    }
  }
  return null;
}

export function sendIotCommand(
  ws: WebSocket,
  iotDescriptors: Map<string, IotDescriptor>,
  deviceName: string,
  methodName: string,
  parameters?: Record<string, any>,
): boolean {
  for (const [key, descriptor] of iotDescriptors) {
    if (descriptor.name.toLowerCase() === deviceName.toLowerCase()) {
      for (const method of descriptor.methods) {
        if (method.name.toLowerCase() === methodName.toLowerCase()) {
          const command: Record<string, any> = {
            name: key,
            method: method.name,
          };
          if (parameters) {
            command.parameters = parameters;
          }
          ws.send(JSON.stringify({ type: 'iot', commands: [command] }));
          return true;
        }
      }
    }
  }
  return false;
}
