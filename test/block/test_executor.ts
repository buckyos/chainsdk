import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {BigNumber, Block, Transaction, initLogger, HeaderStorage, Receipt, createValueDebuger, ValueChainDebuger, initChainCreator, ChainCreator, ValueBlockHeader, ValueTransaction, ValueReceipt, InprocessRoutineManager, InterprocessRoutineManager, ErrorCode } from '../../src/core';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

describe('blockExecutor', () => {
    let headerStorage: HeaderStorage;
    const logger = initLogger({loggerOptions: {console: true, level: 'debug'}});
    let creator: ChainCreator;
    let debuger: ValueChainDebuger;
    const rootDir = path.join(__dirname, '../../../../data/test/testExecutor');
    before((done) => {
        async function __test() {
            fs.removeSync(rootDir);
            fs.ensureDirSync(rootDir);
            const packagePath = path.join(rootDir, 'package');
            fs.ensureDirSync(packagePath);
            const dataDir = path.join(rootDir, 'data');
            fs.ensureDirSync(dataDir);
            const configContent = `
            {
                "handler":"./handler.js",
                "type": {
                    "consensus":"pow",
                    "features":[]
                },
                "global": {
                    "retargetInterval":10,
                    "targetTimespan":60,
                    "basicBits":520159231,
                    "limit":"0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
                }
            }
            `;
            fs.writeFileSync(path.join(packagePath, 'config.json'), configContent);
            const handlerContent = `
                "use strict";
                Object.defineProperty(exports, "__esModule", { value: true });
                const client_1 = require("../../../../dist/blockchain-sdk/src/client");
                function registerHandler(handler) {
                    handler.addViewMethod('getBalance', async (context, params) => {
                        return await context.getBalance(params.address);
                    });
                    handler.addTX('transferTo', async (context, params) => {
                        return await context.transferTo(params.to, context.value);
                    });
                    handler.onMinerWage(async () => {
                        return new client_1.BigNumber(10000);
                    });
                }
                exports.registerHandler = registerHandler;
            `;
            fs.writeFileSync(path.join(packagePath, 'handler.js'), handlerContent);
            creator = initChainCreator({logger});
            const cgr = await creator.createGenesis(packagePath, dataDir, {
                coinbase: '12LKjfgQW26dQZMxcJdkj2iVP2rtJSzT88', 
                preBalance: []});
            assert(!cgr.err, 'create genesis failed');
        
            const vdr = await createValueDebuger(creator, dataDir);
            assert(!vdr.err, 'create debuger failed');
            debuger = vdr.debuger!;
        }
        __test().then(done);
    });

    // it(`profile transactions in memory storage`, (done) => {
    //     async function __test() {
    //         const session = debuger.createIndependSession();
    //         let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0});
    //         assert(!err, 'init session failed');
    //         for (let ix = 0; ix < 1200; ++ix) {
    //             const tr = await session.transaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0)});
    //             assert(!tr.err, 'execute transaction failed');
    //             assert(!tr.receipt!.returnCode, 'transfer transaction return failed');
    //         }
    //     }
    //     __test().then(done);
    // });

    // it(`profile transactions in sqlite storage`, (done) => {
    //     async function __test() {
    //         const session = debuger.createIndependSession();
    //         let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0, memoryStorage: false, storageDir: debuger.chain.dataDir});
    //         assert(!err, 'init session failed');
    //         for (let ix = 0; ix < 1200; ++ix) {
    //             const tr = await session.transaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0)});
    //             assert(!tr.err, 'execute transaction failed');
    //             assert(!tr.receipt!.returnCode, 'transfer transaction return failed');
    //         }
    //     }
    //     __test().then(done);
    // });

    // it(`inprocess routine`, (done) => {
    //     async function __test() {
    //         const session = debuger.createIndependSession();
    //         let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0});
    //         assert(!err, 'init session failed');
    //         const block = debuger.chain.newBlock(session.curHeader);
            
    //         for (let ix = 0; ix < 100; ++ix) {
    //             const tx = session.createTransaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0), nonce: ix});
    //             block.content.addTransaction(tx);
    //         }
    //         const rcr =  new InprocessRoutineManager(debuger.chain).create({block, storage: session.storage});
    //         assert(!rcr.err, 'create routine failed');
    //         const er = await rcr.routine.execute();
    //         assert(!er.err && !er.result!.err, 'routine execute failed');
    //     }
    //     __test().then(done);
    // });

    // it(`cancel inprocess routine`, (done) => {
    //     async function __test() {
    //         const session = debuger.createIndependSession();
    //         let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0});
    //         assert(!err, 'init session failed');
    //         debuger.chain.newBlock(session.curHeader);
            
    //         for (let ix = 0; ix < 100; ++ix) {
    //             const tx = session.createTransaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0), nonce: ix});
    //             block.content.addTransaction(tx);
    //         }
    //         const rcr =  new InprocessRoutineManager(debuger.chain).create({block, storage: session.storage});
    //         assert(!rcr.err, 'create routine failed');
    //         rcr.routine.cancel();
    //         const er = await rcr.routine.execute();
    //         assert(er.err === ErrorCode.RESULT_CANCELED, 'routine cancel failed');
    //     }
    //     __test().then(done);
    // });

    it(`interprocess routine`, (done) => {
        async function __test() {
            const session = debuger.createIndependSession();
            let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0, memoryStorage: false, storageDir: debuger.chain.dataDir});
            assert(!err, 'init session failed');
            const block = debuger.chain.newBlock(session.curHeader);
            
            for (let ix = 0; ix < 100; ++ix) {
                const tx = session.createTransaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0), nonce: ix});
                block.content.addTransaction(tx);
            }
            const rcr =  new InterprocessRoutineManager(debuger.chain).create({name: `${block.hash}${Date.now()}`, block, storage: session.storage});
            assert(!rcr.err, 'create routine failed');
            const er = await rcr.routine.execute();
            assert(!er.err && !er.result!.err, 'routine execute failed');
        }
        __test().then(done);
    });

    // it(`cancel interprocess routine`, (done) => {
    //     async function __test() {
    //         const session = debuger.createIndependSession();
    //         let err = await session.init({height: 0, accounts: 100, coinbase: 0, interval: 0, memoryStorage: false, storageDir: debuger.chain.dataDir});
    //         assert(!err, 'init session failed');
    //         const block = debuger.chain.newBlock(session.curHeader);
            
    //         for (let ix = 0; ix < 100; ++ix) {
    //             const tx = session.createTransaction({caller: 0, method: 'transferTo', input: {to: session.getAccount(1)}, value: new BigNumber(0), fee: new BigNumber(0), nonce: ix});
    //             block.content.addTransaction(tx);
    //         }
    //         const rcr =  new InterprocessRoutineManager(debuger.chain).create({block, storage: session.storage});
    //         assert(!rcr.err, 'create routine failed');
    //         rcr.routine.cancel();
    //         const er = await rcr.routine.execute();
    //         assert(er.err === ErrorCode.RESULT_CANCELED, 'routine cancel failed');
    //     }
    //     __test().then(done);
    // });
});