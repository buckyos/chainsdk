import { EventEmitter } from 'events';
import * as fs from 'fs-extra';
const assert = require('assert');
import { ErrorCode } from '../error_code';
import {LoggerInstance} from '../lib/logger_util';
import { StorageLogger, LoggedStorage } from './logger';
import { BufferReader } from '../lib/reader';

export interface IReadableKeyValue {
    // 单值操作
    get(key: string): Promise<{ err: ErrorCode, value?: any }>;

    // hash
    hexists(key: string, field: string): Promise<{ err: ErrorCode, value?: boolean}>;
    hget(key: string, field: string): Promise<{ err: ErrorCode, value?: any }>;
    hmget(key: string, fields: string[]): Promise<{ err: ErrorCode, value?: any[] }>;
    hlen(key: string): Promise<{ err: ErrorCode, value?: number }>;
    hkeys(key: string): Promise<{ err: ErrorCode, value?: string[] }>;
    hvalues(key: string): Promise<{ err: ErrorCode, value?: any[] }>;
    hgetall(key: string): Promise<{ err: ErrorCode; value?: {key: string, value: any}[]; }>;

    // array
    lindex(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
    llen(key: string): Promise<{ err: ErrorCode, value?: number }>;
    lrange(key: string, start: number, stop: number): Promise<{ err: ErrorCode, value?: any[] }>;
}

export interface IWritableKeyValue {
    // 单值操作
    set(key: string, value: any): Promise<{ err: ErrorCode }>;
    
    // hash
    hset(key: string, field: string, value: any): Promise<{ err: ErrorCode }>;
    hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode }>;
    hclean(key: string): Promise<{err: ErrorCode}>;
    hdel(key: string, field: string): Promise<{err: ErrorCode}>;
    
    // array
    lset(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;

    lpush(key: string, value: any): Promise<{ err: ErrorCode }>;
    lpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
    lpop(key: string): Promise<{ err: ErrorCode, value?: any }>;

    rpush(key: string, value: any): Promise<{ err: ErrorCode }>;
    rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
    rpop(key: string): Promise<{ err: ErrorCode, value?: any }>;

    linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
    lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
}

export type IReadWritableKeyValue = IReadableKeyValue & IWritableKeyValue;

export interface IReadableDatabase {
    getReadableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadableKeyValue }>;
}

export interface IWritableDatabase {
    createKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}>;
    getReadWritableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadWritableKeyValue }>;
}

export type IReadWritableDatabase = IReadableDatabase & IWritableDatabase;

export interface StorageTransaction {
    beginTransaction(): Promise<ErrorCode>;
    commit(): Promise<ErrorCode>;
    rollback(): Promise<ErrorCode>;
}

export abstract class  IReadableStorage {
    public abstract getReadableDataBase(name: string): Promise<{err: ErrorCode, value?: IReadableDatabase}> ;
}

export abstract class  IReadWritableStorage extends IReadableStorage {
    public abstract createDatabase(name: string): Promise<{ err: ErrorCode, value?: IReadWritableDatabase }>;
    public abstract getReadWritableDatabase(name: string): Promise<{ err: ErrorCode, value?: IReadWritableDatabase }> ;
    public abstract beginTransaction(): Promise<{ err: ErrorCode, value?: StorageTransaction }>;
}

export type StorageOptions = {
    filePath: string, 
    logger: LoggerInstance
};

export abstract class Storage extends IReadWritableStorage {
    protected m_filePath: string;
    protected m_logger: LoggerInstance;
    protected m_storageLogger?: LoggedStorage;
    protected m_eventEmitter: EventEmitter = new EventEmitter();

    constructor(options: StorageOptions) {
        super();
        this.m_filePath = options.filePath;
        this.m_logger = options.logger;
    }   

    protected abstract _createLogger(): StorageLogger;

    public createLogger(logger?: StorageLogger) {
        if (!this.m_storageLogger) {
            if (!logger) {
                logger = this._createLogger();
                logger.init();
            }
            this.m_storageLogger = new LoggedStorage(this, logger);
        }
    }

    public get storageLogger(): StorageLogger|undefined {
        if (this.m_storageLogger) {
            return this.m_storageLogger.logger;
        }
    }

    on(event: 'init', listener: (err: ErrorCode) => any): this;
    on(event: string, listener: (...args: any[]) => void): this {
        this.m_eventEmitter.on(event, listener);
        return this;
    }
    once(event: 'init', listener: (err: ErrorCode) => any): this;
    once(event: string, listener: (...args: any[]) => void): this {
        this.m_eventEmitter.once(event, listener);
        return this;
    }

    public async redo(logBuf: Buffer): Promise<ErrorCode> {
        let logger = this._createLogger();
        let err = logger.decode(new BufferReader(logBuf));
        if (err) {
            return err;
        }
        return logger.redoOnStorage(this);
    }

    get filePath() {
        return this.m_filePath;
    }

    public abstract get isInit(): boolean;

    public abstract init(readonly?: boolean): Promise<ErrorCode>;

    public abstract uninit(): Promise<ErrorCode>;

    public async reset(): Promise<ErrorCode> {
        const err = await this.remove();
        if (err) {
            return err;
        }
        return await this.init();
    }

    public async remove(): Promise<ErrorCode> {
        await this.uninit();
        try {
            this.m_logger.debug(`about to remove storage file `, this.m_filePath);
            fs.removeSync(this.m_filePath);
        } catch (e) {
            this.m_logger.error(`remove storage ${this.m_filePath} failed `, e);
            return ErrorCode.RESULT_EXCEPTION;
        }
        return ErrorCode.RESULT_OK;
    }

    public messageDigest(): Promise<{ err: ErrorCode, value?: ByteString }> {
        return Promise.resolve({err: ErrorCode.RESULT_NOT_SUPPORT});
    }

    static keyValueNameSpec = '#';

    static getKeyValueFullName(dbName: string, kvName: string): string {
        return `${dbName}${this.keyValueNameSpec}${kvName}`;
    }

    static checkDataBaseName(name: string): ErrorCode {
        if (Storage.splitFullName(name).dbName) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        return ErrorCode.RESULT_OK;
    }

    static checkTableName(name: string): ErrorCode {
        if (Storage.splitFullName(name).dbName) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        return ErrorCode.RESULT_OK;
    }

    static splitFullName(fullName: string): {dbName?: string, kvName?: string, sqlName?: string} {
        let i = fullName.indexOf(this.keyValueNameSpec);
        if (i > 0) {
            let dbName = fullName.substr(0, i);
            let kvName = fullName.substr(i + 1);
            return {
                dbName,
                kvName
            };
        }
        return {};
    }

    public async getKeyValue(dbName: string, kvName: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}> {
        let err = Storage.checkDataBaseName(dbName);
        if (err) {
            return {err};
        }
        err = Storage.checkTableName(dbName);
        if (err) {
            return {err};
        }
        let dbr = await this.getReadWritableDatabase(dbName);
        if (dbr.err) {
            return {err: dbr.err};
        }
        return dbr.value!.getReadWritableKeyValue(kvName);
    }

    public async getTable(fullName: string): Promise<{ err: ErrorCode, kv?: IReadWritableKeyValue }> {
        let names = Storage.splitFullName(fullName);
        if (!names.dbName) {
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        let dbr = await this.getReadWritableDatabase(names.dbName);
        if (dbr.err) {
            return {err: dbr.err};
        }
        if (names.kvName) {
            return dbr.value!.getReadWritableKeyValue(names.kvName);
        } else {
            assert(false, `invalid fullName ${fullName}`);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }
}