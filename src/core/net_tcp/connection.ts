import {ErrorCode} from '../error_code';
import {Socket} from 'net';
import {IConnection} from '../net';

export class TcpConnection extends IConnection {
    private m_socket: Socket;
    private m_pending: boolean;
    private m_remote: string;
    private m_network?: string;
    protected m_nTimeDelta: number = 0;
    constructor(options: {socket: Socket, remote: string}) {
        super();
        this.m_socket = options.socket;
        this.m_socket.on('drain', () => {
            this.m_pending = false;
            this.emit('drain');
        });
        this.m_socket.on('data', (data: Buffer) => {
            this.emit('data', [data]);
        });
        this.m_socket.on('error', (err) => {
            this.emit('error', this, ErrorCode.RESULT_EXCEPTION);
        });
        this.m_pending = false;
        this.m_remote = options.remote;
    }

    send(data: Buffer): number {
        if (this.m_pending) {
            return 0;
        } else {
            this.m_pending = !this.m_socket.write(data);
            return data.length;
        }
    }
    close(): Promise<ErrorCode> {
        if (this.m_socket) {
            this.m_socket.removeAllListeners('drain');
            this.m_socket.removeAllListeners('data');
            this.m_socket.removeAllListeners('error');
            this.m_socket.once('error', () => {
                // do nothing
            });
            this.m_socket.end();
            delete this.m_socket; 
        }
        this.emit('close', this);
        return Promise.resolve(ErrorCode.RESULT_OK);
    }

    destroy(): Promise<void> {
        if (this.m_socket) {
            this.m_socket.removeAllListeners('drain');
            this.m_socket.removeAllListeners('data');
            this.m_socket.removeAllListeners('error');
            this.m_socket.once('error', () => {
                // do nothing
            });
            this.m_socket.destroy();
            delete this.m_socket;
        }
        return Promise.resolve();
    }

    get remote(): string {
        return this.m_remote;
    }

    set remote(s: string) {
        this.m_remote = s;
    }

    get network(): string {
        return this.m_network!;
    }

    set network(s: string) {
        this.m_network = s;
    }

    getTimeDelta(): number {
        return this.m_nTimeDelta;
    }

    setTimeDelta(n: number) {
        this.m_nTimeDelta = n;
    }
}