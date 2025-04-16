class APIFeatures {
  constructor(query, queryString = {}) {
    this.query = query;
    this.queryString = queryString;
    this.queryParams = [];
  }

  filter() {
    const conditions = [];
    const { verified, negotiable, topSelling, farmersChoice, rating } =
      this.queryString;

    if (verified === 'true') {
      conditions.push(`p."verified" = true`);
    }

    if (negotiable === 'true') {
      conditions.push(`p.negotiable = true`);
    }

    if (topSelling === 'true') {
      conditions.push(`p.top_selling = true`);
    }

    if (farmersChoice === 'true') {
      conditions.push(`p.farmers_choice = true`);
    }

    if (rating) {
      conditions.push(`p.ratings_average >= $${this.queryParams.length + 1}`);
      this.queryParams.push(rating);
    }

    if (conditions.length > 0) {
      this.query += ` WHERE ${conditions.join(' AND ')}`;
    }

    return this;
  }

  sort() {
    const { sort } = this.queryString;

    if (sort === 'lowToHigh') {
      this.query += ` ORDER BY p.price ASC`;
    } else if (sort === 'highToLow') {
      this.query += ` ORDER BY p.price DESC`;
    }

    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields
        .split(',')
        .map((f) => `p.${f.trim()}`)
        .join(', ');
      this.query = this.query.replace('*', fields);
    }
    return this;
  }

  paginate() {
    const page = parseInt(this.queryString.page || '1', 10);
    const limit = parseInt(this.queryString.limit || '20', 10);
    const offset = (page - 1) * limit;

    this.query += ` LIMIT $${this.queryParams.length + 1} OFFSET $${
      this.queryParams.length + 2
    }`;
    this.queryParams.push(limit, offset);
    return this;
  }

  groupBy(defaultFields = []) {
    const customGroup = this.queryString.groupBy;

    const groupFields = customGroup
      ? customGroup.split(',').map((f) => `p."${f.trim()}"`)
      : defaultFields.map((f) => `p."${f}"`);

    if (groupFields.length > 0) {
      this.query += ` GROUP BY ${groupFields.join(', ')}`;
    }

    return this;
  }
}

module.exports = APIFeatures;
