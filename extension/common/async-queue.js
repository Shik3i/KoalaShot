export function createSerializedWriter(writer) {
  let chain = Promise.resolve();

  return (value) => {
    const result = chain.then(() => writer(value));
    chain = result.catch(() => {});
    return result;
  };
}
