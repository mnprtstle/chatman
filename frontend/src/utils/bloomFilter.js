export class BloomFilter {
  constructor(size, hashCount, bloomHashSeed, existingFilter) {
    this.size = size;
    this.hashCount = hashCount;
    this._filter = existingFilter ?? new Uint8Array(Math.ceil(size / 8));
    this.seed = bloomHashSeed;
  }

  // Optimized MurmurHash3 (32-bit Block Jumps)
  _murmur3(data, seed) {
    let h1 = seed >>> 0;
    const c1 = 0xcc9e2d51, c2 = 0x1b873593;
    const len = data.length;
    const nBlocks = Math.floor(len / 4);

    // Using DataView for "Node-free" 32-bit jumps
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < nBlocks; i++) {
      let k1 = view.getUint32(i * 4, true);
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
      h1 = (h1 << 13) | (h1 >>> 19);
      h1 = Math.imul(h1, 5) + 0xe6546b64;
    }

    // Tail handling (remaining 0-3 bytes)
    let k1 = 0;
    const tailStart = nBlocks * 4;
    switch (len & 3) {
      case 3: k1 ^= data[tailStart + 2] << 16;
      case 2: k1 ^= data[tailStart + 1] << 8;
      case 1: k1 ^= data[tailStart];
        k1 = Math.imul(k1, c1);
        k1 = (k1 << 15) | (k1 >>> 17);
        k1 = Math.imul(k1, c2);
        h1 ^= k1;
    }

    // Finalizer (The Avalanche Effect)
    h1 ^= len;
    h1 ^= h1 >>> 16;
    h1 = Math.imul(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;
    return h1 >>> 0;
  }

  add(item) {
    const data = new TextEncoder().encode(item);
    const h1 = this._murmur3(data, this.seed);
    const h2 = this._murmur3(data, h1); // Double hash seed

    for (let i = 0; i < this.hashCount; i++) {
      const index = (h1 + Math.imul(i, h2)) >>> 0;
      const bitPos = index % this.size;

      this._filter[bitPos >> 3] |= (1 << (bitPos % 8));

    }
  }

  has(item) {
    const data = new TextEncoder().encode(item);
    const h1 = this._murmur3(data, this.seed);
    const h2 = this._murmur3(data, h1);

    for (let i = 0; i < this.hashCount; i++) {
      const index = (h1 + Math.imul(i, h2)) >>> 0;
      const bitPos = index % this.size;

      if (!(this._filter[bitPos >> 3] & (1 << (bitPos % 8)))) return false;
    }
    return true;
  }

  clear() {
    this._filter = new Uint8Array(Math.ceil(size / 8))
  }
}
