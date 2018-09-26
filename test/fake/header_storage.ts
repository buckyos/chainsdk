import {IHeaderStorage, VERIFY_STATE, BlockHeader, ErrorCode } from '../../src/core';
import {FakeTxStorage} from './tx_storage';

export class FakeHeaderStorage implements IHeaderStorage {
    get txView()  {
        return new FakeTxStorage();
    }

    public async init(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    uninit() {
        
    }

    public async getHeader(arg1: string|number|'latest'): Promise<{err: ErrorCode, header?: BlockHeader, verified?: VERIFY_STATE}>;
    public async getHeader(arg1: string|BlockHeader, arg2: number): Promise<{err: ErrorCode, header?: BlockHeader, headers?: BlockHeader[]}>;
    public async getHeader(arg1: string|number|'latest'|BlockHeader, arg2?: number): Promise<{err: ErrorCode, header?: BlockHeader, headers?: BlockHeader[]}> {
        let gh = new BlockHeader();
        gh.updateHash();
        return {err: ErrorCode.RESULT_OK, header: gh};
    }

    public async getHeightOnBest(hash: string): Promise<{ err: ErrorCode, height?: number, header?: BlockHeader }> {
        return { err: ErrorCode.RESULT_OK, height: 0 };
    }

    public async saveHeader(header: BlockHeader): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async createGenesis(genesis: BlockHeader): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async getNextHeader(hash: string): Promise<{err: ErrorCode, results?: {header: BlockHeader, verified: VERIFY_STATE}[]}> {
        return {err: ErrorCode.RESULT_OK, results: []};
    }

    public async updateVerified(header: BlockHeader, verified: VERIFY_STATE): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    public async changeBest(header: BlockHeader): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }
}