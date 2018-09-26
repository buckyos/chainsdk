import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {Transaction, BlockStorage, BlockHeader, initLogger, StorageManager,  HeaderStorage, ValuePendingTransactions} from '../../src/core';
import { JsonStorage } from '../../src/core/storage_json/storage';
import { FakeHeaderStorage } from '../fake/header_storage';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

// describe('ValuePending', () => {
//     const rootDir = path.join(__dirname, '../../../../data/test/valuePending');
//     const logger = initLogger({loggerOptions: {console: true, level: 'error'}});
//     const storageManager = new StorageManager({
//         path: rootDir,
//         storageType: JsonStorage,
//         logger, 
//         headerStorage: new FakeHeaderStorage()
//     });
//     const pending = new ValuePendingTransactions({
//         storageManager,
//         logger,
//         txlivetime: 60 * 1000,
//     });
// });