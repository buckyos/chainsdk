import { BufferReader, BufferWriter, Serializable, ErrorCode, SerializableWithHash, toStringifiable, fromStringifiable } from '../serializable';
import { Encoding } from '../lib/encoding';
import * as Address from '../address';
import { isString, isBuffer } from 'util';

export class Transaction extends SerializableWithHash {
    private m_publicKey: Buffer;
    private m_signature: Buffer;
    private m_method: string;
    private m_nonce: number;
    private m_input?: any;

    constructor() {
        super();
        this.m_publicKey = Encoding.ZERO_KEY;
        this.m_signature = Encoding.ZERO_SIG64;
        this.m_method = '';
        this.m_nonce = -1;
    }

    get address(): string | undefined {
        return Address.addressFromPublicKey(this.m_publicKey);
    }

    get method(): string {
        return this.m_method;
    }

    set method(s: string) {
        this.m_method = s;
    }

    get nonce(): number {
        return this.m_nonce;
    }

    set nonce(n: number) {
        this.m_nonce = n;
    }

    get input() {
        const input = this.m_input;
        return input;
    }

    set input(i: any) {
        this.m_input = i;
    }
    
    /**
     *  virtual验证交易的签名段
     */
    public verifySignature(): boolean {
        if (!this.m_publicKey) {
            return false;
        }
        return Address.verify(this.m_hash, this.m_signature, this.m_publicKey);
    }

    public sign(privateKey: Buffer|string) {
        let pubkey = Address.publicKeyFromSecretKey(privateKey);
        this.m_publicKey = pubkey!;
        this.updateHash();
        this.m_signature = Address.sign(this.m_hash, privateKey);
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        try {
            writer.writeVarString(this.m_method);
            writer.writeU32(this.m_nonce);
            writer.writeBytes(this.m_publicKey);
            this._encodeInput(writer);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public encode(writer: BufferWriter): ErrorCode {
        let err = super.encode(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeBytes(this.m_signature);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        try {
            this.m_method = reader.readVarString();
            this.m_nonce = reader.readU32();
            this.m_publicKey = reader.readBytes(33, false);
            this._decodeInput(reader);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        let err = super.decode(reader);
        if (err) {
            return err;
        }
        try {
            this.m_signature = reader.readBytes(64, false);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    protected _encodeInput(writer: BufferWriter): BufferWriter {
        let input: string;
        if (this.m_input) {
            input = JSON.stringify(toStringifiable(this.m_input, true));
        } else {
            input = JSON.stringify({});
        }
        writer.writeVarString(input);
        return writer;
    }

    protected _decodeInput(reader: BufferReader): ErrorCode {
        this.m_input = fromStringifiable(JSON.parse(reader.readVarString()));
        return ErrorCode.RESULT_OK;
    }

    stringify(): any {
        let obj = super.stringify();
        obj.method = this.method;
        obj.input = this.input;
        obj.nonce = this.nonce;
        obj.caller = this.address;
        return obj;
    }

    static fromRaw(raw: string|Buffer, T: new () => Transaction): Transaction|undefined {
        let buffer: Buffer;
        if (isString(raw)) {
            buffer = Buffer.from(raw, 'hex');
        } else if (isBuffer(raw)) {
            buffer = raw;
        } else {
            return undefined;
        }
        let tx = new T();
        let err = tx.decode(new BufferReader(buffer));
        if (err) {
            return undefined;
        }
        return tx;
    }
}

export class EventLog implements Serializable {
    private m_event: string;
    private m_params?: any;
    constructor() {
        this.m_event = '';
    }

    set name(n: string) {
        this.m_event = n;
    }

    get name(): string {
        return this.m_event;
    }

    set param(p: any) {
        this.m_params = p;
    }

    get param(): any {
        const param = this.m_params;
        return param;
    }

    public encode(writer: BufferWriter): ErrorCode {
        let input: string;
        try {
            if (this.m_params) {
                input = JSON.stringify(toStringifiable(this.m_params, true));  
            } else {
                input = JSON.stringify({});
            }
            writer.writeVarString(input);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        try {
            this.m_params = fromStringifiable(JSON.parse(reader.readVarString()));
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    stringify(): any {
        let obj = Object.create(null);
        obj.name = this.name;
        obj.param = this.param;
        return obj;
    }
}

export class Receipt implements Serializable {
    private m_transactionHash: string;
    private m_returnCode: number;
    private m_eventLogs: EventLog[];
    constructor() {
        this.m_transactionHash = '';
        this.m_returnCode = 0;
        this.m_eventLogs = new Array<EventLog>();
    }

    set transactionHash(s: string) {
        this.m_transactionHash = s;
    }
    get transactionHash(): string {
        return this.m_transactionHash;
    }

    set returnCode(n: number) {
        this.m_returnCode = n;
    }

    get returnCode(): number {
        return this.m_returnCode;
    }

    set eventLogs(logs: EventLog[]) {
        this.m_eventLogs = logs;
    }

    get eventLogs(): EventLog[] {
        const l = this.m_eventLogs;
        return l;
    }

    public encode(writer: BufferWriter): ErrorCode {
        try {
            writer.writeVarString(this.m_transactionHash);
            writer.writeI32(this.m_returnCode);
            writer.writeU16(this.m_eventLogs.length);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        for (let log of this.m_eventLogs) {
            let err = log.encode(writer);
            if (err) {
                return err;
            }
        }

        return ErrorCode.RESULT_OK;
    }

    public decode(reader: BufferReader): ErrorCode {
        try {
            this.m_transactionHash = reader.readVarString();
            this.m_returnCode = reader.readI32();
            let nCount: number = reader.readU16();
            for (let i = 0; i < nCount; i++) {
                let log: EventLog = new EventLog();
                let err = log.decode(reader);
                if (err) {
                    return err;
                }
                this.m_eventLogs.push(log);
            }
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }

        return ErrorCode.RESULT_OK;
    }

    stringify(): any {
        let obj = Object.create(null);
        obj.transactionHash = this.m_transactionHash;
        obj.returnCode = this.m_returnCode;
        obj.logs = [];
        for (let l of this.eventLogs) {
            obj.logs.push(l.stringify());
        }
        return obj;
    }
}
