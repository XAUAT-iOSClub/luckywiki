import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.slice(0, 120) ?? "LuckyWiki";
  const lang = searchParams.get("lang") === "en" ? "en" : "zh";
  const tags = searchParams.get("tags")?.slice(0, 80) ?? "";

  const isZh = lang === "zh";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "Geist, sans-serif",
          padding: 80,
          position: "relative",
        }}
      >
        {/* Decorative top bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)",
          }}
        />

        {/* Site name badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            LuckyWiki
          </div>
          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              background: "rgba(100, 116, 139, 0.2)",
              padding: "4px 12px",
              borderRadius: 12,
            }}
          >
            {isZh ? "中文" : "EN"}
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color: "#f1f5f9",
            lineHeight: 1.2,
            textAlign: "center",
            maxWidth: "90%",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {title}
        </div>

        {/* Tags */}
        {tags ? (
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 32,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {tags.split(",").slice(0, 4).map((tag) => (
              <div
                key={tag}
                style={{
                  fontSize: 16,
                  color: "#cbd5e1",
                  background: "rgba(148, 163, 184, 0.15)",
                  padding: "6px 18px",
                  borderRadius: 16,
                }}
              >
                {tag.trim()}
              </div>
            ))}
          </div>
        ) : null}

        {/* Bottom decorative element */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#475569",
            }}
          >
            {isZh ? "基于 Markdown 的知识库" : "A Markdown-first knowledge base"}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
