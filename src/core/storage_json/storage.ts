import * as assert from 'assert';
import * as fs from 'fs-extra';
import * as path from 'path';

import { ErrorCode } from '../error_code';
import { deepCopy, toStringifiable, fromStringifiable } from '../serializable';
import {Storage, IReadWritableDatabase, IReadableDatabase, IReadWritableKeyValue, StorageTransaction, JStorageLogger} from '../storage';
import { LoggerInstance } from '../lib/logger_util';
import * as digest from '../lib/digest';
import { isNullOrUndefined, isUndefined } from 'util';

class JsonStorageKeyValue implements IReadWritableKeyValue {
    private m_root: any;
    constructor(dbRoot: any, readonly name: string, private readonly logger: LoggerInstance) { 
        this.m_root = dbRoot[name];
    }

    get root(): any {
        const r = this.m_root;
        return r;
    }

    public async set(key: string, value: any): Promise<{ err: ErrorCode }> {
        try {
            assert(key);
            this.m_root[key] = deepCopy(value);
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`set ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async get(key: string): Promise<{ err: ErrorCode, value?: any }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key]) };
        } catch (e) {
            this.logger.error(`get ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hset(key: string, field: string, value?: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            assert(field);
            if (!this.m_root[key]) {
                this.m_root[key] = Object.create(null);
            }
            this.m_root[key][field] = deepCopy(value);
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`hset ${key} ${field} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hget(key: string, field: string): Promise<{ err: ErrorCode; value?: any; }> {
        try {   
            assert(key);
            assert(field);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key][field]) };
        } catch (e) {
            this.logger.error(`hget ${key} ${field} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hdel(key: string, field: string): Promise<{err: ErrorCode}> {
        try {
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            delete this.m_root[key][field];
            return {err: ErrorCode.RESULT_OK};   
        } catch (e) {
            this.logger.error(`hdel ${key} ${field} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hlen(key: string): Promise<{ err: ErrorCode; value?: number; }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]).length };   
        } catch (e) {
            this.logger.error(`hlen ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hexists(key: string, field: string): Promise<{ err: ErrorCode, value?: boolean}> {
        try {
            assert(key);
            assert(field);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: !isUndefined(this.m_root[key][field]) };
        } catch (e) {
            this.logger.error(`hexsits ${key} ${field}`, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            assert(fields.length === values.length);
            if (!this.m_root[key]) {
                this.m_root[key] = Object.create(null);
            }

            for (let ix = 0; ix < fields.length; ++ix) {
                this.m_root[key][fields[ix]] = deepCopy(values[ix]);
            }
            return { err: ErrorCode.RESULT_OK };   
        } catch (e) {
            this.logger.error(`hmset ${key} ${fields} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hmget(key: string, fields: string[]): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            let values: any[] = [];
            for (let f of fields) {
                values.push(deepCopy(this.m_root[key][f]));
            }
            return { err: ErrorCode.RESULT_OK, value: values };  
        } catch (e) {
            this.logger.error(`hmget ${key} ${fields} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hkeys(key: string): Promise<{ err: ErrorCode; value?: string[]; }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]) };
        } catch (e) {
            this.logger.error(`hkeys ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hvalues(key: string): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return { err: ErrorCode.RESULT_OK, value: Object.values(this.m_root[key]).map((x) => deepCopy(x)) };
        } catch (e) {
            this.logger.error(`hvalues ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        
    }

    public async hgetall(key: string): Promise<{ err: ErrorCode; value?: {key: string, value: any}[]; }> {
        try {
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return {
                err: ErrorCode.RESULT_OK, value: Object.keys(this.m_root[key]).map((x) => {
                    return { key: x, value: deepCopy(this.m_root[key][x]) };
                })
            };
        } catch (e) {
            this.logger.error(`hgetall ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hclean(key: string): Promise<{err: ErrorCode}> {
        try {
            delete this.m_root[key];
            return {err: ErrorCode.RESULT_OK}; 
        } catch (e) {
            this.logger.error(`hclean ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lindex(key: string, index: number): Promise<{ err: ErrorCode; value?: any; }> {
        try {
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return {err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key][index]) };
        } catch (e) {
            this.logger.error(`lindex ${key} ${index}`, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lset(key: string, index: number, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            this.m_root[key][index] = deepCopy(value);
            return {err: ErrorCode.RESULT_OK};
        } catch (e) {
            this.logger.error(`lset ${key} ${index} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        
    }

    public async llen(key: string): Promise<{ err: ErrorCode; value?: number; }> {
        try {
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            return {err: ErrorCode.RESULT_OK, value: this.m_root[key].length};
        } catch (e) {
            this.logger.error(`llen ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION}; 
        }
    }

    public async lrange(key: string, start: number, stop: number): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
            if (isUndefined(this.m_root[key])) {
                return { err: ErrorCode.RESULT_NOT_FOUND};
            }
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            if (!len) {
                return {err: ErrorCode.RESULT_OK, value: []};
            }
            if (start < 0) {
                start = len! + start;
            }
            if (stop < 0) {
                stop = len! + stop;
            }
            if (stop >= len) {
                stop = len - 1;
            }
            
            return { err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key].slice(start, stop + 1)) };
        } catch (e) {
            this.logger.error(`lrange ${key} ${start} ${stop}`, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpush(key: string, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].unshift(deepCopy(value));
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lpush ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpushx(key: string, value: any[]): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].unshift(...value.map((e) => deepCopy(e)));
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpop(key: string): Promise<{ err: ErrorCode; value?: any; }> {
        try {
            assert(key);
            if (this.m_root[key] && this.m_root[key].length > 0) {
                return {err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key].shift())};
            } else {
                return {err: ErrorCode.RESULT_NOT_FOUND};
            }
        } catch (e) {
            this.logger.error(`lpop ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpush(key: string, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].push(deepCopy(value));
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`rpush ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }> {
        try {
            assert(key);
            if (!this.m_root[key]) {
                this.m_root[key] = [];
            }
            this.m_root[key].push(...value.map((e) => deepCopy(e)));
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpop(key: string): Promise<{ err: ErrorCode; value?: any; }> {
        try {
            assert(key);
            if (this.m_root[key] && this.m_root[key].length > 0) {
                return {err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key].pop())};
            } else {
                return {err: ErrorCode.RESULT_NOT_FOUND};
            }
        } catch (e) {
            this.logger.error(`rpop ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            this.m_root[key].splice(index, 0, deepCopy(value));
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`linsert ${key} ${index} `, value, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }> {
        try {
            assert(key);
            return { err: ErrorCode.RESULT_OK, value: deepCopy(this.m_root[key].splice(index, 1)[0]) };
        } catch (e) {
            this.logger.error(`lremove ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }
}

class JsonReadableDatabase implements IReadableDatabase {
    protected m_root: any; 
    constructor(storageRoot: any, protected readonly name: string, protected readonly logger: LoggerInstance) {
        this.m_root = storageRoot[name];
    }

    get root(): any {
        const r = this.m_root;
        return r;
    }

    public async getReadableKeyValue(name: string) {
        const err = Storage.checkTableName(name);
        if (err) {
            return {err};
        }
        let tbl = new JsonStorageKeyValue(this.m_root!, name, this.logger);
        return { err: ErrorCode.RESULT_OK, kv: tbl };
    }
}

class JsonReadWritableDatabase extends JsonReadableDatabase implements IReadWritableDatabase {
    constructor(...args: any[]) {
        super(args[0], args[1], args[2]);
    }

    public async getReadWritableKeyValue(name: string) {
        let err = Storage.checkTableName(name);
        if (err) {
            return {err};
        }
        let tbl = new JsonStorageKeyValue(this.m_root!, name, this.logger);
        return { err: ErrorCode.RESULT_OK, kv: tbl };
    }

    public async createKeyValue(name: string) {
        let err = Storage.checkTableName(name);
        if (err) {
            return {err};
        }
        if (!isNullOrUndefined(this.m_root[name])) {
            err = ErrorCode.RESULT_ALREADY_EXIST;
        } else {
            this.m_root[name] = Object.create(null);
            err = ErrorCode.RESULT_OK;
        }
        
        let tbl = new JsonStorageKeyValue(this.m_root, name, this.logger);
        return { err, kv: tbl };
    }   
}

class JsonStorageTransaction implements StorageTransaction {
    protected m_storageRoot: any;
    protected m_transactionRoot: any;

    constructor(storageRoot: any) {
        this.m_transactionRoot = deepCopy(storageRoot);
        this.m_storageRoot = storageRoot;
    }

    public async beginTransaction(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async commit(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async rollback(): Promise<ErrorCode> {
        for (const k of Object.keys(this.m_storageRoot)) {
            delete this.m_storageRoot[k];
        }
        Object.assign(this.m_storageRoot, this.m_transactionRoot);
        return ErrorCode.RESULT_OK;
    }
}

export class JsonStorage extends Storage {
    private m_isInit: boolean = false;
    private m_root: any;

    get root(): any {
        const r = this.m_root;
        return r;
    }

    protected _createLogger(): JStorageLogger {
        return new JStorageLogger();
    }

    public get isInit(): boolean {
        return this.m_isInit;
    }

    public async init(readonly?: boolean): Promise<ErrorCode> {
        if (this.m_root) {
            return ErrorCode.RESULT_SKIPPED;
        }
        assert(!this.m_root);
        fs.ensureDirSync(path.dirname(this.m_filePath));
        let options: any = {};
        let err = ErrorCode.RESULT_OK;
        if (fs.existsSync(this.m_filePath)) {
            try {
                const root = fs.readJSONSync(this.m_filePath);
                this.m_root = fromStringifiable(root);
            } catch (e) {
                err = ErrorCode.RESULT_EXCEPTION;
            }
        } else {
            this.m_root = Object.create(null);
        }
       
        if (!err) {
            this.m_isInit = true;
        }
        
        setImmediate(() => {
            this.m_eventEmitter.emit('init', err);
        }); 

        return err;
    }

    public async uninit(): Promise<ErrorCode> {
        await this.flush();
        if (this.m_root) {
            delete this.m_root;
        }

        return ErrorCode.RESULT_OK;
    }

    public async messageDigest(): Promise<{ err: ErrorCode, value?: ByteString }> {
        try {
            const raw = JSON.stringify(this.m_root, undefined, 4);
            let hash = digest.hash256(Buffer.from(raw, 'utf8')).toString('hex');
            return { err: ErrorCode.RESULT_OK, value: hash };
        }   catch (e) {
            this.m_logger.error('json storage messagedigest exception ', e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async getReadableDataBase(name: string) {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, value: new JsonReadableDatabase(this.m_root, name, this.m_logger)};
    }

    public async createDatabase(name: string): Promise<{err: ErrorCode, value?: IReadWritableDatabase}> {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        if (isUndefined(this.m_root[name])) {
            this.m_root[name] = Object.create(null);
        }
        return {err: ErrorCode.RESULT_OK, value: new JsonReadWritableDatabase(this.m_root, name, this.m_logger)};
    }

    public async getReadWritableDatabase(name: string) {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, value: new JsonReadWritableDatabase(this.m_root, name, this.m_logger)};
    }

    public async beginTransaction(): Promise<{ err: ErrorCode, value: StorageTransaction }> {
        let transcation = new JsonStorageTransaction(this.m_root);

        await transcation.beginTransaction();

        return { err: ErrorCode.RESULT_OK, value: transcation };
    }

    public async flush(root?: any) {
        if (root) {
            this.m_root = root;
        }
        const s = toStringifiable(this.m_root, true);
        await fs.writeJSON(this.m_filePath, s, {spaces: 4, flag: 'w'});
    }
    
}