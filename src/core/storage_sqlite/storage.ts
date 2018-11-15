import * as fs from 'fs-extra';
import * as path from 'path';

import * as assert from 'assert';
import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';

const { TransactionDatabase } = require('sqlite3-transactions');
declare module 'sqlite' {
    interface Database {
        driver: sqlite3.Database;
        __proto__: any;
    }
}

import { ErrorCode } from '../error_code';
import {toStringifiable, fromStringifiable} from '../serializable';
import {Storage, IReadWritableDatabase, IReadableDatabase, IReadWritableKeyValue, StorageTransaction, JStorageLogger} from '../storage';
import { LoggerInstance } from '../lib/logger_util';
import { JsonStorage } from '../storage_json/storage';
import { isUndefined, isArray, isNullOrUndefined } from 'util';
const digest = require('../lib/digest');
const {LogShim} = require('../lib/log_shim');

class SqliteStorageKeyValue implements IReadWritableKeyValue {
    protected readonly logger: LoggerInstance;
    constructor(readonly db: sqlite.Database, readonly fullName: string, logger: LoggerInstance) { 
        this.logger = new LogShim(logger).bind(`[transaction: ${this.fullName}]`, true).log;
    }

    public async set(key: string, value: any): Promise<{ err: ErrorCode }> {
        try {
            assert(key);
            const json = JSON.stringify(toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', "____default____", '${json}')`;
            await this.db.exec(sql);
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`set ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async get(key: string): Promise<{ err: ErrorCode, value?: any }> {
        try {
            assert(key);
            const result = await this.db.get(`SELECT value FROM '${this.fullName}' \
                WHERE name=? AND field="____default____"`, key);

            if (result == null) {
                return { err: ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: ErrorCode.RESULT_OK, value: fromStringifiable(JSON.parse(result.value)) };
        } catch (e) {
            this.logger.error(`get ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hset(key: string, field: string, value?: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            assert(field);
            const json = JSON.stringify(toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${field}', '${json}')`;
            await this.db.exec(sql);
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
            const result = await this.db.get(`SELECT value FROM '${this.fullName}' WHERE name=? AND field=?`, key, field);

            if (result == null) {
                return { err: ErrorCode.RESULT_NOT_FOUND };
            }
            return { err: ErrorCode.RESULT_OK, value: fromStringifiable(JSON.parse(result.value)) };
        } catch (e) {
            this.logger.error(`hget ${key} ${field} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hdel(key: string, field: string): Promise<{err: ErrorCode}> {
        try {
            await this.db.exec(`DELETE FROM '${this.fullName}' WHERE name='${key}' and field='${field}'`);
            return {err: ErrorCode.RESULT_OK};   
        } catch (e) {
            this.logger.error(`hdel ${key} ${field} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hlen(key: string): Promise<{ err: ErrorCode; value?: number; }> {
        try {
            assert(key);
            const result = await this.db.get(`SELECT count(*) as value FROM '${this.fullName}' WHERE name=?`, key);

            return { err: ErrorCode.RESULT_OK, value: result.value };   
        } catch (e) {
            this.logger.error(`hlen ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hexists(key: string, field: string): Promise<{ err: ErrorCode, value?: boolean}> {
        let { err } = await this.hget(key, field);
        if (!err) {
            return {err: ErrorCode.RESULT_OK, value: true};
        } else if (err === ErrorCode.RESULT_NOT_FOUND) {
            return {err: ErrorCode.RESULT_OK, value: false};
        } else {
            this.logger.error(`hexists ${key} ${field} `, err);
            return {err};
        }
    }

    public async hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            assert(fields.length === values.length);

            const statement = await this.db.prepare(`REPLACE INTO '${this.fullName}'  (name, field, value) VALUES (?, ?, ?)`);
            for (let i = 0; i < fields.length; i++) {
                await statement.run([key, fields[i], JSON.stringify(toStringifiable(values[i], true))]);
            }
            await statement.finalize();
            return { err: ErrorCode.RESULT_OK };   
        } catch (e) {
            this.logger.error(`hmset ${key} ${fields} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hmget(key: string, fields: string[]): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
            const sql = `SELECT * FROM '${this.fullName}' WHERE name=? AND field in (${fields.map((x) => '?').join(',')})`;
            // console.log({ sql });
            const result = await this.db.all(sql, key, ...fields);
            const resultMap: { [other: string]: any } = {};
            result.forEach((x) => resultMap[x.field] = fromStringifiable(JSON.parse(x.value)));
            const values = fields.map((x) => resultMap[x]);

            return { err: ErrorCode.RESULT_OK, value: values };  
        } catch (e) {
            this.logger.error(`hmget ${key} ${fields} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hkeys(key: string): Promise<{ err: ErrorCode; value?: string[]; }> {
        try {
            assert(key);
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);

            return { err: ErrorCode.RESULT_OK, value: result.map((x) => x.field) };
        } catch (e) {
            this.logger.error(`hkeys ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hvalues(key: string): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);

            return { err: ErrorCode.RESULT_OK, value: result.map((x) => fromStringifiable(JSON.parse(x.value))) };
        } catch (e) {
            this.logger.error(`hvalues ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        
    }

    public async hgetall(key: string): Promise<{ err: ErrorCode; value?: {key: string, value: any}[]; }> {
        try {
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name=?`, key);

            return {
                err: ErrorCode.RESULT_OK, value: result.map((x) => {
                    return { key: x.field, value: fromStringifiable(JSON.parse(x.value)) };
                })
            };
        } catch (e) {
            this.logger.error(`hgetall ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async hclean(key: string): Promise<{err: ErrorCode}> {
        try {
            const result = await this.db.exec(`DELETE FROM ${this.fullName} WHERE name='${key}'`);
            return {err: ErrorCode.RESULT_OK}; 
        } catch (e) {
            this.logger.error(`hclean ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lindex(key: string, index: number): Promise<{ err: ErrorCode; value?: any; }> {
        return this.hget(key, index.toString());
    }

    public async lset(key: string, index: number, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            assert(!isNullOrUndefined(index));
            const json = JSON.stringify(toStringifiable(value, true));
            const sql = `REPLACE INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${index.toString()}', '${json}')`;
            await this.db.exec(sql);
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lset ${key} ${index} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        
    }

    public async llen(key: string): Promise<{ err: ErrorCode; value?: number; }> {
        return await this.hlen(key);
    }

    public async lrange(key: string, start: number, stop: number): Promise<{ err: ErrorCode; value?: any[]; }> {
        try {
            assert(key);
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
            let fields = [];
            for (let i = start; i <= stop; ++i) {
                fields.push(i);
            }
            const result = await this.db.all(`SELECT * FROM '${this.fullName}' WHERE name='${key}' AND field in (${fields.map((x) => `'${x}'`).join(',')})`);
            let ret = new Array(result.length);
            for (let x of result) {
                ret[parseInt(x.field) - start] = fromStringifiable(JSON.parse(x.value));
            }
            return { err: ErrorCode.RESULT_OK, value: ret };
        } catch (e) {
            this.logger.error(`lrange ${key} ${start} ${stop}`, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpush(key: string, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            // update index += 1
            // set index[0] = value
            const json = JSON.stringify(toStringifiable(value, true));
            await this.db.exec(`UPDATE '${this.fullName}' SET field=field+1 WHERE name='${key}'`);
            const sql = `INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '0', '${json}')`;
            // console.log('lpush', { sql });
            await this.db.exec(sql);

            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lpush ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpushx(key: string, value: any[]): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            const len = value.length;
            await this.db.exec(`UPDATE '${this.fullName}' SET field=field+${len} WHERE name='${key}'`);
            for (let i = 0; i < len; i++) {
                const json = JSON.stringify(toStringifiable(value[i], true));
                await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${i}', '${json}')`);
            }
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`lpushx ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lpop(key: string): Promise<{ err: ErrorCode; value?: any; }> {
        try {
            const index = 0;
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            if (len === 0) {
                return { err: ErrorCode.RESULT_NOT_FOUND };
            } else {
                const { err: err2, value } = await this.lindex(key, index);
                let sql = `DELETE FROM '${this.fullName}' WHERE name='${key}' AND field='${index}'`;
                await this.db.exec(sql);
                for (let i = index + 1; i < len!; i++) {
                    sql = `UPDATE '${this.fullName}' SET field=field-1 WHERE name='${key}' AND field = ${i}`;
                    await this.db.exec(sql);
                }

                return { err: ErrorCode.RESULT_OK, value };
            }
        } catch (e) {
            this.logger.error(`lpop ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpush(key: string, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            const json = JSON.stringify(toStringifiable(value, true));
            await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) VALUES ('${key}', '${len}', '${json}')`);
            return { err: ErrorCode.RESULT_OK };
        } catch (e) {
            this.logger.error(`rpush ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }> {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            for (let i = 0; i < value.length; i++) {
                const json = JSON.stringify(toStringifiable(value[i], true));
                await this.db.exec(`INSERT INTO '${this.fullName}' (name, field, value) \
                    VALUES ('${key}', '${len! + i}', '${json}')`);
            }

            return { err: ErrorCode.RESULT_OK };    
        } catch (e) {
            this.logger.error(`rpushx ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async rpop(key: string): Promise<{ err: ErrorCode; value?: any; }> {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            if (len === 0) {
                return { err: ErrorCode.RESULT_NOT_FOUND };
            } else {
                const { err: err2, value } = await this.lindex(key, len! - 1);
                await this.db.exec(`DELETE FROM '${this.fullName}' WHERE name='${key}' AND field=${len! - 1}`);
                return { err: ErrorCode.RESULT_OK, value };
            }
        } catch (e) {
            this.logger.error(`rpop ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode; }> {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            if (len === 0 || index >= len!) {
                return await this.lset(key, len!, value);
            } else {
                for (let i = len! - 1; i >= index; i--) {
                    await this.db.exec(`UPDATE '${this.fullName}' SET field=field+1 WHERE name='${key}' AND field = ${i}`);
                }

                return await this.lset(key, index, value);
            }
        } catch (e) {
            this.logger.error(`linsert ${key} ${index} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    public async lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }> {
        try {
            assert(key);
            const { err, value: len } = await this.llen(key);
            if (err) {
                return {err};
            }
            if (len === 0) {
                return { err: ErrorCode.RESULT_NOT_FOUND };
            } else {
                const { err: err2, value } = await this.lindex(key, index);
                let sql = `DELETE FROM '${this.fullName}' WHERE name='${key}' AND field='${index}'`;
                // console.log('lremove', { sql });
                await this.db.exec(sql);
                for (let i = index + 1; i < len!; i++) {
                    sql = `UPDATE '${this.fullName}' SET field=field-1 WHERE name='${key}' AND field = ${i}`;
                    // console.log({ sql });
                    await this.db.exec(sql);
                }

                return { err: ErrorCode.RESULT_OK, value };
            }
        } catch (e) {
            this.logger.error(`lremove ${key} `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }
}

class SqliteStorageTransaction implements StorageTransaction {
    protected m_transcationDB: any;
    protected m_transcation: any;

    constructor(db: sqlite.Database) {
        this.m_transcationDB = new TransactionDatabase(db.driver);
    }

    public beginTransaction(): Promise<ErrorCode> {
        return new Promise<ErrorCode>((resolve, reject) => {
            this.m_transcationDB.beginTransaction((err: Error, transcation: any) => {
                if (err) {
                    reject(err);
                } else {
                    this.m_transcation = transcation;
                    resolve(ErrorCode.RESULT_OK);
                }
            });
        });
    }

    public commit(): Promise<ErrorCode> {
        return new Promise<ErrorCode>((resolve, reject) => {
            this.m_transcation.commit((err: Error) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(ErrorCode.RESULT_OK);
                }
            });
        });
    }

    public rollback(): Promise<ErrorCode> {
        return new Promise<ErrorCode>((resolve, reject) => {
            this.m_transcation.rollback((err: Error) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(ErrorCode.RESULT_OK);
                }
            });
        });
    }
}

class SqliteReadableDatabase implements IReadableDatabase {
    protected m_db?: sqlite.Database;
    constructor(protected readonly name: string, db: sqlite.Database, protected readonly logger: LoggerInstance) {
        this.m_db = db;
    }

    public async getReadableKeyValue(name: string) {
        const fullName = Storage.getKeyValueFullName(this.name, name);
        let tbl = new SqliteStorageKeyValue(this.m_db!, fullName, this.logger);
        return { err: ErrorCode.RESULT_OK, kv: tbl };
    }
}

class SqliteReadWritableDatabase extends SqliteReadableDatabase implements IReadWritableDatabase {
    public async createKeyValue(name: string) {
        let err = Storage.checkTableName(name);
        if (err) {
            return {err};
        }
        const fullName = Storage.getKeyValueFullName(this.name, name);
        // 先判断表是否存在
        let count;
        try {
            let ret = await this.m_db!.get(`SELECT COUNT(*) FROM sqlite_master where type='table' and name='${fullName}'`);
            count = ret['COUNT(*)'];
        } catch (e) {
            this.logger.error(`select table name failed `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        if (count > 0) {
            err = ErrorCode.RESULT_ALREADY_EXIST;
        } else {
            err = ErrorCode.RESULT_OK;
            await this.m_db!.exec(`CREATE TABLE IF NOT EXISTS  '${fullName}'\
            (name TEXT, field TEXT, value TEXT, unique(name, field))`);
        }
        let tbl = new SqliteStorageKeyValue(this.m_db!, fullName, this.logger);
        return { err: ErrorCode.RESULT_OK, kv: tbl };
    }

    public async getReadWritableKeyValue(name: string) {
        let tbl = new SqliteStorageKeyValue(this.m_db!, Storage.getKeyValueFullName(this.name, name), this.logger);
        return { err: ErrorCode.RESULT_OK, kv: tbl };
    }
}

export class SqliteStorage extends Storage {
    private m_db?: sqlite.Database;
    private m_isInit: boolean = false;

    protected _createLogger(): JStorageLogger {
        return new JStorageLogger();
    }

    public get isInit(): boolean {
        return this.m_isInit;
    }

    public async init(readonly?: boolean): Promise<ErrorCode> {
        if (this.m_db) {
            return ErrorCode.RESULT_SKIPPED;
        }
        assert(!this.m_db);
        fs.ensureDirSync(path.dirname(this.m_filePath));
        let options: any = {};
        if (!readonly) {
            options.mode = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE; 
        } else {
            options.mode = sqlite3.OPEN_READONLY;
        }

        let err = ErrorCode.RESULT_OK;
        try {
            this.m_db = await sqlite.open(this.m_filePath, options);
        } catch (e) {
            this.m_logger.error(`open sqlite database file ${this.m_filePath} failed `, e);
            err = ErrorCode.RESULT_EXCEPTION;
        }

        if (!err) {
            this.m_isInit = true;
        }

        try {
            this.m_db!.run('PRAGMA journal_mode = MEMORY');
            this.m_db!.run('PRAGMA synchronous = OFF');
            this.m_db!.run('PRAGMA locking_mode = EXCLUSIVE');
        } catch (e) {
            this.m_logger.error(`pragma some options on sqlite database file ${this.m_filePath} failed `, e);
            err = ErrorCode.RESULT_EXCEPTION;
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
        if (this.m_db) {
            await this.m_db.close();
            delete this.m_db;
        }

        return ErrorCode.RESULT_OK;
    }

    public async messageDigest(): Promise<{ err: ErrorCode, value?: ByteString }> {
        let buf = await fs.readFile(this.m_filePath);
        const sqliteHeaderSize: number = 100; 
        if (buf.length < sqliteHeaderSize) {
            return {err: ErrorCode.RESULT_INVALID_FORMAT};
        }
        const content = Buffer.from(buf.buffer as ArrayBuffer, sqliteHeaderSize, buf.length - sqliteHeaderSize);
        let hash = digest.hash256(content).toString('hex');
        return { err: ErrorCode.RESULT_OK, value: hash };
    }

    public async getReadableDataBase(name: string) {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, value: new SqliteReadableDatabase(name, this.m_db!, this.m_logger)};
    }

    public async createDatabase(name: string): Promise<{err: ErrorCode, value?: IReadWritableDatabase}> {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, value: new SqliteReadWritableDatabase(name, this.m_db!, this.m_logger)};
    }

    public async getReadWritableDatabase(name: string) {
        let err = Storage.checkDataBaseName(name);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, value: new SqliteReadWritableDatabase(name, this.m_db!, this.m_logger)};
    }

    public async beginTransaction(): Promise<{ err: ErrorCode, value: StorageTransaction }> {
        assert(this.m_db);
        let transcation = new SqliteStorageTransaction(this.m_db!);

        await transcation.beginTransaction();

        return { err: ErrorCode.RESULT_OK, value: transcation };
    }

    public async toJsonStorage(storage: JsonStorage): Promise<{err: ErrorCode}> {
        let tableNames: Map<string, string[]> = new Map();
        try {
            const results = await this.m_db!.all(`select name fromsqlite_master where type='table' order by name;`);
            for (const {name} of results) {
                const {dbName, kvName} = SqliteStorage.splitFullName(name);
                if (!tableNames.has(dbName!)) {
                    tableNames.set(dbName!, []);
                }
                tableNames.get(dbName!)!.push(kvName!);
            }
        } catch (e) {
            this.m_logger.error(`get all tables failed `, e);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        let root = Object.create(null);
        for (let [dbName, kvNames] of tableNames.entries()) {
            let dbRoot = Object.create(null);
            root[dbName] = dbRoot;
            for (let kvName of kvNames) {
                let kvRoot = Object.create(null);
                dbRoot[kvName] = kvRoot;
                const tableName = SqliteStorage.getKeyValueFullName(dbName, kvName);
                try {
                    const elems = await this.m_db!.all(`select * from ${tableName}`);
                    for (const elem of elems) {
                        if (isUndefined(elem.field)) {
                            kvRoot[elem.name] = fromStringifiable(JSON.parse(elem.value));
                        } else {
                            const index = parseInt(elem.field);
                            if (isNaN(index)) {
                                if (isUndefined(kvRoot[elem.name])) {
                                    kvRoot[elem.name] = Object.create(null);
                                }
                                kvRoot[elem.name][elem.filed] = fromStringifiable(JSON.parse(elem.value));
                            } else {
                                if (!isArray(kvRoot[elem.name])) {
                                    kvRoot[elem.name] = [];
                                } 
                                let arr = kvRoot[elem.name] as any[];
                                if (arr.length > index) {
                                    arr[index] = fromStringifiable(JSON.parse(elem.value));
                                } else {
                                    const offset = index - arr.length - 1;
                                    for (let ix = 0; ix < offset; ++ix) {
                                        arr.push(undefined);
                                    }
                                    arr.push(fromStringifiable(JSON.parse(elem.value)));
                                }
                            }
                        }
                    }
                } catch (e) {
                    this.m_logger.error(`database: ${dbName} kv: ${kvName} transfer error `, e);
                    return {err: ErrorCode.RESULT_EXCEPTION};
                }
            }
        }
        await storage.flush(root);
        return {err: ErrorCode.RESULT_OK};
    }
}
