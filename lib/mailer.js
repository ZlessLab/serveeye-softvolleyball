'use strict';

const { Resend } = require('resend');

async function sendLicenseEmail({ to, licenseCode }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@zless.jp';
  const fromName  = process.env.RESEND_FROM_NAME  || 'ServeEye';
  const appUrl    = process.env.APP_BASE_URL       || 'https://zless.jp';
  const support   = process.env.SUPPORT_EMAIL      || 'support@zless.jp';

  await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: '【ServeEye】ライセンスコードのお知らせ',
    html: `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0d1520;color:#e8f0fe;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#162030;border-radius:16px;padding:32px;border:1px solid #2a3d55;">
    <p style="font-size:22px;font-weight:900;color:#00cc88;margin:0 0 8px;">ServeEye</p>
    <p style="font-size:16px;font-weight:700;margin:0 0 24px;">ご購入ありがとうございます！</p>
    <p style="font-size:14px;color:#7a90a8;margin:0 0 16px;">以下のライセンスコードをServeEyeの認証画面に入力してください。</p>

    <div style="background:#1e2d40;border:2px solid #00cc88;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <div style="font-size:11px;color:#7a90a8;letter-spacing:2px;margin-bottom:8px;">LICENSE CODE</div>
      <div style="font-size:28px;font-weight:900;letter-spacing:4px;color:#e8f0fe;font-family:monospace;">${licenseCode}</div>
    </div>

    <div style="background:#0d1520;border-radius:10px;padding:16px;margin:0 0 24px;">
      <p style="font-size:13px;font-weight:700;margin:0 0 10px;">認証手順</p>
      <ol style="font-size:13px;color:#7a90a8;line-height:2;padding-left:18px;margin:0;">
        <li>ServeEyeを開く</li>
        <li>右上のメニュー（⚙ メニュー）をタップ</li>
        <li>「認証コードをお持ちの方はこちら」を選ぶ</li>
        <li>メールアドレスとコードを入力して「認証する」</li>
      </ol>
    </div>

    <a href="${appUrl}/soft-volleyball-score.html"
       style="display:block;background:#1b8a3e;color:#fff;text-align:center;padding:16px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;margin:0 0 20px;">
      ServeEyeを開く →
    </a>

    <p style="font-size:12px;color:#7a90a8;line-height:1.8;margin:0;text-align:center;">
      このコードは購入者ご本人のみ利用可能です（最大2台まで）。<br>
      お問い合わせ: <a href="mailto:${support}" style="color:#00cc88;">${support}</a>
    </p>
  </div>
</body>
</html>`,
  });
}

module.exports = { sendLicenseEmail };
