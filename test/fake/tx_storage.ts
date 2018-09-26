import {ITxStorage, ErrorCode} from '../../src/core';

export class FakeTxStorage implements ITxStorage {
    async init(): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    uninit() {
        
    }

    async add(blockhash: string): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    async remove(nBlockHeight: number): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    async get(txHash: string): Promise<{err: ErrorCode, blockhash?: string}> {
        return {err: ErrorCode.RESULT_OK};
    }

    async getCountByAddress(address: string): Promise<{err: ErrorCode, count?: number}> {
        return {err: ErrorCode.RESULT_OK};
    }
}