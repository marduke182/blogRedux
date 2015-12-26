import ghostBookshelf from './index';
import errors from '../../errors';

export default ghostBookshelf.Model.extend({

  user() {
    return this.belongsTo('User');
  },

  client() {
    return this.belongsTo('Client');
  },

  // override for base function since we don't have
  // a created_by field for sessions
  creating(newObj, attr, options) { // eslint-disable-line
  },

  // override for base function since we don't have
  // a updated_by field for sessions
  saving(newObj, attr, options) { // eslint-disable-line
    // Remove any properties which don't belong on the model
    this.attributes = this.pick(this.permittedAttributes());
  }

}, {
  destroyAllExpired(optionsArg) {
    const options = this.filterOptions(optionsArg, 'destroyAll');
    return ghostBookshelf.Collection.forge([], {model: this})
      .query('where', 'expires', '<', Date.now())
      .fetch(options)
      .then(function then(collection) {
        collection.invokeThen('destroy', options);
      });
  },
  /**
   * ### destroyByUser
   * @param  {[type]} options has context and id. Context is the user doing the destroy, id is the user to destroy
   */
  destroyByUser(optionsArg) {
    const userId = optionsArg.id;

    const options = this.filterOptions(optionsArg, 'destroyByUser');

    if (userId) {
      return ghostBookshelf.Collection.forge([], {model: this})
        .query('where', 'user_id', '=', userId)
        .fetch(options)
        .then(function then(collection) {
          collection.invokeThen('destroy', options);
        });
    }

    return Promise.reject(new errors.NotFoundError('No user found'));
  },

  /**
   * ### destroyByToken
   * @param  {[type]} options has token where token is the token to destroy
   */
  destroyByToken(optionsArg) {
    const token = optionsArg.token;

    const options = this.filterOptions(options, 'destroyByUser');

    if (token) {
      return ghostBookshelf.Collection.forge([], {model: this})
        .query('where', 'token', '=', token)
        .fetch(options)
        .then(function then(collection) {
          collection.invokeThen('destroy', options);
        });
    }

    return Promise.reject(new errors.NotFoundError('Token not found'));
  }
});
