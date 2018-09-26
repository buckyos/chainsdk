import { EventEmitter } from 'events';
import {ChildProcess, spawn} from 'child_process';

export class Worker extends EventEmitter {
    private file: string;
    private params: string;
    private child?: ChildProcess;
    public data: string;
    constructor(file: string, params: string) {
        super();
        this.file = file;
        this.params = params;
        this.data = '';
    }

    run() {
        // 1. 开一个进程，传serverPort, file, params进去
        // 2. 子进程启动，开始运行
        // 3. 函数返回后，子进程

        const bin = process.argv[0];
        const options = { stdio: 'pipe', env: process.env };

        this.child = spawn(bin, [this.file, this.params], options);

        this.child.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });

        this.child.once('exit', (code, signal) => {
            this.emit('exit', code == null ? -1 : code, signal);
        });

        this.child.stdin.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });

        this.child.stdout.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });

        this.child.stderr.on('error', (err) => {
            console.error(`child process error! ${err}`);
            this.destory();
        });

        this.child.stdout.on('data', (data) => {
            this.data += data;
        });
    }

    destory() {
        if (this.child) {
            this.child.kill('SIGTERM');
        }
    }
}