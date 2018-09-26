import {ErrorCode} from '../error_code';
import {BaseNode, BaseNodeOptions, PackageStreamWriter, NodeConnection} from '../chain';

export type ValidatorsNodeOptions = {minConnectionRate: number} & BaseNodeOptions;

export class ValidatorsNode extends BaseNode {
    private m_validators: string[] = [];
    private m_minConnectionRate: number;
    constructor(options: ValidatorsNodeOptions) {
        super(options);
        this.m_minConnectionRate = options.minConnectionRate;
    }

    setValidators(validators: string[]) {
        this.m_validators = [];
        this.m_validators.push(...validators); 
    }

    getValidators(): string[] {
        const v = this.m_validators;
        return v;
    }

    private _getMinOutbound(): number {
        return Math.ceil(this.m_validators.length * this.m_minConnectionRate); 
    }

    private m_checkOutboundTimer: any;

    public async initialOutbounds(): Promise<ErrorCode> {
        this._checkConnections();
        this.m_checkOutboundTimer = setInterval(() => {
            this._checkConnections();
        }, 1000);
        let bSelf: boolean = false;
        for (let v of this.m_validators) {
            if (v === this.node.peerid) {
                bSelf = true;
                break;
            }
        }
        if (this.m_validators.length === 0 || (bSelf && this.m_validators.length === 1)) {
            return ErrorCode.RESULT_SKIPPED;
        }
        return ErrorCode.RESULT_OK;
    }

    public uninit() {
        if (this.m_checkOutboundTimer) {
            clearInterval(this.m_checkOutboundTimer);
            delete this.m_checkOutboundTimer;
        }
        return super.uninit();
    }

    protected _checkConnections() {
        let connectionCount = 0; 
        for (let v of this.m_validators) {
            if (this.node.getConnection(v) || this.m_connecting.has(v)) {
                ++connectionCount;
            }
        }
        let willConn = new Set();
        if (connectionCount < this._getMinOutbound()) {
            for (let v of this.m_validators) {
                if (this._onWillConnectTo(v)) {
                    willConn.add(v);
                }
            }
            this._connectTo(willConn);
        }
    }

    public broadcastToValidators(writer: PackageStreamWriter): Promise<{err: ErrorCode, count: number}> {
        let validators = new Set(this.m_validators);
        return this.m_node.broadcast(writer, {count: validators.size, filter: (conn: NodeConnection) => {
            return validators.has(conn.getRemote());
        }});
    }
}