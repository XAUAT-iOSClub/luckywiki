import { defaultLocale, getPathnameLocale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { zh } from "@/lib/i18n/dictionaries/zh";
import { formatTemplate } from "@/lib/i18n/format";

type VerificationEmailPayload = {
  user: {
    email: string;
    name: string;
  };
  url: string;
};

const resendEndpoint = "https://api.resend.com/emails";

export async function sendVerificationEmail({
  user,
  url,
}: VerificationEmailPayload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!resendApiKey || !emailFrom) {
    console.info(`[auth] verification link for ${user.email}: ${url}`);
    return;
  }

  const locale = getPathnameLocale(new URL(url).pathname) ?? defaultLocale;
  const dictionary = locale === "zh" ? zh : en;

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: user.email,
      subject: dictionary.emailVerification.subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
          <h1 style="font-size: 20px;">${dictionary.emailVerification.heading}</h1>
          <p>${formatTemplate(dictionary.emailVerification.greeting, { name: escapeHtml(user.name) })}</p>
          <p>${dictionary.emailVerification.body}</p>
          <p>
            <a
              href="${url}"
              style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;"
            >
              ${dictionary.emailVerification.cta}
            </a>
          </p>
          <p>${dictionary.emailVerification.fallback}</p>
          <p><a href="${url}">${url}</a></p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send verification email: ${await response.text()}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
