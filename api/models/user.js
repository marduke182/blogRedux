import promisify from '../utils/promisify';
import { genSalt, hash, compare } from 'bcryptjs';
import _ from 'lodash'; // eslint-disable-line
import errors from '../errors';
import utils from '../utils';
import ghostBookshelf from './base';
import crypto from 'crypto';
import validator from 'validator';
import request from 'request';
import validation from '../data/validation';
import config from '../config';

const bcryptGenSalt = promisify(genSalt);
const bcryptHash = promisify(hash);
const bcryptCompare = promisify(compare);

const tokenSecurity = {};
const activeStates = ['active', 'warn-1', 'warn-2', 'warn-3', 'warn-4', 'locked'];
const invitedStates = ['invited', 'invited-pending'];

function validatePasswordLength(password) {
  return validator.isLength(password, 8);
}

function generatePasswordHash(password) {
  // Generate a new salt
  return bcryptGenSalt().then((salt) => {
    // Hash the provided password with bcrypt
    return bcryptHash(password, salt);
  });
}

export const User = ghostBookshelf.Model.extend({

  tableName: 'users',

  emitChange(event) {
    console.log('user' + '.' + event, this);
  },

  initialize() {
    ghostBookshelf.Model.prototype.initialize.apply(this, arguments);

    this.on('created', (model) => {
      model.emitChange('added');

      // active is the default state, so if status isn't provided, this will be an active user
      if (!model.get('status') || _.contains(activeStates, model.get('status'))) {
        model.emitChange('activated');
      }
    });
    this.on('updated', (model) => {
      model.statusChanging = model.get('status') !== model.updated('status');
      model.isActive = _.contains(activeStates, model.get('status'));

      if (model.statusChanging) {
        model.emitChange(model.isActive ? 'activated' : 'deactivated');
      } else {
        if (model.isActive) {
          model.emitChange('activated.edited');
        }
      }

      model.emitChange('edited');
    });
    this.on('destroyed', (model) => {
      if (_.contains(activeStates, model.previous('status'))) {
        model.emitChange('deactivated');
      }

      model.emitChange('deleted');
    });
  },

  saving: (newPage, attr, options) => {

    ghostBookshelf.Model.prototype.saving.apply(this, arguments);

    if (this.hasChanged('slug') || !this.get('slug')) {
      // Generating a slug requires a db call to look for conflicting slugs
      return ghostBookshelf.Model.generateSlug(User, this.get('slug') || this.get('name'),
        {status: 'all', transacting: options.transacting, shortSlug: !this.get('slug')})
        .then((slug) => {
          this.set({slug: slug});
        });
    }
  },

  // For the user model ONLY it is possible to disable validations.
  // This is used to bypass validation during the credential check, and must never be done with user-provided data
  // Should be removed when #3691 is done
  validate() {
    const opts = arguments[1];
    if (opts && _.has(opts, 'validate') && opts.validate === false) {
      return;
    }
    return validation.validateSchema(this.tableName, this.toJSON()); // eslint-disable-line
  },

  // Get the user from the options object
  contextUser(options) {
    // Default to context user
    if (options.context && options.context.user) {
      return options.context.user;
      // Other wise use the internal override
    } else if (options.context && options.context.internal) {
      return 1;
      // This is the user object, so try using this user's id
    } else if (this.get('id')) {
      return this.get('id');
    }

    errors.logAndThrowError(new errors.NotFoundError('missing context'));
  },

  toJSON(optionsArg) {
    const options = optionsArg || {};

    const attrs = ghostBookshelf.Model.prototype.toJSON.call(this, options);
    // remove password hash for security reasons
    delete attrs.password;

    if (!options || !options.context || (!options.context.user && !options.context.internal)) {
      delete attrs.email;
    }

    return attrs;
  },

  format(options) {
    if (!_.isEmpty(options.website)
      && !validator.isURL(options.website, {
        require_protocol: true,
        protocols: ['http', 'https']
      })) {
      options.website = 'http://' + options.website;
    }
    return ghostBookshelf.Model.prototype.format.call(this, options);
  },

  posts() {
    return this.hasMany('Posts', 'created_by');
  },

  roles() {
    return this.belongsToMany('Role');
  },

  permissions() {
    return this.belongsToMany('Permission');
  },

  hasRole(roleName) {
    const roles = this.related('roles');

    return roles.some(function getRole(role) {
      return role.get('name') === roleName;
    });
  },
  enforcedFilters() {
    return this.isPublicContext() ? 'status:[' + activeStates.join(',') + ']' : null;
  },
  defaultFilters() {
    return this.isPublicContext() ? null : 'status:[' + activeStates.join(',') + ']';
  }
}, {
  orderDefaultOptions() {
    return {
      last_login: 'DESC',
      name: 'ASC',
      created_at: 'DESC'
    };
  },

  /**
   * @deprecated in favour of filter
   */
  processOptions(options) {
    if (!options.status) {
      return options;
    }

    // This is the only place that 'options.where' is set now
    options.where = {statements: []};

    const allStates = activeStates.concat(invitedStates);
    let value;

    // Filter on the status.  A status of 'all' translates to no filter since we want all statuses
    if (options.status !== 'all') {
      // make sure that status is valid
      options.status = allStates.indexOf(options.status) > -1 ? options.status : 'active';
    }

    if (options.status === 'active') {
      value = activeStates;
    } else if (options.status === 'invited') {
      value = invitedStates;
    } else if (options.status === 'all') {
      value = allStates;
    } else {
      value = options.status;
    }

    options.where.statements.push({prop: 'status', op: 'IN', value: value});
    delete options.status;

    return options;
  },

  /**
   * Returns an array of keys permitted in a method's `options` hash, depending on the current method.
   * @param {String} methodName The name of the method to check valid options for.
   * @return {Array} Keys allowed in the `options` hash of the model's method.
   */
  permittedOptions(methodName) {
    let options = ghostBookshelf.Model.permittedOptions();

    // whitelists for the `options` hash argument on methods, by method name.
    // these are the only options that can be passed to Bookshelf / Knex.
    const validOptions = {
      findOne: ['withRelated', 'status'],
      setup: ['id'],
      edit: ['withRelated', 'id'],
      findPage: ['page', 'limit', 'columns', 'filter', 'order', 'status']
    };

    if (validOptions[methodName]) {
      options = options.concat(validOptions[methodName]);
    }

    return options;
  },

  /**
   * ### Find One
   * @extends ghostBookshelf.Model.findOne to include roles
   * **See:** [ghostBookshelf.Model.findOne](base.js.html#Find%20One)
   */
  findOne(dataArg, optionsArg) {
    let query;
    let status;
    let optInc;
    const lookupRole = dataArg.role;

    delete dataArg.role;

    let data = _.defaults(dataArg || {}, {
      status: 'active'
    });

    status = data.status;
    delete data.status;

    let options = optionsArg || {};
    optInc = options.include;
    options.withRelated = _.union(options.withRelated, options.include);
    data = this.filterData(data);

    // Support finding by role
    if (lookupRole) {
      options.withRelated = _.union(options.withRelated, ['roles']);
      options.include = _.union(options.include, ['roles']);

      query = this.forge(data, {include: options.include});

      query.query('join', 'roles_users', 'users.id', '=', 'roles_users.id');
      query.query('join', 'roles', 'roles_users.role_id', '=', 'roles.id');
      query.query('where', 'roles.name', '=', lookupRole);
    } else {
      // We pass include to forge so that toJSON has access
      query = this.forge(data, {include: options.include});
    }

    if (status === 'active') {
      query.query('whereIn', 'status', activeStates);
    } else if (status === 'invited') {
      query.query('whereIn', 'status', invitedStates);
    } else if (status !== 'all') {
      query.query('where', {status: options.status});
    }

    options = this.filterOptions(options, 'findOne');
    delete options.include;
    options.include = optInc;

    return query.fetch(options);
  },

  /**
   * ### Edit
   * @extends ghostBookshelf.Model.edit to handle returning the full object
   * **See:** [ghostBookshelf.Model.edit](base.js.html#edit)
   */
  edit(data, optionsArg) {
    let roleId;

    if (data.roles && data.roles.length > 1) {
      return Promise.reject(
        new errors.ValidationError('Only one role per user is supported at the moment.')
      );
    }

    const options = optionsArg || {};
    options.withRelated = _.union(options.withRelated, options.include);

    return ghostBookshelf.Model
      .edit.call(this, data, options)
      .then((user) => {
        if (!data.roles) {
          return user;
        }

        roleId = parseInt(data.roles[0].id || data.roles[0], 10);

        return user.roles()
          .fetch()
          .then((roles) => {
            // return if the role is already assigned
            if (roles.models[0].id === roleId) {
              return;
            }
            return ghostBookshelf.model('Role').findOne({id: roleId}); // eslint-disable-line
          })
          .then((roleToAssign) => {
            if (roleToAssign && roleToAssign.get('name') === 'Owner') {
              return Promise.reject(
                new errors.ValidationError('This method does not support assigning the owner role')
              );
            }
            return user.roles().updatePivot({role_id: roleId});
          })
          .then(() => {
            options.status = 'all';
            return this.findOne({id: user.id}, options);
          });
      });
  },

  /**
   * ## Add
   * Naive user add
   * Hashes the password provided before saving to the database.
   *
   * @param {object} data
   * @param {object} options
   * @extends ghostBookshelf.Model.add to manage all aspects of user signup
   * **See:** [ghostBookshelf.Model.add](base.js.html#Add)
   */
  add(data, optionsArg) {
    let userData = this.filterData(data);
    let roles;

    const options = this.filterOptions(optionsArg, 'add');
    options.withRelated = _.union(options.withRelated, options.include);

    // check for too many roles
    if (data.roles && data.roles.length > 1) {
      return Promise.reject(new errors.ValidationError('Only one role per user is supported at the moment.'));
    }

    if (!validatePasswordLength(userData.password)) {
      return Promise.reject(new errors.ValidationError('Your password must be at least 8 characters long.'));
    }

    function getAuthorRole() {
      return ghostBookshelf.model('Role')
        .findOne({name: 'Author'}, _.pick(options, 'transacting'))
        .then((authorRole) => [authorRole.get('id')]);
    }

    roles = data.roles || getAuthorRole();
    delete data.roles;

    return generatePasswordHash(userData.password)
      .then((hashResult) => {
        // Assign the hashed password
        userData.password = hashResult;
        // LookupGravatar
        return self.gravatarLookup(userData);
      })
      .then((userDataResult) => ghostBookshelf.Model.add.call(self, userDataResult, options)) // Save the user with the hashed password)
      .then((addedUser) => {
        // Assign the userData to our created user so we can pass it back
        userData = addedUser;
        // if we are given a "role" object, only pass in the role ID in place of the full object
        return Promise.resolve(roles)
          .then((rolesResult) => {
            const rolesToReturn = _.map(rolesResult, (role) => {
              if (_.isString(role)) {
                return parseInt(role, 10);
              } else if (_.isNumber(role)) {
                return role;
              }
              return parseInt(role.id, 10);
            });

            return addedUser.roles().attach(rolesToReturn, options);
          });
      })
      .then(() => this.findOne({id: userData.id, status: 'all'}, options));// find and return the added user;
  },

  setup(data, optionsArg) {
    let userData = this.filterData(data);

    if (!validatePasswordLength(userData.password)) {
      return Promise.reject(new errors.ValidationError('Your password must be at least 8 characters long.'));
    }

    const options = this.filterOptions(optionsArg, 'setup');
    options.withRelated = _.union(options.withRelated, options.include);
    options.shortSlug = true;

    return generatePasswordHash(data.password)
      .then((hashInter) => {
        // Assign the hashed password
        userData.password = hashInter;
        const promises = [this.gravatarLookup(userData),
          ghostBookshelf.Model.generateSlug.call(this, User, userData.name, options)];
        return Promise.all(promises); // change the return params type this return an array the default of bluebird must return separated arguments
      })
      .then((results) => {
        userData = results[0];
        userData.slug = results[1];

        return this.edit.call(this, userData, options);
      });
  },

  permissible(userModelOrId, action, context, loadedPermissions, hasUserPermission, hasAppPermission) {
    const userModel = userModelOrId;
    let origArgs;

    // If we passed in a model without its related roles, we need to fetch it again
    if (_.isObject(userModelOrId) && !_.isObject(userModelOrId.related('roles'))) {
      userModelOrId = userModelOrId.id; // eslint-disable-line
    }
    // If we passed in an id instead of a model get the model first
    if (_.isNumber(userModelOrId) || _.isString(userModelOrId)) {
      // Grab the original args without the first one
      origArgs = _.toArray(arguments).slice(1);
      // Get the actual user model
      return this.findOne({id: userModelOrId, status: 'all'}, {include: ['roles']})
        .then((foundUserModel) => {
          // Build up the original args but substitute with actual model
          const newArgs = [foundUserModel].concat(origArgs);

          return this.permissible.apply(this, newArgs);
        }, errors.logAndThrowError);
    }

    if (action === 'edit') {
      // Owner can only be editted by owner
      if (loadedPermissions.user && userModel.hasRole('Owner')) {
        hasUserPermission = _.any(loadedPermissions.user.roles, {name: 'Owner'}); // eslint-disable-line
      }
      // Users with the role 'Editor' and 'Author' have complex permissions when the action === 'edit'
      // We now have all the info we need to construct the permissions
      if (loadedPermissions.user && _.any(loadedPermissions.user.roles, {name: 'Author'})) {
        // If this is the same user that requests the operation allow it.
        hasUserPermission = hasUserPermission || context.user === userModel.get('id'); // eslint-disable-line
      }

      if (loadedPermissions.user && _.any(loadedPermissions.user.roles, {name: 'Editor'})) {
        // If this is the same user that requests the operation allow it.
        hasUserPermission = context.user === userModel.get('id'); // eslint-disable-line

        // Alternatively, if the user we are trying to edit is an Author, allow it
        hasUserPermission = hasUserPermission || userModel.hasRole('Author'); // eslint-disable-line
      }
    }

    if (action === 'destroy') {
      // Owner cannot be deleted EVER
      if (loadedPermissions.user && userModel.hasRole('Owner')) {
        return Promise.reject(new errors.NoPermissionError('You do not have permission to perform this action'));
      }

      // Users with the role 'Editor' have complex permissions when the action === 'destroy'
      if (loadedPermissions.user && _.any(loadedPermissions.user.roles, {name: 'Editor'})) {
        // If this is the same user that requests the operation allow it.
        hasUserPermission = context.user === userModel.get('id'); // eslint-disable-line

        // Alternatively, if the user we are trying to edit is an Author, allow it
        hasUserPermission = hasUserPermission || userModel.hasRole('Author'); // eslint-disable-line
      }
    }

    if (hasUserPermission && hasAppPermission) {
      return Promise.resolve();
    }

    return Promise.reject(new errors.NoPermissionError('You do not have permission to perform this action'));
  },

  setWarning(user, options) {
    const status = user.get('status');
    const regexp = /warn-(\d+)/i;
    let level;

    if (status === 'active') {
      user.set('status', 'warn-1');
      level = 1;
    } else {
      level = parseInt(status.match(regexp)[1], 10) + 1;
      if (level > 4) {
        user.set('status', 'locked');
      } else {
        user.set('status', 'warn-' + level);
      }
    }
    return Promise.resolve(user.save(options))
      .then(() => {
        return 5 - level;
      });
  },

  // Finds the user by email, and checks the password
  check(object) {
    let remainingAttempPlural;
    return this.getByEmail(object.email)
      .then((user) => {
        if (!user) {
          return Promise.reject(new errors.NotFoundError('There is no user with that email address.'));
        }
        if (user.get('status') === 'invited' || user.get('status') === 'invited-pending' ||
          user.get('status') === 'inactive'
        ) {
          return Promise.reject(new errors.NoPermissionError('The user with that email address is inactive.'));
        }
        if (user.get('status') !== 'locked') {
          return bcryptCompare(object.password, user.get('password'))
            .then((matched) => {
              if (!matched) {
                return Promise.resolve(this.setWarning(user, {validate: false}))
                  .then((remaining) => {
                    remainingAttempPlural = (remaining > 1) ? 's' : '';
                    return Promise.reject(new errors.UnauthorizedError('Your password is incorrect. <br />' +
                      remaining + ' attempt' + remainingAttempPlural + ' remaining!'));

                    // Use comma structure, not .catch, because we don't want to catch incorrect passwords
                  }, (error) => {  // TODO: Check why ghost do this, and not with the catch......?
                    // If we get a validation or other error during this save, catch it and log it, but don't
                    // cause a login error because of it. The user validation is not important here.
                    errors.logError(
                      error,
                      'Error thrown from user update during login',
                      'Visit and save your profile after logging in to check for problems.'
                    );
                    return Promise.reject(new errors.UnauthorizedError('Your password is incorrect.'));
                  });
              }

              return Promise.resolve(user.set({status: 'active', last_login: new Date()})
                .save({validate: false}))
                .catch((error) => {
                  // If we get a validation or other error during this save, catch it and log it, but don't
                  // cause a login error because of it. The user validation is not important here.
                  errors.logError(
                    error,
                    'Error thrown from user update during login',
                    'Visit and save your profile after logging in to check for problems.'
                  );
                  return user;
                });
            }, errors.logAndThrowError);
        }

        return Promise.reject(new errors.NoPermissionError('Your account is locked. Please reset your password ' +
          'to log in again by clicking the "Forgotten password?" link!'));
      }, (error) => {
        if (error.message === 'NotFound' || error.message === 'EmptyResponse') {
          return Promise.reject(new errors.NotFoundError('There is no user with that email address.'));
        }

        return Promise.reject(error);
      });
  },

  /**
   * Naive change password method
   * @param {Object} object
   * @param {Object} options
   */
  changePassword: (object, options) => {
    const newPassword = object.newPassword;
    const ne2Password = object.ne2Password;
    const userId = object.user_id;
    const oldPassword = object.oldPassword;
    let user;

    if (newPassword !== ne2Password) {
      return Promise.reject(new errors.ValidationError('Your new passwords do not match'));
    }

    if (userId === options.context.user && _.isEmpty(oldPassword)) {
      return Promise.reject(new errors.ValidationError('Password is required for this operation'));
    }

    if (!validatePasswordLength(newPassword)) {
      return Promise.reject(new errors.ValidationError('Your password must be at least 8 characters long.'));
    }

    return self.forge({id: userId})
      .fetch({require: true})
      .then((_user) => {
        user = _user;
        if (userId === options.context.user) {
          return bcryptCompare(oldPassword, user.get('password'));
        }
        // if user is admin, password isn't compared
        return true;
      })
      .then((matched) => {
        if (!matched) {
          return Promise.reject(new errors.ValidationError('Your password is incorrect'));
        }

        return generatePasswordHash(newPassword);
      })
      .then((password) => {
        return user.save({password});
      });
  },

  generateResetToken(email, expires, dbHash) {
    return this.getByEmail(email)
      .then((foundUser) => {
        if (!foundUser) {
          return Promise.reject(new errors.NotFoundError('There is no user with that email address.'));
        }

        const hashSha256 = crypto.createHash('sha256');

        hashSha256.update(String(expires));
        hashSha256.update(email.toLocaleLowerCase());
        hashSha256.update(foundUser.get('password'));
        hashSha256.update(String(dbHash));

        // Token:
        // BASE64(TIMESTAMP + email + HASH(TIMESTAMP + email + oldPasswordHash + dbHash ))
        const text = `${expires}|${email}|${hashSha256.digest('base64')}`;
        return new Buffer(text).toString('base64');
      });
  },

  validateToken(token, dbHash) {
    // TODO: Is there a chance the use of ascii here will cause problems if oldPassword has weird characters?
    const tokenText = new Buffer(token, 'base64').toString('ascii');
    let expires;
    let email;

    const parts = tokenText.split('|');

    // Check if invalid structure
    if (!parts || parts.length !== 3) {
      return Promise.reject(new errors.BadRequestError('Invalid token structure'));
    }

    expires = parseInt(parts[0], 10);
    email = parts[1];

    if (_.isNaN(expires)) {
      return Promise.reject(new errors.BadRequestError('Invalid token expiration'));
    }

    // Check if token is expired to prevent replay attacks
    if (expires < Date.now()) {
      return Promise.reject(new errors.ValidationError('Expired token'));
    }

    // to prevent brute force attempts to reset the password the combination of email+expires is only allowed for
    // 10 attempts
    if (tokenSecurity[email + '+' + expires] && tokenSecurity[email + '+' + expires].count >= 10) {
      return Promise.reject(new errors.NoPermissionError('Token locked'));
    }

    return this.generateResetToken(email, expires, dbHash)
      .then((generatedToken) => {
        // Check for matching tokens with timing independent comparison
        let diff = 0;

        // check if the token length is correct
        if (token.length !== generatedToken.length) {
          diff = 1;
        }

        for (let index = token.length - 1; index >= 0; index = index - 1) {
          diff |= token.charCodeAt(index) ^ generatedToken.charCodeAt(index);
        }

        if (diff === 0) {
          return email;
        }

        // increase the count for email+expires for each failed attempt
        tokenSecurity[email + '+' + expires] = {
          count: tokenSecurity[email + '+' + expires] ? tokenSecurity[email + '+' + expires].count + 1 : 1
        };
        return Promise.reject(new errors.BadRequestError('Invalid token'));
      });
  },

  resetPassword(options) {
    const token = options.token;
    const newPassword = options.newPassword;
    const ne2Password = options.ne2Password;
    const dbHash = options.dbHash;

    if (newPassword !== ne2Password) {
      return Promise.reject(new errors.ValidationError('Your new passwords do not match'));
    }

    if (!validatePasswordLength(newPassword)) {
      return Promise.reject(new errors.ValidationError('Your password must be at least 8 characters long.'));
    }

    // Validate the token; returns the email address from token
    return this.validateToken(utils.decodeBase64URLsafe(token), dbHash)
      .then((email) => {
        // Fetch the user by email, and hash the password at the same time.
        const promises = [this.getByEmail(email),
          generatePasswordHash(newPassword)];
        return Promise.all(promises); // Same warning that before bluebird.join is not the same to this solution.
      }).then((results) => {
        if (!results[0]) {
          return Promise.reject(new errors.NotFoundError('User not found'));
        }

        // Update the user with the new password hash
        const [foundUser, passwordHash] = results;

        return foundUser.save({password: passwordHash, status: 'active'});
      });
  },

  transferOwnership(object, options) {
    let ownerRole;
    let contextUser;
    const promises = [ghostBookshelf.model('Role').findOne({name: 'Owner'}),
      User.findOne({id: options.context.user}, {include: ['roles']})]; // eslint-disable-line
    return Promise.all(promises)
      .then((results) => {
        ([ownerRole, contextUser] = results);

        // check if user has the owner role
        const currentRoles = contextUser.toJSON(options).roles;
        if (!_.any(currentRoles, {id: ownerRole.id})) {
          return Promise.reject(new errors.NoPermissionError('Only owners are able to transfer the owner role.'));
        }

        const interPromises = [ghostBookshelf.model('Role').findOne({name: 'Administrator'}),
          User.findOne({id: object.id}, {include: ['roles']})];

        return Promise.all(interPromises);
      }).then(function then(results) {
        const [adminRole, user] = results;
        const currentRoles = user.toJSON(options).roles;

        if (!_.any(currentRoles, {id: adminRole.id})) {
          return Promise.reject(new errors.ValidationError('Only administrators can be assigned the owner role.'));
        }

        // convert owner to admin
        const interPromises = [contextUser.roles().updatePivot({role_id: adminRole.id}),
          user.roles().updatePivot({role_id: ownerRole.id}),
          Promise.resolve(user.id)];

        return Promise.all(interPromises);
      }).then((results) => {
        return Users.forge() // eslint-disable-line
          .query('whereIn', 'id', [contextUser.id, results[2]])
          .fetch({withRelated: ['roles']});
      }).then((users) => {
        options.include = ['roles'];
        return users.toJSON(options);
      });
  },

  gravatarLookup(userData) {
    const hashMd5 = crypto.createHash('md5').update(userData.email.toLowerCase().trim()).digest('hex');
    let gravatarUrl = `//www.gravatar.com/avatar/${hashMd5}?s=250`;

    return new Promise(function gravatarRequest(resolve) {
      if (config.isPrivacyDisabled('useGravatar')) {
        return resolve(userData);
      }

      request({url: 'http:' + gravatarUrl + '&d=404&r=x', timeout: 2000}, function handler(err, response) {
        if (err) {
          // just resolve with no image url
          return resolve(userData);
        }

        if (response.statusCode !== 404) {
          gravatarUrl += '&d=mm&r=x';
          userData.image = gravatarUrl;
        }

        resolve(userData);
      });
    });
  },
  // Get the user by email address, enforces case insensitivity rejects if the user is not found
  // When multi-user support is added, email addresses must be deduplicated with case insensitivity, so that
  // joe@bloggs.com and JOE@BLOGGS.COM cannot be created as two separate users.
  getByEmail(email, optionsArg) {
    const options = optionsArg || {};
    // We fetch all users and process them in JS as there is no easy way to make this query across all DBs
    // Although they all support `lower()`, sqlite can't case transform unicode characters
    // This is somewhat mute, as validator.isEmail() also doesn't support unicode, but this is much easier / more
    // likely to be fixed in the near future.
    options.require = true;

    return Users.forge(options) // eslint-disable-line
      .fetch(options)
      .then((users) => {
        const userWithEmail = users.find((user) => {
          return user.get('email').toLowerCase() === email.toLowerCase();
        });
        if (userWithEmail) {
          return userWithEmail;
        }
      });
  }
});

export const Users = ghostBookshelf.Collection.extend({
  model: User
});

