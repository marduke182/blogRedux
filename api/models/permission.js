import ghostBookshelf from './base';


export const Permission = ghostBookshelf.Model.extend({

  tableName: 'permissions',

  roles: function roles() {
    return this.belongsToMany('Role');
  },

  users: function users() {
    return this.belongsToMany('User');
  },

  apps: function apps() {
    return this.belongsToMany('App');
  }
});

export const Permissions = ghostBookshelf.Collection.extend({
  model: Permission
});
