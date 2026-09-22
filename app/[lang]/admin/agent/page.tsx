"use client";

import * as React from "react";
import { Bot, Save, AlertCircle, CheckCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AgentSettings = {
  apiKey: string;
  apiKeyMasked: string;
  hasApiKey: boolean;
  apiBaseUrl: string;
  responsesModel: string;
  embeddingModel: string;
};

export default function AgentControlPage() {
  const [settings, setSettings] = React.useState<AgentSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [showApiKey, setShowApiKey] = React.useState(false);

  // 表单状态
  const [apiKey, setApiKey] = React.useState("");
  const [apiBaseUrl, setApiBaseUrl] = React.useState("");
  const [responsesModel, setResponsesModel] = React.useState("");
  const [embeddingModel, setEmbeddingModel] = React.useState("");
  const [apiKeyChanged, setApiKeyChanged] = React.useState(false);

  const loadSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/agent-settings");
      const data = await res.json();
      if (data.data) {
        setSettings(data.data);
        setApiBaseUrl(data.data.apiBaseUrl || "");
        setResponsesModel(data.data.responsesModel || "");
        setEmbeddingModel(data.data.embeddingModel || "");
        // API Key 不预填，只显示掩码
        setApiKey("");
        setApiKeyChanged(false);
      } else {
        setError(data.error || "加载失败");
      }
    } catch (e) {
      setError("加载配置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updates: Record<string, string> = {};

      if (apiKeyChanged && apiKey.trim()) {
        updates.apiKey = apiKey.trim();
      }
      updates.apiBaseUrl = apiBaseUrl.trim();
      updates.responsesModel = responsesModel.trim();
      updates.embeddingModel = embeddingModel.trim();

      const res = await fetch("/api/admin/agent-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(data.message || "保存成功");
        // 重新加载以显示最新状态
        loadSettings();
      } else {
        setError(data.error || "保存失败");
      }
    } catch (e) {
      setError("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setApiKeyChanged(true);
  };

  const hasChanges =
    apiKeyChanged ||
    apiBaseUrl !== (settings?.apiBaseUrl || "") ||
    responsesModel !== (settings?.responsesModel || "") ||
    embeddingModel !== (settings?.embeddingModel || "");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent 控制</h1>
          <p className="text-sm text-muted-foreground">
            配置 AI 模型参数，修改后立即生效
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            错误
          </div>
          <div className="mt-1 text-sm">{error}</div>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            成功
          </div>
          <div className="mt-1 text-sm">{success}</div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI 模型配置</CardTitle>
          <CardDescription>
            配置 OpenAI 兼容格式的 API 接口信息
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API 密钥</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={apiKeyChanged ? apiKey : settings?.apiKeyMasked || ""}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={
                  settings?.hasApiKey
                    ? "留空则不修改当前密钥"
                    : "请输入 API 密钥"
                }
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {settings?.hasApiKey
                ? "当前已配置 API 密钥，如需修改请直接输入新的密钥"
                : "尚未配置 API 密钥"}
            </p>
          </div>

          {/* API Base URL */}
          <div className="space-y-2">
            <Label htmlFor="apiBaseUrl">API 地址</Label>
            <Input
              id="apiBaseUrl"
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
            <p className="text-xs text-muted-foreground">
              支持 OpenAI 兼容格式，例如 DeepSeek: https://api.deepseek.com/v1
            </p>
          </div>

          {/* 对话模型 */}
          <div className="space-y-2">
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <Label htmlFor="responsesModel">对话模型名</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground cursor-help">
                      常用模型
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="space-y-1 text-xs">
                    <div>OpenAI: gpt-4.1-mini, gpt-4o</div>
                    <div>DeepSeek: deepseek-chat</div>
                    <div>智谱: glm-4-flash</div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <Input
              id="responsesModel"
              value={responsesModel}
              onChange={(e) => setResponsesModel(e.target.value)}
              placeholder="deepseek-chat"
            />
            <p className="text-xs text-muted-foreground">
              用于 Agent 对话问答的模型
            </p>
          </div>

          {/* 向量嵌入模型 */}
          <div className="space-y-2">
            <TooltipProvider>
              <div className="flex items-center gap-2">
                <Label htmlFor="embeddingModel">向量嵌入模型名</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground cursor-help">
                      说明
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    用于文章内容向量化检索。DeepSeek 等部分服务商不提供
                    embedding 模型，可使用 OpenAI 或其他兼容服务。
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <Input
              id="embeddingModel"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              placeholder="text-embedding-3-small"
            />
            <p className="text-xs text-muted-foreground">
              用于知识库语义搜索的向量嵌入模型
            </p>
          </div>

          {/* 保存按钮 */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              配置保存在数据库中，保存后立即生效
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadSettings}
                disabled={saving}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                size="sm"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "保存中..." : "保存配置"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">使用提示</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              配置保存在数据库中，修改后<strong>立即生效</strong>，无需重启服务器
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              数据库中未配置时，会自动回退到环境变量 <code className="rounded bg-muted px-1 py-0.5">.env</code> 中的配置
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              API 密钥以明文存储在数据库中，请确保数据库访问安全
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary">•</span>
            <span>
              只有管理员及以上角色可以修改这些配置
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
