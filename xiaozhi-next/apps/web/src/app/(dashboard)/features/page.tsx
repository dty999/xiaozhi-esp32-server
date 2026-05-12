'use client';
/**
 * 功能配置页
 *
 * 对标旧项目 FeatureManagement.vue + featureManager.js:
 *   - 从 /api/auth/pub-config 获取 systemWebMenu.features 配置
 *   - 两组功能：功能管理（声纹识别、音色克隆、知识库、MCP接入点）+ 语音管理（VAD、ASR）
 *   - 卡片+复选框切换
 *   - 保存（批量写入 system-web.menu 参数）
 *   - 重置为默认
 *   - 全选/取消全选
 *   - saved/loading 状态
 */

import { useEffect, useState } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Globe, Loader2, Check, Save, RotateCcw, CheckSquare, Square,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface FeatureItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_FEATURES: Record<string, { name: string; description: string; enabled: boolean }> = {
  voiceprintRecognition: { name: '声纹识别', description: '声纹快速唤醒与说话人识别', enabled: false },
  voiceClone: { name: '音色克隆', description: '声音克隆与定制化音色', enabled: false },
  knowledgeBase: { name: '知识库', description: 'RAGFlow 知识库检索增强问答', enabled: false },
  mcpAccessPoint: { name: 'MCP接入点', description: 'Model Context Protocol 外部工具接入', enabled: false },
  vad: { name: 'VAD', description: '语音端点检测（Voice Activity Detection）', enabled: false },
  asr: { name: 'ASR', description: '语音识别（Automatic Speech Recognition）', enabled: false },
};

const GROUP_FEATURE_MANAGEMENT = ['voiceprintRecognition', 'voiceClone', 'knowledgeBase', 'mcpAccessPoint'];
const GROUP_VOICE_MANAGEMENT = ['vad', 'asr'];

export default function FeaturesPage() {
  const { token } = useAuthStore();
  const [mgmtFeatures, setMgmtFeatures] = useState<FeatureItem[]>([]);
  const [voiceFeatures, setVoiceFeatures] = useState<FeatureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  /** 从 pub-config 加载功能配置 */
  const loadFeatures = async () => {
    setLoading(true);
    try {
      const res = await ofetch('/api/auth/pub-config', { headers: authHeaders });
      if (res.code === 0) {
        const menu = res.data?.systemWebMenu || {};
        const features: Record<string, any> = menu.features || {};

        const toItems = (ids: string[]): FeatureItem[] =>
          ids.map(id => {
            const f = features[id];
            const def = DEFAULT_FEATURES[id];
            return {
              id,
              name: def?.name || id,
              description: def?.description || '',
              enabled: f?.enabled ?? def?.enabled ?? false,
            };
          });

        setMgmtFeatures(toItems(GROUP_FEATURE_MANAGEMENT));
        setVoiceFeatures(toItems(GROUP_VOICE_MANAGEMENT));
      } else {
        useDefaults();
      }
    } catch {
      useDefaults();
    }
    setLoading(false);
  };

  const useDefaults = () => {
    setMgmtFeatures(GROUP_FEATURE_MANAGEMENT.map(id => ({
      id,
      name: DEFAULT_FEATURES[id].name,
      description: DEFAULT_FEATURES[id].description,
      enabled: DEFAULT_FEATURES[id].enabled,
    })));
    setVoiceFeatures(GROUP_VOICE_MANAGEMENT.map(id => ({
      id,
      name: DEFAULT_FEATURES[id].name,
      description: DEFAULT_FEATURES[id].description,
      enabled: DEFAULT_FEATURES[id].enabled,
    })));
  };

  useEffect(() => { loadFeatures(); }, []);

  const allFeatures = [...mgmtFeatures, ...voiceFeatures];
  const isAllSelected = allFeatures.length > 0 && allFeatures.every(f => f.enabled);

  const toggleFeature = (item: FeatureItem) => {
    const flip = (list: FeatureItem[]) =>
      list.map(f => f.id === item.id ? { ...f, enabled: !f.enabled } : f);
    if (mgmtFeatures.some(f => f.id === item.id)) {
      setMgmtFeatures(flip(mgmtFeatures));
    } else {
      setVoiceFeatures(flip(voiceFeatures));
    }
    setPending(true);
    setMsg(null);
  };

  const toggleSelectAll = () => {
    const newVal = !isAllSelected;
    setMgmtFeatures(mgmtFeatures.map(f => ({ ...f, enabled: newVal })));
    setVoiceFeatures(voiceFeatures.map(f => ({ ...f, enabled: newVal })));
    setPending(true);
    setMsg(null);
  };

  /** 查找或创建 system-web.menu 的参数，返回 ID */
  const ensureParamId = async (): Promise<string | null> => {
    try {
      const res = await ofetch('/api/admin/params?paramCode=system-web.menu&limit=1', { headers: authHeaders });
      if (res.code === 0 && res.data.list?.length > 0) {
        return res.data.list[0].id;
      }
    } catch {}
    // 不存在则自动创建
    try {
      const createRes = await ofetch('/api/admin/params', {
        method: 'POST',
        body: {
          paramCode: 'system-web.menu',
          paramValue: '{}',
          valueType: 4, // json
          remark: '系统功能菜单配置',
        },
        headers: authHeaders,
      });
      if (createRes.code === 0 && createRes.data?.id) {
        return createRes.data.id;
      }
    } catch {}
    return null;
  };

  const handleSave = async () => {
    if (!pending) {
      setMsg({ type: 'error', text: '没有需要保存的变更' });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      // 构建 features 对象
      const features: Record<string, { enabled: boolean }> = {};
      allFeatures.forEach(f => { features[f.id] = { enabled: f.enabled }; });

      // 构建完整的 menu 配置（保留原始其他字段 + 更新 features）
      let existingMenu: any = {};
      try {
        const pubRes = await ofetch('/api/auth/pub-config', { headers: authHeaders });
        if (pubRes.code === 0) {
          existingMenu = pubRes.data?.systemWebMenu || {};
        }
      } catch {}
      const menuConfig = {
        ...existingMenu,
        features,
        groups: {
          featureManagement: GROUP_FEATURE_MANAGEMENT,
          voiceManagement: GROUP_VOICE_MANAGEMENT,
        },
      };

      // 查找或创建参数
      const paramId = await ensureParamId();
      if (!paramId) {
        setMsg({ type: 'error', text: '创建或更新 system-web.menu 参数失败' });
        setSaving(false);
        return;
      }

      const saveRes = await ofetch(`/api/admin/params/${paramId}`, {
        method: 'PUT',
        body: {
          paramValue: JSON.stringify(menuConfig),
          valueType: 4, // json
          remark: '系统功能菜单配置',
        },
        headers: authHeaders,
      });

      if (saveRes.code === 0) {
        setMsg({ type: 'success', text: '配置保存成功' });
        setPending(false);
      } else {
        setMsg({ type: 'error', text: saveRes.msg || '保存失败' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || '保存失败' });
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm('确定重置所有功能配置为默认状态？')) return;

    setSaving(true);
    try {
      // 构建全部禁用的 features
      const features: Record<string, { enabled: boolean }> = {};
      Object.keys(DEFAULT_FEATURES).forEach(id => { features[id] = { enabled: false }; });

      const menuConfig = {
        features,
        groups: {
          featureManagement: GROUP_FEATURE_MANAGEMENT,
          voiceManagement: GROUP_VOICE_MANAGEMENT,
        },
      };

      const paramId = await ensureParamId();
      if (!paramId) {
        setMsg({ type: 'error', text: '创建或更新参数失败' });
        setSaving(false);
        return;
      }

      await ofetch(`/api/admin/params/${paramId}`, {
        method: 'PUT',
        body: {
          paramValue: JSON.stringify(menuConfig),
          valueType: 4,
          remark: '系统功能菜单配置',
        },
        headers: authHeaders,
      });

      useDefaults();
      setPending(false);
      setMsg({ type: 'success', text: '配置已重置' });
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message || '重置失败' });
    }
    setSaving(false);
  };

  const renderFeatureCard = (item: FeatureItem) => (
    <div
      key={item.id}
      className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all select-none ${
        item.enabled
          ? 'border-primary/60 bg-primary/[0.04] shadow-sm'
          : 'border-border bg-card hover:border-primary/30'
      } ${saving ? 'pointer-events-none opacity-70' : ''}`}
      onClick={() => toggleFeature(item)}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-base">{item.name}</h3>
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          item.enabled ? 'bg-primary border-primary' : 'border-border'
        }`}>
          {item.enabled && <Check size={14} className="text-primary-foreground" />}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{item.description}</p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Globe size={20} strokeWidth={1.8} />功能配置
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={toggleSelectAll} disabled={saving}>
            {isAllSelected ? <Square size={14} className="mr-1" /> : <CheckSquare size={14} className="mr-1" />}
            {isAllSelected ? '取消全选' : '全选'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
            <RotateCcw size={14} className="mr-1" />重置
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader2 size={14} className="mr-1 animate-spin" />保存中...</>
              : <><Save size={14} className="mr-1" />保存</>
            }
          </Button>
        </div>
      </div>

      {/* 消息提示 */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          msg.type === 'success'
            ? 'bg-emerald-500/5 text-emerald-600 border border-emerald-500/15'
            : 'bg-destructive/5 text-destructive border border-destructive/15'
        }`}>
          {msg.text}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : (
        <div className="flex gap-8">
          {/* 功能管理分组 */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-3 pl-3 border-l-2 border-primary">
              功能管理
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mgmtFeatures.map(renderFeatureCard)}
            </div>
          </div>

          {/* 语音管理分组 */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold mb-3 pl-3 border-l-2 border-primary">
              语音管理
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {voiceFeatures.map(renderFeatureCard)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}