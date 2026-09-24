"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2, Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  rateLimit: number | null;
  lastUsedAt: string | null;
  totalCalls: number;
  createdAt: string;
  revokedAt: string | null;
};

type NewKeyResult = {
  id: string;
  key: string;
  prefix: string;
};

export default function McpKeysClientPage() {
  const [keys, setKeys] = React.useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [newKeyLimit, setNewKeyLimit] = React.useState(200);
  const [unlimited, setUnlimited] = React.useState(false);
  const [createdKey, setCreatedKey] = React.useState<NewKeyResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ApiKeyInfo | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadKeys = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/mcp-keys");
      const data = await res.json();
      if (data.data) setKeys(data.data);
    } catch (e) {
      setError("Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      setError(null);
      const res = await fetch("/api/admin/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName.trim(),
          rateLimit: unlimited ? null : newKeyLimit,
        }),
      });
      const data = await res.json();
      if (data.data) {
        setCreatedKey(data.data);
        setNewKeyName("");
        setNewKeyLimit(200);
        setUnlimited(false);
        loadKeys();
      } else {
        setError(data.error || "Failed to create key");
      }
    } catch (e) {
      setError("Failed to create key");
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/mcp-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        loadKeys();
      } else {
        setError("删除失败");
      }
    } catch (e) {
      setError("删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreatedKey(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="h-6 w-6" />
            MCP API Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理用于调用百科 MCP 接口的 API Key。每个 Key 独立限流，可随时撤销。
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCreatedKey(null);
              setError(null);
            }
            setCreateOpen(open);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              创建新 Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {createdKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>Key 创建成功</DialogTitle>
                  <DialogDescription>
                    请立即复制保存，关闭后将无法再查看完整 Key。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <div className="flex gap-2">
                      <Input value={createdKey.key} readOnly className="font-mono text-sm" />
                      <Button variant="outline" size="icon" onClick={() => copyKey(createdKey.key)}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      这是唯一一次显示完整 Key，请妥善保存。丢失后只能重新创建。
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={closeCreateDialog}>完成</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>创建 MCP API Key</DialogTitle>
                  <DialogDescription>
                    给这个 Key 起个名字，方便后续管理。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Key 名称</Label>
                    <Input
                      id="name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="例如：社团 AI 服务"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>每小时调用次数限制</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">不限制</span>
                        <input
                          type="checkbox"
                          checked={unlimited}
                          onChange={(e) => setUnlimited(e.target.checked)}
                          className="h-4 w-4 accent-primary cursor-pointer"
                        />
                      </div>
                    </div>
                    <Input
                      type="number"
                      value={newKeyLimit}
                      onChange={(e) => setNewKeyLimit(parseInt(e.target.value) || 0)}
                      disabled={unlimited}
                      min={1}
                      max={100000}
                    />
                    <p className="text-xs text-muted-foreground">
                      默认 200 次/小时，设置为不限制则无上限
                    </p>
                  </div>
                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={closeCreateDialog}>取消</Button>
                  <Button onClick={handleCreate} disabled={!newKeyName.trim()}>创建</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm">加载中...</div>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">还没有创建任何 MCP API Key</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              点击右上角"创建新 Key"开始使用
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <Card key={key.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      {key.name}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">
                      {key.prefix}••••••••
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(key)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">每小时限制</p>
                    <p className="font-medium">
                      {key.rateLimit === null ? "不限制" : `${key.rateLimit} 次/小时`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">总调用次数</p>
                    <p className="font-medium">{key.totalCalls.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">创建时间</p>
                    <p className="font-medium">
                      {new Date(key.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
                {key.lastUsedAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    最近使用：{new Date(key.lastUsedAt).toLocaleString("zh-CN")}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 API Key</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.name}」吗？删除后无法恢复，使用此 Key 的客户端将无法继续访问。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleRevoke(deleteTarget.id)}
              disabled={deleting}
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">MCP 接入信息</CardTitle>
          <CardDescription>
            在 LobeHub 或其他 MCP 客户端中配置以下信息
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">传输方式</span>
            <Badge variant="outline">SSE (MCP 标准)</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">SSE 端点</span>
            <code className="px-2 py-1 bg-muted rounded text-xs">
              /api/mcp
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">鉴权方式</span>
            <span>Bearer Token</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
