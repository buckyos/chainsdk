import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {createValueDebuger, initChainCreator, initLogger, stringifyErrorCode, ValueIndependDebugSession, BigNumber} from '../../../src/core';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

describe('coin', () => {
    const logger = initLogger({loggerOptions: {console: true}});
    let session: ValueIndependDebugSession;
    before((done) => {
        async function __test() {
            const mdr = await createValueDebuger(initChainCreator({logger}), path.join(__dirname, '../chain'));
            assert(!mdr.err, 'createValueMemoryDebuger failed', stringifyErrorCode(mdr.err));
            const debuger = mdr.debuger!;
            session = debuger.createIndependSession();
            assert(!(await session.init({height: 0, accounts: 2, coinbase: 0, interval: 10})), 'init session failed');
        }
        __test().then(done);
    });

    it('wage', (done) => {
        async function __test() {
            assert(!(await session!.wage()).err, 'wage error');
            const gbr = await session.view({method: 'getBalance', params: {address: session!.getAccount(0)}});
            assert(!gbr.err, 'getBalance failed error');
            assert((gbr.value! as BigNumber).eq(10000), 'wage value error');
        }
        __test().then(done);
    });

    it('transferTo', (done) => {
        async function __test() {
            assert(!(await session.transaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(10), fee: new BigNumber(0)})).err, 'transferTo failed');
            let gbr = await session.view({method: 'getBalance', params: {address: session!.getAccount(0)}});
            assert(gbr.value!.eq(10000 - 10), '0 balance value err');
            gbr = await session.view({method: 'getBalance', params: {address: session!.getAccount(1)}});
            assert(gbr.value!.eq(10), '1 balance value err');
        }
        __test().then(done);
    });
});