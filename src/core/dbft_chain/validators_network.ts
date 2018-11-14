import {isNullOrUndefined} from 'util';
import {ErrorCode} from '../error_code';
import {Network, NetworkOptions, NetworkInstanceOptions, PackageStreamWriter, NodeConnection} from '../chain';

export type ValidatorsNetworkInstanceOptions = {minConnectionRate: number, initialValidator: string} & NetworkInstanceOptions;

export class ValidatorsNetwork extends Network {
    private m_validators: string[] = [];
    private m_minConnectionRate?: number;
    constructor(options: NetworkOptions) {
        super(options);
    }

    setInstanceOptions(options: any) {
        super.setInstanceOptions(options);
        this.m_minConnectionRate = options.minConnectionRate;
        this.setValidators([options.initialValidator]);
    }

    parseInstanceOptions(options: {parsed: any, origin: Map<string, any>}) {
        let por = super.parseInstanceOptions(options);
        if (por.err) {
            return {err: por.err};
        }
        let value = Object.create(por.value);

        if (!isNullOrUndefined(options.parsed.minConnectionRate)) {
            value.minConnectionRate = options.parsed.minConnectionRate;
        } else if (options.origin.has('minConnectionRate')) {
            value.minConnectionRate = parseInt(options.origin.get('minConnectionRate'));
        } else {
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }

        if (!isNullOrUndefined(options.parsed.initialValidator)) {
            value.initialValidator = options.parsed.initialValidator;
        } else if (options.origin.has('initialValidator')) {
            value.initialValidator = options.origin.get('initialValidator');
        } else {
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        return {err: ErrorCode.RESULT_OK, value};
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
        return Math.ceil(this.m_validators.length * this.m_minConnectionRate!); 
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
            return validators.has(conn.remote!);
        }});
    }
}