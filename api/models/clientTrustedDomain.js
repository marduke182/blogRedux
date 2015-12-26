import ghostBookshelf from './base';

export const ClientTrustedDomain = ghostBookshelf.Model.extend({
  tableName: 'client_trusted_domains'
});

export const ClientTrustedDomains = ghostBookshelf.Collection.extend({
  model: ClientTrustedDomain
});
