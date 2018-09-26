import {EventEmitter} from 'events';
import {HostClient, HostClientOptions} from './rpc';

export type ChainClientOptions = HostClientOptions;

export class ChainClient extends HostClient {
    constructor(options: ChainClientOptions) {
        super(options);
    }

    on(event: 'tipBlock', listener: (block: any) => void): this;
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        this.m_emitter.on(event, listener);
        this._beginWatchTipBlock();
        return this;
    }
    once(event: 'tipBlock', listener: (block: any) => void): this;
    once(event: string | symbol, listener: (...args: any[]) => void): this {
        this.m_emitter.once(event, listener);
        this._beginWatchTipBlock();
        return this;
    }

    private async _beginWatchTipBlock() {
        if (this.m_tipBlockTimer) {
            return ;
        }
        this.m_tipBlockTimer = setInterval(
            async () => {
                let {err, block} = await this.getBlock({which: 'latest'});
                if (block) {
                    if (!this.m_tipBlock || this.m_tipBlock.hash !== block.hash) {
                        this.m_tipBlock = block;
                        this.m_emitter.emit('tipBlock', this.m_tipBlock);
                        if (!this.m_emitter.listenerCount('tipBlock')) {
                            clearInterval(this.m_tipBlockTimer!);
                            delete this.m_tipBlockTimer;
                        }
                    }
                }
                // TODO: set block interval 
            }, 10000
        );
    }

    private m_tipBlockTimer?: any;
    private m_tipBlock?: any; 
    private m_emitter = new EventEmitter(); 
}