const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const { generateFarmerBio } = require('../../utils/generativeAI');

dotenv.config({ path: './../../config.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
console.log('Database URL:', process.env.DATABASE_URL);

pool.on('connect', () => {
  console.log('connected to the db');
});

const farmers = JSON.parse(
  fs.readFileSync(`${__dirname}/farmers.json`, 'utf-8')
);

const makefarmers = async () => {
  try {
    for (const farmer of farmers) {
      // Get the user ID
      const userQuery = `SELECT id FROM public."users" WHERE email = $1;`;
      const user = await pool.query(userQuery, [farmer.email]);

      if (user.rows.length === 0) {
        console.log(`User with email ${farmer.email} not found.`);
        continue;
      }

      const userId = user.rows[0].id;

      // Check if the user is already a farmer
      const existingFarmerQuery = `SELECT * FROM farmers WHERE id = $1;`;
      const existingFarmer = await pool.query(existingFarmerQuery, [userId]);

      if (existingFarmer.rows.length > 0) {
        console.log(`User ${farmer.email} is already a farmer.`);
        continue;
      }

      const bio = await generateFarmerBio(
        farmer.experience,
        farmer.specialization,
        farmer.farm_location
      );

      // Insert new farmer
      const query = `
        INSERT INTO farmers (id, experience, specialization, certifications, farm_location, location, bio)
        VALUES ($1, $2, $3, $4, $5, $6 , $7) RETURNING *;
      `;
      const values = [
        userId,
        farmer.experience,
        farmer.specialization,
        farmer.certifications,
        farmer.farm_location,
        farmer.location,
        bio,
      ];
      await pool.query(query, values);

      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [
        'farmer',
        userId,
      ]);

      console.log(`${farmer.name} inserted successfully.`);
    }
    console.log('All selected users became farmers successfully!');
    process.exit();
  } catch (error) {
    console.error('Error making farmers:', error);
    process.exit(1);
  }
};

if (process.argv[2] === '--makeFarmers') {
  makefarmers();
} else {
  console.log('Invalid command. Please use --makeFarmers');
  process.exit(1);
}
