import {RPCServer} from '../lib/rpc_server';
import {Options as CommandOptions} from '../lib/simple_command';

import {ErrorCode, Chain, Miner, Transaction, ValueTransaction, toStringifiable, LoggerInstance} from '../../core';
import { isUndefined } from 'util';

function promisify(f: any) {
    return () => {
        let args = Array.prototype.slice.call(arguments);
        return new Promise((resolve, reject) => {
            args.push((err: any, result: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
            f.apply(null, args);
        });
    };
}

export class ChainServer {
    private m_logger: LoggerInstance;
    constructor(logger: LoggerInstance, chain: Chain, miner?: Miner) {
        this.m_chain = chain;
        this.m_miner = miner;
        this.m_logger = logger;
    }

    init(commandOptions: CommandOptions): boolean {
        let host = commandOptions.get('rpchost');
        if (!host) {
            return false;
        }
        let port = commandOptions.get('rpcport');
        if (!port) {
            return false;
        }
        this.m_server = new RPCServer(host, parseInt(port, 10));
        this._initMethods();
        this.m_server.start();
        return true;
    }

    _initMethods() {
        this.m_server!.on('sendTransaction', async (params: {tx: any}, resp) => {
            let tx = ValueTransaction.fromRaw(Buffer.from(params.tx, 'hex'), ValueTransaction);
            if (!tx) {
                await promisify(resp.write.bind(resp)(JSON.stringify(ErrorCode.RESULT_INVALID_FORMAT)));
            } else {
                this.m_logger.debug(`rpc server txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
                const err = await this.m_chain.addTransaction(tx);
                await promisify(resp.write.bind(resp)(JSON.stringify(err)));
            }
            await promisify(resp.end.bind(resp)());
        });

        this.m_server!.on('getTransactionReceipt', async (params: {tx: string}, resp) => {
            let cr = await this.m_chain.getTransactionReceipt(params.tx);
            if (cr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({err: cr.err})));
            } else {
                await promisify(resp.write.bind(resp)(JSON.stringify({
                    err: ErrorCode.RESULT_OK,
                    block: cr.block!.stringify(),
                    tx: cr.tx!.stringify(),
                    receipt: cr.receipt!.stringify()
                })));
            }
            await promisify(resp.end.bind(resp)());
        });

        this.m_server!.on('getNonce', async (params: {address: string}, resp) => {
            let nonce = await this.m_chain.getNonce(params.address);
            await promisify(resp.write.bind(resp)(JSON.stringify(nonce)));
            await promisify(resp.end.bind(resp)());
        });

        this.m_server!.on('view', async (params: {method: string, params: any, from?: number|string|'latest'}, resp) => {
            let cr = await this.m_chain.view(isUndefined(params.from) ? 'latest' : params.from , params.method, params.params);
            if (cr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({err: cr.err})));
            } else {
                let s;
                try {
                    s = toStringifiable(cr.value!, true);
                    cr.value = s;
                } catch (e) {
                    this.m_logger.error(`call view ${params} returns ${cr.value!} isn't stringifiable`);
                    cr.err = ErrorCode.RESULT_INVALID_FORMAT;
                    delete cr.value;
                }
                await promisify(resp.write.bind(resp)(JSON.stringify(cr)));
            }
            await promisify(resp.end.bind(resp)());
        });

        this.m_server!.on('getBlock', async (params: {which: number|string|'latest', transactions?: boolean}, resp) => {
            let hr = await this.m_chain.getHeader(params.which);
            if (hr.err) {
                await promisify(resp.write.bind(resp)(JSON.stringify({err: hr.err})));
            } else {
                // 是否返回 block的transactions内容
                if (params.transactions) {
                    let block = await this.m_chain.getBlock(hr.header!.hash);
                    if ( block ) {
                        // 处理block content 中的transaction, 然后再响应请求
                        let transactions = block.content.transactions.map((tr: Transaction) => tr.stringify());
                        let res = {err: ErrorCode.RESULT_OK, block: hr.header!.stringify(), transactions};
                        await promisify(resp.write.bind(resp)(JSON.stringify(res)));
                    }
                } else {
                    await promisify(resp.write.bind(resp)(JSON.stringify({err: ErrorCode.RESULT_OK, block: hr.header!.stringify()})));
                }
            }
            await promisify(resp.end.bind(resp))();
        });

        this.m_server!.on('getPeers', async (args, resp) => {
            let peers = this.m_chain.node.getNetwork()!.node.dumpConns();
            await promisify(resp.write.bind(resp)(JSON.stringify(peers)));
            await promisify(resp.end.bind(resp)());
        });
    }

    private m_chain: Chain;
    private m_miner?: Miner;
    private m_server?: RPCServer;
}