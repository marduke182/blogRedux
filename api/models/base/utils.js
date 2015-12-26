/**
 * # Utils
 * Parts of the model code which can be split out and unit tested
 */
import _ from 'lodash'; // eslint-disable-line

const tagUpdate = {
  fetchCurrentPost(PostModel, id, options) {
    return PostModel.forge({id: id}).fetch(_.extend({}, options, {withRelated: ['tags']}));
  },

  fetchMatchingTags(TagModel, tagsToMatch, options) {
    if (_.isEmpty(tagsToMatch)) {
      return false;
    }
    return TagModel.forge()
      .query('whereIn', 'name', _.pluck(tagsToMatch, 'name')).fetchAll(options);
  },

  detachTagFromPost(post, tag, options) {
    return () => {
      // See tgriesser/bookshelf#294 for an explanation of _.omit(options, 'query')
      return post.tags().detach(tag.id, _.omit(options, 'query'));
    };
  },

  attachTagToPost(post, tag, index, options) {
    return () => {
      // See tgriesser/bookshelf#294 for an explanation of _.omit(options, 'query')
      return post.tags().attach({tag_id: tag.id, sort_order: index}, _.omit(options, 'query'));
    };
  },

  createTagThenAttachTagToPost(TagModel, post, tag, index, options) {
    return () => {
      return TagModel.add({name: tag.name}, options).then(function then(createdTag) {
        return tagUpdate.attachTagToPost(post, createdTag, index, options)();
      });
    };
  },

  updateTagOrderForPost(post, tag, index, options) {
    return () => {
      return post.tags().updatePivot(
        {sort_order: index}, _.extend({}, options, {query: {where: {tag_id: tag.id}}})
      );
    };
  },

  // Test if two tags are the same, checking ID first, and falling back to name
  tagsAreEqual(tag1, tag2) {
    if (tag1.hasOwnProperty('id') && tag2.hasOwnProperty('id')) {
      return parseInt(tag1.id, 10) === parseInt(tag2.id, 10);
    }
    return tag1.name.toString() === tag2.name.toString();
  },
  tagSetsAreEqual(tags1, tags2) {
    // If the lengths are different, they cannot be the same
    if (tags1.length !== tags2.length) {
      return false;
    }
    // Return if no item is not the same (double negative is horrible)
    return !_.any(tags1, (tag1, index) => {
      return !tagUpdate.tagsAreEqual(tag1, tags2[index]);
    });
  }
};

export default tagUpdate;
