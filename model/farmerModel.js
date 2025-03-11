const pool = require('./../db/db');

const Farmer = {
  async findFarmerById(userId) {
    const query = 'SELECT * FROM farmers WHERE id = $1';
    const { rows } = await pool.query(query, [userId]);
    return rows[0];
  },

  async createFarmer(
    userId,
    experience,
    specialization,
    certifications,
    farm_location,
    location,
    bio
  ) {
    const query = `
        INSERT INTO farmers (id, experience, specialization, certifications, farm_location,location, bio)
        VALUES ($1, $2, $3, $4, $5, $6 , $7) RETURNING *;
    `;
    const values = [
      userId,
      experience,
      specialization,
      certifications,
      farm_location,
      location,
      bio,
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },
};

module.exports = Farmer;
