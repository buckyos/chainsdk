import {ErrorCode} from '../error_code';
import {BaseNode, BaseNodeOptions} from './base_node';

export type RandomOutNodeOptions = {minOutbound: number, checkCycle: number} & BaseNodeOptions;

export class RandomOutNode extends BaseNode {
    constructor(options: RandomOutNodeOptions) {
        super(options);
        this.m_minOutbound = options.minOutbound;
        this.m_checkCycle = options.checkCycle;
    }

    private m_minOutbound: number;
    private m_checkCycle: number;
    private m_checkOutboundTimer: any;

    public uninit() {
        if (this.m_checkOutboundTimer) {
            clearInterval(this.m_checkOutboundTimer);
            delete this.m_checkOutboundTimer;
        }
        return super.uninit();
    }

    public async initialOutbounds(): Promise<ErrorCode> {
        this.logger.debug(`initialOutbounds`);
        if (this.m_minOutbound === 0) {
            return ErrorCode.RESULT_SKIPPED;
        }
        let err = await this._newOutbounds(this.m_minOutbound);
        if (err) {
            return err;
        }
        this.m_checkOutboundTimer = setInterval(() => {
            let next = this.m_minOutbound - (this.m_connecting.size + this.m_node.getConnnectionCount());
            if (next > 0) {
                this.logger.debug(`node need more ${next} connection, call  _newOutbounds`);
                this._newOutbounds(next);
            }
        }, this.m_checkCycle);
        return ErrorCode.RESULT_OK;
    }

    protected async _newOutbounds(count: number, callback?: (count: number) => void): Promise<ErrorCode> {
        let peerids: string[] = this.m_nodeStorage.get('all');
        let willConn = new Set();
        for (let pid of peerids) {
            if (this._onWillConnectTo(pid)) {
                willConn.add(pid);
            }
        }
        this.logger.debug(`will connect to peers from node storage: `, willConn);
        if (willConn.size < count) {
            let excludes: string[] = [];
            for (const pid of this.m_connecting) {
                excludes.push(pid);
            }
            for (const pid of willConn) {
                excludes.push(pid);
            }
            for (const ib of this.node.getInbounds()) {
                excludes.push(ib.getRemote());
            }
            for (const ob of this.node.getOutbounds()) {
                excludes.push(ob.getRemote());
            }
            let result = await this.m_node.randomPeers(count, excludes);
            
            if (result.peers.length === 0) {
                result.peers = this.m_nodeStorage.staticNodes.filter((value) => !excludes.includes(value));
                result.err = result.peers.length > 0 ? ErrorCode.RESULT_OK : ErrorCode.RESULT_SKIPPED;
            }

            if (result.err === ErrorCode.RESULT_OK) {
                this.logger.debug(`will connect to peers from random peers: `, result.peers);
                for (let pid of result.peers) {
                    willConn.add(pid);
                }
            } else if (result.err === ErrorCode.RESULT_SKIPPED) {
                this.logger.error(`cannot find any peers, ignore connect.`);
                return ErrorCode.RESULT_SKIPPED;
            } else {
                this.logger.error(`random peers failed for : `, result.err);
                return result.err;
            }
        }
        
        return await this._connectTo(willConn, callback);
    }
}