function decodeTags(tags) {
  if (!tags || tags.length === 0) return { tag_categories: [], tag_topics: [] };

  const tag_categories = [];
  const tag_topics = [];

  for (const tag of tags) {
    if (tag.startsWith("k:")) {
      tag_categories.push(tag.slice(2));
    } else if (tag.startsWith("o:")) {
      tag_topics.push(tag.slice(2));
    }
  }

  return { tag_categories, tag_topics };
}

module.exports = decodeTags;
