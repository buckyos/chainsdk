import {ErrorCode, ValueTransaction, BufferWriter, LoggerInstance, fromStringifiable} from '../../core';
import {RPCClient} from '../lib/rpc_client';

export type HostClientOptions = {host: string, port: number, logger: LoggerInstance};

export class HostClient {
    protected m_logger: LoggerInstance;
    constructor(options: HostClientOptions) {
        this.m_logger = options.logger;
        this.m_client = new RPCClient(options.host, options.port, this.m_logger);
    }

    async getBlock(params: {which: string|number|'lastest', transactions?: boolean}): Promise<{err: ErrorCode, block?: any, txs?: any[]}> {
        let cr = await this.m_client.callAsync('getBlock', params);
        if (cr.ret !== 200) {
            return {err: ErrorCode.RESULT_FAILED};
        }
        return JSON.parse(cr.resp!);
    }

    async getTransactionReceipt(params: {tx: string}): Promise<{err: ErrorCode, block?: any, tx?: any, receipt?: any}> {
        let cr = await this.m_client.callAsync('getTransactionReceipt', params);
        if (cr.ret !== 200) {
            return {err: ErrorCode.RESULT_FAILED};
        }
        return JSON.parse(cr.resp!);
    }

    async getNonce(params: {address: string}): Promise<{err: ErrorCode, nonce?: number}> {
        let cr = await this.m_client.callAsync('getNonce', params);
        if (cr.ret !== 200) {
            return {err: ErrorCode.RESULT_FAILED};
        }
        return JSON.parse(cr.resp!);
    }

    async sendTransaction(params: {tx: ValueTransaction}): Promise<{err: ErrorCode}> {
        let writer = new BufferWriter();
        let err = params.tx.encode(writer);
        if (err) {
            this.m_logger.error(`send invalid transactoin`, params.tx);
            return {err};
        }
        let cr = await this.m_client.callAsync('sendTransaction', {tx: writer.render()});
        if (cr.ret !== 200) {
            this.m_logger.error(`send tx failed ret `, cr.ret);
            return {err: ErrorCode.RESULT_FAILED};
        }
        return {err: JSON.parse(cr.resp!) as ErrorCode};
    } 

    async view(params: {method: string, params: any, from?: number|string|'latest'}): Promise<{err: ErrorCode, value?: any}> {
        let cr = await this.m_client.callAsync('view', params);
        if (cr.ret !== 200) {
            return {err: ErrorCode.RESULT_FAILED};
        }
        return fromStringifiable(JSON.parse(cr.resp!));
    }

    async getPeers(): Promise<string[]> {
        let cr = await this.m_client.callAsync('getPeers', {});
        return JSON.parse(cr.resp!);
    }

    private m_client: RPCClient;
}