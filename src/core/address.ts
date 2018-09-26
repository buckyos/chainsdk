const secp256k1 = require('secp256k1');
const { randomBytes } = require('crypto');
import * as digest from './lib/digest';
import { StaticWriter } from './lib/staticwriter';
import * as base58 from './lib/base58';
import { isString } from 'util';
import { BufferReader } from '../client';

// prefix can identify different network
// will be readed from consensus params
const defaultPrefix = 0x00;

function pubKeyToBCFormat(publickey: Buffer): Buffer {
    const keyHash = digest.hash160(publickey);
    const size = 5 + keyHash.length;
    const bw = new StaticWriter(size);

    bw.writeU8(defaultPrefix);

    bw.writeBytes(keyHash);
    bw.writeChecksum();

    return bw.render();
}

export function signBufferMsg(msg: Buffer, key: Buffer) {
    // Sign message
    let sig = secp256k1.sign(msg, key);
    // Ensure low S value
    return secp256k1.signatureNormalize(sig.signature);
}

export function verifyBufferMsg(msg: Buffer, sig: Buffer, key: Buffer): boolean {
    if (sig.length === 0) {
        return false;
    }

    if (key.length === 0) {
        return false;
    }

    try {
        sig = secp256k1.signatureNormalize(sig);
        return secp256k1.verify(msg, sig, key);
    } catch (e) {
        return false;
    }
}

export function addressFromPublicKey(publicKey: Buffer|string): string | undefined {
    if (isString(publicKey)) {
        publicKey = Buffer.from(publicKey, 'hex');
    }
    return base58.encode(pubKeyToBCFormat(publicKey));
}

export function publicKeyFromSecretKey(secret: Buffer|string): Buffer | undefined {
    if (isString(secret)) {
        secret = Buffer.from(secret, 'hex');
    }
    if (!secp256k1.privateKeyVerify(secret)) {
        return;
    }
    const key = secp256k1.publicKeyCreate(secret, true);
    return key;
}

export function addressFromSecretKey(secret: Buffer|string): string|undefined {
    let publicKey = publicKeyFromSecretKey(secret);
    if (publicKey) {
        return addressFromPublicKey(publicKey);
    }
}

export function createKeyPair(): [Buffer, Buffer] {
    let privateKey;

    do {
        privateKey = randomBytes(32);
    } while (!secp256k1.privateKeyVerify(privateKey));

    const key = secp256k1.publicKeyCreate(privateKey, true);
    return [key, privateKey];
}

export function sign(md: Buffer|string, secret: Buffer|string): Buffer {
    if (isString(secret)) {
        secret = Buffer.from(secret, 'hex');
    }
    if (isString(md)) {
        md = Buffer.from(md, 'hex');
    }
    return signBufferMsg(md, secret);
}

export function verify(md: Buffer|string, signature: Buffer, publicKey: Buffer): boolean {
    if (isString(md)) {
        md = Buffer.from(md, 'hex');
    }
    return verifyBufferMsg(md, signature, publicKey);
}

export function isValidAddress(address: string): boolean {
    let buf = base58.decode(address);
    if (buf.length !== 25) {
        return false;
    }
    let br = new BufferReader(buf);
    br.readU8();
    br.readBytes(20);
    try {
        br.verifyChecksum();
    } catch (error) {
        return false;
    }
    
    return true;
}
