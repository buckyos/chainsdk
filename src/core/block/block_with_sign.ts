import * as assert from 'assert';

import { ErrorCode } from '../error_code';
import * as Address from '../address';

import { Encoding } from '../lib/encoding';
import { BufferWriter } from '../lib/writer';
import { BufferReader } from '../lib/reader';
import * as digest from '../lib/digest';

import { BlockHeader } from './block'; 

export function instance(superClass: new(...args: any[]) => BlockHeader) {
    return class extends superClass {
        constructor(...args: any[]) {
            super(args[0]);
        }
        
        // Uint8Array(33)
        private m_pubkey: Buffer = Encoding.ZERO_KEY;
        // Uint8Array(64)
        private m_sign: Buffer = Encoding.ZERO_SIG64;
    
        get pubkey(): Buffer {
            return this.m_pubkey;
        }

        set pubkey(k: Buffer) {
            this.m_pubkey = k;
        }

        get miner(): string {
            return Address.addressFromPublicKey(this.m_pubkey)!;
        }

        public encode(writer: BufferWriter): ErrorCode {
            try {
                writer.writeBytes(this.m_sign);
            } catch (e) {
                return ErrorCode.RESULT_INVALID_FORMAT;
            }
            return super.encode(writer);
        }
    
        public decode(reader: BufferReader): ErrorCode {
            this.m_sign = reader.readBytes(64);
            return super.decode(reader);
        }

        protected _encodeHashContent(writer: BufferWriter): ErrorCode {
            let err = super._encodeHashContent(writer);
            if (err) {
                return err;
            }
            try {
                writer.writeBytes(this.m_pubkey);
            } catch (e) {
                return ErrorCode.RESULT_INVALID_FORMAT;
            }
            
            return ErrorCode.RESULT_OK;
        }

        protected _decodeHashContent(reader: BufferReader): ErrorCode {
            let err: ErrorCode = super._decodeHashContent(reader);
            if (err !== ErrorCode.RESULT_OK) {
                return err;
            }
            this.m_pubkey = reader.readBytes(33);
            return ErrorCode.RESULT_OK;
        }

        public signBlock(secret: Buffer): ErrorCode {
            this.m_pubkey = Address.publicKeyFromSecretKey(secret) as Buffer;
            let writer = new BufferWriter();
            let err = this._encodeSignContent(writer);
            if (err) {
                return err;
            }
            let content;
            try {
                content = writer.render();
            } catch (e) {
                return ErrorCode.RESULT_INVALID_FORMAT;
            }
            let signHash = digest.hash256(content);
            this.m_sign = Address.signBufferMsg(signHash, secret);
            return ErrorCode.RESULT_OK;
        }

        protected _encodeSignContent(writer: BufferWriter): ErrorCode {
            let err = super._encodeHashContent(writer);
            if (err) {
                return err;
            }
            try {
                writer.writeBytes(this.m_pubkey);
            } catch (e) {
                return ErrorCode.RESULT_INVALID_FORMAT;
            }
            
            return ErrorCode.RESULT_OK;
        }

        protected _verifySign(): boolean {
            let writer = new BufferWriter();
            this._encodeSignContent(writer);
            let signHash = digest.hash256(writer.render());
            return Address.verifyBufferMsg(signHash, this.m_sign, this.m_pubkey);
        }

        public stringify(): any { 
            let obj = super.stringify();
            obj.creator = Address.addressFromPublicKey(this.m_pubkey);
            return obj;
        }
    };
}
