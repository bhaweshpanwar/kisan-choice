class APIFeatures {
  constructor(query, queryString = {}) {
    this.query = query;
    this.queryString = {
      ...queryString,
      page: queryString.page ? Number(queryString.page) : 1,
      limit: queryString.limit ? Number(queryString.limit) : 20,
    };
    this.queryParams = [];
  }

  filter() {
    const conditions = [];
    const { verified, negotiate } = this.queryString;

    if (verified === 'true') {
      conditions.push(`p."verified" = true`);
    }

    if (negotiate === 'true') {
      conditions.push(`p.negotiate = true`);
    }

    if (conditions.length > 0) {
      this.query += ` AND ${conditions.join(' AND ')}`;
    }

    // // Inside APIFeatures.filter()
    // if (conditions.length > 0) {
    //   if (this.query.toUpperCase().includes(' WHERE ')) {
    //     // Check if base query already has WHERE
    //     this.query += ` AND ${conditions.join(' AND ')}`;
    //   } else {
    //     this.query += ` WHERE ${conditions.join(' AND ')}`;
    //   }
    // }
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
    // Convert to numbers explicitly
    const page = this.queryString.page;
    const limit = this.queryString.limit;
    const offset = (page - 1) * limit;

    // // Remove the ::BIGINT cast - let PostgreSQL handle the type conversion
    // this.query += ` LIMIT $${this.queryParams.length + 1} OFFSET $${
    //   this.queryParams.length + 2
    // }`;

    // // Push the numeric values
    // this.queryParams.push(limit, offset);

    // Direct interpolation with sanitized values
    this.query += ` LIMIT ${Math.floor(limit)} OFFSET ${Math.floor(offset)}`;

    return this;
  }

  // groupBy(defaultFields = []) {
  //   const customGroup = this.queryString.groupBy;

  //   const groupFields = customGroup
  //     ? customGroup.split(',').map((f) => `p."${f.trim()}"`)
  //     : defaultFields.map((f) => `p."${f}"`);

  //   if (groupFields.length > 0) {
  //     this.query += ` GROUP BY ${groupFields.join(', ')}`;
  //   }

  //   return this;
  // }

  groupBy(defaultFields = ['id', 'category_id', 'seller_id']) {
    const customGroup = this.queryString.groupBy;

    // Always include these essential fields for product queries
    const requiredGroupFields = [
      'p.id',
      'p.category_id',
      'p.seller_id',
      'c.name',
      'u.name',
      'u.photo',
    ];

    const groupFields = customGroup
      ? [
          ...requiredGroupFields,
          ...customGroup.split(',').map((f) => `p."${f.trim()}"`),
        ]
      : [...requiredGroupFields, ...defaultFields.map((f) => `p."${f}"`)];

    if (groupFields.length > 0) {
      this.query += ` GROUP BY ${groupFields.join(', ')}`;
    }

    return this;
  }
}

module.exports = APIFeatures;
