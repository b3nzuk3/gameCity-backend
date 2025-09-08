const nodemailer = require('nodemailer')

// Debug environment variables
console.log('Environment check:')
console.log('FRONTEND_URL:', process.env.FRONTEND_URL)
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not set')

// Create a reusable transporter with connection pooling
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true, // Use connection pooling
  maxConnections: 5, // Maximum number of connections
  maxMessages: 100, // Maximum number of messages per connection
  rateDelta: 20000, // Rate limiting: 1 message per 20 seconds
  rateLimit: 5, // Maximum 5 messages per rateDelta
})

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email transporter verification failed:', error)
  } else {
    console.log('Email transporter is ready to send messages')
  }
})

// Email templates
const emailTemplates = {
  verification: (name, verifyUrl) => ({
    subject: 'Verify your email - GameCity Electronics',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">GameCity Electronics</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to GameCity!</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Hi <strong>${name}</strong>,
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Thank you for registering with GameCity Electronics! To complete your registration and start shopping, please verify your email address by clicking the button below:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" 
               style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">
            If the button doesn't work, you can also copy and paste this link into your browser:<br>
            <a href="${verifyUrl}" style="color: #667eea;">${verifyUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">
            This verification link will expire in 24 hours for security reasons.
          </p>
        </div>
        <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
          <p>© 2024 GameCity Electronics. All rights reserved.</p>
          <p>If you didn't create an account, please ignore this email.</p>
        </div>
      </div>
    `,
    text: `
      Welcome to GameCity Electronics!
      
      Hi ${name},
      
      Thank you for registering with GameCity Electronics! To complete your registration, please verify your email address by visiting this link:
      
      ${verifyUrl}
      
      This verification link will expire in 24 hours for security reasons.
      
      If you didn't create an account, please ignore this email.
      
      Best regards,
      GameCity Electronics Team
    `,
  }),

  passwordReset: (name, resetUrl) => ({
    subject: 'Password Reset Request - GameCity Electronics',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">GameCity Electronics</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Hi <strong>${name}</strong>,
          </p>
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password for your GameCity Electronics account. If you made this request, click the button below to reset your password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">
            If the button doesn't work, you can also copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #e74c3c;">${resetUrl}</a>
          </p>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">
            <strong>Important:</strong> This link will expire in 1 hour for security reasons. If you don't reset your password within this time, you'll need to request a new reset link.
          </p>
          <p style="color: #999; font-size: 14px; line-height: 1.6;">
            If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
          </p>
        </div>
        <div style="background: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
          <p>© 2024 GameCity Electronics. All rights reserved.</p>
          <p>For security reasons, please do not share this email with anyone.</p>
        </div>
      </div>
    `,
    text: `
      Password Reset Request - GameCity Electronics
      
      Hi ${name},
      
      We received a request to reset your password for your GameCity Electronics account. If you made this request, visit this link to reset your password:
      
      ${resetUrl}
      
      Important: This link will expire in 1 hour for security reasons.
      
      If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
      
      Best regards,
      GameCity Electronics Team
    `,
  }),
}

// Email sending functions with retry logic
async function sendEmailWithRetry(mailOptions, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Sending email attempt ${attempt}/${maxRetries} to ${mailOptions.to}`
      )

      const result = await transporter.sendMail(mailOptions)
      console.log(
        `Email sent successfully to ${mailOptions.to}:`,
        result.messageId
      )
      return result
    } catch (error) {
      console.error(`Email send attempt ${attempt} failed:`, error.message)

      if (attempt === maxRetries) {
        throw new Error(
          `Failed to send email after ${maxRetries} attempts: ${error.message}`
        )
      }

      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
      console.log(`Waiting ${delay}ms before retry...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// Public email functions
async function sendVerificationEmail(user, req) {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://game-city-one.vercel.app'
    console.log('Frontend URL for verification:', frontendUrl)
    const verifyUrl = `${frontendUrl}/verify-email?token=${user.verificationToken}`

    const template = emailTemplates.verification(user.name, verifyUrl)

    const mailOptions = {
      from: {
        name: 'GameCity Electronics',
        address: process.env.EMAIL_USER,
      },
      to: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    }

    return await sendEmailWithRetry(mailOptions)
  } catch (error) {
    console.error('Failed to send verification email:', error)
    throw error
  }
}

async function sendPasswordResetEmail(user, resetToken, req) {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://game-city-one.vercel.app'
    console.log('Frontend URL for password reset:', frontendUrl)
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`

    const template = emailTemplates.passwordReset(user.name, resetUrl)

    const mailOptions = {
      from: {
        name: 'GameCity Electronics',
        address: process.env.EMAIL_USER,
      },
      to: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    }

    return await sendEmailWithRetry(mailOptions)
  } catch (error) {
    console.error('Failed to send password reset email:', error)
    throw error
  }
}

// Close transporter when app shuts down
process.on('SIGINT', () => {
  console.log('Closing email transporter...')
  transporter.close()
})

process.on('SIGTERM', () => {
  console.log('Closing email transporter...')
  transporter.close()
})

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  transporter,
}
