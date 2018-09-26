import {ErrorCode, stringifyErrorCode} from '../../core';

export function rejectifyValue<T>(func: (...args: any[]) => Promise<{err: ErrorCode}&any>, _this: any, _name?: string): (...args: any[]) => Promise<T> {
    let _func = async (...args: any[]): Promise<any> => {
        let ret = await func.bind(_this)(...args);
        if (ret.err) {
            return Promise.reject(new Error(stringifyErrorCode(ret.err)));
        } else {
            return Promise.resolve(ret[_name ? _name : 'value'] as T);
        }
    };
    return _func;
}

export function rejectifyErrorCode(func: (...args: any[]) => Promise<ErrorCode>, _this: any): (...args: any[]) => Promise<void> {
    let _func = async (...args: any[]): Promise<any> => {
        let err = await func.bind(_this)(...args);
        if (err) {
            return Promise.reject(new Error(`${err}`));
        } else {
            return Promise.resolve();
        }
    };
    return _func;
}
