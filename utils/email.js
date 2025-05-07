const nodemailer = require('nodemailer');
const pug = require('pug');
const { convert } = require('html-to-text');

module.exports = class Email {
  constructor(user, url = null, extraData = {}) {
    this.to = user.email;
    this.firstname = user.name.split(' ')[0];
    this.url = url;
    this.from = `Bhawesh Panwar <${process.env.EMAIL_FROM}>`;
    this.extraData = extraData; // For passing productName, price, quantity, etc.
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
          ...this.extraData, // Spread extra data
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
    } catch (err) {
      console.error('❌ Error sending email:', err);
      throw new Error('Email sending failed!');
    }
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to Kisan Choice!');
  }

  async sendPasswordReset() {
    await this.send(
      'resetLink',
      'Password Reset Request - Kisan Choice (valid for only 10 minutes)'
    );
  }

  async sendOfferNotification() {
    await this.send(
      'offerNotification',
      'You Have Received a New Offer on Your Product'
    );
  }

  async sendOfferRejectedNotification({
    productName,
    farmerName,
    rejectionReason,
  }) {
    await this.send('offerRejected', 'Your Offer was Rejected', {
      name: this.name,
      productName,
      farmerName,
      rejectionReason,
    });
  }

  async sendOfferAcceptedNotification({
    productName,
    acceptedPrice,
    quantity,
    farmerName,
    expiryDate,
  }) {
    const subject = `Your offer has been accepted for ${productName}`;

    // Store extra data to be injected into the pug template
    this.extraData = {
      productName,
      acceptedPrice,
      quantity,
      farmerName,
      expiryDate,
    };

    return this.send('offerAccepted', subject);
  }
};
