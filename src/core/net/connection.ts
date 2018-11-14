import { ErrorCode } from '../error_code';
import { EventEmitter } from 'events';

export class IConnection extends EventEmitter {
    on(event: 'error', listener: (conn: IConnection, err: ErrorCode) => void): this;
    on(event: 'drain', listener: (conn: IConnection) => void): this;
    on(event: 'data', listener: (conn: IConnection, data: Buffer) => void): this;
    on(event: 'close', listener: (conn: IConnection) => void): this;
    on(event: 'checkedVersion', listener: (conn: IConnection) => void): this;
    on(event: string, listener: any): this {
        return super.on(event, listener);
    }
    once(event: 'error', listener: (conn: IConnection, err: ErrorCode) => void): this;
    once(event: 'drain', listener: (conn: IConnection) => void): this;
    once(event: 'data', listener: (conn: IConnection, data: Buffer) => void): this;
    once(event: 'close', listener: (conn: IConnection) => void): this;
    once(event: 'checkedVersion', listener: (conn: IConnection) => void): this;
    once(event: string, listener: any): this {
        return super.once(event, listener);
    }

    send(data: Buffer): number {
        return 0;
    }
    close(): Promise<ErrorCode> {
        return Promise.resolve(ErrorCode.RESULT_OK);
    }

    destroy(): Promise<void> {
        return Promise.resolve();
    }

    remote: string|undefined;

    network: string|undefined;

    getTimeDelta(): number {
        return 0;
    }

    setTimeDelta(n: number) {
        
    }
}