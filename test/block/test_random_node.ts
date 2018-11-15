import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {Transaction, RandomOutNetwork, TcpNode, staticPeeridIp, StaticOutNode, INode, BlockHeader, ErrorCode, initLogger, Network, BAN_LEVEL, Receipt } from '../../src/core';
import {FakeHeaderStorage} from '../fake/header_storage';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

describe('RandomNode', () => {
    let tcpnodes: INode[] = [];
    let nodes: Network[] = [];
    let peerids: string[] = [];
    const logger = initLogger({loggerOptions: {console: true, level: 'error'}});
    const headerStorage = new FakeHeaderStorage();
    const rootDir = path.join(__dirname, '../../../../data/test/randomNode');
    before(() => {
        fs.removeSync(rootDir);
        fs.ensureDirSync(rootDir);
        let nodeType = staticPeeridIp.splitInstance(StaticOutNode(TcpNode));
        for (let i = 0; i < 10; ++i) {
            peerids.push(`127.0.0.1:${10000 + i}`);
        }
        for (let i = 0; i < 10; ++i) {
            const pid = peerids[i];
            let others = [];
            for (let _pid of peerids) {
                if (_pid !== pid) {
                    others.push(_pid);
                }
            }
            const tcpNode = new nodeType(others, {network: 'default', peerid: pid, host: '127.0.0.1', port: 10000 + i});
            tcpnodes.push(tcpNode);
            const network = new RandomOutNetwork({
                node: tcpNode,
                logger,
                dataDir: path.join(rootDir, i.toString()),
                headerStorage,
                blockHeaderType: BlockHeader,
                transactionType: Transaction,
                receiptType: Receipt, 
            });
            nodes.push(network);
            network.setInstanceOptions({
                minOutbound: 5,
                checkCycle: 500
            });
        }
    });

    after(() => {
        let ops = [];
        for (let n of nodes) {
            ops.push(n.uninit());
        }
        return Promise.all(ops);
    });

    it(`initial 1 outbounds`, (done) => {
        async function __test() {
            assert(!(await nodes[0].init()), '0 init err');
            assert(!(await nodes[1].init()), '1 init err');
            assert(!(await nodes[1].listen()), '1 listen err');

            logger.info('connection 0=>1');
            assert(!(await nodes[0].initialOutbounds()), '0 initialOutbounds err');
            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    assert(nodes[0].node.getConnnectionCount() === 1, '0 getConnnectionCount err ');
                    assert(nodes[1].node.getConnnectionCount() === 1, '1 getConnnectionCount err ');
                    resolve();
                }, 1000);
            });

            logger.info('connection 1=>0, should ignore for 0=>1 exists');
            assert(!(await nodes[0].listen()), '0 listen err');
            assert(!(await nodes[1].initialOutbounds()), '0 initialOutbounds err');
            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    assert(nodes[0].node.getConnnectionCount() === 1, '0 getConnnectionCount err ');
                    assert(nodes[1].node.getConnnectionCount() === 1, '1 getConnnectionCount err ');
                    resolve();
                }, 1000);
            });

            logger.info('ban 0=>1, should open connection 0=>2');
            assert(nodes[0].node.getConnection(peerids[1]), 'get connection 0=>1 err');
            // let conn01 = nodes[0].node.getConnection(peerids[1]);
            nodes[0].banConnection(peerids[1], BAN_LEVEL.forever);
            assert(!nodes[0].node.getConnection(peerids[1]), `ban connection 0=>1 err`);
            assert(!(await nodes[2].init()), '2 init err');
            assert(!(await nodes[2].listen()), '2 listen err');
            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    assert(nodes[0].node.getConnnectionCount() === 1, '0 getConnnectionCount err ');
                    assert(nodes[0].node.getConnection(peerids[2]), '0 getConnection of 2 err');
                    assert(nodes[1].node.getConnnectionCount() >= 1, '1 getConnnectionCount err ');
                    assert(nodes[1].node.getConnection(peerids[2]), '1 getConnection of 2 err');
                    assert(nodes[2].node.getConnnectionCount() === 2, '2 getConnnectionCount err ');
                    assert(nodes[2].node.getConnection(peerids[0]), '2 getConnection of 0 err');
                    assert(nodes[2].node.getConnection(peerids[1]), '2 getConnection of 1 err');
                    resolve();
                }, 2000);
            });
        }
        __test().then(done);
    });

    it(`init 5 outbounds`, (done) => {
        async function __test() {
            assert(!(await nodes[2].initialOutbounds()), `2 initialOutbounds err`);
            logger.info('3--7 init, listen, initialOutbounds');
            for (let i = 3; i < 10; ++i) {
                assert(!(await nodes[i].init()), `${i} init err`);
                assert(!(await nodes[i].listen()), `${i} listen err`);
                assert(!(await nodes[i].initialOutbounds()), `${i} initialOutbounds err`);
            }

            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    for (let i = 0; i < 10; ++i) {
                        assert(nodes[i].node.getConnnectionCount() >= 5, `${i} getConnnectionCount err`);
                    }
                    resolve();
                }, 5000);
            });
        }
        __test().then(done);
    });
});