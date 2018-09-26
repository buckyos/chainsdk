import {BigNumber} from 'bignumber.js';
import {BaseHandler} from '../chain';

// 是否需要中值时间呢？
export type MinerWageListener = (height: number) => Promise<BigNumber>; 

export class ValueHandler extends BaseHandler {
    protected m_minerWage: MinerWageListener;
    constructor() {
        super();
        this.m_minerWage = (height: number): Promise<BigNumber> => {
            return Promise.resolve(new BigNumber(1));
        };
    }

    public onMinerWage(l: MinerWageListener) {
        if (l) {
            this.m_minerWage = l;
        }
    }

    public getMinerWageListener(): MinerWageListener {
        return this.m_minerWage;
    }
}