const nodemailer = require('nodemailer');
const pug = require('pug');
const { convert } = require('html-to-text');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstname = user.name.split(' ')[0];
    this.url = url;
    this.from = `Bhawesh Panwar <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD,
        },
      });
    }

    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  async send(template, subject) {
    try {
      const html = pug.renderFile(
        `${__dirname}/../views/emails/${template}.pug`,
        {
          firstname: this.firstname,
          reset_url: this.url,
          subject,
        }
      );

      const mailOptions = {
        from: this.from,
        to: this.to,
        subject,
        html,
        text: convert(html),
      };

      await this.newTransport().sendMail(mailOptions);
      // console.log('✅ Email sent successfully!');
    } catch (err) {
      console.error('❌ Error sending email:', err);
      throw new Error('Email sending failed!');
    }
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to the Natours Family!');
  }

  async sendPasswordReset() {
    await this.send(
      'resetLink',
      'Password Reset Request - Kisan Choice (valid for only 10 minutes)'
    );
  }
};
