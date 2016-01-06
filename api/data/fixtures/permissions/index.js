// # Permissions Fixtures
// Sets up the permissions, and the default permissions_roles relationships
import sequence from '../../../utils/sequence';
import _ from 'lodash'; // eslint-disable-line
import errors from '../../../errors';
import models from '../../../models';
import fixtures from './permissions';

const logInfo = (message) => {
  errors.logInfo('Migrations', message);
};

const addRolesPermissionsForRole = (roleName) => {
  const fixturesForRole = fixtures.permissions_roles[roleName];
  let permissionsToAdd;

  return models.Role.forge({name: roleName}).fetch({withRelated: ['permissions']})
    .then((role) => {
      return models.Permissions.forge().fetch()
        .then((permissions) => {
          if (_.isObject(fixturesForRole)) {
            permissionsToAdd = _.map(permissions.toJSON(), (permission) => {
              const objectPermissions = fixturesForRole[permission.object_type];
              if (objectPermissions === 'all') {
                return permission.id;
              } else if (_.isArray(objectPermissions) && _.contains(objectPermissions, permission.action_type)) {
                return permission.id;
              }
              return null;
            });
          }

          return role.permissions().attach(_.compact(permissionsToAdd));
        });
    });
};

const addAllRolesPermissions = () => {
  const roleNames = _.keys(fixtures.permissions_roles);
  const ops = [];

  _.each(roleNames, (roleName) => {
    ops.push(addRolesPermissionsForRole(roleName));
  });

  return Promise.all(ops);
};

const addAllPermissions = (options) => {
  const ops = [];
  _.each(fixtures.permissions, (permissions, objectType) => {
    _.each(permissions, (permission) => {
      ops.push(() => {
        permission.object_type = objectType;
        return models.Permission.add(permission, options);
      });
    });
  });

  return sequence(ops);
};

// ## Populate
const populate = (options) => {
  logInfo('Populating permissions');
  // ### Ensure all permissions are added
  return addAllPermissions(options)
    .then(() => {
      // ### Ensure all roles_permissions are added
      return addAllRolesPermissions();
    });
};

// ## Update
// Update permissions to 003
// Need to rename old permissions, and then add all of the missing ones
const to003 = (options) => {
  const ops = [];

  logInfo('Upgrading permissions');

  // To safely upgrade, we need to clear up the existing permissions and permissions_roles before recreating the new
  // full set of permissions defined as of version 003
  return models.Permissions.forge().fetch()
    .then((permissions) => {
      logInfo('Removing old permissions');
      permissions.each((permission) => {
        ops.push(permission.related('roles').detach()
          .then(() => {
            return permission.destroy();
          }));
      });

      // Now we can perform the normal populate
      return Promise.all(ops)
        .then(() => {
          return populate(options);
        });
    });
};

export default {
  populate: populate,
  to003: to003
};
