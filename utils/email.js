const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

async function sendVerificationEmail(to, token, name, req) {
  // Use frontend URL for verification link
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`
  await transporter.sendMail({
    from: 'gamecityelectronicsonline@gmail.com',
    to,
    subject: 'Verify your email',
    html: `<p>Hi ${name},</p><p>Please verify your email by clicking <a href="${verifyUrl}">here</a>.</p>`,
  })
}

module.exports = { sendVerificationEmail }
