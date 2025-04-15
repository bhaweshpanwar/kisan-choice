const { createClient } = require('redis');
const redis = require('ioredis');
const dotenv = require('dotenv');
dotenv.config({ path: './config.env' });

if (process.env.NODE_ENV === 'production') {
  const client = createClient({
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  });

  client.on('error', (err) => console.log('❌ Redis Client Error:', err));

  const connectRedis = async () => {
    try {
      await client.connect();
      console.log('✅ Redis Connected Successfully!');
    } catch (err) {
      console.error('❌ Redis Connection Failed:', err);
    }
  };

  connectRedis();
  module.exports = client;
} else {
  const client = new redis();
  module.exports = client;
}
