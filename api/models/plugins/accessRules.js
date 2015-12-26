// # Access Rules
//
// Extends Bookshelf.Model.force to take a 'context' option which provides information on how this query should
// be treated in terms of data access rules - currently just detecting public requests
export default (Bookshelf) => {
  const model = Bookshelf.Model;
  const Model = Bookshelf.Model
    .extend({
      /**
       * Cached copy of the context setup for this model instance
       */
      _context: null,
      /**
       * ## Is Public Context?
       * A helper to determine if this is a public request or not
       * @returns {boolean}
       */
      isPublicContext() {
        return !!(this._context && this._context.public);
      }
    },
    {
      /**
       * ## Forge
       * Ensure that context gets set as part of the forge
       *
       * @param {object} attributes
       * @param {object} options
       * @returns {Bookshelf.Model} model
       */
      forge(attributes, options) {
        const self = model.forge.apply(this, arguments);

        if (options && options.context) {
          self._context = options.context;
          delete options.context;
        }

        return self;
      }
    });

  Bookshelf.Model = Model;
};
