import {ErrorCode} from '../error_code';
import {Serializable} from '../serializable';
import {Storage, StorageTransaction, IReadWritableDatabase, IWritableDatabase, IWritableKeyValue, IReadWritableStorage, IReadWritableKeyValue} from './storage';

export interface IStorageLogger {
    init(): any;
    finish(): void;

    redoOnStorage(storage: IReadWritableStorage): Promise<ErrorCode>; 

    beginTransaction(): Promise<{ err: ErrorCode, value?: StorageTransaction }>;
    createDatabase(name: string): Promise <{err: ErrorCode, value?: IWritableDatabase}>;
    getReadWritableDatabase(name: string): Promise <{err: ErrorCode, value?: IWritableDatabase}>;
}

export type StorageLogger = IStorageLogger & Serializable;

export class LoggedStorage {
    
    constructor(storage: Storage, logger: StorageLogger) {
        this.m_storage = storage;
        this.m_logger = logger;
        this._wrapStorage();
    }

    private m_logger: StorageLogger;
    private m_storage: Storage;

    get logger(): StorageLogger {
        return this.m_logger;
    }

    private _wrapStorage() {
        let storage = this.m_storage;
        {
            let proto = storage.beginTransaction;
            storage.beginTransaction = async (): Promise<{ err: ErrorCode, value?: StorageTransaction }> => {
                let ltr = await this.m_logger.beginTransaction();
                await ltr.value!.beginTransaction();
                let btr = await proto.bind(storage)();
                this._wrapTransaction(btr.value, ltr.value!);
                return btr;
            };
        }
        {
            let proto = storage.getReadWritableDatabase;
            storage.getReadWritableDatabase = async (name: string): Promise<{err: ErrorCode, value?: IReadWritableDatabase }> => {
                let ltr = await this.m_logger.getReadWritableDatabase(name);
                let dbr = await proto.bind(storage)(name);
                this._wrapDatabase(dbr.value!, ltr.value!);
                return dbr;
            };
        }
        {
            let proto = storage.createDatabase;
            storage.createDatabase = async (name: string): Promise<{err: ErrorCode, value?: IReadWritableDatabase }> => {
                let ltr = await this.m_logger.createDatabase(name);
                let dbr = await proto.bind(storage)(name);
                this._wrapDatabase(dbr.value!, ltr.value!);
                return dbr;
            };
        }
    }

    private _wrapDatabase(database: IReadWritableDatabase, logger: IWritableDatabase) {
        {
            let proto = database.getReadWritableKeyValue;
            database.getReadWritableKeyValue = async (name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}> => {
                let ltr = await logger.getReadWritableKeyValue(name);
                let btr = await proto.bind(database)(name);
                this._wrapKeyvalue(btr.kv!, ltr.kv!);
                return btr;
            };
        }
        {
            let proto = database.createKeyValue;
            database.createKeyValue = async (name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}> => {
                let ltr = await logger.createKeyValue(name);
                let btr = await proto.bind(database)(name);
                this._wrapKeyvalue(btr.kv!, ltr.kv!);
                return btr;
            };
        }
    }

    private _wrapTransaction(transaction: StorageTransaction, logger: StorageTransaction) {
        {
            let proto = transaction.commit;
            transaction.commit = async (): Promise<ErrorCode> => {
                logger.commit();
                return await proto.bind(transaction)();
            };
        }
        {
            let proto = transaction.rollback;
            transaction.rollback = async (): Promise<ErrorCode> => {
                logger.rollback();
                return await proto.bind(transaction)();
            };
        }
    }

    private _wrapKeyvalue(kv: IReadWritableKeyValue, logger: IWritableKeyValue) {
        {
            let proto = kv.set;
            kv.set = async (key: string, value: any): Promise<{err: ErrorCode}> => {
                await logger.set(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.hset;
            kv.hset = async (key: string, field: string, value: any): Promise<{ err: ErrorCode }> => {
                await logger.hset(key, field, value);
                return await proto.bind(kv)(key, field, value);
            };
        }
        {
            let proto = kv.hmset;
            kv.hmset = async (key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode }> => {
                await logger.hmset(key, fields, values);
                return await proto.bind(kv)(key, fields, values);
            };
        }
        {
            let proto = kv.hdel;
            kv.hdel = async (key: string, field: string): Promise<{err: ErrorCode}> => {
                await logger.hdel(key, field);
                return await proto.bind(kv)(key, field);
            };
        }
        {
            let proto = kv.hclean;
            kv.hclean = async (key: string): Promise<{err: ErrorCode}> => {
                await logger.hclean(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.lset;
            kv.lset = async (key: string, index: number, value: any): Promise<{ err: ErrorCode }> => {
                await logger.lset(key, index, value);
                return await proto.bind(kv)(key, index, value);
            };
        }
        {
            let proto = kv.lpush;
            kv.lpush = async (key: string, value: any): Promise<{ err: ErrorCode }> => {
                await logger.lpush(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.lpushx;
            kv.lpushx = async (key: string, value: any[]): Promise<{ err: ErrorCode }> => {
                await logger.lpushx(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.lpop;
            kv.lpop = async (key: string): Promise<{ err: ErrorCode, value?: any }> => {
                await logger.lpop(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.rpush;
            kv.rpush = async (key: string, value: any): Promise<{ err: ErrorCode }> => {
                await logger.rpush(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.rpushx;
            kv.rpushx = async (key: string, value: any[]): Promise<{ err: ErrorCode }> => {
                await logger.rpushx(key, value);
                return await proto.bind(kv)(key, value);
            };
        }
        {
            let proto = kv.rpop;
            kv.rpop = async (key: string): Promise<{ err: ErrorCode, value?: any }> => {
                await logger.rpop(key);
                return await proto.bind(kv)(key);
            };
        }
        {
            let proto = kv.linsert;
            kv.linsert = async (key: string, index: number, value: any): Promise<{ err: ErrorCode }> => {
                await logger.linsert(key, index, value);
                return await proto.bind(kv)(key, index, value);
            };
        }
        {
            let proto = kv.lremove;
            kv.lremove = async (key: string, index: number): Promise<{ err: ErrorCode, value?: any }> => {
                await logger.lremove(key, index);
                return await proto.bind(kv)(key, index);
            };
        }
    }
}