const { Sequelize, QueryTypes } = require('sequelize');
const { config } = require('./dbConfig');

class Transaction {
  constructor() {
    this.sequelize = new Sequelize(config.database, config.user, config.password, {
      host: config.host,
      dialect: config.dialect,
    });
  }

async create(tableName, data, transaction) {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');

    let query = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

    const values = Object.values(data).map(value => (value === undefined || value === null ? '' : value));


    return await this.sequelize.query(query, {
      replacements: values,
      type: QueryTypes.INSERT,
      transaction: transaction,
    });
  }

  async update(tableName, data, condition, transaction) {
    const updateColumns = Object.keys(data).map(column => `${column} = ?`).join(', ');
    const conditionColumns = Object.keys(condition).map(column => `${column} = ?`).join(' AND ');
  
    let query = `UPDATE ${tableName} SET ${updateColumns} WHERE ${conditionColumns}`;
  
    const values = [...Object.values(data), ...Object.values(condition)];
  
    return await this.sequelize.query(query, {
      replacements: values,
      type: QueryTypes.UPDATE,
      transaction: transaction,
    });
  }

  async delete(tableName, condition, transaction) {
    const conditionColumns = Object.keys(condition).map(column => `${column} = ?`).join(' AND ');
  
    let query = `DELETE FROM ${tableName} WHERE ${conditionColumns}`;
  
    const values = Object.values(condition);
  
    return await this.sequelize.query(query, {
      replacements: values,
      type: QueryTypes.DELETE,
      transaction: transaction,
    });
  }

  async select(query, transaction) {
    const result = await this.sequelize.query(query, {
      type: QueryTypes.SELECT,
      transaction: transaction,
    });
  
    return result;
  }

  async selectByCond(query, replacements, transaction) {
    const result = await this.sequelize.query(query, {
      replacements: replacements,
      type: QueryTypes.SELECT,
      transaction: transaction,
    });
  
  
    return  result
  }

  async countRows(query,replacements, transaction) {
    const result = await this.sequelize.query(query, {
      replacements: replacements,
      type: QueryTypes.SELECT,
      transaction: transaction,
    });
  
    return  result.length; // Return both rows and count
  }

  async updateQuery(query, replacements, transaction) {
    const result = await this.sequelize.query(query, {
      replacements: replacements,
      type: QueryTypes.UPDATE,
      transaction: transaction,
    });
  
    return  result
  }

}

module.exports = {
  Transaction,
};
