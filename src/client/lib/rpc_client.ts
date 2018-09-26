let XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
import {LoggerInstance} from '../../core';
export class RPCClient {
    private m_url: string;
    constructor(serveraddr: string, port: number, private logger: LoggerInstance ) {
        this.m_url = 'http://' + serveraddr + ':' + port + '/rpc';
    }

    call(funName: string, funcArgs: any, onComplete: (resp: string | null, code: number) => void) {
        let sendObj = {
            funName,
            args: funcArgs
        };
        this.logger.info(`RPCClient send request ${sendObj.funName}, params ${JSON.stringify(sendObj.args)}`);
        const xmlhttp = new XMLHttpRequest();
        xmlhttp.onreadystatechange = () => {
            if (xmlhttp.readyState === 4) {
                if (xmlhttp.status === 200) {
                    let strResp = xmlhttp.responseText;
                    onComplete(strResp, xmlhttp.status);
                } else {
                    onComplete(null, xmlhttp.status);
                }
            }
        };

        xmlhttp.ontimeout = (err: any) => {
            onComplete(null, 504);
        };

        xmlhttp.open('POST', this.m_url, true);
        xmlhttp.setRequestHeader('Content-Type', 'application/json');

        xmlhttp.send(JSON.stringify(sendObj));
    }

    async callAsync(funcName: string, funcArgs: any): Promise<{ resp: string | null, ret: number }> {
        return new Promise<{ resp: string | null, ret: number }>((reslove, reject) => {
            this.call(funcName, funcArgs, (resp, statusCode) => {
                reslove({ resp, ret: statusCode });
            });
        });
    }
}