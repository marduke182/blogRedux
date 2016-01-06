import _ from 'lodash'; // eslint-disable-line
import errors from '../../errors';
import config from '../../config';
import defaultSettings from '../default-settings';

const initialVersion = '000';
let defaultDatabaseVersion;

// Default Database Version
// The migration version number according to the hardcoded default settings
// This is the version the database should be at or migrated to
export function getDefaultDatabaseVersion() {
  if (!defaultDatabaseVersion) {
    // This be the current version according to the software
    defaultDatabaseVersion = defaultSettings.core.databaseVersion.defaultValue;
  }

  return defaultDatabaseVersion;
}

// Database Current Version
// The migration version number according to the database
// This is what the database is currently at and may need to be updated
export function getDatabaseVersion() {
  const knex = config.database.knex;

  return knex.schema.hasTable('settings')
    .then((exists) => {
      // Check for the current version from the settings table
      if (exists) {
        // Temporary code to deal with old databases with currentVersion settings
        return knex('settings')
          .where('key', 'databaseVersion')
          .orWhere('key', 'currentVersion')
          .select('value')
          .then((versions) => {
            let databaseVersion = _.reduce(versions, (memo, version) => {
              if (isNaN(version.value)) {
                errors.throwError('Database version is not recognised');
              }
              return parseInt(version.value, 10) > parseInt(memo, 10) ? version.value : memo;
            }, initialVersion);

            if (!databaseVersion || databaseVersion.length === 0) {
              // we didn't get a response we understood, assume initialVersion
              databaseVersion = initialVersion;
            }

            return databaseVersion;
          });
      }
      throw new Error('Settings table does not exist');
    });
}

export function setDatabaseVersion() {
  return config.database.knex('settings')
    .where('key', 'databaseVersion')
    .update({value: defaultDatabaseVersion});
}
