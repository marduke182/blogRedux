import ghostBookshelf from './base';
import Basetoken from './base/token';

export const Accesstoken = Basetoken.extend({
  tableName: 'accesstokens'
});

export const Accesstokens = ghostBookshelf.Collection.extend({
  model: Accesstoken
});
