import { EventEmitter } from 'events';
import * as http from 'http';

export class RPCServer extends EventEmitter {
    private m_addr: string;
    private m_port: number;
    private m_server?: http.Server;
    constructor(listenaddr: string, port: number) {
        super();
        this.m_addr = listenaddr;
        this.m_port = port;
    }

    on(funcName: string, listener: (args: any, resp: http.ServerResponse) => void): this;
    on(event: string, listener: any): this  {
        return super.on(event, listener);
    }

    once(funcName: string, listener: (args: any, resp: http.ServerResponse) => void): this;
    once(event: string, listener: any): this  {
        return super.once(event, listener);
    }

    prependListener(funcName: string, listener: (args: any, resp: http.ServerResponse) => void): this;
    prependListener(event: string, listener: any): this  {
        return super.prependListener(event, listener);
    }

    prependOnceListener(funcName: string, listener: (args: any, resp: http.ServerResponse) => void): this;
    prependOnceListener(event: string, listener: any): this  {
        return super.prependOnceListener(event, listener);
    }

    start() {
        if (this.m_server) {
            return;
        }
        this.m_server = http.createServer();
        this.m_server.on('request', (req, resp) => {
            if (req.url !== '/rpc' || req.method !== 'POST') {
                resp.writeHead(404);
                resp.end();
            } else {
                let jsonData = '';
                req.on('data', (chunk: any) => {
                    jsonData += chunk;
                });
                req.on('end', () => {
                    let reqObj = JSON.parse(jsonData);
                    // console.info(`RPCServer emit request ${reqObj.funName}, params ${JSON.stringify(reqObj.args)}`);
                    if (!this.emit(reqObj.funName, reqObj.args, resp)) {
                        resp.writeHead(404);
                        resp.end();
                    }
                    
                });
            }
        });

        this.m_server.listen(this.m_port, this.m_addr);
    }

    stop() {
        if (this.m_server) {
            this.m_server.close();
            delete this.m_server;
        }
    }
}