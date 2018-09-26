import { BigNumber } from 'bignumber.js';
import {Transaction, Receipt} from '../chain';
import { BufferWriter, BufferReader, ErrorCode } from '../serializable';

export class ValueTransaction extends Transaction {
    constructor() {
        super();
        this.m_value = new BigNumber(0);
        this.m_fee = new BigNumber(0);
    }

    private m_value: BigNumber;
    private m_fee: BigNumber;

    get value(): BigNumber {
        return this.m_value;
    }

    set value(value: BigNumber) {
        this.m_value = value;
    }

    get fee(): BigNumber {
        return this.m_fee;
    }
   
    set fee(value: BigNumber) {
        this.m_fee = value;
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        writer.writeBigNumber(this.m_value);
        writer.writeBigNumber(this.m_fee);
        return ErrorCode.RESULT_OK;
    }

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        let err = super._decodeHashContent(reader);
        if (err) {
            return err;
        }
        try {
            this.m_value = reader.readBigNumber();
            this.m_fee = reader.readBigNumber();
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }

        return ErrorCode.RESULT_OK;
    }

    stringify(): any {
        let obj = super.stringify();
        obj.value = this.value.toString();
        obj.fee = this.fee.toString();
        return obj;
    }
}

export class ValueReceipt extends Receipt {
    private m_cost: BigNumber;
    constructor() {
        super();    
        this.m_cost = new BigNumber(0);
    }

    get cost(): BigNumber {
        const b = this.m_cost;
        return b;
    }

    set cost(c: BigNumber) {
        this.m_cost = c;
    }

    public encode(writer: BufferWriter): ErrorCode {
        const err = super.encode(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeBigNumber(this.m_cost);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        const err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            this.m_cost = reader.readBigNumber();
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    stringify(): any {
        let obj = super.stringify();
        obj.cost = this.m_cost.toString();
        return obj;
    }
 }