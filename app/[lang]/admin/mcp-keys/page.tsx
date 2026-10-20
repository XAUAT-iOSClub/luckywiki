"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  Panel,
} from "@/components/ui/page-ui";

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
    } catch {
      setError("加载 API Keys 失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Initial data fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadKeys();
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
        void loadKeys();
      } else {
        setError(data.error || "创建 API Key 失败。");
      }
    } catch {
      setError("创建 API Key 失败。");
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/mcp-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        void loadKeys();
      } else {
        setError("删除失败。");
      }
    } catch {
      setError("删除失败。");
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
    <Page>
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
        <PageHeader
          actions={
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus data-icon="inline-start" />
                创建新 Key
              </Button>
            </DialogTrigger>
          }
          description="管理用于调用百科 MCP 接口的 API Key。每个 Key 独立限流，可随时撤销。"
          title="MCP API Keys"
        />

        <DialogContent className="sm:max-w-md">
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Key 创建成功</DialogTitle>
                <DialogDescription>
                  请立即复制保存，关闭后将无法再查看完整 Key。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono text-[12px]"
                      readOnly
                      value={createdKey.key}
                    />
                    <Button
                      aria-label="复制 API Key"
                      onClick={() => copyKey(createdKey.key)}
                      size="icon"
                      variant="outline"
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-[12px] leading-5 text-amber-800 dark:text-amber-200">
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
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Key 名称</Label>
                  <Input
                    id="name"
                    onChange={(event) => setNewKeyName(event.target.value)}
                    placeholder="例如：社团 AI 服务"
                    value={newKeyName}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label>每小时调用次数限制</Label>
                    <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                      不限制
                      <input
                        checked={unlimited}
                        className="size-3.5 cursor-pointer accent-primary"
                        onChange={(event) => setUnlimited(event.target.checked)}
                        type="checkbox"
                      />
                    </label>
                  </div>
                  <Input
                    disabled={unlimited}
                    max={100000}
                    min={1}
                    onChange={(event) =>
                      setNewKeyLimit(parseInt(event.target.value) || 0)
                    }
                    type="number"
                    value={newKeyLimit}
                  />
                  <p className="text-[11.5px] leading-4 text-muted-foreground">
                    默认 200 次/小时，设置为不限制则无上限。
                  </p>
                </div>
                {error ? (
                  <p className="text-[12px] text-destructive">{error}</p>
                ) : null}
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog} variant="outline">
                  取消
                </Button>
                <Button disabled={!newKeyName.trim()} onClick={handleCreate}>
                  创建
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {error && !createOpen ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-[12.5px] text-destructive">
          {error}
        </div>
      ) : null}

      <Panel
        description="每个 Key 独立限流，最近使用时间会实时更新。"
        title="API Keys"
      >
        {loading ? (
          <List>
            {[0, 1, 2].map((item) => (
              <ListRow key={item}>
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="mt-2 h-3 w-64" />
              </ListRow>
            ))}
          </List>
        ) : keys.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setCreateOpen(true)} size="sm" variant="outline">
                <Plus data-icon="inline-start" />
                创建新 Key
              </Button>
            }
            description="点击右上角「创建新 Key」开始使用。"
            icon={KeyRound}
            title="还没有创建任何 MCP API Key"
          />
        ) : (
          <List>
            {keys.map((key) => (
              <ListRow key={key.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium text-foreground">
                        {key.name}
                      </p>
                      <Badge className="font-mono" variant="outline">
                        {key.prefix}••••••••
                      </Badge>
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">
                      {key.rateLimit === null
                        ? "不限制"
                        : `${key.rateLimit} 次/小时`}
                      <span className="px-1.5 text-border">·</span>
                      总调用 {key.totalCalls.toLocaleString()}
                      <span className="px-1.5 text-border">·</span>
                      创建于 {new Date(key.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                    {key.lastUsedAt ? (
                      <p className="text-[11.5px] text-muted-foreground/80">
                        最近使用：
                        {new Date(key.lastUsedAt).toLocaleString("zh-CN")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    aria-label={`删除 ${key.name}`}
                    className="self-start text-muted-foreground hover:text-destructive md:self-auto"
                    onClick={() => setDeleteTarget(key)}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </ListRow>
            ))}
          </List>
        )}
      </Panel>

      <Panel
        description="在 LobeHub 或其他 MCP 客户端中配置以下信息。"
        title="MCP 接入信息"
      >
        <div className="divide-y divide-border/60">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">传输方式</span>
            <Badge variant="outline">SSE (MCP 标准)</Badge>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">SSE 端点</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px]">
              /api/mcp
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">鉴权方式</span>
            <span className="text-[13px]">Bearer Token</span>
          </div>
        </div>
      </Panel>

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
              确定要删除「{deleteTarget?.name}」吗？删除后无法恢复，使用此 Key
              的客户端将无法继续访问。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={deleting}
              onClick={() => deleteTarget && handleRevoke(deleteTarget.id)}
              variant="destructive"
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
