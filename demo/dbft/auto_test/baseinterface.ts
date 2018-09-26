import {BigNumber, ErrorCode} from '../../../src/client';
export interface IOperation {
    getAddress(): string;
    getBalance(address: string): Promise<BigNumber>;
    transferTo(to: string, amount: string): Promise<ErrorCode>;
    register(address: string): Promise<ErrorCode>;
    unregister(address: string): Promise<ErrorCode>;
    getMiners(): Promise<{err: ErrorCode, miners?: string[]}>;
    isMiners(address: string): Promise<{err: ErrorCode, isminer?: boolean}>;
    newProcess(id: string, command: string, argv: string[]): Promise<ErrorCode>;
    killProcess(id: string): Promise<ErrorCode>;
}