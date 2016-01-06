import _ from 'lodash'; // eslint-disable-line
import config from '../../config';
import { tables as schema } from '../schema';
import clients from './clients';

let dbConfig;

function addTableColumn(tablename, table, columnname) {
  let column;
  const columnSpec = schema[tablename][columnname];
  const { type } = columnSpec;
  // creation distinguishes between text with fieldtype, string with maxlength and all others
  if (type === 'text' && columnSpec.hasOwnProperty('fieldtype')) {
    column = table[type](columnname, columnSpec.fieldtype);
  } else if (type === 'string' && columnSpec.hasOwnProperty('maxlength')) {
    column = table[type](columnname, columnSpec.maxlength);
  } else {
    column = table[type](columnname);
  }

  if (columnSpec.hasOwnProperty('nullable') && columnSpec.nullable === true) {
    column.nullable();
  } else {
    column.notNullable();
  }
  if (columnSpec.hasOwnProperty('primary') && columnSpec.primary === true) {
    column.primary();
  }
  if (columnSpec.hasOwnProperty('unique') && columnSpec.unique) {
    column.unique();
  }
  if (columnSpec.hasOwnProperty('unsigned') && columnSpec.unsigned) {
    column.unsigned();
  }
  if (columnSpec.hasOwnProperty('references')) {
    // check if table exists?
    column.references(columnSpec.references);
  }
  if (columnSpec.hasOwnProperty('defaultTo')) {
    column.defaultTo(columnSpec.defaultTo);
  }
}

export function addColumn(tableName, column) {
  dbConfig = dbConfig || config.database;
  return dbConfig.knex.schema.table(tableName, (table) => {
    addTableColumn(tableName, table, column);
  });
}

export function addUnique(tableName, column) {
  dbConfig = dbConfig || config.database;
  return dbConfig.knex.schema.table(tableName, (table) => {
    table.unique(column);
  });
}

export function dropUnique(tableName, column) {
  dbConfig = dbConfig || config.database;
  return dbConfig.knex.schema.table(tableName, (table) => {
    table.dropUnique(column);
  });
}

export function createTable(tableName) {
  dbConfig = dbConfig || config.database;
  return dbConfig.knex.schema.createTable(tableName, (table) => {
    const columnKeys = _.keys(schema[tableName]);
    _.each(columnKeys, (column) => {
      return addTableColumn(tableName, table, column);
    });
  });
}

export function deleteTable(table) {
  dbConfig = dbConfig || config.database;
  return dbConfig.knex.schema.dropTableIfExists(table);
}

export function getTables() {
  dbConfig = dbConfig || config.database;
  const client = dbConfig.client;

  if (_.contains(_.keys(clients), client)) {
    return clients[client].getTables();
  }

  return Promise.reject('No support for database client ' + client);
}

export function getIndexes(table) {
  dbConfig = dbConfig || config.database;
  const client = dbConfig.client;

  if (_.contains(_.keys(clients), client)) {
    return clients[client].getIndexes(table);
  }

  return Promise.reject('No support for database client ' + client);
}

export function getColumns(table) {
  dbConfig = dbConfig || config.database;
  const client = dbConfig.client;

  if (_.contains(_.keys(clients), client)) {
    return clients[client].getColumns(table);
  }

  return Promise.reject('No support for database client ' + client);
}

export function checkTables() {
  dbConfig = dbConfig || config.database;
  const client = dbConfig.client;

  if (client === 'mysql') {
    return clients[client].checkPostTable();
  }
}

