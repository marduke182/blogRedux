// # Base Model
// This is the model from which all other Ghost models extend. The model is based on Bookshelf.Model, and provides
// several basic behaviours such as UUIDs, as well as a set of Data methods for accessing information from the database.
//
// The models are internal to Ghost, only the API and some internal functions such as migration and import/export
// accesses the models directly. All other parts of Ghost, including the blog frontend, admin UI, and apps are only
// allowed to access data via the API.
import _ from 'lodash'; // eslint-disable-line
import bookshelf from 'bookshelf';
import config from '../../config';
import errors from '../../errors';
import filters from '../../filters';
import moment from 'moment';
import { sanitizer } from 'validator';
import schema from '../../data/schema';
import utils from '../../utils';
import uuid from 'node-uuid';
import validation from '../../data/validation';
import * as plugins from '../plugins';

let ghostBookshelf;
let proto;

// ### ghostBookshelf
// Initializes a new Bookshelf instance called ghostBookshelf, for reference elsewhere in Ghost.
ghostBookshelf = bookshelf(config.database.knex);

// Load the Bookshelf registry plugin, which helps us avoid circular dependencies
ghostBookshelf.plugin('registry');

// Load the Ghost access rules plugin, which handles passing permissions/context through the model layer
ghostBookshelf.plugin(plugins.accessRules);

// Load the Ghost filter plugin, which handles applying a 'filter' to findPage requests
ghostBookshelf.plugin(plugins.filter);

// Load the Ghost include count plugin, which allows for the inclusion of cross-table counts
ghostBookshelf.plugin(plugins.includeCount);

// Load the Ghost pagination plugin, which gives us the `fetchPage` method on Models
ghostBookshelf.plugin(plugins.pagination);

// Cache an instance of the base model prototype
proto = ghostBookshelf.Model.prototype;

// ## ghostBookshelf.Model
// The Base Model which other Ghost objects will inherit from,
// including some convenience functions as static properties on the model.
ghostBookshelf.Model = ghostBookshelf.Model.extend({
  // Bookshelf `hasTimestamps` - handles created_at and updated_at properties
  hasTimestamps: true,
  // Ghost option handling - get permitted attributes from server/data/schema.js, where the DB schema is defined
  permittedAttributespermittedAttributes() {
    return _.keys(schema.tables[this.tableName]);
  },

  // Bookshelf `defaults` - default values setup on every model creation
  defaultsdefaults() {
    return {
      uuid: uuid.v4()
    };
  },

  // Bookshelf `initialize` - declare a constructor-like method for model creation
  initializeinitialize() {
    const options = arguments[1] || {};

    // make options include available for toJSON()
    if (options.include) {
      this.include = _.clone(options.include);
    }

    this.on('creating', this.creating, this);
    this.on('saving', (model, attributes, optionsInt) => {
      return Promise
        .resolve(self.saving(model, attributes, optionsInt))
        .then(() => self.validate(model, attributes, optionsInt));
    });
  },

  validate() {
    return validation.validateSchema(this.tableName, this.toJSON());
  },

  creating(newObj, attr, options) {
    if (!this.get('created_by')) {
      this.set('created_by', this.contextUser(options));
    }
  },

  saving(newObj, attr, options) {
    // Remove any properties which don't belong on the model
    this.attributes = this.pick(this.permittedAttributes());
    // Store the previous attributes so we can tell what was updated later
    this._updatedAttributes = newObj.previousAttributes();

    this.set('updated_by', this.contextUser(options));
  },

  // Base prototype properties will go here
  // Fix problems with dates
  fixDates(attrs) {
    _.each(attrs, (value, key) => {
      if (value !== null
        && schema.tables[this.tableName].hasOwnProperty(key)
        && schema.tables[this.tableName][key].type === 'dateTime') {
        // convert dateTime value into a native javascript Date object
        attrs[key] = moment(value).toDate();
      }
    });
    return attrs;
  },

  // Convert integers to real booleans
  fixBools(attrs) {
    _.each(attrs, (value, key) => {
      if (schema.tables[this.tableName].hasOwnProperty(key)
        && schema.tables[this.tableName][key].type === 'bool') {
        attrs[key] = value ? true : false;
      }
    });
    return attrs;
  },

  // Get the user from the options object
  contextUser(options) {
    // Default to context user
    if (options.context && options.context.user) {
      return options.context.user;
      // Other wise use the internal override
    } else if (options.context && options.context.internal) {
      return 1;
    }
    errors.logAndThrowError(new Error('missing context'));
  },

  // format date before writing to DB, bools work
  format(attrs) {
    return this.fixDates(attrs);
  },

  // format data and bool when fetching from DB
  parse(attrs) {
    return this.fixBools(this.fixDates(attrs));
  },

  toJSON(optionsArg) {
    const attrs = _.extend({}, this.attributes);
    let options = optionsArg || {};
    options = _.pick(options, ['shallow', 'baseKey', 'include', 'context']);

    if (options && options.shallow) {
      return attrs;
    }

    if (options && options.include) {
      this.include = _.union(this.include, options.include);
    }

    _.each(this.relations, (relation, key) => {
      if (key.substring(0, 7) !== '_pivot_') {
        // if include is set, expand to full object
        const fullKey = _.isEmpty(options.baseKey) ? key : options.baseKey + '.' + key;
        if (_.contains(this.include, fullKey)) {
          attrs[key] = relation.toJSON(_.extend({}, options, {baseKey: fullKey, include: this.include}));
        }
      }
    });

    // @TODO upgrade bookshelf & knex and use serialize & toJSON to do this in a neater way (see #6103)
    return proto.finalize.call(this, attrs);
  },

  sanitize(attr) {
    return sanitizer(this.get(attr)).xss();
  },

  // Get attributes that have been updated (values before a .save() call)
  updatedAttributes() {
    return this._updatedAttributes || {};
  },

  // Get a specific updated attribute value
  updated(attr) {
    return this.updatedAttributes()[attr];
  }
}, {
  // ## Data Utility Functions

  /**
   * Returns an array of keys permitted in every method's `options` hash.
   * Can be overridden and added to by a model's `permittedOptions` method.
   * @return {Object} Keys allowed in the `options` hash of every model's method.
   */
  permittedOptions() {
    // terms to whitelist for all methods.
    return ['context', 'include', 'transacting'];
  },

  /**
   * Filters potentially unsafe model attributes, so you can pass them to Bookshelf / Knex.
   * @param {Object} data Has keys representing the model's attributes/fields in the database.
   * @return {Object} The filtered results of the passed in data, containing only what's allowed in the schema.
   */
  filterData(data) {
    const permittedAttributes = this.prototype.permittedAttributes();
    const filteredData = _.pick(data, permittedAttributes);

    return filteredData;
  },

  /**
   * Filters potentially unsafe `options` in a model method's arguments, so you can pass them to Bookshelf / Knex.
   * @param {Object} options Represents options to filter in order to be passed to the Bookshelf query.
   * @param {String} methodName The name of the method to check valid options for.
   * @return {Object} The filtered results of `options`.
   */
  filterOptions(options, methodName) {
    const permittedOptions = this.permittedOptions(methodName);
    const filteredOptions = _.pick(options, permittedOptions);

    return filteredOptions;
  },

  // ## Model Data Functions

  /**
   * ### Find All
   * Naive find all fetches all the data for a particular model
   * @param {Object} options (optional)
   * @return {Promise(ghostBookshelf.Collection)} Collection of all Models
   */
  findAll(optionsArgs) {
    const options = this.filterOptions(optionsArgs, 'findAll');
    options.withRelated = _.union(options.withRelated, options.include);
    return this.forge().fetchAll(options).then(function then(result) {
      if (options.include) {
        _.each(result.models, function each(item) {
          item.include = options.include;
        });
      }
      return result;
    });
  },

  /**
   * ### Find Page
   * Find results by page - returns an object containing the
   * information about the request (page, limit), along with the
   * info needed for pagination (pages, total).
   *
   * **response:**
   *
   *     {
     *         posts: [
     *         {...}, ...
     *     ],
     *     page: __,
     *     limit: __,
     *     pages: __,
     *     total: __
     *     }
   *
   * @param {Object} options
   */
  findPage(optionsArgs) {
    let options = optionsArgs || {};

    const itemCollection = this.forge(null, {context: options.context});
    const tableName = _.result(this.prototype, 'tableName');

    // Set this to true or pass ?debug=true as an API option to get output
    itemCollection.debug = options.debug && process.env.NODE_ENV !== 'production';

    // Filter options so that only permitted ones remain
    options = this.filterOptions(options, 'findPage');

    // This applies default properties like 'staticPages' and 'status'
    // And then converts them to 'where' options... this behaviour is effectively deprecated in favour
    // of using filter - it's only be being kept here so that we can transition cleanly.
    this.processOptions(options);

    // Add Filter behaviour
    itemCollection.applyFilters(options);

    // Handle related objects
    // TODO: this should just be done for all methods @ the API level
    options.withRelated = _.union(options.withRelated, options.include);

    // Ensure only valid fields/columns are added to query
    if (options.columns) {
      options.columns = _.intersection(options.columns, this.prototype.permittedAttributes());
    }

    if (options.order) {
      options.order = this.parseOrderOption(options.order, options.include);
    } else {
      options.order = this.orderDefaultOptions();
    }

    return itemCollection.fetchPage(options).then(function formatResponse(response) {
      const data = {};
      data[tableName] = response.collection.toJSON(options);
      data.meta = {pagination: response.pagination};

      return data;
    });
  },

  /**
   * ### Find One
   * Naive find one where data determines what to match on
   * @param {Object} data
   * @param {Object} options (optional)
   * @return {Promise(ghostBookshelf.Model)} Single Model
   */
  findOne(dataArg, optionsArg) {
    const data = this.filterData(dataArg);
    const options = this.filterOptions(optionsArg, 'findOne');
    // We pass include to forge so that toJSON has access
    return this.forge(data, {include: options.include}).fetch(options);
  },

  /**
   * ### Edit
   * Naive edit
   * @param {Object} data
   * @param {Object} options (optional)
   * @return {Promise(ghostBookshelf.Model)} Edited Model
   */
  edit(dataArg, optionsArg) {
    const id = optionsArg.id;
    const data = this.filterData(dataArg);
    const options = this.filterOptions(optionsArg, 'edit');

    return this.forge({id: id}).fetch(options).then(function then(object) {
      if (object) {
        return object.save(data, options);
      }
    });
  },

  /**
   * ### Add
   * Naive add
   * @param {Object} data
   * @param {Object} options (optional)
   * @return {Promise(ghostBookshelf.Model)} Newly Added Model
   */
  add(dataArg, optionsArg) {
    const data = this.filterData(dataArg);
    const options = this.filterOptions(optionsArg, 'add');
    const model = this.forge(data);
    // We allow you to disable timestamps when importing posts so that the new posts `updated_at` value is the same
    // as the import json blob. More details refer to https://github.com/TryGhost/Ghost/issues/1696
    if (options.importing) {
      model.hasTimestamps = false;
    }
    return model.save(null, options);
  },

  /**
   * ### Destroy
   * Naive destroy
   * @param {Object} options (optional)
   * @return {Promise(ghostBookshelf.Model)} Empty Model
   */
  destroy(optionsArg) {
    const id = optionsArg.id;
    const options = this.filterOptions(optionsArg, 'destroy');

    // Fetch the object before destroying it, so that the changed data is available to events
    return this.forge({id: id}).fetch(options).then(function then(obj) {
      return obj.destroy(options);
    });
  },

  /**
   * ### Generate Slug
   * Create a string to act as the permalink for an object.
   * @param {ghostBookshelf.Model} Model Model type to generate a slug for
   * @param {String} base The string for which to generate a slug, usually a title or name
   * @param {Object} options Options to pass to findOne
   * @return {Promise(String)} Resolves to a unique slug string
   */
  generateSlug(Model, base, options) {
    let slug;
    let slugTryCount = 1;
    const baseName = Model.prototype.tableName.replace(/s$/, '');
    // Look for a matching slug, append an incrementing number if so
    let checkIfSlugExists;
    let longSlug;

    checkIfSlugExists = (slugToFind) => {
      const args = {slug: slugToFind};
      // status is needed for posts
      if (options && options.status) {
        args.status = options.status;
      }
      return Model.findOne(args, options).then(function then(found) {
        let trimSpace;

        if (!found) {
          return slugToFind;
        }

        slugTryCount += 1;

        // If we shortened, go back to the full version and try again
        if (slugTryCount === 2 && longSlug) {
          slugToFind = longSlug; // eslint-disable-line
          longSlug = null;
          slugTryCount = 1;
          return checkIfSlugExists(slugToFind);
        }

        // If this is the first time through, add the hyphen
        if (slugTryCount === 2) {
          slugToFind += '-'; // eslint-disable-line
        } else {
          // Otherwise, trim the number off the end
          trimSpace = -(String(slugTryCount - 1).length);
          slugToFind = slugToFind.slice(0, trimSpace); // eslint-disable-line
        }

        slugToFind += slugTryCount; // eslint-disable-line

        return checkIfSlugExists(slugToFind);
      });
    };

    slug = utils.safeString(base, options);

    // If it's a user, let's try to cut it down (unless this is a human request)
    if (baseName === 'user' && options && options.shortSlug && slugTryCount === 1 && slug !== 'ghost-owner') {
      longSlug = slug;
      slug = (slug.indexOf('-') > -1) ? slug.substr(0, slug.indexOf('-')) : slug;
    }

    // Check the filtered slug doesn't match any of the reserved keywords
    return filters
      .doFilter('slug.reservedSlugs', config.slugs.reserved).then(function then(slugList) {
        // Some keywords cannot be changed
        slugList = _.union(slugList, config.slugs.protected); // eslint-disable-line

        return _.contains(slugList, slug) ? slug + '-' + baseName : slug;
      })
      .then((slug) => { // eslint-disable-line
        // if slug is empty after trimming use the model name
        if (!slug) {
          slug = baseName; // eslint-disable-line
        }
        // Test for duplicate slugs.
        return checkIfSlugExists(slug);
      });
  },

  parseOrderOption(order, include) {
    let permittedAttributes;
    let result;
    let rules;

    permittedAttributes = this.prototype.permittedAttributes();
    if (include && include.indexOf('count.posts') > -1) {
      permittedAttributes.push('count.posts');
    }
    result = {};
    rules = order.split(',');

    _.each(rules, (rule) => {
      let match;
      let field;
      let direction;

      match = /^([a-z0-9_\.]+)\s+(asc|desc)$/i.exec(rule.trim());

      // invalid order syntax
      if (!match) {
        return;
      }

      field = match[1].toLowerCase();
      direction = match[2].toUpperCase();

      if (permittedAttributes.indexOf(field) === -1) {
        return;
      }

      result[field] = direction;
    });

    return result;
  }

});


export default ghostBookshelf;

