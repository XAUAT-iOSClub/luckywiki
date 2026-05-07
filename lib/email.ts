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

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: user.email,
      subject: "Verify your LuckyWiki account",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #18181b;">
          <h1 style="font-size: 20px;">Verify your LuckyWiki account</h1>
          <p>Hello ${escapeHtml(user.name)},</p>
          <p>Click the button below to verify your email address and finish setting up your account.</p>
          <p>
            <a
              href="${url}"
              style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;"
            >
              Verify email
            </a>
          </p>
          <p>If the button does not work, open this link:</p>
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
