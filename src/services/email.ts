const { getMailer } = require("../config/services");

async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const mailer = getMailer();
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Reset your Code Campus password",
    text: `Use this link within 15 minutes to reset your password: ${resetUrl}`,
    html: `<p>Use this link within 15 minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p>`,
  });
}

async function sendRegistrationVerificationEmail(email: string, code: string): Promise<void> {
  const mailer = getMailer();
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Verify your Code Campus email",
    text: `Your Code Campus verification code is ${code}. It expires in 10 minutes.`,
    html: `<div style="background:#0b1120;padding:32px;font-family:Arial,sans-serif;color:#eaf2ff"><div style="max-width:480px;margin:auto;border:1px solid #263449;border-radius:18px;background:#111a2b;padding:32px"><p style="margin:0 0 8px;color:#67e8f9;font-size:12px;letter-spacing:2px;text-transform:uppercase">Code Campus</p><h1 style="margin:0 0 12px;font-size:24px">Verify your email</h1><p style="color:#a4b2c5;line-height:1.6">Enter this one-time code to finish creating your account. It expires in 10 minutes.</p><div style="margin:24px 0;padding:18px;border:1px solid #285264;border-radius:12px;background:#0c1726;text-align:center;color:#67e8f9;font-size:32px;font-weight:bold;letter-spacing:10px">${code}</div><p style="margin:0;color:#8292a9;font-size:12px">If you didn't request an account, you can ignore this message.</p></div></div>`,
  });
}

module.exports = { sendPasswordResetEmail, sendRegistrationVerificationEmail };

export {};
