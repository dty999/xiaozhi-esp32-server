'use client';
/**
 * 聊天记录面板 — 按智能体 ID 展示会话列表 + 消息详情 + 音频播放
 *
 * 用于首页智能体卡片的弹窗及独立页面嵌入式使用。
 */

import { useState, useEffect } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, Download, Play } from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

interface Session {
  sessionId: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
}

interface Message {
  id: string;
  chatType: number;
  content: string | null;
  audioId: string | null;
  createdAt: string;
  macAddress: string | null;
}

export function ChatHistoryPanel({ agentId }: { agentId: string }) {
  const { token } = useAuthStore();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 加载会话列表
  useEffect(() => {
    (async () => {
      try {
        const res = await ofetch(`/api/agents/${agentId}/sessions?page=1&limit=50`, { headers: authHeaders });
        if (res.code === 0) setSessions(res.data.list || []);
      } catch { /* 容错 */ }
      setLoading(false);
    })();
  }, [agentId]);

  // 加载指定会话的消息
  const loadMessages = async (sessionId: string) => {
    setSelectedSession(sessionId);
    try {
      const res = await ofetch(`/api/agents/${agentId}/chat-history/${sessionId}`, { headers: authHeaders });
      if (res.code === 0) setMessages(res.data || []);
    } catch { /* 容错 */ }
  };

  // 播放音频
  const playAudio = async (audioId: string) => {
    try {
      const res1 = await ofetch(`/api/agents/audio/${audioId}`, { method: 'POST', headers: authHeaders });
      if (res1.code !== 0 || !res1.data) return;
      window.open(`/api/agents/play/${res1.data}`, '_blank');
    } catch { /* 容错 */ }
  };

  // 下载聊天
  const handleDownload = async () => {
    if (!selectedSession) return;
    try {
      const res = await ofetch('/api/chat/download', {
        method: 'POST',
        body: { agentId, sessionId: selectedSession },
        headers: authHeaders,
      });
      if (res.code === 0 && res.data) {
        window.open(`/api/chat/download/${res.data}/current`, '_blank');
      }
    } catch { /* 容错 */ }
  };

  if (loading) return <Skeleton className="h-48" />;

  // 消息列表视图
  if (selectedSession) {
    const sessionTitle = sessions.find(s => s.sessionId === selectedSession)?.title || '对话';
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedSession(null); setMessages([]); }}>
            <ChevronLeft size={14} className="mr-1" />返回
          </Button>
          <span className="text-sm font-medium truncate max-w-[200px]">{sessionTitle}</span>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download size={14} className="mr-1" />导出
          </Button>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className={`p-2 rounded text-sm ${msg.chatType === 1 ? 'bg-muted/50' : 'bg-primary/5'}`}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{msg.chatType === 1 ? '👤 用户' : '🤖 AI'}</span>
                <span>{msg.createdAt ? new Date(msg.createdAt).toLocaleString() : ''}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{msg.content || '(空)'}</p>
              {msg.audioId && (
                <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => playAudio(msg.audioId!)}>
                  <Play size={12} className="mr-1" />播放音频
                </Button>
              )}
            </div>
          ))}
          {messages.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">暂无消息</p>}
        </div>
      </div>
    );
  }

  // 会话列表视图
  return sessions.length === 0 ? (
    <p className="text-center text-muted-foreground text-sm py-4">暂无会话</p>
  ) : (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {sessions.map(session => (
        <button
          key={session.sessionId}
          onClick={() => loadMessages(session.sessionId)}
          className="w-full text-left p-3 rounded-md border hover:bg-muted/50 transition-colors"
        >
          <div className="flex justify-between items-center">
            <span className="font-medium text-sm truncate max-w-[250px]">{session.title}</span>
            <span className="text-xs text-muted-foreground">{session.messageCount} 条</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {session.lastMessageAt ? new Date(session.lastMessageAt).toLocaleString() : ''}
          </p>
        </button>
      ))}
    </div>
  );
}
