/**
 * Dependencies
 */
import _ from 'lodash';

/**
 * Expose all models
 */
export * from './accesstoken';
export * from './appField';
export * from './appSetting';
export * from './app';
export * from './clientTrustedDomain';
export * from './client';
export * from './permission';
export * from './post';
export * from './refreshtoken';
export * from './role';
export * from './settings';
export * from './tag';
export * from './user';
export { default as ghostBookshelf} from './base';

// ### deleteAllContent
// Delete all content from the database (posts, tags, tags_posts)
export const deleteAllContent = () => {
  return this.Post
    .findAll()
    .then((posts) => {
      return Promise.all(_.map(posts.toJSON(), (post) => {
        return this.Post.destroy({id: post.id});
      }));
    }).then(() => {
      return this.Tag
        .findAll()
        .then((tags) => {
          return Promise.all(_.map(tags.toJSON(), (tag) => {
            return this.Tag.destroy({id: tag.id});
          }));
        });
    });
};
