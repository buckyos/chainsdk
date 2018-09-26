import {Worker} from './worker';
import { ErrorCode } from '../error_code';

export class Workpool {
    
    private file: string;
    private size: number;
    private workers:Array<Worker|undefined>;
    constructor(workerfile: string, size: number) {
        this.file = workerfile;
        this.size = size;
        this.workers = new Array(this.size);
    }

    push(params: Object, callback: (code:number, signal: string, ret: any) => void): number {
        //找一个空闲的worker
        for (let index = 0; index < this.workers.length; index++) {
            if (!this.workers[index]) {
                //run for worker
                let workerParam = JSON.stringify(params);
                this.workers[index] = new Worker(this.file, workerParam);
                this.workers[index]!.on('exit', (code, signal) => {
                    callback(code, signal, this.workers[index]!.data);
                    this.workers[index] = undefined;
                })
                this.workers[index]!.run();
                return ErrorCode.RESULT_OK;
            }
        }

        return ErrorCode.RESULT_NOT_FOUND;
    }

    stop(){
        for (let index = 0; index < this.workers.length; index++) {
            if (this.workers[index]) {
                this.workers[index]!.destory();
                //this.workers[index] = undefined;
            }
            
        }
    }
}