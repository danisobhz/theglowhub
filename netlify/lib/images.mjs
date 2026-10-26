export function createImages(store) {
  return {
    head(key) { return store.getMetadata(key); },
    async get(key) {
      const result = await store.getWithMetadata(key, { type: 'stream' });
      if (!result) return null;
      return { body: result.data, httpEtag: result.etag, httpMetadata: { contentType: result.metadata.contentType } };
    },
    async put(key, bytes, options) {
      // UUID keys are immutable. Strong reads make a new upload immediately
      // available when the subsequent product-save request validates it.
      await store.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), {
        metadata: { contentType: options.httpMetadata.contentType }
      });
    }
  };
}
