
// import { expect } from 'chai';
import * as assert from 'assert';
import * as fs from 'fs-extra';
import 'mocha';
import * as path from 'path';
import { ErrorCode, initLogger, IReadWritableDatabase, IReadWritableKeyValue, BufferWriter, Storage } from '../../src/core';
import { SqliteStorage } from '../../src/core/storage_sqlite/storage';
import { JsonStorage } from '../../src/core/storage_json/storage';
import * as jsonableValues from '../jsonable_values';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

function defineStorageTest(rootDir: string, storageType: new (...args: any[]) => Storage, descName: string) {
    const storagePath = path.join(rootDir, descName);
    const logger = initLogger({loggerOptions: {console: true, level: 'debug'}});
    const storage: Storage = new storageType({
        filePath: storagePath,
        logger
    });

    let database: IReadWritableDatabase;
    let keyvalue: IReadWritableKeyValue;

    it(`${descName}: init`, (done) => {
        async function __test() {
            let err = await storage.init();
            storage.createLogger();
            assert(!err);
            await new Promise((resolve, reject) => {
                storage.once('init', (_err: ErrorCode) => {
                    if (_err) {
                        assert(false, `init err`);
                    }
                    resolve();
                });
            });
        }
        __test().then(done);
    });

    it(`${descName}: create database`, (done) => {
        async function __test() {
            const cdr = await storage.createDatabase('testDatabase');
            assert(!cdr.err);
            database = cdr.value!;
            assert(database);
        }
        __test().then(done);
    });

    it(`${descName}: create keyvalue`, (done) => {
        async function __test() {
            const ckr = await database.createKeyValue('testKeyvalue');
            assert(!ckr.err);
            keyvalue = ckr.kv!;
            assert(keyvalue);
        }
        __test().then(done);
    });

    it(`${descName}: keyvalue set get`, (done) => {
        async function __test() {
            const values = jsonableValues.values;
            for (let i = 0; i < values.length; ++i) {
                const k = `set${i}`;
                logger.info(`set ${k} `, values[i]);
                assert(!(await keyvalue.set(k, values[i])).err);
                assert(jsonableValues.checkValue(values[i], (await keyvalue.get(k)).value));
            }
        }
        __test().then(done);
    });

    it(`${descName}: keyvalue list`, (done) => {
        async function __test() {
            const values = jsonableValues.values;
            {
                const k = `lpush`;
                for (let i = 0; i < values.length; ++i) {
                    logger.info(`lpush ${i}`);
                    assert(!(await keyvalue.lpush(k, values[i])).err, 'lpush err');
                    assert((await keyvalue.llen(k)).value === (i + 1), 'llen err');
                    assert(jsonableValues.checkValue((await keyvalue.lindex(k, 0)).value, values[i]), 'lindex err');
                }
            }
            {
                const k = `lpushx`;
                logger.info(`lpushx`);
                assert(!(await keyvalue.lpushx(k, values)).err, 'lpushx err');
                assert(jsonableValues.checkValue((await keyvalue.lrange(k, 0, -1)).value, values), 'lrange err');
            }
            {
                const k = `rpush`;
                for (let i = 0; i < values.length; ++i) {
                    logger.info(`rpush ${i}`);
                    assert(!(await keyvalue.rpush(k, values[i])).err, 'rpush err');
                    assert((await keyvalue.llen(k)).value === (i + 1), 'llen err');
                    assert(jsonableValues.checkValue((await keyvalue.lindex(k, i)).value, values[i]), 'lindex err');
                }
            }
            {
                const k = `rpush`;
                logger.info(`rpushx`);
                assert(!(await keyvalue.rpushx(k, values)).err, 'rpushx err');
                assert(jsonableValues.checkValue((await keyvalue.lrange(k, -values.length, -1)).value, values), 'lrange err');
            }
            {
                const k = `rpush`;
                logger.info(`lpop`);
                assert(jsonableValues.checkValue((await keyvalue.lpop(k)).value, values[0]), 'lpop value err');
                assert(((await keyvalue.llen(k)).value === 11), 'lpop length err');
                logger.info(`rpop`);
                assert(jsonableValues.checkValue((await keyvalue.rpop(k)).value, values[values.length - 1]), 'rpop value err');
                assert(((await keyvalue.llen(k)).value === 10), 'rpop length err');
                logger.info(`linsert`);
                assert(!(await keyvalue.linsert(k, 3, values[0])).err, 'linsert err');
                assert(jsonableValues.checkValue((await keyvalue.lindex(k, 3)).value, values[0]), 'lindex err');
                assert(((await keyvalue.llen(k)).value === 11), 'linsert length err');
                assert(jsonableValues.checkValue((await keyvalue.lremove(k, 3)).value, values[0]), 'lremove value err');
                assert(((await keyvalue.llen(k)).value === 10), 'lremove length err');
            }
        }
        __test().then(done);
    });

    it(`${descName}: keyvalue hashmap`, (done) => {
        async function __test() {
            const values = jsonableValues.values;
            {
                const k = 'hset';
                logger.info(`hset`);
                for (let i = 0; i < values.length; ++i) {
                    logger.info(`hset k${i}`);
                    assert(!(await keyvalue.hset(k, `k${i}`, values[i])).err, 'hset err');
                    assert((await keyvalue.hexists(k, `k${i}`)).value, 'hexists err');
                    assert(jsonableValues.checkValue((await keyvalue.hget(k, `k${i}`)).value, values[i]), 'hget err');
                }
            }

            {
                const k = 'hmset';
                logger.info(`hmset`);
                let keys = [];
                for (let i = 0; i < values.length; ++i) {
                    logger.info(`hset k${i}`);
                    keys.push(`k${i}`);
                }
                assert(!(await keyvalue.hmset(k, keys, values)).err, 'hmset err');
                assert(jsonableValues.checkValue((await keyvalue.hmget(k, keys)).value, values), 'hmget err');
            }
        }
        __test().then(done);
    });

    it(`${descName}: redo log`, (done) => {
        async function __test() {
            const redoLog = storage.storageLogger!;
            const redoStoragePath = path.join(rootDir, `${descName}.redo`);
            let redoStorage = new storageType({
                filePath: redoStoragePath,
                logger
            });
            await storage.uninit();
            redoLog.finish();
            let logWriter = new BufferWriter();
            assert(!redoLog.encode(logWriter));
            let logBuf = logWriter.render();
            logger.info('redo log : ', logBuf.toString('utf-8'));
            
            assert(!(await redoStorage.init()));
            assert(!(await redoStorage.redo(logBuf)));

            await redoStorage.uninit();

            const md1 = (await storage.messageDigest()).value!;
            const md2 = (await redoStorage.messageDigest()).value!;
            assert(md1 === md2);
        }
        __test().then(done);
    });
}

describe('Storage', async () => {
    const rootDir = path.join(__dirname, '../../../../data/test/storage');
    fs.removeSync(rootDir);
    fs.ensureDirSync(rootDir);
    defineStorageTest(rootDir, SqliteStorage, 'SqliteStorage');
    defineStorageTest(rootDir, JsonStorage, 'JsonStorage');
});
