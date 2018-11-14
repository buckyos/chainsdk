import * as assert from 'assert';

import { ErrorCode } from '../error_code';

import {BlockWithSign, ValueBlockHeader, } from '../value_chain';
import * as libAddress from '../address';
import { DbftChain } from './chain';
import {BufferWriter} from '../lib/writer';
import {BufferReader} from '../lib/reader';
import { DbftContext } from './context';

export type DbftBlockHeaderSignature =   {
    pubkey: Buffer, sign: Buffer
};

export class DbftBlockHeader extends BlockWithSign(ValueBlockHeader) {
    // 签名部分不进入hash计算
    protected m_dbftSigns: DbftBlockHeaderSignature[] = [];
    protected m_view: number = 0;

    set view(v: number) {
        this.m_view = v;
    }

    get view(): number {
        return this.m_view;
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeU32(this.m_view);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        
        return ErrorCode.RESULT_OK;
    } 

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        let err = super._decodeHashContent(reader);
        if (err) {
            return err;
        }
        try {
            this.m_view = reader.readU32();
        } catch (e) {
            return ErrorCode.RESULT_EXCEPTION;
        }
        return ErrorCode.RESULT_OK;
    }

    public encode(writer: BufferWriter): ErrorCode {
        let err = super.encode(writer);
        if (err) {
            return err;
        }
        writer.writeU16(this.m_dbftSigns.length);
        for (let s of this.m_dbftSigns) {
            writer.writeBytes(s.pubkey);
            writer.writeBytes(s.sign);
        }
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        let err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            let n: number = reader.readU16();
            for (let i = 0; i < n; i++) {
                let pubkey: Buffer = reader.readBytes(33);
                let sign: Buffer = reader.readBytes(64);
                this.m_dbftSigns.push({pubkey, sign});
            }
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public setSigns(signs: DbftBlockHeaderSignature[]) {
        this.m_dbftSigns = [];
        this.m_dbftSigns.push(...signs);
    }

    public verifySign(): boolean {
        return this._verifySign();
    }

    public async verify(chain: DbftChain): Promise<{ err: ErrorCode, valid?: boolean }> {
        // 从某个设施验证pubkey是否在列表中,是否轮到这个节点出块
        return await this._verifySigns(chain);
    }

    private async _verifySigns(chain: DbftChain): Promise<{ err: ErrorCode, valid?: boolean }> {
        let gm = await chain.dbftHeaderStorage.getMiners(this);
        if (gm.err) {
            return {err: gm.err};
        }
        let gdr = await chain.dbftHeaderStorage.getDueMiner(this, gm.miners!);
        if (gdr.err) {
            return {err: gdr.err};
        }
        if (this.miner !== gdr.miner!) {
            return {err: ErrorCode.RESULT_OK, valid: false};
        }
        let miners = new Set(gm.miners!);
        let verified = new Set();
        for (let s of this.m_dbftSigns) {
            let address = libAddress.addressFromPublicKey(s.pubkey)!;
            if (miners.has(address) && !verified.has(address)) {
                if (libAddress.verify(this.hash, s.sign, s.pubkey)) {
                    verified.add(address);
                }
            }
        }
        const valid = DbftContext.isAgreeRateReached(chain.globalOptions, miners.size, verified.size);
        return {err: ErrorCode.RESULT_OK, valid};
    }

    public stringify(): any {
        let obj = super.stringify();
        obj.view = this.m_view;
        return obj;
    }
}