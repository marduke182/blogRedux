import _ from 'lodash'; // eslint-disable-line
import versioning from '../versioning';
import config from '../../config';
import utils from '../utils';
import serverUtils from '../../utils';
import errors from '../../errors';
import settings from '../../api/settings';

const excludedTables = ['accesstokens', 'refreshtokens', 'clients'];

const exportFileName = () => {
  const datetime = (new Date()).toJSON().substring(0, 10);
  let title = '';

  return settings.read({key: 'title', context: {internal: true}})
    .then((result) => {
      if (result) {
        title = serverUtils.safeString(result.settings[0].value) + '.';
      }
      return `${title}ghost.${datetime}.json`;
    })
    .catch((err) => {
      errors.logError(err);
      return `ghost.${datetime}.json`;
    });
};

const exporter = () => {
  return Promise.join(versioning.getDatabaseVersion(), utils.getTables())
    .then(([version, tables]) => {
      const selectOps = _.map(tables, (name) => {
        if (excludedTables.indexOf(name) < 0) {
          return config.database.knex(name).select();
        }
      });

      return Promise.all(selectOps).then((tableData) => {
        const exportData = {
          meta: {
            exported_on: new Date().getTime(),
            version: version
          },
          data: {
            // Filled below
          }
        };

        _.each(tables, (name, index) => {
          exportData.data[name] = tableData[index];
        });

        return exportData;
      }).catch((err) => {
        errors.logAndThrowError(err, 'Error exporting data', '');
      });
    });
};

export default exporter;
export const fileName = exportFileName;
