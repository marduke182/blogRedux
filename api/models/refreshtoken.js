import ghostBookshelf from './base';
import Basetoken from './base/token';

export const Refreshtoken = Basetoken.extend({
  tableName: 'refreshtokens'
});

export const Refreshtokens = ghostBookshelf.Collection.extend({
  model: Refreshtoken
});

