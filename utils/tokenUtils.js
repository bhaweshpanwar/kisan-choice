const crypto = require('crypto');

exports.createPasswordResetToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  const expirationTime = Date.now() + 10 * 60 * 1000; // 10 minutes
  return { resetToken, hashedToken, expirationTime };
};

module.exports = createPasswordResetToken;
