import _ from 'lodash'; // eslint-disable-line
import crypto from 'crypto';
import sequence from '../../utils/sequence';
import path from 'path';
import fs from 'fs';
import errors from '../../errors';
import commands from './commands';
import versioning from '../versioning';
import models from '../../models';
import fixtures from '../fixtures';
import { tables as schema } from '../schema';
import dataExport from '../export';
import utils from '../utils';
import config from '../../config';
import promisify from '../../utils/promisify';


const schemaTables = _.keys(schema);

const logInfo = (message) => {
  errors.logInfo('Migrations', message);
};

const populateDefaultSettings = () => {
  // Initialise the default settings
  logInfo('Populating default settings');
  return models.Settings.populateDefaults().then(() => {
    logInfo('Complete');
  });
};

const backupDatabase = () => {
  logInfo('Creating database backup');
  return dataExport()
    .then((exportedData) => {
      // Save the exported data to the file system for download
      return dataExport.fileName()
        .then((fileNameArg) => {
          const fileName = path.resolve(`${config.paths.contentPath}/data/${fileNameArg}`);

          return promisify(fs.writeFile)(fileName, JSON.stringify(exportedData))
            .then(() => {
              logInfo('Database backup written to: ' + fileName);
            });
        });
    });
};

// TODO: move to migration.to005() for next DB version
const fixClientSecret = () => {
  return models.Clients.forge().query('where', 'secret', '=', 'not_available').fetch().then(function updateClients(results) {
    return Promise.map(results.models, function mapper(client) {
      if (process.env.NODE_ENV.indexOf('testing') !== 0) {
        logInfo('Updating client secret');
        client.secret = crypto.randomBytes(6).toString('hex');
      }
      return models.Client.edit(client, {context: {internal: true}, id: client.id});
    });
  });
};


// ### Reset
// Delete all tables from the database in reverse order
const reset = () => {
  const tables = _.map(schemaTables, (table) => {
    return () => {
      return utils.deleteTable(table);
    };
  }).reverse();

  return sequence(tables);
};

// Only do this if we have no database at all
const migrateUpFreshDb = (tablesOnly) => {
  let tableSequence;
  const tables = _.map(schemaTables, (table) => {
    return () => {
      logInfo('Creating table: ' + table);
      return utils.createTable(table);
    };
  });
  logInfo('Creating tables...');
  tableSequence = sequence(tables);

  if (tablesOnly) {
    return tableSequence;
  }
  return tableSequence
    .then(() => {
      // Load the fixtures
      return fixtures.populate();
    }).then(() => {
      return populateDefaultSettings();
    });
};

// Migrate from a specific version to the latest
const migrateUp = (fromVersion, toVersion) => {
  let oldTables;
  let modifyUniCommands = [];
  let migrateOps = [];

  return backupDatabase()
    .then(() => {
      return utils.getTables();
    }).then((tables) => {
      oldTables = tables;
      if (!_.isEmpty(oldTables)) {
        return utils.checkTables();
      }
    }).then(() => {
      migrateOps = migrateOps.concat(commands.getDeleteCommands(oldTables, schemaTables));
      migrateOps = migrateOps.concat(commands.getAddCommands(oldTables, schemaTables));
      return Promise.all(
        _.map(oldTables, (table) => {
          return utils.getIndexes(table).then((indexes) => {
            modifyUniCommands = modifyUniCommands.concat(commands.modifyUniqueCommands(table, indexes));
          });
        })
      );
    }).then(() => {
      return Promise.all(
        _.map(oldTables, (table) => {
          return utils.getColumns(table)
            .then((columns) => {
              migrateOps = migrateOps.concat(commands.addColumnCommands(table, columns));
            });
        })
      );
    }).then(() => {
      migrateOps = migrateOps.concat(_.compact(modifyUniCommands));

      // execute the commands in sequence
      if (!_.isEmpty(migrateOps)) {
        logInfo('Running migrations');

        return sequence(migrateOps);
      }
    }).then(() => {
      // Ensure all of the current default settings are created (these are fixtures, so should be inserted first)
      return populateDefaultSettings();
    }).then(() => {
      // Finally, run any updates to the fixtures, including default settings
      return fixtures.update(fromVersion, toVersion);
    });
};

// Check for whether data is needed to be bootstrapped or not
const init = (tablesOnly = false) => {
  // There are 4 possibilities:
  // 1. The database exists and is up-to-date
  // 2. The database exists but is out of date
  // 3. The database exists but the currentVersion setting does not or cannot be understood
  // 4. The database has not yet been created
  return versioning.getDatabaseVersion()
    .then((databaseVersion) => {
      const defaultVersion = versioning.getDefaultDatabaseVersion();

      if (databaseVersion < defaultVersion || process.env.FORCE_MIGRATION) {
        // 2. The database exists but is out of date
        // Migrate to latest version
        logInfo('Database upgrade required from version ' + databaseVersion + ' to ' + defaultVersion);
        return migrateUp(databaseVersion, defaultVersion)
          .then(() => {
            // Finally update the databases current version
            return versioning.setDatabaseVersion();
          });
      }

      if (databaseVersion === defaultVersion) {
        // 1. The database exists and is up-to-date
        logInfo(`Up to date at version ${databaseVersion}`);
        // TODO: temporary fix for missing client.secret
        return fixClientSecret();
      }

      if (databaseVersion > defaultVersion) {
        // 3. The database exists but the currentVersion setting does not or cannot be understood
        // In this case we don't understand the version because it is too high
        errors.logErrorAndExit(
          'Your database is not compatible with this version of Ghost',
          'You will need to create a new database'
        );
      }
    }, (err) => {
      if (err.message || err === 'Settings table does not exist') {
        // 4. The database has not yet been created
        // Bring everything up from initial version.
        logInfo('Database initialisation required for version ' + versioning.getDefaultDatabaseVersion());
        return migrateUpFreshDb(tablesOnly);
      }
      // 3. The database exists but the currentVersion setting does not or cannot be understood
      // In this case the setting was missing or there was some other problem
      errors.logErrorAndExit('There is a problem with the database', err.message || err);
    });
};


export default {
  init,
  reset,
  migrateUp,
  migrateUpFreshDb
};
