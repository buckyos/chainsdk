import 'mocha';
import * as path from 'path';
import * as fs from 'fs-extra';
const assert = require('assert');
import {initChainCreator, INode, Chain, Miner, Block, BlockHeader, BufferReader, initLogger, LogShim, MinerInstanceOptions, BufferWriter, LoggerOptions, ErrorCode, staticPeeridIp, TcpNode, StaticOutNode, BaseHandler, Storage, ChainContructOptions, InprocessRoutineManager } from '../../src/core';

process.on('unhandledRejection', (reason, p) => {
    console.log('未处理的 rejection：', p, '原因：', reason);
    // 记录日志、抛出错误、或其他逻辑。
});

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

describe('2 networks', () => {
    let peers: string[] = [];
    let nodes: INode[] = [];
    const nodeType = StaticOutNode(staticPeeridIp.splitInstance(TcpNode));
    const logger = initLogger({loggerOptions: {console: true, level: 'error'}});
    const rootDir = path.join(__dirname, '../../../../data/test/networks');
    let chains: TestChain[] = [];
    let miners: TestMiner[] = [];
    const cc = initChainCreator({logger});
    
    before((done) => {
        async function __test() {
            fs.removeSync(rootDir);
            fs.ensureDirSync(rootDir);
            for (let i = 0; i < 4; ++i) {
                peers.push(`127.0.0.1:${10000 + i}`);
            }

            for (let i = 0; i < 2; ++i) {
                const pid = peers[i];
                let others = [];
                for (let _pid of peers.slice(0, 3)) {
                    if (_pid !== pid) {
                        others.push(_pid);
                    }
                }
                const tcpNode = new nodeType(others, {network: 'n1', peerid: pid, host: '127.0.0.1', port: 10000 + i, logger});
                nodes.push(tcpNode);
            }

            for (let i = 2; i < 4; ++i) {
                const pid = peers[i];
                let others = [];
                for (let _pid of peers.slice(2, 4)) {
                    if (_pid !== pid) {
                        others.push(_pid);
                    }
                }
                const tcpNode = new nodeType(others, {network: 'n2', peerid: pid, host: '127.0.0.1', port: 10000 + i, logger});
                nodes.push(tcpNode);
            }

            const minerPeers = [0];

            logger.info(`create genesis`);
            {
                const genesisDir = path.join(rootDir, `genesis`);
                const genesisMiner = new TestMiner({networkCreator: cc.networkCreator, logger, dataDir: genesisDir, globalOptions: {txlivetime: 1000000, maxPengdingCount: 10000, warnPengdingCount: 5000}, handler: new BaseHandler(), miners: minerPeers, miner: 0});
                
                assert(!(await genesisMiner.initComponents()), `initComponets genesis err`);
                assert(!(await genesisMiner.create({txlivetime: 1000000})), 'create genesis err');
                await genesisMiner.uninitComponents();
                for (let i = 0; i < 3; ++i) {
                    const dataDir = path.join(rootDir, `${i}`);
                    fs.ensureDirSync(dataDir);
                    fs.copySync(genesisDir, dataDir);
                }
            }

            {
                logger.info(`create miners`);
                const mLogger = new LogShim(logger).bind(`[miner: ${0}]`, true).log;
                const dataDir = path.join(rootDir, `${0}`);
                let miner = new TestMiner({networkCreator: cc.networkCreator, logger: mLogger, miners: minerPeers, miner: 0, dataDir, globalOptions: {}, handler: new BaseHandler() });
                assert(!(await miner.initComponents()), `initComponets ${0} err`);
                miners.push(miner);
                chains.push(miner.chain);
            }
            
            logger.info(`create peers`);
            for (let i = 1; i < 3; ++i) {
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
            
            await Promise.all(createOp);

            await new Promise((resolve) => {
                // stop之后等一会儿再
                setTimeout(resolve, 1000);
            });

            const otherTip = miners[0].chain.tipBlockHeader!;
            assert(otherTip.number === 5, '0 mine 5 seconds no enough block mined');
        }
        __test().then(done);
    });

    // 单个peer从单个miner同步
    it('1 peer from 1 miner sync in 1 network', (done) => {
        async function __test() {
            logger.info(`start peer 1`);
            assert(!(await chains[1].initialize({
                networks: [
                    chains[1].newNetwork({node: nodes[1], minOutbound: 5}).network!, 
                    chains[1].newNetwork({node: nodes[2], minOutbound: 0}).network!
                ],
                initializePeerCount: 1,
                routineManagerType: InprocessRoutineManager,
            })), `chain ${1} initialize err`);
            assert(chains[1].tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, `initialize peer ${1} tip err`);
        }
        __test().then(done);
    });

    // 单个peer从另一个network同步
    it('1 peer from 1 peer sync in 2 network', (done) => {
        async function __test() {
            logger.info(`start peer 2`);
            assert(!(await chains[2].initialize({
                networks: [
                    chains[1].newNetwork({node: nodes[3], minOutbound: 5}).network!, 
                ],
                initializePeerCount: 1,
                routineManagerType: InprocessRoutineManager,
            })), `chain ${2} initialize err`);
            assert(chains[2].tipBlockHeader!.number === miners[0].chain.tipBlockHeader!.number, `initialize peer ${2} tip err`);
        }
        __test().then(done);
    });
});