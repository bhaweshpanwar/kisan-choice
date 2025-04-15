const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config({ path: './../../config.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('connect', () => {
  console.log('connected to the db');
});

const users = JSON.parse(fs.readFileSync(`${__dirname}/users.json`, 'utf-8'));

const importData = async () => {
  try {
    for (const user of users) {
      const hashedPassword = await bcrypt.hash(user.password, 12);

      //Insert User Data
      const query = `
      INSERT INTO public."users"
      (name, email, mobile, password, photo)
      VALUES ($1, $2, $3, $4, $5);`;

      await pool.query(query, [
        user.name,
        user.email,
        user.mobile,
        hashedPassword,
        user.photo,
      ]);
      console.log(`${user.role} ${user.name} inserted successfully.`);
    }
    console.log('All data imported successfully!');
    process.exit();
  } catch (error) {
    console.log(error);
    process.exit();
  }
};

const deleteData = async () => {
  try {
    await pool.query('DELETE FROM public."users";');
    console.log('Data deleted successfully!');
    process.exit();
  } catch (error) {
    console.error('Error deleting data:', error);
    process.exit(1);
  }
};

// Command-line arguments
if (process.argv[2] === '--import') {
  importData();
} else if (process.argv[2] === '--delete') {
  deleteData();
}
