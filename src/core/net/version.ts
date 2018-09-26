import {ErrorCode} from '../error_code';
import { BufferReader } from '../lib/reader';
import { BufferWriter } from '../lib/writer';
import { write } from 'fs-extra';

let MAIN_VERSION: string = '1.2.3.4';

export class Version {
    protected m_mainVersion: string;
    protected m_timestamp: number;
    protected m_peerid: string;
    protected m_genesis: string = '';
    protected m_random: number;
    
    constructor() {
        this.m_mainVersion = MAIN_VERSION;
        this.m_timestamp = Date.now();
        this.m_peerid = '';
        this.m_random = 1000000 * Math.random();
    }

    compare(other: Version): number {
        if (this.m_timestamp > other.m_timestamp) {
            return 1;
        } else if (this.m_timestamp < other.m_timestamp) {
            return -1;
        }
        if (this.m_random > other.m_random) {
            return 1;
        } else if (this.m_random > other.m_random) {
            return -1;
        }
        return 0;
    }

    set mainversion(v: string) {
        this.m_mainVersion = v;
    }

    get mainversion(): string {
        return this.m_mainVersion;
    }

    get timestamp(): number {
        return this.m_timestamp;
    }

    set genesis(genesis: string) {
        this.m_genesis = genesis;
    }

    get genesis(): string {
        return this.m_genesis;
    }

    set peerid(p: string) {
        this.m_peerid = p;
    }

    get peerid(): string {
        return this.m_peerid;
    }

    public decode(reader: BufferReader): ErrorCode {
        try {
            this.m_timestamp =  reader.readU64();
            this.m_peerid = reader.readVarString();
            this.m_genesis = reader.readVarString();
            this.m_mainVersion = reader.readVarString();
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public encode(writer: BufferWriter): ErrorCode {
        try {
            writer.writeU64(this.m_timestamp);
            writer.writeVarString(this.m_peerid);
            writer.writeVarString(this.m_genesis);
            writer.writeVarString(this.m_mainVersion);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    public isSupport(): boolean {
        return true;
    }
}