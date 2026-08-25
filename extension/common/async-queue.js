export function createSerializedWriter(writer) {
  let chain = Promise.resolve();

  return (value) => {
    chain = chain
      .catch(() => {})
      .then(() => writer(value))
      .catch(() => {});
    return chain;
  };
}
