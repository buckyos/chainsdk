import { BlockHeader } from '../chain';
import { BufferWriter } from '../lib/writer';
import { BufferReader } from '../lib/reader';
import { ErrorCode } from '../error_code';

export class ValueBlockHeader extends BlockHeader {
    constructor() {
        super();
        this.m_coinbase = '';
    }

    private m_coinbase: string;

    get coinbase(): string {
        return this.m_coinbase;
    }

    set coinbase(coinbase: string) {
        this.m_coinbase = coinbase;
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeVarString(this.m_coinbase);
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
        try {
            this.m_coinbase = reader.readVarString('utf-8');
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public stringify(): any {
        let obj = super.stringify();
        obj.coinbase = this.coinbase;
        return obj;
    }
}