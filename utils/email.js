const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

async function sendVerificationEmail(to, token, name, req) {
  const verifyUrl = `${req.protocol}://${req.get(
    'host'
  )}/api/auth/verify-email?token=${token}`
  await transporter.sendMail({
    from: 'no-reply@gamecity.com',
    to,
    subject: 'Verify your email',
    html: `<p>Hi ${name},</p><p>Please verify your email by clicking <a href="${verifyUrl}">here</a>.</p>`,
  })
}

module.exports = { sendVerificationEmail }
