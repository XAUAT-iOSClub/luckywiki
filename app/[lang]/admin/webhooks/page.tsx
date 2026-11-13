"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Plus,
  Trash2,
  Webhook,
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

const EVENT_OPTIONS = [
  { value: "article.created", label: "创建文章" },
  { value: "article.published", label: "发布文章" },
  { value: "article.updated", label: "更新文章" },
  { value: "article.moved", label: "移动文章" },
  { value: "article.archived", label: "归档文章" },
  { value: "article.restored", label: "恢复文章" },
  { value: "article.deleted", label: "删除文章" },
] as const;

type DeliveryLog = {
  id: string;
  event: string;
  status: string;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
  retries: number;
  createdAt: string;
};

type WebhookInfo = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secretPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  recentDeliveries: DeliveryLog[];
};

type NewWebhookResult = {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
};

export default function WebhooksClientPage() {
  const [webhooks, setWebhooks] = React.useState<WebhookInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newEvents, setNewEvents] = React.useState<string[]>([
    "article.published",
    "article.updated",
  ]);
  const [newSecret, setNewSecret] = React.useState("");
  const [createdWebhook, setCreatedWebhook] = React.useState<NewWebhookResult | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<WebhookInfo | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadWebhooks = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/webhooks");
      const data = await res.json();
      if (data.data) setWebhooks(data.data);
    } catch {
      setError("加载 Webhook 列表失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Initial data fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWebhooks();
  }, [loadWebhooks]);

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewUrl("");
    setNewEvents(["article.published", "article.updated"]);
    setNewSecret("");
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newUrl.trim() || newEvents.length === 0 || creating) return;
    try {
      setCreating(true);
      setError(null);
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          url: newUrl.trim(),
          events: newEvents,
          ...(newSecret.trim() ? { secret: newSecret.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (data.data) {
        setCreatedWebhook(data.data);
        resetCreateForm();
        void loadWebhooks();
      } else {
        setError(data.error || "创建 Webhook 失败。");
      }
    } catch {
      setError("创建 Webhook 失败。");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (webhook: WebhookInfo) => {
    // 乐观更新
    setWebhooks((prev) =>
      prev.map((w) => (w.id === webhook.id ? { ...w, active: !w.active } : w)),
    );
    try {
      const res = await fetch(`/api/admin/webhooks/${webhook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !webhook.active }),
      });
      if (!res.ok) {
        throw new Error();
      }
    } catch {
      // 回滚
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, active: webhook.active } : w)),
      );
      setError("更新状态失败。");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        void loadWebhooks();
      } else {
        setError("删除失败。");
      }
    } catch {
      setError("删除失败。");
    } finally {
      setDeleting(false);
    }
  };

  const copySecret = async (secret: string) => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreatedWebhook(null);
    setError(null);
  };

  return (
    <Page>
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreatedWebhook(null);
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
                创建 Webhook
              </Button>
            </DialogTrigger>
          }
          description="文章发生变更时，向你配置的 URL 推送事件通知（带 HMAC 签名）。"
          title="Webhooks"
        />

        <DialogContent className="sm:max-w-md">
          {createdWebhook ? (
            <>
              <DialogHeader>
                <DialogTitle>Webhook 创建成功</DialogTitle>
                <DialogDescription>
                  请立即复制保存签名密钥，关闭后将无法再查看完整密钥。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>签名密钥（Secret）</Label>
                  <div className="flex gap-2">
                    <Input
                      className="font-mono text-[12px]"
                      readOnly
                      value={createdWebhook.secret}
                    />
                    <Button
                      aria-label="复制签名密钥"
                      onClick={() => copySecret(createdWebhook.secret)}
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
                    接收端可用此密钥验证 X-LuckyWiki-Signature
                    请求头（HMAC-SHA256）。这是唯一一次显示完整密钥。
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
                <DialogTitle>创建 Webhook</DialogTitle>
                <DialogDescription>
                  配置接收事件通知的 URL 和订阅的事件类型。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wh-name">名称</Label>
                  <Input
                    id="wh-name"
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="例如：官网同步服务"
                    value={newName}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-url">接收 URL</Label>
                  <Input
                    id="wh-url"
                    onChange={(event) => setNewUrl(event.target.value)}
                    placeholder="https://example.com/webhook"
                    value={newUrl}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>订阅事件</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {EVENT_OPTIONS.map((option) => (
                      <label
                        className="flex cursor-pointer items-center gap-2 text-[12.5px]"
                        key={option.value}
                      >
                        <input
                          checked={newEvents.includes(option.value)}
                          className="size-3.5 cursor-pointer accent-primary"
                          onChange={() => toggleEvent(option.value)}
                          type="checkbox"
                        />
                        {option.label}
                        <span className="font-mono text-[10.5px] text-muted-foreground">
                          {option.value}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-secret">签名密钥（可选）</Label>
                  <Input
                    id="wh-secret"
                    onChange={(event) => setNewSecret(event.target.value)}
                    placeholder="留空则自动生成"
                    value={newSecret}
                  />
                  <p className="text-[11.5px] leading-4 text-muted-foreground">
                    用于生成 HMAC-SHA256 签名，至少 8 个字符。
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
                <Button
                  disabled={!newName.trim() || !newUrl.trim() || newEvents.length === 0 || creating}
                  onClick={handleCreate}
                >
                  {creating ? "创建中..." : "创建"}
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
        description="事件推送失败会自动重试 3 次，每个 Webhook 显示最近 5 条投递记录。"
        title="Webhook 列表"
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
        ) : webhooks.length === 0 ? (
          <EmptyState
            action={
              <Button onClick={() => setCreateOpen(true)} size="sm" variant="outline">
                <Plus data-icon="inline-start" />
                创建 Webhook
              </Button>
            }
            description="点击右上角「创建 Webhook」开始接收事件通知。"
            icon={Webhook}
            title="还没有配置任何 Webhook"
          />
        ) : (
          <List>
            {webhooks.map((webhook) => (
              <ListRow key={webhook.id}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13.5px] font-medium text-foreground">
                        {webhook.name}
                      </p>
                      <Badge variant={webhook.active ? "default" : "secondary"}>
                        {webhook.active ? "启用中" : "已停用"}
                      </Badge>
                      <Badge className="font-mono" variant="outline">
                        {webhook.secretPrefix}••••••••
                      </Badge>
                    </div>
                    <p className="break-all font-mono text-[11.5px] text-muted-foreground">
                      {webhook.url}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {webhook.events.map((event) => (
                        <Badge className="font-mono" key={event} variant="outline">
                          {event}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11.5px] text-muted-foreground">
                      创建于 {new Date(webhook.createdAt).toLocaleDateString("zh-CN")}
                      {webhook.lastUsedAt ? (
                        <>
                          <span className="px-1.5 text-border">·</span>
                          最近投递：
                          {new Date(webhook.lastUsedAt).toLocaleString("zh-CN")}
                        </>
                      ) : null}
                    </p>
                    {webhook.recentDeliveries.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                        {webhook.recentDeliveries.map((log) => (
                          <div
                            className="flex flex-wrap items-center gap-x-2 text-[11.5px]"
                            key={log.id}
                          >
                            <span
                              className={
                                log.status === "success"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-destructive"
                              }
                            >
                              {log.status === "success" ? "成功" : "失败"}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {log.event}
                            </span>
                            {log.statusCode ? (
                              <span className="text-muted-foreground">
                                HTTP {log.statusCode}
                              </span>
                            ) : null}
                            {log.retries > 0 ? (
                              <span className="text-muted-foreground">
                                重试 {log.retries} 次
                              </span>
                            ) : null}
                            <span className="text-muted-foreground/70">
                              {new Date(log.createdAt).toLocaleString("zh-CN")}
                            </span>
                            {log.error ? (
                              <span className="w-full truncate text-destructive/80">
                                {log.error}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 self-start">
                    <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-muted-foreground">
                      启用
                      <input
                        checked={webhook.active}
                        className="size-3.5 cursor-pointer accent-primary"
                        onChange={() => handleToggleActive(webhook)}
                        type="checkbox"
                      />
                    </label>
                    <Button
                      aria-label={`删除 ${webhook.name}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(webhook)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </ListRow>
            ))}
          </List>
        )}
      </Panel>

      <Panel
        description="接收端验证请求签名的方式。"
        title="签名验证"
      >
        <div className="divide-y divide-border/60">
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">事件类型头</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px]">
              X-LuckyWiki-Event
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">签名头</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px]">
              X-LuckyWiki-Signature
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">时间戳头（参与签名）</span>
            <code className="rounded-md bg-muted px-2 py-1 font-mono text-[11.5px]">
              X-LuckyWiki-Timestamp
            </code>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <span className="text-[13px] text-muted-foreground">签名算法</span>
            <span className="text-[13px]">
              HMAC-SHA256（hex），签名串 = <code className="font-mono">timestamp + "." + 请求体</code>
            </span>
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
            <DialogTitle>删除 Webhook</DialogTitle>
            <DialogDescription>
              确定要删除「{deleteTarget?.name}」吗？删除后无法恢复，投递日志也会一并删除。
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
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
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
