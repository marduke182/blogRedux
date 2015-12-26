import ghostBookshelf from './base';


export const AppSetting = ghostBookshelf.Model.extend({
  tableName: 'app_settings',

  app() {
    return this.belongsTo('App');
  }
});

export const AppSettings = ghostBookshelf.Collection.extend({
  model: AppSetting
});

