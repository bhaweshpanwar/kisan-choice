const changedPasswordAfter = (passwordChangedAt, JWTTimestamp) => {
  if (!passwordChangedAt) {
    return false;
  }

  const changedTimestamp = Math.floor(
    new Date(passwordChangedAt).getTime() / 1000
  );

  return JWTTimestamp < changedTimestamp;
};

module.exports = changedPasswordAfter;
