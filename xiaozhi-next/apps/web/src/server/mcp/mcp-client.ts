import { logger } from '../utils/logger';

const TAG = 'MCPClient';

export class MCPClient {
  private tools: Map<string, MCPToolData> = new Map();
  private nameMapping: Map<string, string> = new Map();
  private _ready = false;
  private callResults: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }> = new Map();
  private nextId = 1;
  private cachedAvailableTools: ToolDefinitionForMCP[] | null = null;

  get ready(): boolean { return this._ready; }

  hasTool(name: string): boolean { return this.tools.has(name); }

  getAvailableTools(): ToolDefinitionForMCP[] {
    if (this.cachedAvailableTools) return this.cachedAvailableTools;

    const result: ToolDefinitionForMCP[] = [];
    for (const [toolName, toolData] of this.tools) {
      result.push({
        type: 'function',
        function: {
          name: toolName,
          description: toolData.description,
          parameters: {
            type: 'object' as const,
            properties: toolData.inputSchema.properties || {},
            required: toolData.inputSchema.required || [],
          },
        },
      });
    }
    this.cachedAvailableTools = result;
    return result;
  }

  async addTool(toolData: MCPToolData): Promise<void> {
    const sanitizedName = sanitizeToolName(toolData.name);
    this.tools.set(sanitizedName, toolData);
    this.nameMapping.set(sanitizedName, toolData.name);
    this.cachedAvailableTools = null;
  }

  setReady(status: boolean): void {
    this._ready = status;
  }

  getNextId(): number {
    return this.nextId++;
  }

  registerCallFuture(id: number, resolve: (v: any) => void, reject: (e: Error) => void, timeoutMs: number): void {
    const timer = setTimeout(() => {
      this.callResults.delete(id);
      reject(new Error('MCP工具调用超时'));
    }, timeoutMs);
    this.callResults.set(id, { resolve, reject, timer });
  }

  resolveCall(id: number, result: any): void {
    const entry = this.callResults.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.callResults.delete(id);
      entry.resolve(result);
    }
  }

  rejectCall(id: number, error: Error): void {
    const entry = this.callResults.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.callResults.delete(id);
      entry.reject(error);
    }
  }

  cleanupCall(id: number): void {
    const entry = this.callResults.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      this.callResults.delete(id);
    }
  }

  getOriginalName(sanitizedName: string): string {
    return this.nameMapping.get(sanitizedName) || sanitizedName;
  }

  getToolDescriptions(): string {
    const parts: string[] = [];
    for (const [sanitizedName, toolData] of this.tools) {
      let desc = toolData.description;
      for (const [sName, origName] of this.nameMapping) {
        desc = desc.replace(origName, sName);
      }
      parts.push(`${sanitizedName}: ${desc}`);
    }
    return parts.join('\n');
  }

  destroy(): void {
    for (const [, entry] of this.callResults) {
      clearTimeout(entry.timer);
      entry.reject(new Error('连接已关闭'));
    }
    this.callResults.clear();
    this.tools.clear();
    this.nameMapping.clear();
    this._ready = false;
  }
}

export interface MCPToolData {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ToolDefinitionForMCP {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

export function sanitizeToolNameExport(name: string): string {
  return sanitizeToolName(name);
}
