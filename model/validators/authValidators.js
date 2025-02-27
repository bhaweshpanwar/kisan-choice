const Joi = require('joi');

const signupSchema = Joi.object({
  name: Joi.string().min(3).max(30).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name should have a minimum length of 3',
    'string.max': 'Name should have a maximum length of 30',
  }),
  email: Joi.string().email().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Email is invalid',
  }),
  password: Joi.string()
    .min(6)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password should have a minimum length of 6',
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Passwords do not match',
  }),
  mobile: Joi.string()
    .pattern(/^[0-9]{10}$/)
    .required()
    .messages({
      'string.empty': 'Mobile is required',
      'string.pattern.base': 'Mobile is invalid',
    }),
}).options({ stripUnknown: true });

module.exports = signupSchema;
