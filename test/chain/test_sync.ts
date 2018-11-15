import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {initChainCreator, INode, Chain, Miner, Block, BlockHeader, BufferReader, initLogger, LogShim, MinerInstanceOptions, BufferWriter, LoggerOptions, ErrorCode, staticPeeridIp, TcpNode, StaticOutNode, BaseHandler, Storage, ChainContructOptions, InprocessRoutineManager } from '../../src/core';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

const startport = 20000;
class TestBlockHeader extends BlockHeader {
    constructor() {
        super();
        this.m_miner = 0;
    }

    private m_miner: number;

    get miner(): number {
        return this.m_miner;
    }

    set miner(miner: number) {
        this.m_miner = miner;
    }

    protected _encodeHashContent(writer: BufferWriter): ErrorCode {
        let err = super._encodeHashContent(writer);
        if (err) {
            return err;
        }
        try {
            writer.writeU16(this.m_miner);
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        
        return ErrorCode.RESULT_OK;
    }

    protected _decodeHashContent(reader: BufferReader): ErrorCode {
        let err: ErrorCode = super._decodeHashContent(reader);
        if (err !== ErrorCode.RESULT_OK) {
            return err;
        }
        try {
            this.m_miner = reader.readU16();
        } catch (e) {
            return ErrorCode.RESULT_INVALID_FORMAT;
        }
        return ErrorCode.RESULT_OK;
    }

    public async verify(chain: TestChain): Promise<{err: ErrorCode, valid?: boolean}> {
        let vr = await super.verify(chain);
        if (vr.err || !vr.valid) {
            return vr;
        }
        const valid = chain.miners.includes(this.m_miner);
        return {err: ErrorCode.RESULT_OK, valid};
    }
}

class TestChain extends Chain {
    constructor(options: ChainContructOptions&{miners: number[]}) {
        super(options);
        this.m_miners = options.miners.slice(0);
    }

    private m_miners: number[];

    get miners(): number[] {
        const m = this.m_miners;
        return m;
    }

    protected _getBlockHeaderType() {
        return TestBlockHeader;
    }

    async onCreateGenesisBlock(block: Block, storage: Storage, genesisOptions?: any): Promise<ErrorCode> {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }
        let gkvr = await storage.getKeyValue(Chain.dbSystem, Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv!.set('consensus', 'test');
        if (rpr.err) {
            return rpr.err;
        }
        block.header.updateHash();
        return ErrorCode.RESULT_OK;
    }
}

class TestMiner extends Miner {
    private m_miner?: number;
    private m_miners: number[];
    private m_mining: boolean = false;

    constructor(options: ChainContructOptions&{miners: number[], miner: number}) {
        super(options);
        this.m_miner = options.miner;
        this.m_miners = options.miners.slice(0);
    }

    get chain(): TestChain {
        return this.m_chain as TestChain;
    }

    protected _chainInstance(): Chain {
        return new TestChain(this.m_constructOptions);
    }

    public async initialize(options: MinerInstanceOptions): Promise<ErrorCode> {
        let err = await super.initialize(options);
        if (err) {
            return err;
        }
        return ErrorCode.RESULT_OK;
    }

    public startMine() {
        this.m_mining = true;
        this._onTipBlock(this.chain, this.chain.tipBlockHeader!);
    }

    public stopMine() {
        this.m_mining = false;
    }

    protected async _onTipBlock(chain: Chain, tipBlock: BlockHeader) {
        if (!this.m_mining) {
            return ;
        }
        this.m_logger.debug(`will createBlock after 500 ms`);
        setTimeout(() => {
            this.m_logger.info(`${this.m_miner} begin create block`);
            let gh = new TestBlockHeader();
            gh.setPreBlock(tipBlock);
            this._createBlock(gh);
        }, 500);
    }
    
    protected async _mineBlock(block: Block): Promise<ErrorCode> {
        (block.header as TestBlockHeader).miner = this.m_miner!;
        block.header.updateHash();
        return ErrorCode.RESULT_OK;
    }
}

describe('sync chain', () => {
    let peers: string[] = [];
    let nodes: INode[] = [];
    const nodeType = StaticOutNode(staticPeeridIp.splitInstance(TcpNode));
    const logger = initLogger({loggerOptions: {console: true, level: 'error'}});
    const rootDir = path.join(__dirname, '../../../../data/test/sync');
    let chains: TestChain[] = [];
    let miners: TestMiner[] = [];
    const cc = initChainCreator({logger});
    
    before((done) => {
        async function __test() {
            fs.removeSync(rootDir);
            fs.ensureDirSync(rootDir);
            for (let i = 0; i < 10 + 5; ++i) {
                peers.push(`127.0.0.1:${startport + i}`);
            }

            for (let i = 0; i < 10; ++i) {
                const pid = peers[i];
                let others = [];
                for (let _pid of peers.slice(0, 10)) {
                    if (_pid !== pid) {
                        others.push(_pid);
                    }
                }
                const tcpNode = new nodeType(others, {network: 'default', peerid: pid, host: '127.0.0.1', port: startport + i, logger});
                nodes.push(tcpNode);
            }
            const minerPeers = [0, 1, 2, 3];

            logger.info(`create genesis`);
            {
                const genesisDir = path.join(rootDir, `genesis`);
                const genesisMiner = new TestMiner({networkCreator: cc.networkCreator, logger, dataDir: genesisDir, globalOptions: {txlivetime: 1000000, maxPengdingCount: 10000, warnPengdingCount: 5000}, handler: new BaseHandler(), miners: minerPeers, miner: 0});
                
                assert(!(await genesisMiner.initComponents()), `initComponets genesis err`);
                assert(!(await genesisMiner.create({txlivetime: 1000000})), 'create genesis err');
                await genesisMiner.uninitComponents();
                for (let i = 0; i < 10 + 5; ++i) {
                    const dataDir = path.join(rootDir, `${i}`);
                    fs.ensureDirSync(dataDir);
                    fs.copySync(genesisDir, dataDir);
                }
            }

            logger.info(`create miners`);
            for (let i = 0; i < 4; ++i) {
                const mLogger = new LogShim(logger).bind(`[miner: ${i}]`, true).log;
                const dataDir = path.join(rootDir, `${i}`);
                let miner = new TestMiner({networkCreator: cc.networkCreator, logger: mLogger, miners: minerPeers, miner: i, dataDir, globalOptions: {}, handler: new BaseHandler() });
                assert(!(await miner.initComponents()), `initComponets ${i} err`);
                miners.push(miner);
                chains.push(miner.chain);
            }

            logger.info(`create peers`);
            for (let i = 4; i < 10; ++i) {
                const mLogger = new LogShim(logger).bind(`[peer: ${i}]`, true).log;
                const dataDir = path.join(rootDir, `${i}`);
                let chain = new TestChain({networkCreator: cc.networkCreator, logger: mLogger, miners: minerPeers, dataDir, globalOptions: {}, handler: new BaseHandler()});
                assert(!(await chain.initComponents()), `initComponets ${i} err`);
                chains.push(chain);
            }

            let chainToMiner: TestChain[] = [];
            logger.info(`create chain to miner peers`);
            for (let i = 10; i < 10 + 5; ++i) {
                const pid = peers[i];
                const tcpNode = new nodeType([peers[i - 1]], {network: 'default', peerid: pid, host: '127.0.0.1', port: startport + i, logger});
                nodes.push(tcpNode);
            }

            for (let i = 10; i < 10 + 5; ++i) {
                const mLogger = new LogShim(logger).bind(`[peer: ${i}]`, true).log;
                const dataDir = path.join(rootDir, `${i}`);
                let chain = new TestChain({networkCreator: cc.networkCreator, logger: mLogger, miners: minerPeers, dataDir, globalOptions: {}, handler: new BaseHandler()});
                assert(!(await chain.initComponents()), `initComponets ${i} err`);
                chains.push(chain);
            }
        }
        __test().then(done);
    });

    // miner出一些块
    it('miner create block', (done) => {
        async function __test() {
            const createOp = []; 

            logger.info(`start miner 0`);
            assert(!(await miners[0].initialize({
                networks: [miners[0].chain.newNetwork({node: nodes[0], minOutbound: 0}).network!],
                initializePeerCount: 0, 
                routineManagerType: InprocessRoutineManager,
            })), 'miner 0 initialize err');
            createOp.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number === 5) {
                        miners[0].chain.removeListener('tipBlock', onTip);
                        miners[0].stopMine();
                        resolve();
                    }  
                }
                miners[0].chain.prependListener('tipBlock', onTip);
            }));
            miners[0].startMine();

            logger.info(`start miner 1`);
            assert(!(await miners[1].initialize({
                networks: [miners[1].chain.newNetwork({node: nodes[1], minOutbound: 0}).network!], 
                minOutbound: 0,
                initializePeerCount: 0,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 1 initialize err');
            createOp.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number === 5) {
                        miners[1].chain.removeListener('tipBlock', onTip);
                        miners[1].stopMine();
                        resolve();
                    }  
                }
                miners[1].chain.prependListener('tipBlock', onTip);
            }));
            miners[1].startMine();

            logger.info(`start miner 2`);
            assert(!(await miners[2].initialize({
                networks: [miners[2].chain.newNetwork({node: nodes[2], minOutbound: 0}).network!],
                initializePeerCount: 0,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 2 initialize err');
            createOp.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number === 30) {
                        miners[2].chain.removeListener('tipBlock', onTip);
                        miners[2].stopMine();
                        assert(miners[2].chain.tipBlockHeader!.number === 30, '2 mine 30 block err');
                        resolve();
                    }  
                }
                miners[2].chain.prependListener('tipBlock', onTip);
            }));
            miners[2].startMine();

            logger.info(`start miner 3`);
            assert(!(await miners[3].initialize({
                networks: [miners[3].chain.newNetwork({node: nodes[3], minOutbound: 0}).network!],
                minOutbound: 0,
                initializePeerCount: 0,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 3 initialize err');
            createOp.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number === 15) {
                        miners[3].chain.removeListener('tipBlock', onTip);
                        miners[3].stopMine();
                        assert(miners[3].chain.tipBlockHeader!.number === 15, '3 mine 15 block err');
                        resolve();
                    }  
                }
                miners[3].chain.prependListener('tipBlock', onTip);
            }));
            miners[3].startMine();
            
            await Promise.all(createOp);

            await new Promise((resolve) => {
                // stop之后等一会儿再
                setTimeout(resolve, 1000);
            });

            const thisTip = miners[1].chain.tipBlockHeader!;
            assert(thisTip.number === 5, '1 mine 5 seconds no enough block mined');
            const otherTip = miners[0].chain.tipBlockHeader!;
            assert(otherTip.number === 5, '0 mine 5 seconds no enough block mined');
            assert(thisTip.hash !== otherTip.hash, `independed miners create save block`);
                
            await miners[1].uninitialize();
            await miners[2].uninitialize();
            await miners[3].uninitialize();
        }
        __test().then(done);
    });

    // 单个peer从单个miner同步
    it('1 peer from 1 miner sync', (done) => {
        async function __test() {
            logger.info(`start peer 2`);
            assert(!(await chains[miners.length + 0].initialize({
                networks: [chains[miners.length + 0].newNetwork({node: nodes[miners.length + 0], minOutbound: 5}).network!],
                initializePeerCount: 1,
                routineManagerType: InprocessRoutineManager,
            })), `chain ${miners.length + 0} initialize err`);
            assert(chains[miners.length + 0].tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, `initialize peer ${miners.length + 0} tip err`);
            
            logger.info(`0 continue mine and sync to peer ${miners.length + 0}`);
            miners[0].startMine();
            const checkTipInterval = setInterval(() => {
                const offset = (chains[miners.length + 0].tipBlockHeader!.number - miners[0].chain.tipBlockHeader!.number);
                assert(offset <= 1, `sync peer ${miners.length + 0} offset to miner 0 err`);
            }, 1000); 
            await new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number === 10) {
                        miners[0].chain.removeListener('tipBlock', onTip);
                        miners[0].stopMine();
                        resolve();
                    }
                }
                miners[0].chain.prependListener('tipBlock', onTip);
            });
            clearInterval(checkTipInterval);
        }
        __test().then(done);
    });

    // 单个peer从多个不一致的peer同步
    it('1 peer from 2 peer sync', (done) => {
        async function __test() {
            assert(!(await chains[miners.length + 1].initialize({
                networks: [chains[miners.length + 1].newNetwork({node: nodes[miners.length + 1], minOutbound: 5}).network!],
                initializePeerCount: 2,
                routineManagerType: InprocessRoutineManager,
            })), `chain ${miners.length + 1} initialize err`);
            assert(chains[miners.length + 1].tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, `initialize peer ${miners.length + 1} tip err`);
        }
        __test().then(done);
    });

    // 较短的fork从较长的tip合并，fork和tip差距在confirm depth以内
    it('merge short(in comfirm depth) shorter fork', (done) => {
        async function __test() {
            assert(!(await miners[1].initialize({
                networks: [miners[1].chain.newNetwork({node: nodes[1], minOutbound: 5}).network!],
                initializePeerCount: 2,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 1 initialize err');
            assert(miners[1].chain.tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, 'initialize miner 1 tip err');
        }
        __test().then(done);
    });

     // 从较长的tip从较短的fork合并，fork和tip差距在confirm depth以内
    it('merge short(in comfirm depth) longer fork', (done) => {
        async function __test() {
            let curTip = miners[3].chain.tipBlockHeader!;
            assert(!(await miners[3].initialize({
                networks: [miners[3].chain.newNetwork({node: nodes[3], minOutbound: 5}).network!],
                initializePeerCount: 2,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 3 initialize err');
            assert(miners[3].chain.tipBlockHeader!.hash === curTip.hash, 'initialize miner 3 tip err');
        }
        __test().then(done);
    });

    // 较长的tip上出块向外广播，较短的fork同步到tip，fork和tip差距在confirm depth以内
    it('broadcast short(in comfirm depth) longer fork', (done) => {
        async function __test() {
            miners[3].startMine();
            await new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.hash === miners[3].chain.tipBlockHeader!.hash) {
                        miners[3].stopMine();
                        chains[miners.length + 0].removeListener('tipBlock', onTip);
                        resolve();         
                    } else {
                        const offset = miners[3].chain.tipBlockHeader!.number - header.number;
                        logger.info(`chain ${miners.length + 0}'s tip offset to miner 3 is ${offset} now`);
                    }
                }
                chains[miners.length + 0].prependListener('tipBlock', onTip);
            });
            
        }
        __test().then(done);
    });

    // 合并两个长fork，fork之间的差距超过confirm depth
    it('merge long(beyound comfirm depth) fork', (done) => {
        async function __test() {
            miners[0].startMine();
            await new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    if (header.number > miners[2].chain.tipBlockHeader!.number) {
                        miners[0].chain.removeListener('tipBlock', onTip);
                        miners[0].stopMine();
                        resolve();
                    }  
                }
                miners[0].chain.prependListener('tipBlock', onTip);
            });
            
            assert(!(await miners[2].initialize({
                networks: [miners[2].chain.newNetwork({node: nodes[2], minOutbound: 5}).network!], 
                initializePeerCount: 2,
                routineManagerType: InprocessRoutineManager,
            })), 'miner 2 initialize err');
            assert(miners[2].chain.tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, 'initialize miner 2 tip err');
        }
        __test().then(done);
    });

    // 不直接连接到miner的节点从miner同步
    it(`sync with chain connection to miner`, (done) => {
        async function __test() {
            let initOp = [];
            initOp.push(chains[9].initialize({
                networks: [chains[9].newNetwork({node: nodes[9], minOutbound: 5}).network!],
                initializePeerCount: 2,
                routineManagerType: InprocessRoutineManager,
            }));
            for (let i = 10; i < 10 + 5; ++i) {
                initOp.push(chains[i].initialize({
                    networks: [chains[i].newNetwork({node: nodes[i], minOutbound: 1}).network!],
                    initializePeerCount: 1,
                    routineManagerType: InprocessRoutineManager,
                }));
            }
            await Promise.all(initOp);
            for (let i = 9; i < 10 + 5; ++i) {
                assert(chains[i].tipBlockHeader!.hash === chains[0].tipBlockHeader!.hash, `${i} initialize err`);
            }
        }
        __test().then(done);
    });

    // miner出块广播向外扩散
    it(`broadcast from miner to chain connection`, (done) => {
        async function __test() {
            let ops = [];
            ops.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    miners[0].chain.removeListener('tipBlock', onTip);
                    miners[0].stopMine();
                    resolve();
                }
                miners[0].chain.prependListener('tipBlock', onTip);
            }));
            miners[0].startMine();
            ops.push(new Promise((resolve) => {
                function onTip(chain: Chain, header: BlockHeader) {
                    miners[0].chain.removeListener('tipBlock', onTip);
                    assert(header.hash === miners[0].chain.tipBlockHeader!.hash);
                    resolve();
                }
                chains[14].prependListener('tipBlock', onTip);
            }));
            await Promise.all(ops);
        }
        __test().then(done);
    });
});