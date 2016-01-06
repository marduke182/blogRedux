import _ from 'lodash'; // eslint-disable-line
import errors from '../../errors';
import utils from '../utils';
import { tables as schema } from '../schema';


const logInfo = (message) => {
  errors.logInfo('Migrations', message);
};

export function getDeleteCommands(oldTables, newTables) {
  const deleteTables = _.difference(oldTables, newTables);
  return _.map(deleteTables, (table) => {
    return () => {
      logInfo(`Deleting table: ${table}`);
      return utils.deleteTable(table);
    };
  });
}

export function getAddCommands(oldTables, newTables) {
  const addTables = _.difference(newTables, oldTables);
  return _.map(addTables, (table) => {
    return () => {
      logInfo('Creating table: ' + table);
      return utils.createTable(table);
    };
  });
}

export function addColumnCommands(table, columns) {
  const columnKeys = _.keys(schema[table]);
  const addColumns = _.difference(columnKeys, columns);

  return _.map(addColumns, (column) => {
    return () => {
      logInfo(`Adding column: ${table}.${column}`);
      return utils.addColumn(table, column);
    };
  });
}

export function modifyUniqueCommands(table, indexes) {
  const columnKeys = _.keys(schema[table]);
  return _.map(columnKeys, (column) => {
    if (schema[table][column].unique === true) {
      if (!_.contains(indexes, table + '_' + column + '_unique')) {
        return () => {
          logInfo('Adding unique on: ' + table + '.' + column);
          return utils.addUnique(table, column);
        };
      }
    } else if (!schema[table][column].unique) {
      if (_.contains(indexes, table + '_' + column + '_unique')) {
        return () => {
          logInfo('Dropping unique on: ' + table + '.' + column);
          return utils.dropUnique(table, column);
        };
      }
    }
  });
}
