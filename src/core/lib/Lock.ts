class ClassNotfiy {
    protected m_resolve: any;
    protected m_reject: any;
    constructor(resolve: any, reject: any) {
        this.m_resolve = resolve;
        this.m_reject = reject;
    }

    get resolve(): any {
        return this.m_resolve;
    }

    get reject(): any {
        return this.m_reject;
    }
}

export class Lock {
    protected m_busy: boolean;
    protected m_list: ClassNotfiy[];
    constructor() {
        this.m_busy = false;
        this.m_list = [];
    }
    enter(bHightPriority?: boolean) {
        if (this.m_busy) {
            return new Promise((resolve, reject) => {
                if (bHightPriority) {
                    this.m_list.splice(0, 0, new ClassNotfiy(resolve, reject));
                } else {
                    this.m_list.push(new ClassNotfiy(resolve, reject));
                }
            });
        }
        this.m_busy = true;
        return Promise.resolve(true);
    }

    leave() {
        this.m_busy = false;
        if (this.m_list.length === 0) {
            return;
        }

        let notifyObj: ClassNotfiy = this.m_list.shift() as ClassNotfiy;
        this.m_busy = true;
        notifyObj.resolve(true);
    }

    destory() {
        while (this.m_list.length > 0) {
            (this.m_list.shift() as ClassNotfiy).reject(false);
        }
    }
}
