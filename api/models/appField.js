import ghostBookshelf from './base';

export const AppField = ghostBookshelf.Model.extend({
  tableName: 'app_fields',

  post() {
    return this.morphOne('Post', 'relatable');
  }
});

export const AppFields = ghostBookshelf.Collection.extend({
  model: AppField
});

