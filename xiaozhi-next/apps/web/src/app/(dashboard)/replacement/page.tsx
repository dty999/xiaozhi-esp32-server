'use client';
/**
 * 替换词管理页
 *
 * 对标旧项目 ReplacementWordManagement.vue + ReplacementWordDialog.vue:
 *   - 表格列：选择框、文件名、词条数、内容（tooltip展示）、创建时间、更新时间、操作（编辑/下载/删除）
 *   - 批量选择删除
 *   - 分页（每页条数选择）
 *   - 新增/编辑对话框：
 *     - 文件名（必填）
 *     - 内容文本域（格式：每行"原词|替换词"）
 *     - .txt 文件导入
 *     - 词条计数（最大 4000 条）
 *     - 内容验证：每行一个|、原词和替换词不能为空、不能含特殊字符
 *   - 下载替换词文件 (.txt)
 */

import { useEffect, useState, useRef } from 'react';
import { ofetch } from 'ofetch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText, Plus, Pencil, Trash2, Download, Upload,
  ChevronLeft, ChevronRight, Check, Square, AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/hooks/useAuth';

const MAX_WORD_COUNT = 4000;

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
    ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** 内容验证：解析并校验每行格式 */
function validateContentLines(content: string): { valid: boolean; lines: string[]; error?: string } {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { valid: false, lines: [], error: '内容不能为空' };
  if (lines.length > MAX_WORD_COUNT) return { valid: false, lines, error: `词条数不能超过 ${MAX_WORD_COUNT} 条` };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const pipeCount = (line.match(/\|/g) || []).length;
    if (pipeCount !== 1) return { valid: false, lines, error: `第 ${i + 1} 行格式错误：每行必须有且仅有一个 |` };

    const parts = line.split('|');
    if (!parts[0]?.trim()) return { valid: false, lines, error: `第 ${i + 1} 行：原词不能为空` };
    if (!parts[1]?.trim()) return { valid: false, lines, error: `第 ${i + 1} 行：替换词不能为空` };

    const specialCharRegex = /[!@#$%^&*()_+=\[\]{};':"\\<>?\/`~]/;
    if (specialCharRegex.test(parts[0])) return { valid: false, lines, error: `第 ${i + 1} 行：原词包含不允许的特殊字符` };
    if (specialCharRegex.test(parts[1])) return { valid: false, lines, error: `第 ${i + 1} 行：替换词包含不允许的特殊字符` };
  }

  return { valid: true, lines };
}

/** 格式化内容显示（截断长文本） */
function truncateContent(content: string | string[], maxLen = 60): string {
  if (!content) return '';
  const str = Array.isArray(content) ? content.join(', ') : content;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export default function ReplacementPage() {
  const { token } = useAuthStore();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await ofetch(`/api/correct-word/files?page=${page}&limit=${pageSize}`, { headers: authHeaders });
      if (res.code === 0) {
        setData(res.data.list || []);
        setTotal(res.data.total || 0);
      }
    } catch { /* 容错 */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, pageSize]);

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个文件？`)) return;
    try {
      await ofetch(`/api/correct-word/files?ids=${ids.join(',')}`, { method: 'DELETE', headers: authHeaders });
      setSelectedIds(new Set());
      fetchData();
    } catch { /* 容错 */ }
  };

  const handleDownload = async (id: string, fileName: string) => {
    try {
      const res = await fetch(`/api/correct-word/files/${id}/download`, { headers: authHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.msg || '下载失败');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName || '替换词'}.txt`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || '下载失败');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(r => r.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={24} />替换词管理
        </h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => handleDelete(Array.from(selectedIds))}>
              <Trash2 size={16} className="mr-1" />删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus size={16} className="mr-1" />新增文件
          </Button>
        </div>
      </div>

      {/* 全选 */}
      {data.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
          <button onClick={handleSelectAll} className="flex items-center gap-1 hover:text-foreground">
            {selectedIds.size === data.length ? <Check size={14} /> : <Square size={14} />}
            全选
          </button>
          <span>已选 {selectedIds.size} / {data.length}</span>
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-sm">加载中...</p>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground text-sm">暂无替换词文件</p>
      ) : (
        <div className="space-y-2">
          {data.map((row: any) => (
            <Card key={row.id} className="hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => handleSelectOne(row.id)} className="flex-shrink-0">
                      {selectedIds.has(row.id)
                        ? <Check size={16} className="text-primary" />
                        : <Square size={16} className="text-muted-foreground" />
                      }
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.fileName || '-'}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.wordCount ?? '-'} 条
                        </span>
                      </div>
                      {/* 内容预览（tooltip 方式展示） */}
                      {row.content && (
                        <div className="mt-1 group relative">
                          <span className="text-xs text-muted-foreground cursor-default">
                            {truncateContent(row.content)}
                          </span>
                          <div className="hidden group-hover:block absolute z-10 top-5 left-0 bg-popover border rounded-md shadow-lg p-3 max-w-md max-h-60 overflow-y-auto">
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(row.content) ? row.content : (typeof row.content === 'string' ? row.content.split(/\r?\n/).filter(Boolean) : [])).map((item: string, i: number) => (
                                <span key={i} className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                                  {item}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                        <span>创建: {formatDate(row.createDate)}</span>
                        {row.updateDate && <span>更新: {formatDate(row.updateDate)}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 ml-4 flex-shrink-0">
                    {row.content && (
                      <Button size="sm" variant="outline" onClick={() => handleDownload(row.id, row.fileName)}>
                        <Download size={14} className="mr-1" />下载
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(row); setDialogOpen(true); }}>
                      <Pencil size={14} />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete([row.id])}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">每页</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="text-xs text-muted-foreground">条</span>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </Button>
            <span className="text-sm text-muted-foreground px-2">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>末页</Button>
          </div>
        )}

        <span className="text-xs text-muted-foreground">共 {total} 条</span>
      </div>

      {/* 新增/编辑对话框 */}
      <ReplacementWordDialog
        open={dialogOpen}
        editing={editing}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSaved={() => { setDialogOpen(false); setEditing(null); fetchData(); }}
        authHeaders={authHeaders}
      />
    </div>
  );
}

/** 替换词编辑对话框 */
function ReplacementWordDialog({ open, editing, onClose, onSaved, authHeaders }: {
  open: boolean;
  editing: any;
  onClose: () => void;
  onSaved: () => void;
  authHeaders: Record<string, string>;
}) {
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 编辑时回填
  useEffect(() => {
    if (editing) {
      setFileName(editing.fileName || '');
      const raw = editing.content;
      if (Array.isArray(raw)) {
        setContent(raw.join('\n'));
      } else {
        setContent(raw || '');
      }
    } else {
      setFileName('');
      setContent('');
    }
    setError('');
  }, [editing]);

  // 实时计算词条数
  useEffect(() => {
    const lines = content.split(/\r?\n/).filter(l => l.includes('|'));
    setWordCount(lines.length);
  }, [content]);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.txt')) {
      setError('仅支持 .txt 文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string || '';
      setContent(text);
      // 自动填充文件名
      if (!fileName) {
        setFileName(f.name.replace(/\.txt$/, ''));
      }
      setError('');
    };
    reader.onerror = () => setError('读取文件失败');
    reader.readAsText(f);
    // 重置 input 以便重复选择同一文件
    e.target.value = '';
  };

  const handleSubmit = async () => {
    // 验证
    if (!fileName.trim()) { setError('请输入文件名'); return; }

    const validation = validateContentLines(content);
    if (!validation.valid) { setError(validation.error || '内容验证失败'); return; }

    setError('');
    setSaving(true);

    try {
      const body = {
        fileName: fileName.trim(),
        content: validation.lines.join('\n'),
        wordCount: validation.lines.length,
      };

      let res: any;
      if (editing?.id) {
        res = await ofetch(`/api/correct-word/files/${editing.id}`, {
          method: 'PUT', body, headers: authHeaders,
        });
      } else {
        res = await ofetch('/api/correct-word/files', {
          method: 'POST', body, headers: authHeaders,
        });
      }

      if (res.code === 0) {
        onSaved();
      } else {
        setError(res.msg || '保存失败');
      }
    } catch (e: any) {
      setError(e.message || '保存失败');
    }
    setSaving(false);
  };

  const isOverLimit = wordCount > MAX_WORD_COUNT;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑替换词' : '新增替换词'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 文件名 */}
          <div className="space-y-1">
            <Label>文件名 <span className="text-destructive">*</span></Label>
            <Input
              value={fileName}
              onChange={e => { setFileName(e.target.value); setError(''); }}
              placeholder="输入文件名"
            />
          </div>

          {/* 内容 */}
          <div className="space-y-1">
            <Label>内容 <span className="text-destructive">*</span></Label>
            <Textarea
              value={content}
              onChange={e => { setContent(e.target.value); setError(''); }}
              placeholder={"一行一条，格式：原词|替换词\n例如：\n番茄|西红柿\n土豆|马铃薯"}
              rows={10}
              className="font-mono text-sm"
            />
            <p className="text-xs text-blue-600">格式：每行一条，原词|替换词</p>

            {/* 导入TXT和词条计数 */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} className="mr-1" />导入 .txt
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt"
                  className="hidden"
                  onChange={handleFileImport}
                />
              </div>
              <span className={`text-xs font-medium ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                {wordCount} / {MAX_WORD_COUNT} 条
                {isOverLimit && <AlertCircle size={12} className="inline ml-1" />}
              </span>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={saving || !fileName.trim() || isOverLimit}
            className="w-full"
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}