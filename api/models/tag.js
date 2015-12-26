import _ from 'lodash'; // eslint-disable-line
import ghostBookshelf from './base';

export const Tag = ghostBookshelf.Model.extend({
  tableName: 'tags',

  emitChange(event) {
    console.log('tag' + '.' + event, this);
  },

  initialize() {
    ghostBookshelf.Model.prototype.initialize.apply(this, arguments);

    this.on('created', (model) => {
      model.emitChange('added');
    });
    this.on('updated', (model) => {
      model.emitChange('edited');
    });
    this.on('destroyed', (model) => {
      model.emitChange('deleted');
    });
  },

  saving: function saving(newPage, attr, options) {
    ghostBookshelf.Model.prototype.saving.apply(this, arguments);

    if (this.hasChanged('slug') || !this.get('slug')) {
      // Pass the new slug through the generator to strip illegal characters, detect duplicates
      return ghostBookshelf.Model.generateSlug(Tag, this.get('slug') || this.get('name'),
        {transacting: options.transacting})
        .then((slug) => {
          this.set({slug: slug});
        });
    }
  },

  posts() {
    return this.belongsToMany('Post');
  },

  toJSON(optionsArg) {
    const options = optionsArg || {};

    const attrs = ghostBookshelf.Model.prototype.toJSON.call(this, options);

    attrs.parent = attrs.parent || attrs.parent_id;
    delete attrs.parent_id;

    return attrs;
  }
}, {
  orderDefaultOptions() {
    return {};
  },

  /**
   * @deprecated in favour of filter
   */
  processOptions(options) {
    return options;
  },

  permittedOptions(methodName) {
    let options = ghostBookshelf.Model.permittedOptions(),

    // whitelists for the `options` hash argument on methods, by method name.
    // these are the only options that can be passed to Bookshelf / Knex.
      validOptions = {
        findPage: ['page', 'limit', 'columns', 'filter', 'order']
      };

    if (validOptions[methodName]) {
      options = options.concat(validOptions[methodName]);
    }

    return options;
  },

  /**
   * ### Find One
   * @overrides ghostBookshelf.Model.findOne
   */
  findOne(dataArg, optionsArg) {
    let options = optionsArg || {};

    options = this.filterOptions(options, 'findOne');
    const data = this.filterData(dataArg, 'findOne');

    const tag = this.forge(data);

    // Add related objects
    options.withRelated = _.union(options.withRelated, options.include);

    return tag.fetch(options);
  },

  destroy: function destroy(optionsArg) {
    const id = options.id;
    const options = this.filterOptions(optionsArg, 'destroy');

    return this.forge({id})
      .fetch({withRelated: ['posts']})
      .then((tag) => {
        return tag.related('posts')
          .detach()
          .then(() => tag.destroy(options));
      });
  }
});

export const Tags = ghostBookshelf.Collection.extend({
  model: Tag
});
