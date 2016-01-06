import _ from 'lodash'; // eslint-disable-line
import models from '../../models';
import utils from './utils';

const internal = utils.internal;

class DataImporter {
  importData(data) {
    return this.doImport(data);
  }

  loadRoles() {
    const options = _.extend({}, internal);

    return models.Role.findAll(options)
      .then((roles) => {
        return roles.toJSON();
      });
  }

  loadUsers() {
    const users = {all: {}};
    const options = _.extend({}, {include: ['roles']}, internal);

    return models.User.findAll(options)
      .then((_users) => {
        _users.forEach((user) => {
          users.all[user.get('email')] = {realId: user.get('id')};
          if (user.related('roles').toJSON(options)[0] && user.related('roles').toJSON(options)[0].name === 'Owner') {
            users.owner = user.toJSON(options);
          }
        });

        if (!users.owner) {
          return Promise.reject('Unable to find an owner');
        }

        return users;
      });
  }

  doUserImport(table, tableData, owner, users, errors, roles) {
    let userOps = [];
    const imported = [];

    if (tableData.users && tableData.users.length) {
      if (tableData.roles_users && tableData.roles_users.length) {
        tableData = utils.preProcessRolesUsers(tableData, owner, roles); //eslint-disable-line
      }

      // Import users, deduplicating with already present users
      userOps = utils.importUsers(tableData.users, users, table);

      return Promise.settle(userOps).then((descriptors) => {
        descriptors.forEach((descriptor) => {
          if (descriptor.isRejected()) {
            errors = errors.concat(descriptor.reason()); // eslint-disable-line
          } else {
            imported.push(descriptor.value().toJSON(internal));
          }
        });

        // If adding the users fails,
        if (errors.length > 0) {
          table.rollback(errors);
        } else {
          return imported;
        }
      });
    }

    return Promise.resolve({});
  }

  doImport(data) {

    let tableData = data.data;
    const imported = {};
    let errors = [];
    let users = {};
    let owner = {};
    let roles = {};

    return this.loadRoles()
      .then((_roles) => {
        roles = _roles;

        return this.loadUsers()
          .then((result) => {
            owner = result.owner;
            users = result.all;

            return models.Base
              .transaction((transaction) => {
                // Step 1: Attempt to handle adding new users
                this.doUserImport(transaction, tableData, owner, users, errors, roles)
                  .then((resultDoUserImport) => {
                    let importResults = [];

                    imported.users = resultDoUserImport;

                    _.each(imported.users, (user) => {
                      users[user.email] = {realId: user.id};
                    });

                    // process user data - need to figure out what users we have available for assigning stuff to etc
                    try {
                      tableData = utils.processUsers(tableData, owner, users, ['posts', 'tags']);
                    } catch (error) {
                      return transaction.rollback([error]);
                    }

                    // Do any pre-processing of relationships (we can't depend on ids)
                    if (tableData.posts_tags && tableData.posts && tableData.tags) {
                      tableData = utils.preProcessPostTags(tableData);
                    }

                    // Import things in the right order

                    return utils.importTags(tableData.tags, transaction)
                      .then((results) => {
                        if (results) {
                          importResults = importResults.concat(results);
                        }

                        return utils.importPosts(tableData.posts, transaction);
                      })
                      .then((results) => {
                        if (results) {
                          importResults = importResults.concat(results);
                        }

                        return utils.importSettings(tableData.settings, transaction);
                      })
                      .then((results) => {
                        if (results) {
                          importResults = importResults.concat(results);
                        }
                      })
                      .then(() => {
                        importResults.forEach((irPromise) => {
                          if (irPromise.isRejected()) {
                            errors = errors.concat(irPromise.reason());
                          }
                        });

                        if (errors.length === 0) {
                          transaction.commit();
                        } else {
                          transaction.rollback(errors);
                        }
                      });

                    /** do nothing with these tables, the data shouldn't have changed from the fixtures
                     *   permissions
                     *   roles
                     *   permissions_roles
                     *   permissions_users
                     */
                  });
              })
              .then(() => {
                // TODO: could return statistics of imported items
                return Promise.resolve();
              });
          });
      });
  }
}
export default {
  DataImporter: DataImporter,
  importData: (data) => {
    return new DataImporter().importData(data);
  }
};
