const assert = require('assert');
import {ErrorCode} from '../error_code';
import {IReadableStorage, IReadWritableStorage, Chain} from '../value_chain';
import {DbftBlockHeader} from './block';
import {LoggerInstance} from '../lib/logger_util';
import * as libAddress from '../address';
import * as digest from '../lib/digest';

type CandidateInfo = {
    height: number;
};

export class DbftContext {
    public static kvDBFT: string = 'dbft';
    public static keyCandidate: string = 'candidate';
    public static keyMiners: string = 'miner';

    constructor(protected storage: IReadableStorage, protected globalOptions: any, protected logger: LoggerInstance) {

    }

    public async init(miners: string[]): Promise<{err: ErrorCode}> {
        let storage = this.storage as IReadWritableStorage;
        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return {err: dbr.err};
        }
        let kvr = await dbr.value!.getReadWritableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return {err: kvr.err};
        }
        let kvDBFT = kvr.kv!;
        await kvDBFT.set(DbftContext.keyMiners, JSON.stringify(miners));
        for (let address of miners) {
            let info: CandidateInfo = {height: 0};
            let {err} = await kvDBFT.hset(DbftContext.keyCandidate, address, info);
            if (err) {
                return {err};
            }
        }
        return {err: ErrorCode.RESULT_OK};
    }

    static getElectionBlockNumber(globalOptions: any, n: number) {
        if (n === 0) {
            return 0;
        }
        return Math.floor((n - 1) / globalOptions.reSelectionBlocks) * globalOptions.reSelectionBlocks;
    }

    static isElectionBlockNumber(globalOptions: any, n: number): boolean {
        // n=0的时候为创世块，config里面还没有值呢
        if (n === 0) {
            return true;
        }
        return  n % globalOptions.reSelectionBlocks === 0;
    }

    static isAgreeRateReached(globalOptions: any, minerCount: number, agreeCount: number): boolean {
        return agreeCount >= (minerCount * globalOptions.agreeRateNumerator / globalOptions.agreeRateDenominator); 
    }

    static getDueNextMiner(globalOptions: any, preBlock: DbftBlockHeader, nextMiners: string[], view: number): string {
        let offset = view;
        if (!DbftContext.isElectionBlockNumber(globalOptions, preBlock.number)) {
            let idx = nextMiners.indexOf(preBlock.miner);
            if (idx >= 0) {
                offset += idx + 1;
            }
        }
        return nextMiners[offset % nextMiners.length];
    } 

    public async getMiners(): Promise<{err: ErrorCode, miners?: string[]}> {
        let dbr = await this.storage.getReadableDataBase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return {err: dbr.err};
        }
        let kvr = await dbr.value!.getReadableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return {err: kvr.err};
        }
        let kvDBFT = kvr.kv!;
        let gm = await kvDBFT.get(DbftContext.keyMiners);
        if (gm.err) {
            this.logger.error(`getMinersFromStorage failed,errcode=${gm.err}`);
            return {err: gm.err};
        }
        
        return {err: ErrorCode.RESULT_OK, miners: JSON.parse(gm.value)};
    }

    public async isMiner(address: string): Promise<{err: ErrorCode, isminer?: boolean}> {
        let dbr = await this.storage.getReadableDataBase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return {err: dbr.err};
        }
        let kvr = await dbr.value!.getReadableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return {err: kvr.err};
        }
        let kvDBFT = kvr.kv!;
        let gm = await kvDBFT.get(DbftContext.keyMiners);
        if (gm.err) {
            if (gm.err  === ErrorCode.RESULT_NOT_FOUND) {
                return {err: ErrorCode.RESULT_OK, isminer: false};
            } else {
                return {err: gm.err};
            }
        }
        let miners = new Set(JSON.parse(gm.value!));
        return {err: ErrorCode.RESULT_OK, isminer: miners.has(address)};
    }

    async registerToCandidate(superAdmin: string, blockheight: number, address: string): Promise<ErrorCode> {
        if (superAdmin !== this.globalOptions.superAdmin) {
            this.logger.error(`registerToCandidate superAdmin error should ${this.globalOptions.superAdmin} but ${superAdmin} address=${address}`);
            return ErrorCode.RESULT_NOT_SUPPORT;
        }
        /*
        if (!libAddress.verify(Buffer.from(digest.md5(Buffer.from(address, 'hex')).toString('hex')), Buffer.from(sign, 'hex'), Buffer.from(this.globalOptions.systemPubkey, 'hex'))) {
            this.logger.error(`registerToCandidate superAdmin sign error,address=${address}`);
            return ErrorCode.RESULT_NOT_SUPPORT;
        }
        */
        let storage = this.storage as IReadWritableStorage;
        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return dbr.err;
        }
        let kvr = await dbr.value!.getReadWritableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv!;
        let info: CandidateInfo = {height: blockheight};
        let {err} = await kvDBFT.hset(DbftContext.keyCandidate, address, info);

        return err;
    }

    async unRegisterFromCandidate(superAdmin: string, address: string): Promise<ErrorCode> {
        if (superAdmin !== this.globalOptions.superAdmin) {
            this.logger.error(`registerToCandidate superadmin error should ${this.globalOptions.superAdmin} but ${superAdmin} address=${address}`);
            return ErrorCode.RESULT_NOT_SUPPORT;
        }
        /*
        if (!libAddress.verify(Buffer.from(digest.md5(Buffer.from(address, 'hex')).toString('hex')), Buffer.from(sign, 'hex'), Buffer.from(this.globalOptions.systemPubkey, 'hex'))) {
            this.logger.error(`registerToCandidate superadmin sign error,address=${address}`);
            return ErrorCode.RESULT_NOT_SUPPORT;
        }
        */
        
        let storage = this.storage as IReadWritableStorage;
        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return dbr.err;
        }
        let kvr = await dbr.value!.getReadWritableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv!;

        let {err} = await kvDBFT.hdel(DbftContext.keyCandidate, address);

        return err;
    }

    public async updateMiners(blockheight: number): Promise<ErrorCode> {
        let storage = this.storage as IReadWritableStorage;
        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            this.logger.error(`get system database failed ${dbr.err}`);
            return dbr.err;
        }
        let kvr = await dbr.value!.getReadWritableKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            this.logger.error(`get dbft keyvalue failed ${dbr.err}`);
            return kvr.err;
        }
        let kvDBFT = kvr.kv!;

        let ga = await kvDBFT.hgetall(DbftContext.keyCandidate);
        if (ga.err) {
            this.logger.error(`updateCandidate failed,hgetall errcode=${ga.err}`);
            return ga.err;
        }
        let minWaitBlocksToMiner: number = this.globalOptions.minWaitBlocksToMiner;
        let miners: string[] = [];
        ga.value!.forEach((v) => {
            let info: CandidateInfo = v.value;
            if (blockheight - info.height >= minWaitBlocksToMiner) {
                miners.push(v.key);
            }
        });
        let minValidator: number = this.globalOptions.minValidator;
        let maxValidator: number = this.globalOptions.maxValidator;
        if (minValidator > miners.length) {
            this.logger.error(`updateCandidate failed, valid miners not enough, length ${miners.length} minValidator ${minValidator}`);
            return ErrorCode.RESULT_NOT_ENOUGH;
        }
        if (miners.length > maxValidator) {
            miners = miners.slice(maxValidator);
        }
        let {err} = await kvDBFT.set(DbftContext.keyMiners, JSON.stringify(miners));

        return err;  
    }
}