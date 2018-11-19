import { ErrorCode } from '../error_code';
import {StorageLogger} from './logger';
import {BufferReader, BufferWriter, toEvalText} from '../serializable';
import {StorageTransaction, IReadWritableKeyValue, IReadWritableStorage, IWritableDatabase} from './storage';

class TransactionLogger implements StorageTransaction {
    constructor(private owner: JStorageLogger) {

    }

    async beginTransaction(): Promise<ErrorCode> {
        this.owner.appendLog(`{let trans = (await storage.beginTransaction()).value;`);
        return ErrorCode.RESULT_OK;
    }

    async commit(): Promise<ErrorCode> {
        this.owner.appendLog(`await trans.commit();}`);
        return ErrorCode.RESULT_OK;
    }

    async rollback(): Promise<ErrorCode> {
        this.owner.appendLog(`await trans.rollback();}`);
        return ErrorCode.RESULT_OK;
    }
}

class KeyValueLogger implements IReadWritableKeyValue {
    constructor(private owner: JStorageLogger, private name: string) {
        
    }

    get(key: string): Promise<{ err: ErrorCode, value?: any }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    hexists(key: string, field: string): Promise<{err: ErrorCode, value?: boolean}> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    hget(key: string, field: string): Promise<{ err: ErrorCode, value?: any }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    hmget(key: string, fields: string[]): Promise<{ err: ErrorCode, value?: any[] }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    hlen(key: string): Promise<{ err: ErrorCode, value?: number }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    hkeys(key: string): Promise<{ err: ErrorCode, value?: string[] }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    hvalues(key: string): Promise<{ err: ErrorCode, value?: any[] }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    hgetall(key: string): Promise<{ err: ErrorCode; value?: any[]; }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    lindex(key: string, index: number): Promise<{ err: ErrorCode, value?: any }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    llen(key: string): Promise<{ err: ErrorCode, value?: number }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    lrange(key: string, start: number, stop: number): Promise<{ err: ErrorCode, value?: any[] }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }
    
    async set(key: string, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.set(${toEvalText(key)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    
    // hash
    async hset(key: string, field: string, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.hset(${toEvalText(key)}, ${toEvalText(field)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.hmset(${toEvalText(key)}, ${toEvalText(fields)}, ${toEvalText(values)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async hclean(key: string): Promise<{err: ErrorCode}> {
        this.owner.appendLog(`await ${this.name}.hclean(${toEvalText(key)});`);
        return {err: ErrorCode.RESULT_OK};
    }

    public async hdel(key: string, field: string): Promise<{err: ErrorCode}> {
        this.owner.appendLog(`await ${this.name}.hdel(${toEvalText(key)},${toEvalText(field)});`);
        return {err: ErrorCode.RESULT_OK };
    }
    
    // array
    async lset(key: string, index: number, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.lset(${toEvalText(key)}, ${index}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }

    async lpush(key: string, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.lpush(${toEvalText(key)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async lpushx(key: string, value: any[]): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.lpushx(${toEvalText(key)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async lpop(key: string): Promise<{ err: ErrorCode, value?: any }> {
        this.owner.appendLog(`await ${this.name}.lpop(${toEvalText(key)});`);
        return {err: ErrorCode.RESULT_OK};
    }

    async rpush(key: string, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.rpush(${toEvalText(key)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.rpushx(${toEvalText(key)}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async rpop(key: string): Promise<{ err: ErrorCode, value?: any }> {
        this.owner.appendLog(`await ${this.name}.rpop(${toEvalText(key)});`);
        return {err: ErrorCode.RESULT_OK};
    }

    async linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode }> {
        this.owner.appendLog(`await ${this.name}.linsert(${toEvalText(key)}, ${index}, ${toEvalText(value)});`);
        return {err: ErrorCode.RESULT_OK};
    }
    async lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }> {
        this.owner.appendLog(`await ${this.name}.lremove(${toEvalText(key)}, ${index});`);
        return {err: ErrorCode.RESULT_OK};
    }
}

class DatabaseLogger implements IWritableDatabase {
    constructor(readonly owner: JStorageLogger, readonly name: string) {

    }

    private m_nextVal: number = 0;

    private _kvVal(): string {
        let val = `${this.name}kv${this.m_nextVal}`;
        ++this.m_nextVal;
        return val;
    }

    async createKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}> {
        let val = this._kvVal();
        this.owner.appendLog(`let ${val} = (await ${this.name}.createKeyValue(${JSON.stringify(name)})).kv;`);
        return {err: ErrorCode.RESULT_OK, kv: new KeyValueLogger(this.owner, val)};
    }

    async getReadWritableKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}> {
        let val = this._kvVal();
        this.owner.appendLog(`let ${val} = (await ${this.name}.getReadWritableKeyValue(${JSON.stringify(name)})).kv;`);
        return {err: ErrorCode.RESULT_OK, kv: new KeyValueLogger(this.owner, val)};
    }
}

export class JStorageLogger implements StorageLogger {
    constructor() {
        this.m_log = '';
    }
    private m_log: string = '';
    private m_nextVal: number = 0;

    private _dbVal(): string {
        let val = `db${this.m_nextVal}`;
        ++this.m_nextVal;
        return val;
    }

    get log(): string {
        return this.m_log!;
    }

    redoOnStorage(storage: IReadWritableStorage): Promise<ErrorCode> {
        return new Promise((resolve) => {
            eval(this.m_log);
        });
    }

    encode(writer: BufferWriter): ErrorCode {
        writer.writeVarString(this.m_log);
        return ErrorCode.RESULT_OK;
    }

    decode(reader: BufferReader): ErrorCode {
        this.m_log = reader.readVarString();
        return ErrorCode.RESULT_OK;
    }

    init(): any {
        this.m_log = `const BigNumber = require('bignumber.js');async function redo() {`;
    }

    finish() {
        this.appendLog('}; redo().then(()=>{resolve(0);})');
    }

    appendLog(log: string) {
        this.m_log += log;
    }

    async createDatabase(name: string): Promise <{err: ErrorCode, value?: IWritableDatabase}> {
        let val = this._dbVal();
        this.appendLog(`let ${val} = (await storage.createDatabase(${JSON.stringify(name)})).value;`);
        return {err: ErrorCode.RESULT_OK, value: new DatabaseLogger(this, val)};
    }

    async getReadWritableDatabase(name: string): Promise <{err: ErrorCode, value?: IWritableDatabase}> {
        let val = this._dbVal();
        this.appendLog(`let ${val} = (await storage.getReadWritableDatabase(${JSON.stringify(name)})).value;`);
        return {err: ErrorCode.RESULT_OK, value: new DatabaseLogger(this, val)};
    }

    async beginTransaction(): Promise<{ err: ErrorCode, value: StorageTransaction }> {
        return {err: ErrorCode.RESULT_OK, value: new TransactionLogger(this)};
    }
}