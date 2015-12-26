import ghostBookshelf from './base';

export const Client = ghostBookshelf.Model.extend({
  tableName: 'clients',
  trustedDomains() {
    return this.hasMany('ClientTrustedDomain', 'client_id');
  }
}, {
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
      findOne: ['withRelated']
    };

    if (validOptions[methodName]) {
      options = options.concat(validOptions[methodName]);
    }

    return options;
  }
});

export const Clients = ghostBookshelf.Collection.extend({
  model: Client
});

