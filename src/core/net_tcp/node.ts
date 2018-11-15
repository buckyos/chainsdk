import {ErrorCode} from '../error_code';
import {Server, Socket} from 'net';
import {IConnection, NodeConnection, INode} from '../net';
import {TcpConnection} from './connection';
import { LoggerOptions } from '../lib/logger_util';

export class TcpNode extends INode {
    private m_options: any;
    private m_server: Server;

    constructor(options: {network: string, peerid: string, host: string, port: number} & LoggerOptions) {
        super({network: options.network, peerid: options.peerid, logger: options.logger, loggerOptions: options.loggerOptions});
        this.m_options = Object.create(null);
        Object.assign(this.m_options, options);
        this.m_server = new Server();
    }

    protected async _peeridToIpAddress(peerid: string): Promise<{err: ErrorCode, ip?: {host: string, port: number}}>  {
        return {err: ErrorCode.RESULT_NOT_SUPPORT};
    }

    protected async _connectTo(peerid: string): Promise<{err: ErrorCode, conn?: NodeConnection}> {
        let par = await this._peeridToIpAddress(peerid);
        if (par.err) {
            return {err: par.err};
        }
        let tcp = new Socket();
        return new Promise<{err: ErrorCode, conn?: NodeConnection}>((resolve, reject) => {
            tcp.once('error', (e) => {
                tcp.removeAllListeners('connect');
                resolve({err: ErrorCode.RESULT_EXCEPTION});
            });
            tcp.connect(par.ip!);
            tcp.once('connect', () => {
                let connNodeType = this._nodeConnectionType();
                let connNode: any = (new connNodeType(this, {socket: tcp , remote: peerid}));
                tcp.removeAllListeners('error');
                tcp.on('error', (e) => {this.emit('error', connNode, ErrorCode.RESULT_EXCEPTION);
            });
                resolve({err: ErrorCode.RESULT_OK, conn: connNode});
            });
        });
    }

    protected _connectionType(): new(...args: any[]) => IConnection {
        return TcpConnection;
    }

    public uninit() {
        let closeServerOp;
        if (this.m_server) {
            closeServerOp = new Promise((resolve) => {
                this.m_server.close(resolve);
            });
        }
        if (closeServerOp) {
            return Promise.all([closeServerOp, super.uninit()]);
        } else {
            return super.uninit();
        }
    }

    public listen(): Promise<ErrorCode> {
        return new Promise((resolve, reject) => {
            this.m_server.listen(this.m_options.port, this.m_options.host);
            this.m_server.once('listening', () => {
                this.m_server.removeAllListeners('error');
                this.m_server.on('connection', (tcp: Socket) => {
                    let connNodeType = this._nodeConnectionType();
                    let connNode: any = (new connNodeType(this, { socket: tcp, remote: `${tcp.remoteAddress}:${tcp.remotePort}` }));
                    tcp.on('error', (e) => {
                        this.emit('error', connNode, ErrorCode.RESULT_EXCEPTION);
                });
                    this._onInbound(connNode);
                });
                resolve(ErrorCode.RESULT_OK);
            });
            this.m_server.once('error', (e) => {
                this.m_server.removeAllListeners('listening');
                this.m_logger.error(`tcp listen on ${this.m_options.host}:${this.m_options.port} error `, e);
                resolve(ErrorCode.RESULT_EXCEPTION);
            });
        });
    }
}