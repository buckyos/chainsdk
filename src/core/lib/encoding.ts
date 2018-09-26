/*!
 * encoding.js - encoding utils for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

/**
 * @module utils/encoding
 */

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export class Encoding {

    /**
     * An empty buffer.
     * @const {Buffer}
     * @default
     */

    static DUMMY = Buffer.from([0]);

    /**
     * A hash of all zeroes with a `1` at the
     * end (used for the SIGHASH_SINGLE bug).
     * @const {Buffer}
     * @default
     */

    static ONE_HASH = Buffer.from(
        '0100000000000000000000000000000000000000000000000000000000000000',
        'hex'
    );

    /**
     * A hash of all zeroes.
     * @const {Buffer}
     * @default
     */

    static ZERO_HASH = Buffer.from(
        '0000000000000000000000000000000000000000000000000000000000000000',
        'hex'
    );

    /**
     * A hash of all 0xff.
     * @const {Buffer}
     * @default
     */

    static MAX_HASH = Buffer.from(
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        'hex'
    );

    /**
     * A hash of all zeroes.
     * @const {String}
     * @default
     */

    static NULL_HASH =
        '0000000000000000000000000000000000000000000000000000000000000000';

    /**
     * A hash of all 0xff.
     * @const {String}
     * @default
     */

    static HIGH_HASH =
        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    /**
     * A hash of all zeroes.
     * @const {Buffer}
     * @default
     */

    static ZERO_HASH160 = Buffer.from(
        '0000000000000000000000000000000000000000',
        'hex'
    );

    /**
     * A hash of all 0xff.
     * @const {String}
     * @default
     */

    static MAX_HASH160 = Buffer.from(
        'ffffffffffffffffffffffffffffffffffffffff',
        'hex'
    );

    /**
     * A hash of all zeroes.
     * @const {String}
     * @default
     */

    static NULL_HASH160 = '0000000000000000000000000000000000000000';

    /**
     * A hash of all 0xff.
     * @const {String}
     * @default
     */

    static HIGH_HASH160 = 'ffffffffffffffffffffffffffffffffffffffff';

    /**
     * A compressed pubkey of all zeroes.
     * @const {Buffer}
     * @default
     */

    static ZERO_KEY = Buffer.from(
        '000000000000000000000000000000000000000000000000000000000000000000',
        'hex'
    );

    /**
     * A 73 byte signature of all zeroes.
     * @const {Buffer}
     * @default
     */

    static ZERO_SIG = Buffer.from(''
        + '0000000000000000000000000000000000000000000000000000000000000000'
        + '0000000000000000000000000000000000000000000000000000000000000000'
        + '000000000000000000',
        'hex'
    );

    /**
     * A 64 byte signature of all zeroes.
     * @const {Buffer}
     * @default
     */

    static ZERO_SIG64 = Buffer.from(''
        + '0000000000000000000000000000000000000000000000000000000000000000'
        + '0000000000000000000000000000000000000000000000000000000000000000',
        'hex'
    );

    /**
     * 4 zero bytes.
     * @const {Buffer}
     * @default
     */

    static ZERO_U32 = Buffer.from('00000000', 'hex');

    /**
     * 8 zero bytes.
     * @const {Buffer}
     * @default
     */

    static ZERO_U64 = Buffer.from('0000000000000000', 'hex');

    /**
     * Read uint64le as a js number.
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    static readU64(data: Buffer, off: number) {
        const hi = data.readUInt32LE(off + 4, true);
        const lo = data.readUInt32LE(off, true);
        enforce((hi & 0xffe00000) === 0, off, 'Number exceeds 2^53-1');
        return hi * 0x100000000 + lo;
    }

    /**
     * Read uint64be as a js number.
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    static readU64BE(data: Buffer, off: number) {
        const hi = data.readUInt32BE(off, true);
        const lo = data.readUInt32BE(off + 4, true);
        enforce((hi & 0xffe00000) === 0, off, 'Number exceeds 2^53-1');
        return hi * 0x100000000 + lo;
    }

    /**
     * Read int64be as a js number.
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    static readI64(data: Buffer, off: number) {
        const hi = data.readInt32LE(off + 4, true);
        const lo = data.readUInt32LE(off, true);
        enforce(isSafe(hi, lo), 'Number exceeds 2^53-1');
        return hi * 0x100000000 + lo;
    }

    /**
     * Read int64be as a js number.
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    static readI64BE(data: Buffer, off: number) {
        const hi = data.readInt32BE(off, true);
        const lo = data.readUInt32BE(off + 4, true);
        enforce(isSafe(hi, lo), 'Number exceeds 2^53-1');
        return hi * 0x100000000 + lo;
    }

    /**
     * Write a javascript number as a uint64le.
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     * @throws on num > MAX_SAFE_INTEGER
     */

    static writeU64(dst: Buffer, num: number, off: number) {
        return write64(dst, num, off, false);
    }

    /**
     * Write a javascript number as a uint64be.
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     * @throws on num > MAX_SAFE_INTEGER
     */

    static writeU64BE(dst: Buffer, num: number, off: number) {
        return write64(dst, num, off, true);
    }

    /**
     * Write a javascript number as an int64le.
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     * @throws on num > MAX_SAFE_INTEGER
     */

    static writeI64(dst: Buffer, num: number, off: number) {
        return write64(dst, num, off, false);
    }

    /**
     * Write a javascript number as an int64be.
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     * @throws on num > MAX_SAFE_INTEGER
     */

    static writeI64BE(dst: Buffer, num: number, off: number) {
        return write64(dst, num, off, true);
    }

    /**
     * Read a varint.
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Object}
     */

    static readVarint(data: Buffer, off: number) {
        let value, size;

        assert(off < data.length, off);

        switch (data[off]) {
            case 0xff:
                size = 9;
                assert(off + size <= data.length, off);
                value = Encoding.readU64(data, off + 1);
                enforce(value > 0xffffffff, off, 'Non-canonical varint');
                break;
            case 0xfe:
                size = 5;
                assert(off + size <= data.length, off);
                value = data.readUInt32LE(off + 1, true);
                enforce(value > 0xffff, off, 'Non-canonical varint');
                break;
            case 0xfd:
                size = 3;
                assert(off + size <= data.length, off);
                value = data[off + 1] | (data[off + 2] << 8);
                enforce(value >= 0xfd, off, 'Non-canonical varint');
                break;
            default:
                size = 1;
                value = data[off];
                break;
        }

        return new Varint(size, value);
    }

    /**
     * Write a varint.
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     */

    static writeVarint(dst: Buffer, num: number, off: number) {
        if (num < 0xfd) {
            dst[off++] = num & 0xff;
            return off;
        }

        if (num <= 0xffff) {
            dst[off++] = 0xfd;
            dst[off++] = num & 0xff;
            dst[off++] = (num >> 8) & 0xff;
            return off;
        }

        if (num <= 0xffffffff) {
            dst[off++] = 0xfe;
            dst[off++] = num & 0xff;
            dst[off++] = (num >> 8) & 0xff;
            dst[off++] = (num >> 16) & 0xff;
            dst[off++] = num >>> 24;
            return off;
        }

        dst[off++] = 0xff;
        off = Encoding.writeU64(dst, num, off);
        return off;
    }

    /**
     * Calculate size of varint.
     * @param {Number} num
     * @returns {Number} size
     */

    static sizeVarint(num: number) {
        if (num < 0xfd) {
            return 1;
        }

        if (num <= 0xffff) {
            return 3;
        }
            
        if (num <= 0xffffffff) {
            return 5;
        }
        
        return 9;
    }

    /**
     * Read a varint (type 2).
     * @param {Buffer} data
     * @param {Number} off
     * @returns {Object}
     */

    static readVarint2(data: Buffer, off: number) {
        let num = 0;
        let size = 0;

        for (; ;) {
            assert(off < data.length, off);

            const ch = data[off++];
            size++;

            // Number.MAX_SAFE_INTEGER >>> 7
            enforce(num <= 0x3fffffffffff - (ch & 0x7f), off, 'Number exceeds 2^53-1');

            // num = (num << 7) | (ch & 0x7f);
            num = (num * 0x80) + (ch & 0x7f);

            if ((ch & 0x80) === 0) {
                break;
            }
                
            enforce(num !== MAX_SAFE_INTEGER, off, 'Number exceeds 2^53-1');
            num++;
        }

        return new Varint(size, num);
    }

    /**
     * Write a varint (type 2).
     * @param {Buffer} dst
     * @param {Number} num
     * @param {Number} off
     * @returns {Number} Buffer offset.
     */

    static writeVarint2(dst: Buffer, num: number, off: number) {
        const tmp = [];

        let len = 0;

        for (; ;) {
            tmp[len] = (num & 0x7f) | (len ? 0x80 : 0x00);
            if (num <= 0x7f) {
                break;
            }
                
            // num = (num >>> 7) - 1;
            num = ((num - (num % 0x80)) / 0x80) - 1;
            len++;
        }

        assert(off + len + 1 <= dst.length, off);

        do {
            dst[off++] = tmp[len];
        } while (len--);

        return off;
    }

    /**
     * Calculate size of varint (type 2).
     * @param {Number} num
     * @returns {Number} size
     */

    static sizeVarint2(num: number) {
        let size = 0;

        for (; ;) {
            size++;
            if (num <= 0x7f) {
                break;
            }
               
            // num = (num >>> 7) - 1;
            num = ((num - (num % 0x80)) / 0x80) - 1;
        }

        return size;
    }

    /**
     * Serialize number as a u8.
     * @param {Number} num
     * @returns {Buffer}
     */

    static U8(num: number) {
        const data = Buffer.allocUnsafe(1);
        data[0] = num >>> 0;
        return data;
    }

    /**
     * Serialize number as a u32le.
     * @param {Number} num
     * @returns {Buffer}
     */

    static U32(num: number) {
        const data = Buffer.allocUnsafe(4);
        data.writeUInt32LE(num, 0, true);
        return data;
    }

    /**
     * Serialize number as a u32be.
     * @param {Number} num
     * @returns {Buffer}
     */

    static U32BE(num: number) {
        const data = Buffer.allocUnsafe(4);
        data.writeUInt32BE(num, 0, true);
        return data;
    }

    /**
     * Get size of varint-prefixed bytes.
     * @param {Buffer} data
     * @returns {Number}
     */

    static sizeVarBytes(data: Buffer) {
        return Encoding.sizeVarint(data.length) + data.length;
    }

    /**
     * Get size of varint-prefixed length.
     * @param {Number} len
     * @returns {Number}
     */

    static sizeVarlen(len: number) {
        return Encoding.sizeVarint(len) + len;
    }

    /**
     * Get size of varint-prefixed string.
     * @param {String} str
     * @returns {Number}
     */

    static sizeVarString(str: string, enc?: string) {
        if (typeof str !== 'string') {
            return Encoding.sizeVarBytes(str);
        }
            
        const len = Buffer.byteLength(str, enc);

        return Encoding.sizeVarint(len) + len;
    }
}

/*
 * Helpers
 */

function isSafe(hi: number, lo: number) {
    if (hi < 0) {
        hi = ~hi;
        if (lo === 0) {
            hi += 1;
        }
            
    }

    return (hi & 0xffe00000) === 0;
}

function write64(dst: Buffer, num: number, off: number, be: boolean) {
    let neg = false;

    if (num < 0) {
        num = -num;
        neg = true;
    }

    let hi = (num * (1 / 0x100000000)) | 0;
    let lo = num | 0;

    if (neg) {
        if (lo === 0) {
            hi = (~hi + 1) | 0;
        } else {
            hi = ~hi;
            lo = ~lo + 1;
        }
    }

    if (be) {
        off = dst.writeInt32BE(hi, off, true);
        off = dst.writeInt32BE(lo, off, true);
    } else {
        off = dst.writeInt32LE(lo, off, true);
        off = dst.writeInt32LE(hi, off, true);
    }

    return off;
}

/**
 * EncodingError
 * @constructor
 * @param {Number} offset
 * @param {String} reason
 */

export class EncodingError extends Error {
    public type: string;
    constructor(offset: number|string, reason: string|undefined, start?: any) {
        super();

        this.type = 'EncodingError';
        this.message = `${reason} (offset=${offset}).`;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, start || EncodingError);
        }
    }
}

class Varint {
    public size: number;
    public value: number;
    constructor(size: number, value: number) {
        this.size = size;
        this.value = value;
    }
}

function assert(value: boolean, offset: number) {
    if (!value) {
        throw new EncodingError(offset, 'Out of bounds read', assert);
    }
}

function enforce(value: boolean, offset: number|string, reason?: string) {
    if (!value) {
        throw new EncodingError(offset, reason, enforce);
    }
}
