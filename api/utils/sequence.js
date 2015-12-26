export default function sequence(tasks) {
  const results = tasks.reduce(results, (task) => {
    return task().then((result) => {
      results.push(result);

      return results;
    });
  }, []);
  return Promise.resolve(results);
}
